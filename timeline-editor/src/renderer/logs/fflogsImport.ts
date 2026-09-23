// FFLogs cast 数据 → 战斗日志文档 的纯函数解析（不依赖 store，可单测）
// 规则移植自 ccinos.github.io/act_dps_show/v3

import type { FflogsCastEvent, FflogsReportInfo } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { LogsImportPayload, LogsSkillColumn } from './logsTypes'
import { columnMatchName } from './logsTypes'

export interface FflogsParseOptions {
  report: FflogsReportInfo
  /** hostility=0 玩家施法 */
  casts: FflogsCastEvent[]
  /** hostility=1 BOSS/NPC 施法 */
  enemyCasts: FflogsCastEvent[]
  fightStart: number
  fightEnd: number
  /** 用于匹配（matchName || name） */
  columns: LogsSkillColumn[]
  /** 用开始读条（begincast）事件与 cast 配对计算读条时长；否则全部按默认时长 */
  includeBegincast: boolean
  /** 默认 '攻击'，匹配到的事件技能名被过滤；非法正则按默认处理 */
  eventFilterRegex: string
  /** 国服中文名库（按 guid 翻译技能名）；缺省则保留 FFLogs 原名 */
  actionNames?: ActionNameDatabase
}

export interface ParsedEnemyEvent {
  timeMs: number
  text: string
  skillName: string
  /** 读条时长 ms（begincast 配对得出，最小钳制）；无 = 瞬发 */
  durationMs?: number
  /** 技能 guid，供图标解析（不写进导入 payload） */
  guid?: number
}

export interface ParsedFflogsData {
  /** friendlies 排除 LimitBreak，且只保留本场战斗有施法记录的（report 列表是整个报告范围） */
  players: { id: number; name: string; job: string }[]
  /** enemies type === 'Boss'，且只保留本场战斗有施法记录的 */
  bosses: { id: number; name: string }[]
  npcs: { id: number; name: string }[]
  /** 被跟踪技能名(matchName||name) → 玩家 id → 施放时间（相对战斗开始 ms，升序） */
  abilityCasts: Record<string, Record<number, number[]>>
  gcdCasts: Record<string, Record<number, number[]>>
  /** 敌方 sourceId → 事件列表（按时间升序） */
  eventsBySource: Record<number, ParsedEnemyEvent[]>
  /** 技能名（翻译后）→ 技能 ID（guid，取首个出现的 cast；展示用） */
  skillIds: Record<string, number>
}

export interface FflogsImportMapping {
  /** 解析时使用的列（abilitySource 的 columnId → 匹配名靠它解析） */
  columns: LogsSkillColumn[]
  /** 选中的 BOSS/NPC sourceId */
  eventSourceIds: number[]
  /** ability 列 id → 玩家 id（null = 不导入该列） */
  abilitySource: Record<string, number | null>
  /** GCD 技能名(matchName||name) → 玩家 id */
  gcdSource: Record<string, number | null>
}

const DEDUP_WINDOW_MS = 1000
const MIN_CAST_MS = 500
const MAX_CAST_MS = 30000

function compileEventFilter(pattern: string): RegExp {
  const p = pattern.trim() || '攻击'
  try {
    return new RegExp(p)
  } catch {
    return new RegExp('攻击')
  }
}

function pushCast(map: Record<string, Record<number, number[]>>, skill: string, sourceId: number, timeMs: number): void {
  const perSkill = map[skill] ?? (map[skill] = {})
  const list = perSkill[sourceId] ?? (perSkill[sourceId] = [])
  list.push(timeMs)
}

/** 同键 1000ms 内只取第一次 */
function dedupFilter(casts: FflogsCastEvent[], key: (c: FflogsCastEvent) => string): FflogsCastEvent[] {
  const last = new Map<string, number>()
  const out: FflogsCastEvent[] = []
  for (const cast of casts) {
    const k = key(cast)
    const prev = last.get(k)
    if (prev !== undefined && cast.timestamp - prev < DEDUP_WINDOW_MS) continue
    last.set(k, cast.timestamp)
    out.push(cast)
  }
  return out
}

export function parseFflogsFight(opts: FflogsParseOptions): ParsedFflogsData {
  const { report, fightStart, includeBegincast } = opts

  // 国服中文名库按 guid 翻译（FFLogs 对新技能/BOSS 技能缺中文翻译会返回英文名）；
  // 库中无该 guid 时保留 FFLogs 原名（其 translate=true 对旧技能已翻译）
  const nameOf = (ability: { name: string; guid?: number }): string => {
    const entry = ability.guid !== undefined ? opts.actionNames?.actions[ability.guid] : undefined
    return entry?.[0] || ability.name
  }

  // report.friendlies/enemies 是整个报告范围的实体列表（v1 API 不提供按战斗划分的参与者）；
  // casts 已按所选战斗的时间窗下载，按 sourceID 出现与否过滤出本场战斗的实体。
  // 未下载对应数据流时（casts/enemyCasts 为空）列表为空，映射页对应分区本就不显示
  const playerIds = new Set(opts.casts.map(c => c.sourceID))
  const enemyIds = new Set(opts.enemyCasts.map(c => c.sourceID))
  const players = report.friendlies
    .filter(a => a.type !== 'LimitBreak' && playerIds.has(a.id))
    .map(a => ({ id: a.id, name: a.name, job: a.type }))
  const bosses = report.enemies
    .filter(a => a.type === 'Boss' && enemyIds.has(a.id))
    .map(a => ({ id: a.id, name: a.name }))
  const npcs = report.enemies
    .filter(a => a.type !== 'Boss' && enemyIds.has(a.id))
    .map(a => ({ id: a.id, name: a.name }))

  const enemyNames = new Map(report.enemies.map(a => [a.id, a.name]))
  const columnBySkill = new Map<string, LogsSkillColumn>()
  for (const col of opts.columns) columnBySkill.set(columnMatchName(col), col)

  const abilityCasts: Record<string, Record<number, number[]>> = {}
  const gcdCasts: Record<string, Record<number, number[]>> = {}
  const skillIds: Record<string, number> = {}
  const noteSkillId = (name: string, guid?: number): void => {
    if (guid !== undefined && !(name in skillIds)) skillIds[name] = guid
  }

  // 玩家流只统计实际施放（begincast 不计入，避免与 cast 重复）
  const playerCasts = dedupFilter(
    opts.casts.filter(c => c.type === 'cast').sort((a, b) => a.timestamp - b.timestamp),
    c => `${c.sourceID}|${nameOf(c.ability)}`
  )
  for (const cast of playerCasts) {
    const skillName = nameOf(cast.ability)
    noteSkillId(skillName, cast.ability.guid)
    const col = columnBySkill.get(skillName)
    if (!col) continue
    const timeMs = cast.timestamp - fightStart
    if (col.kind === 'gcd') pushCast(gcdCasts, skillName, cast.sourceID, timeMs)
    else pushCast(abilityCasts, skillName, cast.sourceID, timeMs)
  }

  const filter = compileEventFilter(opts.eventFilterRegex)
  const eventsBySource: Record<number, ParsedEnemyEvent[]> = {}
  // 敌方流：begincast 仅用于配对读条时长，不生成独立事件；去重键含 type 保住配对
  const enemyTypes = new Set(includeBegincast ? ['cast', 'begincast'] : ['cast'])
  const enemyCasts = dedupFilter(
    opts.enemyCasts.filter(c => enemyTypes.has(c.type)).sort((a, b) => a.timestamp - b.timestamp),
    c => `${c.sourceID}|${nameOf(c.ability)}|${c.type}`
  )
  const beginQueues = new Map<string, number[]>()
  for (const cast of enemyCasts) {
    const skillName = nameOf(cast.ability)
    const queueKey = `${cast.sourceID}|${skillName}`
    if (cast.type === 'begincast') {
      const queue = beginQueues.get(queueKey) ?? []
      queue.push(cast.timestamp)
      beginQueues.set(queueKey, queue)
      continue
    }
    // 有 begincast 配对且间隔合理 → 真实读条时长；否则视为瞬发（不设时长）
    const beginTs = beginQueues.get(queueKey)?.shift()
    let durationMs: number | undefined
    if (beginTs !== undefined) {
      const diff = cast.timestamp - beginTs
      if (diff > 0 && diff <= MAX_CAST_MS) durationMs = Math.max(MIN_CAST_MS, diff)
    }
    if (filter.test(skillName)) continue
    noteSkillId(skillName, cast.ability.guid)
    const sourceName = enemyNames.get(cast.sourceID) ?? String(cast.sourceID)
    const list = eventsBySource[cast.sourceID] ?? (eventsBySource[cast.sourceID] = [])
    list.push({
      timeMs: cast.timestamp - fightStart,
      text: `${sourceName} 施放 [${skillName}]`,
      skillName,
      durationMs,
      guid: cast.ability.guid
    })
  }

  return { players, bosses, npcs, abilityCasts, gcdCasts, eventsBySource, skillIds }
}

function pickTopPlayer(perPlayer: Record<number, number[]> | undefined): number | null {
  if (!perPlayer) return null
  let best: number | null = null
  let bestCount = 0
  for (const [idText, times] of Object.entries(perPlayer)) {
    if (times.length > bestCount) {
      bestCount = times.length
      best = Number(idText)
    }
  }
  return best
}

/** 每个被跟踪技能选施放次数最多的玩家 */
export function autoAssignPlayers(
  parsed: ParsedFflogsData,
  columns: LogsSkillColumn[]
): { abilitySource: Record<string, number | null>; gcdSource: Record<string, number | null> } {
  const abilitySource: Record<string, number | null> = {}
  const gcdSource: Record<string, number | null> = {}
  for (const col of columns) {
    const key = columnMatchName(col)
    if (col.kind === 'ability') abilitySource[col.id] = pickTopPlayer(parsed.abilityCasts[key])
    else gcdSource[key] = pickTopPlayer(parsed.gcdCasts[key])
  }
  return { abilitySource, gcdSource }
}

type PayloadEvent = NonNullable<LogsImportPayload['events']>[number]

/** 映射结果 → logsStore.applyImport 的入参形状；icons = guid → 图标 URL（可缺省） */
export function buildImportPayload(
  parsed: ParsedFflogsData,
  mapping: FflogsImportMapping,
  fightDurationMs: number,
  icons?: Record<number, string>
): LogsImportPayload {
  const events: PayloadEvent[] = []
  for (const sourceId of mapping.eventSourceIds) {
    for (const e of parsed.eventsBySource[sourceId] ?? []) {
      events.push({
        timeMs: e.timeMs,
        text: e.text,
        skillName: e.skillName,
        skillId: e.guid,
        durationMs: e.durationMs,
        icon: e.guid !== undefined ? icons?.[e.guid] : undefined
      })
    }
  }
  events.sort((a, b) => a.timeMs - b.timeMs)

  const gcds: { timeMs: number; skill: string; skillId?: number }[] = []
  for (const [skill, playerId] of Object.entries(mapping.gcdSource)) {
    if (playerId === null) continue
    for (const timeMs of parsed.gcdCasts[skill]?.[playerId] ?? []) {
      gcds.push({ timeMs, skill, skillId: parsed.skillIds[skill] })
    }
  }
  gcds.sort((a, b) => a.timeMs - b.timeMs)

  const skillUses: Record<string, { timeMs: number }[]> = {}
  for (const [columnId, playerId] of Object.entries(mapping.abilitySource)) {
    if (playerId === null) continue
    const col = mapping.columns.find(c => c.id === columnId)
    if (!col) continue
    const times = parsed.abilityCasts[columnMatchName(col)]?.[playerId] ?? []
    skillUses[columnId] = times.map(timeMs => ({ timeMs }))
  }

  const columnSkillIds: Record<string, number> = {}
  for (const col of mapping.columns) {
    const id = parsed.skillIds[columnMatchName(col)]
    if (id !== undefined) columnSkillIds[col.id] = id
  }

  return { events, gcds, skillUses, columnSkillIds, lengthMs: fightDurationMs }
}
