// 从战斗日志生成 BOSS 时间轴（纯函数内核）。
// 两条来源归一化为统一的 BossLogFight：ACT 窗口事件（开怪点判定同模拟器 findActPullTs）、
// FFLogs 敌方 casts（战斗边界即开怪点；Pet 过滤；同键 1s 去重）。
// mergeBossFights 把多场战斗的同一次施法按时间窗对齐成一个簇：同一场内同一时刻的
// 不同技能保持分开，跨场 id 不同（同一技能被记录为多个 ID）则合并为一个锚点。
// buildTimelineFromClusters 按 cactbot 导入同款产物规则生成 PtlDocument 锚点骨架。

import type { ActActorInfo, ActEncounter, ActLogEvent } from '@shared/actTypes'
import { isActEnemyId } from '@shared/actTypes'
import type { FflogsActor, FflogsCastEvent, FflogsFight } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { PtlAnchor, PtlDocument, PtlSyncRule } from '@shared/prTypes'
import { collectPetIds, collectSimSources, findActPullTs, type SimSource } from './sim/simEvents'
import { collectFflogsSimSources } from './sim/simFflogs'

export interface BossCastEvent {
  /** 相对开怪点 ms */
  tMs: number
  /** start = 开始读条（CastStart）；effect = 判定/瞬发（ActionEffect） */
  kind: 'start' | 'effect'
  id: number
  name: string
  sourceId: number
}

export interface BossLogFight {
  key: string
  /** 展示用来源标签（日志文件/报告 + 战斗） */
  label: string
  source: 'act' | 'fflogs'
  /** 区域/战斗名（用于默认文档名） */
  zoneName?: string
  durationMs: number
  /** 全部非宠物敌方来源事件（未按 selectedSourceIds 过滤） */
  events: BossCastEvent[]
  sources: SimSource[]
  selectedSourceIds: number[]
}

export interface MergedCluster {
  /** 成员时间中位数（相对开怪点 ms） */
  timeMs: number
  kind: 'start' | 'effect'
  ids: number[]
  names: string[]
  /** 贡献了成员的场数 */
  fightCount: number
  perFight: { fightIndex: number; timesMs: number[] }[]
  /** effect 簇是否与某 start 簇配对（同一读条技能的判定事件） */
  paired: boolean
}

export interface MergeOptions {
  /** 对齐窗口：同一施法在不同日志中的时间差 ≤ 该值视为同一次（ms） */
  windowMs: number
  /** 至少出现场数（滤掉偶发事件） */
  minFights: number
  /** 保留读条技能的判定锚点（读条/判定各自一个锚点；关闭后只留 CastStart 锚点） */
  includeEffectAnchors: boolean
}

export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  windowMs: 2500,
  minFights: 1,
  includeEffectAnchors: true
}

const FFLOGS_DEDUP_MS = 1000
const PAIR_MIN_MS = -1000
const PAIR_MAX_MS = 30_000
const TIME_EPSILON = 0.0001
const TIME_STEP = 0.001

// ---------- 来源归一化 ----------

/** ACT 窗口事件 → BossLogFight（开怪点与模拟器同一判定；只含非宠物敌方来源事件） */
export function buildActBossFight(
  key: string,
  label: string,
  events: ActLogEvent[],
  actors: ActActorInfo[],
  encounter: ActEncounter
): BossLogFight {
  const petIds = collectPetIds(actors)
  const pullTs = findActPullTs(events, petIds, encounter.start)
  const sources = collectSimSources(events, actors)
  const bossEvents: BossCastEvent[] = []
  for (const ev of events) {
    if (ev.ts < pullTs) continue
    if (!isActEnemyId(ev.sourceId) || petIds.has(ev.sourceId)) continue
    bossEvents.push({
      tMs: ev.ts - pullTs,
      kind: ev.type === 'begincast' ? 'start' : 'effect',
      id: ev.abilityId,
      name: ev.abilityName,
      sourceId: ev.sourceId
    })
  }
  return {
    key,
    label,
    source: 'act',
    zoneName: encounter.zoneName,
    durationMs: encounter.end - pullTs,
    events: bossEvents.sort((a, b) => a.tMs - b.tMs),
    sources,
    selectedSourceIds: sources.map(s => s.id)
  }
}

/** FFLogs 敌方 casts → BossLogFight（战斗边界即开怪点；Pet 过滤；同键 1s 去重） */
export function buildFflogsBossFight(
  key: string,
  label: string,
  casts: FflogsCastEvent[],
  fight: FflogsFight,
  enemies: FflogsActor[],
  actionNames?: ActionNameDatabase
): BossLogFight {
  const nameOf = (ability: FflogsCastEvent['ability']): string =>
    ability.guid !== undefined ? (actionNames?.actions[ability.guid]?.[0] || ability.name) : ability.name
  const petIds = new Set(enemies.filter(a => a.type === 'Pet').map(a => a.id))
  const sources = collectFflogsSimSources(casts, enemies)
  const last = new Map<string, number>()
  const bossEvents: BossCastEvent[] = []
  const sorted = [...casts].sort((a, b) => a.timestamp - b.timestamp)
  for (const c of sorted) {
    if (c.type !== 'cast' && c.type !== 'begincast') continue
    if (petIds.has(c.sourceID)) continue
    if (c.ability.guid === undefined) continue
    const dedupKey = `${c.sourceID}|${c.ability.guid}|${c.type}`
    const prev = last.get(dedupKey)
    if (prev !== undefined && c.timestamp - prev < FFLOGS_DEDUP_MS) continue
    last.set(dedupKey, c.timestamp)
    bossEvents.push({
      tMs: c.timestamp - fight.start_time,
      kind: c.type === 'begincast' ? 'start' : 'effect',
      id: c.ability.guid,
      name: nameOf(c.ability),
      sourceId: c.sourceID
    })
  }
  return {
    key,
    label,
    source: 'fflogs',
    zoneName: fight.zoneName || fight.name,
    durationMs: fight.end_time - fight.start_time,
    events: bossEvents,
    sources,
    selectedSourceIds: sources.map(s => s.id)
  }
}

// ---------- 多场对齐合并 ----------

interface ClusterMember {
  tMs: number
  fightIndex: number
  event: BossCastEvent
}

interface MutableCluster {
  kind: 'start' | 'effect'
  minTime: number
  members: ClusterMember[]
}

/** 已按 selectedSourceIds 过滤后的各场事件 → 对齐簇（按时间升序） */
export function mergeBossFights(
  fights: BossLogFight[],
  options: Partial<MergeOptions> = {}
): MergedCluster[] {
  const opts = { ...DEFAULT_MERGE_OPTIONS, ...options }
  const clusters: MergedCluster[] = []
  for (const kind of ['start', 'effect'] as const) {
    const members: ClusterMember[] = []
    fights.forEach((fight, fightIndex) => {
      const allowed = new Set(fight.selectedSourceIds)
      for (const event of fight.events) {
        if (event.kind !== kind || !allowed.has(event.sourceId)) continue
        members.push({ tMs: event.tMs, fightIndex, event })
      }
    })
    members.sort((a, b) => a.tMs - b.tMs)
    for (const cluster of clusterMembers(members, opts.windowMs)) {
      clusters.push(finalizeCluster(kind, cluster))
    }
  }
  clusters.sort((a, b) => a.timeMs - b.timeMs)
  markPairedEffects(clusters)
  return clusters.filter(cluster =>
    cluster.fightCount >= opts.minFights &&
    (opts.includeEffectAnchors || !(cluster.kind === 'effect' && cluster.paired))
  )
}

/**
 * 贪心限宽聚类：事件加入当前簇的条件是
 *  1. 距簇起点 ≤ windowMs（限宽，防止连续读条链式合并成一簇）；
 *  2. 簇内没有同一场战斗的成员——同一场内的每个事件都是一次独立施法，
 *     只有跨场事件才合并（跨场 id 不同即「同一技能多个 ID」场景）。
 */
function clusterMembers(members: ClusterMember[], windowMs: number): MutableCluster[] {
  const clusters: MutableCluster[] = []
  let current: MutableCluster | null = null
  for (const member of members) {
    if (current && member.tMs - current.minTime <= windowMs &&
      !current.members.some(m => m.fightIndex === member.fightIndex)) {
      current.members.push(member)
    } else {
      current = { kind: member.event.kind, minTime: member.tMs, members: [member] }
      clusters.push(current)
    }
  }
  return clusters
}

function finalizeCluster(kind: 'start' | 'effect', cluster: MutableCluster): MergedCluster {
  const times = cluster.members.map(m => m.tMs).sort((a, b) => a - b)
  const median = times.length % 2 === 1
    ? times[(times.length - 1) / 2]
    : (times[times.length / 2 - 1] + times[times.length / 2]) / 2
  const perFight = new Map<number, number[]>()
  for (const m of cluster.members) {
    const list = perFight.get(m.fightIndex) ?? []
    list.push(m.tMs)
    perFight.set(m.fightIndex, list)
  }
  return {
    timeMs: Math.round(median / 10) * 10,
    kind,
    ids: [...new Set(cluster.members.map(m => m.event.id))].sort((a, b) => a - b),
    names: [...new Set(cluster.members.map(m => m.event.name))],
    fightCount: perFight.size,
    perFight: [...perFight.entries()]
      .map(([fightIndex, timesMs]) => ({ fightIndex, timesMs: timesMs.sort((a, b) => a - b) }))
      .sort((a, b) => a.fightIndex - b.fightIndex),
    paired: false
  }
}

/** effect 簇与 id 集有交集、时差合理的 start 簇配对（同一读条技能的判定事件） */
function markPairedEffects(clusters: MergedCluster[]): void {
  const starts = clusters.filter(c => c.kind === 'start')
  for (const effect of clusters) {
    if (effect.kind !== 'effect') continue
    effect.paired = starts.some(start => {
      const dt = effect.timeMs - start.timeMs
      return dt >= PAIR_MIN_MS && dt <= PAIR_MAX_MS && start.ids.some(id => effect.ids.includes(id))
    })
  }
}

// ---------- 生成 PtlDocument ----------

export interface LogTimelineMeta {
  name: string
  /** 来源描述列表（写入 Meta.Remark） */
  sourceLabels: string[]
}

/** 由日志直接生成的时间轴未经实战校验——对话框、文档备注、导入汇总共用这段提示 */
export const LOG_IMPORT_TEST_WARNING =
  '该时间轴由战斗日志直接生成，未经人工校正：同一技能在不同日志中可能记录为多个 ID' +
  '（已合并的锚点带有 ⚠ 备注），导入后请用「▶ 模拟测试」逐条验证再投入实战。'

export function buildTimelineFromClusters(
  clusters: MergedCluster[],
  meta: LogTimelineMeta
): PtlDocument {
  const usedTimes: number[] = []
  const anchors: PtlAnchor[] = []
  for (const cluster of clusters) {
    anchors.push(buildClusterAnchor(cluster, reserveTime(cluster.timeMs / 1000, usedTimes)))
  }
  anchors.sort((a, b) => a.Time - b.Time || a.Guid.localeCompare(b.Guid))
  anchors.unshift(buildAnchor('开始', 0, createSync('InCombat')))
  const maxTime = anchors.reduce((max, anchor) => Math.max(max, anchor.Time), 0)
  const end = buildAnchor('结束', maxTime + 30, null)
  end.IsEndAnchor = true
  anchors.push(end)
  normalizeAnchorTimes(anchors)
  return {
    Version: 1,
    Meta: {
      Name: meta.name,
      TerritoryId: 0,
      JobId: 0,
      Author: 'Log import',
      AcrAuthor: null,
      CreatedAt: new Date().toISOString(),
      Opener: null,
      Remark: [
        `由 Timeline Editor 从战斗日志导入（${meta.sourceLabels.join('；')}）`,
        LOG_IMPORT_TEST_WARNING
      ].join('\n')
    },
    Variables: [],
    Anchors: anchors,
    Entries: []
  }
}

function buildClusterAnchor(cluster: MergedCluster, time: number): PtlAnchor {
  const sync = createSync(cluster.kind === 'start' ? 'CastStart' : 'ActionEffect')
  if (cluster.ids.length > 1) {
    sync.Params.Regex = `^(?:${cluster.ids.join('|')})$`
  } else {
    sync.Params.ActionId = String(cluster.ids[0])
  }
  const multiId = cluster.ids.length > 1
  const name = cluster.names[0] ?? String(cluster.ids[0])
  const anchor = buildAnchor(
    `${multiId ? '⚠ ' : ''}${name} ${cluster.kind === 'start' ? '开始读条' : '判定'}`,
    time,
    sync
  )
  const parts = []
  if (multiId) parts.push(`该技能在不同日志中记录了多个 ID: ${cluster.ids.join(' | ')}，请实测确认`)
  parts.push(`日志出现 ${cluster.fightCount} 场`)
  if (cluster.names.length > 1) parts.push(`名称差异: ${cluster.names.join(' / ')}`)
  anchor.Remark = parts.join('；')
  return anchor
}

function buildAnchor(name: string, time: number, sync: PtlSyncRule | null): PtlAnchor {
  return {
    Guid: crypto.randomUUID(),
    Name: name,
    Time: time,
    IsPhaseAnchor: false,
    IsEndAnchor: false,
    IsCommentAnchor: false,
    IsTechnicalAnchor: false,
    Enabled: true,
    Remark: null,
    Sync: sync
  }
}

function createSync(type: string): PtlSyncRule {
  return {
    Type: type,
    Params: {},
    MatchTime: null,
    JumpTargetTime: null,
    IsForceJump: false,
    WindowBefore: 0,
    WindowAfter: 0
  }
}

function reserveTime(requested: number, used: number[]): number {
  let time = requested
  while (used.some(value => Math.abs(value - time) <= TIME_EPSILON)) time += TIME_STEP
  used.push(time)
  return time
}

function normalizeAnchorTimes(anchors: PtlAnchor[]): void {
  let previous = Number.NEGATIVE_INFINITY
  for (const anchor of anchors) {
    if (anchor.Time <= previous + TIME_EPSILON) anchor.Time = previous + TIME_STEP
    previous = anchor.Time
  }
}
