// 战斗日志 → PR 时间轴的分段锚点对齐算法（纯函数，无 React 依赖）。
// PR 运行时靠锚点 Sync 规则对表，多阶段副本中战斗时间会脱钩，
// 因此用锚点自己的同步规则（CastStart/ActionEffect 的 ActionId / Regex）
// 去日志 BOSS 事件中找回真实时刻，建立分段映射后再换算技能 Offset。

import type { PtlAnchor, PtlEntry } from '@shared/prTypes'
import type { LogsEvent, LogsTimelineDoc } from '../logs/logsTypes'
import { createAction, createEntry, createNode, formatPrTime } from './prModel'

export interface AnchorMatch {
  anchorGuid: string
  /** 锚点定义时间（秒） */
  prTime: number
  /** 对齐到的日志时刻 */
  logMs: number
  method: 'start' | 'exact' | 'interpolated' | 'extrapolated'
  /** method=exact 时命中的 LogsEvent.id */
  eventId?: string
}

export interface SkillUseRow {
  timeMs: number
  name: string
  skillId?: number
  kind: 'gcd' | 'ability'
}

export interface SkillPlacement {
  use: SkillUseRow
  anchorGuid: string
  /** 秒，已收敛到 [0, segmentDuration) */
  offset: number
  /** 越界被钳制或改挂到下一锚点 */
  clamped: boolean
  /** 有 warning 的条目不生成 Entry */
  warning?: string
}

/** 期望窗口半宽：估计时刻 ±30s 内的匹配事件优先 */
const EXPECTED_WINDOW_MS = 30000
/** offset 越界不超过该值时钳制在段内，超过则尝试改挂下一锚点 */
const REFLOW_THRESHOLD_SEC = 3
/** 钳制时与段末保持的间距 */
const CLAMP_GAP_SEC = 0.1

/** 合并 GCD 轨道与 ability 独占列的技能使用，按时间升序 */
export function collectSkillUses(doc: LogsTimelineDoc): SkillUseRow[] {
  const rows: SkillUseRow[] = doc.gcds.map(g => ({
    timeMs: g.timeMs,
    name: g.skill,
    skillId: g.skillId,
    kind: 'gcd'
  }))
  for (const col of doc.columns) {
    if (col.kind !== 'ability') continue // gcd 跟踪列与 gcds 轨道重复，跳过
    for (const use of doc.skillUses[col.id] ?? []) {
      rows.push({ timeMs: use.timeMs, name: col.name, skillId: col.skillId, kind: 'ability' })
    }
  }
  return rows.sort((a, b) => a.timeMs - b.timeMs)
}

interface SyncMatcher {
  actionId?: number
  regex?: RegExp
  /** CastStart 锚点：对齐读条开始时刻（event.timeMs - durationMs）；ActionEffect/其他：对齐判定时刻 */
  castStart: boolean
}

/** 从锚点 Sync 规则解析可观察的日志匹配条件；无法从日志观察的返回 null */
export function anchorSyncMatcher(anchor: PtlAnchor): SyncMatcher | null {
  const sync = anchor.Sync
  if (!sync) return null
  const castStart = sync.Type === 'CastStart'
  if (castStart || sync.Type === 'ActionEffect') {
    const raw = sync.Params?.ActionId ?? sync.Params?.actionId
    const id = typeof raw === 'string' ? Number(raw) : NaN
    if (Number.isFinite(id) && id > 0) return { actionId: id, castStart }
  }
  const regexRaw = sync.Params?.Regex ?? sync.Params?.regex
  if (typeof regexRaw === 'string' && regexRaw.trim()) {
    try {
      return { regex: new RegExp(regexRaw), castStart }
    } catch {
      return null
    }
  }
  return null
}

/** 事件相对锚点同步类型的对齐时刻：读条开始 = 判定时刻 - 读条时长（瞬发=判定时刻） */
export function alignedEventMs(ev: LogsEvent, castStart: boolean): number {
  return castStart ? ev.timeMs - (ev.durationMs ?? 0) : ev.timeMs
}

/** 锚点是否按读条开始同步（对话框标注 读条/判定 用） */
export function anchorCastStart(anchor: PtlAnchor): boolean {
  return anchor.Sync?.Type === 'CastStart'
}

function eventMatches(ev: LogsEvent, matcher: SyncMatcher): boolean {
  if (matcher.actionId !== undefined) return ev.skillId === matcher.actionId
  if (matcher.regex) return matcher.regex.test(ev.text) || (ev.skillName ? matcher.regex.test(ev.skillName) : false)
  return false
}

/** 锚点同步规则在日志中的全部候选事件（映射表人工改选下拉用） */
export function candidateEventsForAnchor(anchor: PtlAnchor, events: LogsEvent[]): LogsEvent[] {
  const matcher = anchorSyncMatcher(anchor)
  if (!matcher) return []
  return events.filter(ev => eventMatches(ev, matcher)).sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * 锚点 ↔ 日志事件单调顺序匹配。
 * anchors 为有序功能锚点（不含 End）。首个锚点强制对齐日志 0 点（method=start），
 * 匹配不上的锚点第二趟用分段线性插值/外推补齐。
 * pins：人工钉选的 anchorGuid → LogsEvent.id，钉选锚点直接使用该事件并以其为基准继续匹配。
 * skips：人工留空的 anchorGuid 集合，留空锚点不参与匹配，与未匹配锚点一样插值/外推补齐。
 */
export function matchAnchorsToLog(
  anchors: PtlAnchor[],
  events: LogsEvent[],
  pins?: ReadonlyMap<string, string>,
  skips?: ReadonlySet<string>
): AnchorMatch[] {
  const sortedEvents = [...events].sort((a, b) => a.timeMs - b.timeMs)
  const matches: AnchorMatch[] = []
  if (anchors.length === 0) return matches

  matches.push({ anchorGuid: anchors[0].Guid, prTime: anchors[0].Time, logMs: 0, method: 'start' })

  // 第一趟：单调贪心匹配（未匹配的先记 null，第二趟补齐）
  const pending: (AnchorMatch | null)[] = [matches[0]]
  for (let i = 1; i < anchors.length; i++) {
    const anchor = anchors[i]

    // 人工留空：不参与匹配，第二趟插值/外推补齐
    if (skips?.has(anchor.Guid)) {
      pending.push(null)
      continue
    }

    const pinnedEventId = pins?.get(anchor.Guid)
    if (pinnedEventId) {
      const pinned = sortedEvents.find(ev => ev.id === pinnedEventId)
      if (pinned) {
        pending.push({
          anchorGuid: anchor.Guid,
          prTime: anchor.Time,
          logMs: alignedEventMs(pinned, anchorCastStart(anchor)),
          method: 'exact',
          eventId: pinned.id
        })
        continue
      }
    }

    const matcher = anchorSyncMatcher(anchor)

    // 前一个已确定锚点（跨越未匹配/留空者）：单调约束与期望时刻都以它为基准，
    // 否则中间锚点留空后约束会重置到 0，后面的事件可能匹配到前面的锚点
    let prevIdx = 0
    for (let j = i - 1; j >= 0; j--) {
      if (pending[j]) { prevIdx = j; break }
    }
    const prev = pending[prevIdx]!
    const prevLogMs = prev.logMs

    // 运行缩放系数估计期望时刻：有匹配锚点对时用段缩放，否则沿用 scale=1
    let scale = 1000 // ms/s：默认 1 PR 秒 = 1000 ms
    for (let j = prevIdx; j > 0; j--) {
      const a = pending[j]
      const b = pending[j - 1]
      if (a && b && a.prTime !== b.prTime) {
        scale = (a.logMs - b.logMs) / (a.prTime - b.prTime)
        break
      }
    }
    const expectedLogMs = prevLogMs + (anchor.Time - prev.prTime) * scale

    let hit: LogsEvent | null = null
    let hitMs = 0
    let fallback: LogsEvent | null = null
    let fallbackMs = 0
    if (matcher) {
      for (const ev of sortedEvents) {
        const t = alignedEventMs(ev, matcher.castStart)
        if (t <= prevLogMs + 1) continue // 单调约束：对齐时刻必须晚于上一锚点
        if (!eventMatches(ev, matcher)) continue
        if (Math.abs(t - expectedLogMs) <= EXPECTED_WINDOW_MS) {
          // 窗口内取离期望时刻最近的（同名技能多次出现时对到正确的第 k 次）
          if (!hit || Math.abs(t - expectedLogMs) < Math.abs(hitMs - expectedLogMs)) { hit = ev; hitMs = t }
        } else if (!fallback) {
          fallback = ev // 窗口外最近的候选，仅在窗口内无匹配时使用
          fallbackMs = t
        }
      }
    }
    const chosen = hit ?? fallback
    const chosenMs = hit ? hitMs : fallbackMs
    pending.push(
      chosen
        ? { anchorGuid: anchor.Guid, prTime: anchor.Time, logMs: chosenMs, method: 'exact', eventId: chosen.id }
        : null
    )
  }

  // 第二趟：插值/外推补齐未匹配锚点
  for (let i = 1; i < pending.length; i++) {
    if (pending[i]) continue
    const prev = pending[i - 1]
    let nextIdx = -1
    for (let j = i + 1; j < pending.length; j++) {
      if (pending[j]) { nextIdx = j; break }
    }
    const anchor = anchors[i]
    if (prev && nextIdx > 0) {
      const next = pending[nextIdx]!
      const prSpan = next.prTime - prev.prTime
      const t = prSpan !== 0 ? (anchor.Time - prev.prTime) / prSpan : 0
      pending[i] = {
        anchorGuid: anchor.Guid,
        prTime: anchor.Time,
        logMs: prev.logMs + (next.logMs - prev.logMs) * t,
        method: 'interpolated'
      }
    } else if (prev) {
      // 尾部外推：沿用最后一段的缩放系数
      let scale = 1000 // ms/s：默认 1 PR 秒 = 1000 ms
      for (let j = i - 1; j > 0; j--) {
        const a = pending[j]
        const b = pending[j - 1]
        if (a && b && a.prTime !== b.prTime) {
          scale = (a.logMs - b.logMs) / (a.prTime - b.prTime)
          break
        }
      }
      pending[i] = {
        anchorGuid: anchor.Guid,
        prTime: anchor.Time,
        logMs: prev.logMs + (anchor.Time - prev.prTime) * scale,
        method: 'extrapolated'
      }
    }
  }

  return pending.filter((m): m is AnchorMatch => m !== null)
}

/** End 锚点（或时间轴末尾）的日志边界：用最后一段缩放系数外推 */
export function endBoundaryLogMs(matches: AnchorMatch[], endPrTime: number | null): number {
  const last = matches[matches.length - 1]
  if (!last) return 0
  if (endPrTime === null || endPrTime <= last.prTime) return Infinity
  let scale = 1000 // ms/s：默认 1 PR 秒 = 1000 ms
  for (let j = matches.length - 1; j > 0; j--) {
    const a = matches[j]
    const b = matches[j - 1]
    if (a.prTime !== b.prTime) {
      scale = (a.logMs - b.logMs) / (a.prTime - b.prTime)
      break
    }
  }
  return last.logMs + (endPrTime - last.prTime) * scale
}

/**
 * 把技能使用落位到 (锚点, Offset)。
 * 段内做缩放校正（日志段时长 / PR 段时长），offset 按 PR 校验规则收敛到 [0, 段长)。
 */
export function placeSkills(
  matches: AnchorMatch[],
  uses: SkillUseRow[],
  endPrTime: number | null
): SkillPlacement[] {
  const placements: SkillPlacement[] = []
  if (matches.length === 0) return placements
  const endLogMs = endBoundaryLogMs(matches, endPrTime)

  const segScale = (i: number): number => {
    const cur = matches[i]
    const nextLog = i + 1 < matches.length ? matches[i + 1].logMs : endLogMs
    const nextPr = i + 1 < matches.length ? matches[i + 1].prTime : endPrTime
    if (nextPr === null || !Number.isFinite(nextLog) || nextPr === cur.prTime) return 1000
    return (nextLog - cur.logMs) / (nextPr - cur.prTime)
  }
  const segDuration = (i: number): number => {
    const nextPr = i + 1 < matches.length ? matches[i + 1].prTime : endPrTime
    if (nextPr === null) return Infinity
    return nextPr - matches[i].prTime
  }

  for (const use of uses) {
    if (use.skillId === undefined) {
      placements.push({ use, anchorGuid: '', offset: 0, clamped: false, warning: '缺少技能 ID，已跳过' })
      continue
    }
    if (use.timeMs < 0 || use.timeMs >= endLogMs) {
      placements.push({ use, anchorGuid: '', offset: 0, clamped: false, warning: '超出时间轴范围，已跳过' })
      continue
    }

    // 找所属段：最后一个 logMs <= timeMs 的锚点
    let seg = -1
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].logMs <= use.timeMs) seg = i
      else break
    }
    if (seg < 0) {
      placements.push({ use, anchorGuid: '', offset: 0, clamped: false, warning: '超出时间轴范围，已跳过' })
      continue
    }

    const scale = segScale(seg)
    let offset = (use.timeMs - matches[seg].logMs) / (scale > 0 ? scale : 1000)
    let anchorIdx = seg
    let clamped = false

    const dur = segDuration(anchorIdx)
    if (offset >= dur) {
      const overflow = offset - dur
      const nextIsEnd = anchorIdx + 1 >= matches.length
      if (overflow <= REFLOW_THRESHOLD_SEC || nextIsEnd) {
        offset = Math.max(0, dur - CLAMP_GAP_SEC)
        clamped = true
      } else {
        // 实际属于下一阶段开头：改挂下一锚点重算
        anchorIdx = anchorIdx + 1
        const scale2 = segScale(anchorIdx)
        offset = (use.timeMs - matches[anchorIdx].logMs) / (scale2 > 0 ? scale2 : 1000)
        const dur2 = segDuration(anchorIdx)
        if (offset < 0) { offset = 0; clamped = true }
        if (offset >= dur2) {
          offset = Number.isFinite(dur2) ? Math.max(0, dur2 - CLAMP_GAP_SEC) : offset
          clamped = true
        }
      }
    }

    placements.push({
      use,
      anchorGuid: matches[anchorIdx].anchorGuid,
      offset: Math.round(offset * 1000) / 1000,
      clamped
    })
  }
  return placements
}

/**
 * 与游戏内编辑器的目标 Auto 一致（ActionHelper.TryResolveActionTargetType）：
 * EffectRange=0 → Self，其余（含近战 -1，运行时按武器射程判定）→ Target。
 * 技能表没有该 id 或没有射程数据时回退 Self（旧行为）。
 */
export function resolveAutoTarget(
  skillId: number | undefined,
  spellLookup: Record<string, { r?: number }> | null | undefined
): string {
  const range = skillId != null ? spellLookup?.[String(skillId)]?.r : undefined
  return range != null && range !== 0 ? 'Target' : 'Self'
}

/** 每个有效 placement 生成一个 enqueueskill 行为组（目标按技能表 Auto 解析） */
export function buildSkillEntries(
  placements: SkillPlacement[],
  matches: AnchorMatch[],
  spellLookup?: Record<string, { r?: number }> | null
): PtlEntry[] {
  const prTimeOf = new Map(matches.map(m => [m.anchorGuid, m.prTime]))
  const entries: PtlEntry[] = []
  for (const p of placements) {
    if (p.warning || !p.anchorGuid) continue
    const anchorPrTime = prTimeOf.get(p.anchorGuid) ?? 0
    const entry = createEntry(p.anchorGuid, `${p.use.name} ${formatPrTime(anchorPrTime + p.offset)}`)
    entry.Offset = p.offset

    const action = createAction('enqueueskill')
    action.ActionId = p.use.skillId ?? null
    action.SkillType = p.use.kind === 'gcd' ? 'Gcd' : 'OffGcd'
    action.Target = resolveAutoTarget(p.use.skillId, spellLookup)

    const node = createNode('action', 2)
    node.Name = p.use.name
    node.Actions = [action]
    entry.EntryGroup.Children = [node]
    entries.push(entry)
  }
  return entries
}
