// PR 时间轴战斗模拟内核（纯函数，无 React 依赖）。
// 语义移植自 PromeRotation 插件运行时（PureTimeline/Runtime/）：
//   PtlEngine.Tick：Clock.Tick(dt) → Matcher.Tick（ForceJump/窗口过期）→ Tracker.Tick（激活 Entry）→ End 停止
//   SyncMatcher：事件在两次 Tick 之间同步消费；候选按 |MatchTime-当前时刻| 升序、再按 MatchTime，
//     首个同类型且参数匹配者胜出（一次事件只消费一个 PendingSync）；
//     窗口 [MatchTime-WindowBefore, MatchTime+WindowAfter] 是相对 MatchTime 的时间轴时间区间，
//     双 0 时默认普通锚点 ±2.5s / 阶段锚点 ±10s；事件侧宽限 +0.5s（EventGracePeriod）；
//     命中 = 时钟硬拉到 JumpTargetTime（缺省=锚点 Time），阶段锚点或 JumpTargetTime≠锚点时间时清理更早 Pending；
//     IsForceJump：时钟到达 MatchTime 即跳 TargetTime+漂移量，无需事件。
//   SegmentTracker：只查当前段，Offset <= localTime 激活，一次性；越界 Offset 跳过并告警；
//     时钟前跳跨过整段时，被跨段的 Entry 不补触发。
// 与插件的差异：无帧概念，窗口过期连续化为「越过 WindowEnd+0.5s 宽限」时触发
//   （插件 Tick 严格 >WindowEnd，事件匹配允许 +0.5s；二者在帧间隙内的先后差异 <0.5s）。

import type { PtlAnchor, PtlDocument, PtlEntry } from '@shared/prTypes'
import { functionalAnchors, sortedAnchors } from '../prModel'

const DEFAULT_WINDOW_SEC = 2.5
const DEFAULT_PHASE_WINDOW_SEC = 10
const EVENT_GRACE_SEC = 0.5
const EPS = 1e-6

/** 插件运行时永不命中的同步类型（ActorControl 加载期被剥除；Lua/Manual 无事件分发路径） */
const UNSUPPORTED_SYNC_TYPES = new Set(['ActorControl', 'Lua', 'Manual'])
/** 运行时存在但 ACT 战斗日志没有对应事件源的同步类型 */
const NO_ACT_SOURCE_TYPES = new Set([
  'Weather', 'ChatLog', 'Countdown', 'AddedCombatant', 'NpcYell', 'InstanceContentText'
])

// ---------- 输入 ----------

export interface SimInputEvent {
  /** epoch ms（单调递增，基准任意） */
  tsMs: number
  /** 同步事件类型 + 战斗边界（InCombat/CombatEnd） */
  type: 'InCombat' | 'CastStart' | 'ActionEffect' | 'CombatEnd'
  /** 事件参数（插件语义：CastStart/ActionEffect 只有 ActionId，十进制字符串） */
  params: Record<string, string>
  /** 展示用标签，如 「技能名 (12345) · 来源」 */
  label: string
}

// ---------- 结果 ----------

export type SimAnchorStatus =
  | 'matched'     // 窗口内命中（含 ForceJump）
  | 'expired'     // 窗口耗尽未命中
  | 'pending'     // 战斗结束时仍在等待（窗口尚未耗尽）
  | 'nosync'      // 无同步规则 / None / 锚点禁用（不参与匹配）
  | 'unsupported' // ActorControl/Lua/Manual — 插件运行时永不命中

export interface SimAnchorResult {
  anchorGuid: string
  name: string
  time: number
  syncType: string | null
  kind: 'normal' | 'phase' | 'end' | 'comment' | 'technical'
  status: SimAnchorStatus
  /** matched（事件命中）：命中的事件标签与日志时刻、时钟校正量 delta（秒） */
  eventLabel?: string
  eventTsMs?: number
  delta?: number
  /** matched 且由 ForceJump 触发（无事件命中） */
  forceJump?: boolean
  /** expired/pending/unsupported：原因说明 */
  detail?: string
  /** 运行时可能触发但 ACT 日志没有对应事件源（Weather/ChatLog/…） */
  noActSource?: boolean
}

export type SimEntryStatus =
  | 'activated'      // 正常激活
  | 'notReached'     // 段内时钟未走到 Offset（激活前被跳走/停止）
  | 'segmentSkipped' // 所属段从未进入（被时钟跳跃整体跨过）
  | 'outOfRange'     // Offset 越界（运行时跳过并告警）
  | 'invalidBinding' // 绑定了注释/技术锚点（不在段列表中）
  | 'disabled'

export interface SimEntryResult {
  entryGuid: string
  name: string
  anchorGuid: string
  anchorName: string
  offset: number
  status: SimEntryStatus
  /** activated：激活时的时间轴时间（秒）与对应日志时刻（epoch ms） */
  activatedTimeline?: number
  activatedTsMs?: number
}

export interface SimLogLine {
  /** 对应日志时刻（epoch ms）；未进战时为 null */
  tsMs: number | null
  /** 时间轴时间（秒）；未进战时为 null */
  timeline: number | null
  text: string
}

export interface SimResult {
  started: boolean
  startDetail?: string
  stopped: boolean
  stopReason?: string
  /** 进战对应的日志时刻（epoch ms）；未启动为 null */
  combatStartTs: number | null
  finalTimelineTime: number
  combatDurationSec: number
  anchors: SimAnchorResult[]
  entries: SimEntryResult[]
  logs: SimLogLine[]
}

export interface SimSummary {
  anchorSynced: number
  anchorMatched: number
  anchorExpired: number
  anchorPending: number
  anchorUnsupported: number
  entryEnabled: number
  entryActivated: number
  entryNotReached: number
  entrySegmentSkipped: number
  entryOutOfRange: number
  entryInvalidBinding: number
}

export function summarizeSim(result: SimResult): SimSummary {
  const synced = result.anchors.filter(a => a.syncType !== null && a.status !== 'nosync')
  const entries = result.entries
  return {
    anchorSynced: synced.length,
    anchorMatched: synced.filter(a => a.status === 'matched').length,
    anchorExpired: synced.filter(a => a.status === 'expired').length,
    anchorPending: synced.filter(a => a.status === 'pending').length,
    anchorUnsupported: synced.filter(a => a.status === 'unsupported').length,
    entryEnabled: entries.filter(e => e.status !== 'disabled').length,
    entryActivated: entries.filter(e => e.status === 'activated').length,
    entryNotReached: entries.filter(e => e.status === 'notReached').length,
    entrySegmentSkipped: entries.filter(e => e.status === 'segmentSkipped').length,
    entryOutOfRange: entries.filter(e => e.status === 'outOfRange').length,
    entryInvalidBinding: entries.filter(e => e.status === 'invalidBinding').length
  }
}

// ---------- 参数匹配（SyncMatcher.MatchesParams） ----------

function regexMatches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(value ?? '')
  } catch {
    return false
  }
}

/** OrdinalIgnoreCase 相等，或期望值按 `a|b|c` 管道拆分多选一 */
function matchesExpectedValue(actual: string, expected: string): boolean {
  if (actual.toLowerCase() === expected.toLowerCase()) return true
  if (!expected.includes('|')) return false
  return expected
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => part.toLowerCase() === actual.toLowerCase())
}

export function matchesSyncParams(
  ruleParams: Record<string, string>,
  eventParams: Record<string, string>
): boolean {
  const entries = Object.entries(ruleParams)
  if (entries.length === 0) return true
  const eventByLowerKey = new Map(Object.entries(eventParams).map(([k, v]) => [k.toLowerCase(), v]))
  for (const [key, expected] of entries) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.startsWith('regex:')) {
      const actual = eventByLowerKey.get(lowerKey.slice('regex:'.length))
      if (actual === undefined || !regexMatches(expected, actual)) return false
      continue
    }
    if (lowerKey === 'regex') {
      if (![...eventByLowerKey.values()].some(v => regexMatches(expected, v))) return false
      continue
    }
    const actual = eventByLowerKey.get(lowerKey)
    if (actual === undefined || !matchesExpectedValue(actual, expected)) return false
  }
  return true
}

// ---------- 内核 ----------

interface Pending {
  anchor: PtlAnchor
  matchTime: number
  targetTime: number
  windowStart: number
  windowEnd: number
  state: 'pending' | 'matched' | 'expired'
  forceJumpFlag: boolean
  eventLabel?: string
  eventTsMs?: number
  delta?: number
  expireReason?: string
}

interface SimSeg {
  start: PtlAnchor
  end: PtlAnchor
  duration: number
  entries: PtlEntry[]
}

export function runSimulation(doc: PtlDocument, events: SimInputEvent[]): SimResult {
  const logs: SimLogLine[] = []
  const all = sortedAnchors(doc) // (Time, Guid) 排序，含注释/技术锚点 — 与插件 _anchors 一致
  const firstAnchor = all[0] ?? null
  const endAnchorTime = doc.Anchors.length > 0 ? Math.max(...doc.Anchors.map(a => a.Time)) : 0

  // 段由功能锚点切分（PtlDefinition.BuildSegments），Entry 按 StartAnchorGuid 归段
  const fn = functionalAnchors(doc)
  const segments: SimSeg[] = []
  for (let i = 0; i < fn.length - 1; i++) {
    segments.push({
      start: fn[i],
      end: fn[i + 1],
      duration: fn[i + 1].Time - fn[i].Time,
      entries: doc.Entries
        .filter(e => e.StartAnchorGuid === fn[i].Guid)
        .sort((a, b) => a.Offset - b.Offset || a.Guid.localeCompare(b.Guid))
    })
  }
  const segOfEntry = new Map<string, SimSeg>()
  for (const s of segments) for (const e of s.entries) segOfEntry.set(e.Guid, s)
  const anchorByGuid = new Map(all.map(a => [a.Guid, a]))

  // 结果容器
  const anchorResults = new Map<string, SimAnchorResult>()
  const anchorKind = (a: PtlAnchor): SimAnchorResult['kind'] =>
    a.IsCommentAnchor ? 'comment'
      : a.IsTechnicalAnchor ? 'technical'
        : a.IsEndAnchor ? 'end'
          : a.IsPhaseAnchor ? 'phase' : 'normal'
  for (const a of all) {
    const syncType = a.Sync && a.Sync.Type !== 'None' ? a.Sync.Type : null
    anchorResults.set(a.Guid, {
      anchorGuid: a.Guid,
      name: a.Name ?? '',
      time: a.Time,
      syncType,
      kind: anchorKind(a),
      status: 'nosync',
      noActSource: syncType !== null && NO_ACT_SOURCE_TYPES.has(syncType) ? true : undefined
    })
  }
  const entryResults = new Map<string, SimEntryResult>()
  for (const e of doc.Entries) {
    const seg = segOfEntry.get(e.Guid)
    const anchorName = seg ? (seg.start.Name ?? '') : (anchorByGuid.get(e.StartAnchorGuid)?.Name ?? '')
    entryResults.set(e.Guid, {
      entryGuid: e.Guid,
      name: e.Name ?? '',
      anchorGuid: e.StartAnchorGuid,
      anchorName,
      offset: e.Offset,
      status: !e.Enabled ? 'disabled'
        : !seg ? 'invalidBinding'
          : (e.Offset < 0 || e.Offset >= seg.duration) ? 'outOfRange'
            : 'notReached'
    })
  }

  let state: 'loaded' | 'running' | 'stopped' = 'loaded'
  let combatStartTs = 0
  let realElapsed = 0
  let timelineTime = 0
  let stopReason: string | undefined
  const pendings: Pending[] = []
  const activatedAt = new Map<string, { timeline: number; tsMs: number }>()
  const enteredSegs = new Set<SimSeg>()

  const log = (text: string) => {
    logs.push({
      tsMs: state === 'running' ? combatStartTs + realElapsed * 1000 : null,
      timeline: state === 'running' ? timelineTime : null,
      text
    })
  }

  // 越界告警在插件里是 Load 时（Tracker.Initialize）打出的
  for (const s of segments) {
    for (const e of s.entries) {
      if (e.Offset < 0 || e.Offset >= s.duration) {
        log(`越界 Entry 已跳过：${e.Name ?? ''}，Anchor=${s.start.Name ?? ''}，Offset=${e.Offset.toFixed(3)}，区间=${s.start.Time.toFixed(3)}-${s.end.Time.toFixed(3)}。`)
      }
    }
  }

  const currentSeg = (): SimSeg | null =>
    segments.find(s => timelineTime >= s.start.Time && timelineTime < s.end.Time) ?? null

  const expire = (p: Pending, reason: string) => {
    if (p.state !== 'pending') return
    p.state = 'expired'
    p.expireReason = reason
    log(`过期：${p.anchor.Name ?? ''}，原因=${reason}`)
  }

  const expireEarlier = (belowMatchTime: number, reason: string) => {
    for (const p of pendings) {
      if (p.state === 'pending' && p.matchTime < belowMatchTime) expire(p, reason)
    }
  }

  const trackerTick = () => {
    const seg = currentSeg()
    if (!seg) return
    enteredSegs.add(seg)
    const local = timelineTime - seg.start.Time
    for (const e of seg.entries) {
      if (activatedAt.has(e.Guid) || !e.Enabled) continue
      if (e.Offset < 0 || e.Offset >= seg.duration) continue
      if (e.Offset <= local + EPS) {
        activatedAt.set(e.Guid, { timeline: timelineTime, tsMs: combatStartTs + realElapsed * 1000 })
        log(`EntryInstance 创建：${e.Name ?? ''}`)
      }
    }
  }

  const checkEnd = () => {
    if (state === 'running' && timelineTime >= endAnchorTime - EPS) {
      state = 'stopped'
      stopReason = `到达 EndAnchor（TimelineTime=${timelineTime.toFixed(2)} >= ${endAnchorTime.toFixed(2)}）`
      log(`${stopReason} → Stopped。`)
    }
  }

  // SyncMatcher.ApplyDueForceJump（每帧只跳第一个到期的）
  const applyDueForceJump = (): boolean => {
    const due = pendings
      .filter(p => p.state === 'pending' && p.forceJumpFlag
        && p.targetTime > p.matchTime + 0.001 && p.matchTime <= timelineTime + EPS)
      .sort((a, b) => a.matchTime - b.matchTime || a.anchor.Guid.localeCompare(b.anchor.Guid))[0]
    if (!due) return false
    const drift = Math.max(0, timelineTime - due.matchTime)
    const newTime = Math.max(0, due.targetTime + drift)
    due.state = 'matched'
    timelineTime = newTime
    log(`Forcejump: ${due.anchor.Name ?? ''}, from=${due.matchTime.toFixed(2)}, target=${due.targetTime.toFixed(2)}, time=${timelineTime.toFixed(2)}.`)
    for (const p of pendings) {
      if (p.state === 'pending' && p.matchTime < newTime) expire(p, 'Forcejump cleared earlier Pending.')
    }
    return true
  }

  // SyncMatcher.ExpirePastWindow 的连续化：越过 WindowEnd+宽限 即过期
  const expireDue = () => {
    for (const p of pendings) {
      if (p.state === 'pending' && timelineTime > p.windowEnd + EVENT_GRACE_SEC - EPS) {
        expire(p, `超窗：当前=${timelineTime.toFixed(2)}，窗口结束=${p.windowEnd.toFixed(2)}`)
      }
    }
  }

  /** 时钟推进到 targetReal（真实秒），途中按帧序处理 ForceJump/过期/Entry 激活/End 停止 */
  const advanceTo = (targetReal: number) => {
    let guard = 0
    while (state === 'running') {
      if (guard++ > 100000) break
      if (applyDueForceJump()) {
        trackerTick()
        checkEnd()
        continue
      }
      expireDue()
      trackerTick()
      checkEnd()
      if (state !== 'running') return
      const remaining = targetReal - realElapsed
      if (remaining <= EPS) return
      // 下一里程碑的时间轴时间
      let tm = timelineTime + remaining
      for (const p of pendings) {
        if (p.state !== 'pending') continue
        const expireAt = p.windowEnd + EVENT_GRACE_SEC
        if (expireAt > timelineTime + EPS && expireAt < tm) tm = expireAt
        if (p.forceJumpFlag && p.targetTime > p.matchTime + 0.001
          && p.matchTime > timelineTime + EPS && p.matchTime < tm) tm = p.matchTime
      }
      const seg = currentSeg()
      if (seg) {
        for (const e of seg.entries) {
          if (activatedAt.has(e.Guid) || !e.Enabled) continue
          if (e.Offset < 0 || e.Offset >= seg.duration) continue
          const actAt = seg.start.Time + e.Offset
          if (actAt > timelineTime + EPS && actAt < tm) tm = actAt
        }
      }
      if (endAnchorTime > timelineTime + EPS && endAnchorTime < tm) tm = endAnchorTime
      realElapsed += tm - timelineTime
      timelineTime = tm
    }
  }

  const isInEventWindow = (p: Pending, t: number): boolean => {
    if (p.state !== 'pending' || t < p.windowStart - EPS) return false
    if (t <= p.windowEnd + EVENT_GRACE_SEC + EPS) return true
    expire(p, `Out of window: current=${t.toFixed(2)}, end=${p.windowEnd.toFixed(2)}.`)
    return false
  }

  // SyncMatcher.TryMatchPending：候选排序后首个同类型+参数匹配者胜出，事件被消费
  const handleEvent = (ev: SimInputEvent) => {
    const t = timelineTime
    const ordered = pendings
      .filter(p => p.state === 'pending')
      .sort((a, b) =>
        Math.abs(a.matchTime - t) - Math.abs(b.matchTime - t) || a.matchTime - b.matchTime)
    for (const p of ordered) {
      if (!isInEventWindow(p, t)) continue
      const rule = p.anchor.Sync!
      if (rule.Type !== ev.type) continue
      if (!matchesSyncParams(rule.Params ?? {}, ev.params)) continue
      const delta = p.targetTime - t
      timelineTime = Math.max(0, t + delta)
      p.state = 'matched'
      p.eventLabel = ev.label
      p.eventTsMs = ev.tsMs
      p.delta = delta
      log(`Match: ${p.anchor.Name ?? ''}, type=${ev.type}, delta=${delta.toFixed(2)}, time=${timelineTime.toFixed(2)}.`)
      if (p.anchor.IsPhaseAnchor || Math.abs(p.targetTime - p.anchor.Time) > 0.001) {
        expireEarlier(p.targetTime, '阶段锚点命中，清理更早 Pending。')
      }
      trackerTick() // 下一帧 Tracker.Tick 用新时间轴时间激活到期 Entry
      checkEnd()
      return
    }
  }

  // ---------- 主循环 ----------
  const sorted = [...events].sort((a, b) => a.tsMs - b.tsMs)
  let started = false

  for (const ev of sorted) {
    if (state === 'loaded') {
      // Loaded 态只接受首个锚点的 InCombat（TryMatchFirstSync，不检查 Enabled）
      if (ev.type === 'InCombat' && firstAnchor?.Sync?.Type === 'InCombat') {
        state = 'running'
        started = true
        combatStartTs = ev.tsMs
        realElapsed = 0
        timelineTime = 0
        log('首个 InCombat sync 命中：PTL 可以从 Loaded 进入 Running。')
        // LoadRemaining：Skip(1)，Enabled + 有 sync 且非 None；ActorControl 加载期已被剥除
        for (const a of all.slice(1)) {
          if (!a.Enabled || !a.Sync || a.Sync.Type === 'None') continue
          if (a.Sync.Type === 'ActorControl') continue
          let before = a.Sync.WindowBefore
          let after = a.Sync.WindowAfter
          if (before <= 0 && after <= 0) {
            before = after = a.IsPhaseAnchor ? DEFAULT_PHASE_WINDOW_SEC : DEFAULT_WINDOW_SEC
          }
          const matchTime = a.Sync.MatchTime ?? a.Time
          pendings.push({
            anchor: a,
            matchTime,
            targetTime: a.Sync.JumpTargetTime ?? a.Time,
            windowStart: Math.max(0, matchTime - before),
            windowEnd: matchTime + after,
            state: 'pending',
            forceJumpFlag: a.Sync.IsForceJump
          })
        }
        log(`进入 Running 模式：已加载后续 sync 数量=${pendings.length}。`)
        trackerTick()
        checkEnd()
      }
      continue
    }
    if (state !== 'running') break
    if (ev.type === 'CombatEnd') {
      advanceTo((ev.tsMs - combatStartTs) / 1000)
      if (state === 'running') {
        state = 'stopped'
        stopReason = '战斗结束'
        log('战斗结束 → Stopped。')
      }
      continue
    }
    advanceTo((ev.tsMs - combatStartTs) / 1000)
    if (state !== 'running') break
    handleEvent(ev)
  }

  const lastTsMs = sorted.length > 0 ? sorted[sorted.length - 1].tsMs : 0

  // ---------- 汇总锚点结果 ----------
  const pendingByGuid = new Map(pendings.map(p => [p.anchor.Guid, p]))
  for (const a of all) {
    const r = anchorResults.get(a.Guid)!
    const p = pendingByGuid.get(a.Guid)
    if (p) {
      if (p.state === 'matched') {
        r.status = 'matched'
        if (p.eventLabel !== undefined) {
          r.eventLabel = p.eventLabel
          r.eventTsMs = p.eventTsMs
          r.delta = p.delta
        } else {
          r.forceJump = true
        }
      } else if (p.state === 'expired') {
        r.status = 'expired'
        r.detail = p.expireReason
      } else {
        r.status = 'pending'
        r.detail = started ? '战斗结束时仍在等待（窗口未耗尽）' : '时间轴未启动'
      }
      if (UNSUPPORTED_SYNC_TYPES.has(a.Sync!.Type)) {
        r.status = 'unsupported'
        r.detail = `${a.Sync!.Type} 同步在插件运行时永不命中（${p.state === 'expired' ? '窗口已过期' : p.state === 'pending' ? '挂到战斗结束' : '—'}）`
      }
      continue
    }
    if (a === firstAnchor) {
      if (started) {
        r.status = 'matched'
        r.eventLabel = '进入战斗（InCombat）'
        r.eventTsMs = combatStartTs
        r.delta = 0
      } else if (a.Sync?.Type === 'InCombat') {
        r.status = 'pending'
        r.detail = '未等到进入战斗事件'
      } else {
        r.status = 'nosync'
        r.detail = '首锚点同步类型不是 InCombat，插件运行时无法启动时间轴'
      }
      continue
    }
    if (!a.Enabled) {
      r.status = 'nosync'
      r.detail = '锚点已禁用'
    } else if (a.Sync && a.Sync.Type !== 'None' && a.Sync.Type === 'ActorControl') {
      r.status = 'unsupported'
      r.detail = 'ActorControl 同步在插件加载时被剥除，运行时等同无同步'
    } else if (a.Sync && a.Sync.Type !== 'None' && !started) {
      r.status = 'pending'
      r.detail = '时间轴未启动（未等到首个 InCombat）'
    }
    // 其余保持 nosync（无 sync / None）
  }

  // ---------- 汇总行为组结果 ----------
  for (const e of doc.Entries) {
    const r = entryResults.get(e.Guid)!
    if (r.status !== 'notReached') continue
    const act = activatedAt.get(e.Guid)
    if (act) {
      r.status = 'activated'
      r.activatedTimeline = act.timeline
      r.activatedTsMs = act.tsMs
      continue
    }
    const seg = segOfEntry.get(e.Guid)
    if (seg && !enteredSegs.has(seg)) r.status = 'segmentSkipped'
  }

  return {
    started,
    startDetail: started ? undefined : (!firstAnchor
      ? '时间轴没有锚点'
      : firstAnchor.Sync?.Type !== 'InCombat'
        ? `首个锚点「${firstAnchor.Name ?? ''}」的同步类型不是 InCombat（插件将永远等待，无法启动）`
        : '事件流中没有进入战斗（InCombat）事件'),
    stopped: state === 'stopped',
    stopReason,
    combatStartTs: started ? combatStartTs : null,
    finalTimelineTime: timelineTime,
    combatDurationSec: started ? (lastTsMs - combatStartTs) / 1000 : 0,
    anchors: all.map(a => anchorResults.get(a.Guid)!),
    entries: doc.Entries.map(e => entryResults.get(e.Guid)!),
    logs
  }
}
