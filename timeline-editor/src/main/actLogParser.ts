// ACT 日志行解析（纯函数，不依赖 electron/fs，可单测）
// 行格式见 shared/actTypes.ts 头部注释；参考 ccinos act_dps_show timeline.js 的
// parseActLogFile（只取 21 行），此处补充 20（读条时长）与 22（AOE）行，
// 以及 25（死亡）与 260（InCombat）行用于团灭/脱战分段

import type { ActActorInfo, ActEncounter, ActEncounterEndReason, ActLogEvent } from '../shared/actTypes'
import { isActEnemyId, isActPlayerId, parseActId } from '../shared/actTypes'

export { isActEnemyId, isActPlayerId, parseActId }

/** 解析出的战斗行（比 IPC 形状多目标信息，供战斗分段判断敌我参与） */
export interface ParsedActLine extends ActLogEvent {
  targetId: number
}

export const LINE_TYPE = {
  ChangeZone: '01',
  AddCombatant: '03',
  StartsCast: '20',
  Ability: '21',
  AoeAbility: '22',
  Death: '25',
  InCombat: '260'
} as const

const COMBAT_LINE_TYPES = new Set<string>([LINE_TYPE.StartsCast, LINE_TYPE.Ability, LINE_TYPE.AoeAbility])

/** ACT 时间戳（2026-09-16T20:42:45.2260000+08:00）→ epoch ms；失败返回 NaN */
export function parseActTimestamp(raw: string): number {
  // V8 对 7 位小数控件的解析实现相关，统一截断为 3 位再交给 Date.parse
  return Date.parse(raw.replace(/(\.\d{3})\d+/, '$1'))
}

/** 20/21/22 战斗行 → 归一化事件；非战斗行/字段缺失返回 null */
export function parseCombatLine(line: string): ParsedActLine | null {
  const type = line.slice(0, 2)
  if (!COMBAT_LINE_TYPES.has(type) || line.charCodeAt(2) !== 0x7c /* | */) return null
  const f = line.split('|')
  // 至少需要到目标名（20 行: 0..8+；21/22 行更长）
  if (f.length < 8) return null
  const ts = parseActTimestamp(f[1])
  if (Number.isNaN(ts)) return null
  const sourceId = parseActId(f[2])
  const abilityId = parseActId(f[4])
  const targetId = parseActId(f[6])
  if (Number.isNaN(sourceId) || Number.isNaN(abilityId)) return null
  return {
    ts,
    type: type === LINE_TYPE.StartsCast ? 'begincast' : 'cast',
    sourceId,
    sourceName: f[3],
    abilityId,
    abilityName: f[5],
    targetId: Number.isNaN(targetId) ? 0 : targetId
  }
}

/** 25 Death 行 → 死亡单位 ID 与时间；非 25 行/字段缺失返回 null */
export function parseDeathLine(line: string): { ts: number; id: number } | null {
  if (!line.startsWith('25|')) return null
  const f = line.split('|')
  if (f.length < 4) return null
  const ts = parseActTimestamp(f[1])
  const id = parseActId(f[2])
  if (Number.isNaN(ts) || Number.isNaN(id)) return null
  return { ts, id }
}

/** 260 InCombat 行（OverlayPlugin）→ ACT 战斗状态与时间；非 260 行返回 null */
export function parseInCombatLine(line: string): { ts: number; inCombat: boolean } | null {
  if (!line.startsWith('260|')) return null
  const f = line.split('|')
  if (f.length < 4) return null
  const ts = parseActTimestamp(f[1])
  if (Number.isNaN(ts)) return null
  return { ts, inCombat: f[2] === '1' }
}

/** 01 ChangeZone 行 → 区域名与时间 */
export function parseChangeZoneLine(line: string): { ts: number; zoneName: string } | null {
  if (!line.startsWith('01|')) return null
  const f = line.split('|')
  if (f.length < 4 || !f[3]) return null
  const ts = parseActTimestamp(f[1])
  if (Number.isNaN(ts)) return null
  return { ts, zoneName: f[3] }
}

/** 03 AddCombatant 行 → 单位信息（玩家/敌方都保留；无效返回 null） */
export function parseAddCombatantLine(line: string): ActActorInfo | null {
  if (!line.startsWith('03|')) return null
  const f = line.split('|')
  if (f.length < 7) return null
  const id = parseActId(f[2])
  // 只认玩家/敌方段的单位（排除环境等特殊 id）
  if (Number.isNaN(id) || (!isActPlayerId(id) && !isActEnemyId(id)) || !f[3]) return null
  const job = parseActId(f[4])
  const ownerId = parseActId(f[6])
  return {
    id,
    name: f[3],
    job: Number.isNaN(job) ? 0 : job,
    ownerId: Number.isNaN(ownerId) ? 0 : ownerId
  }
}

interface MutableEncounter {
  start: number
  end: number
  zoneName?: string
  events: number
  /** 段内是否有敌方单位（0x40 段）作为来源或目标 */
  hasEnemy: boolean
  endReason?: ActEncounterEndReason
}

/** 团灭判定：该窗口内死亡的不同玩家数达到阈值即视为团灭（8 人队全灭通常几秒内连续死亡） */
const WIPE_DEATH_WINDOW_MS = 15_000
const WIPE_DEATH_MIN_PLAYERS = 4
/** 团灭关段后的尾部抑制：团灭瞬间 BOSS 常残留几个清场/消失动作，不另起新段 */
const WIPE_TAIL_MS = 20_000

/**
 * 战斗分段器：战斗事件（20/21/22）按时间连续累积，以下情况切断成新的一场战斗：
 *  1. 相邻事件间隔超过 gapMs；
 *  2. 区域切换；
 *  3. 260 InCombat 行报告 ACT 战斗状态 1→0（击杀/团灭/脱战重置）——最精确的开怪级切分；
 *  4. 日志没有 InCombat 行时兜底：WIPE_DEATH_WINDOW_MS 内 ≥WIPE_DEATH_MIN_PLAYERS 名
 *     不同玩家死亡视为团灭，立即切断（团灭后重新开怪不会被揉进上一场）。
 */
export class ActEncounterTracker {
  private current: MutableEncounter | null = null
  private zoneName: string | undefined
  private readonly done: MutableEncounter[] = []
  private prevInCombat: boolean | null = null
  private sawInCombatLine = false
  private recentPlayerDeaths: { ts: number; id: number }[] = []
  private wipeClosedAt: number | null = null

  constructor(private readonly gapMs: number) {}

  /** 区域切换：结束当前段，后续段归入新区域 */
  changeZone(zoneName: string): void {
    this.closeCurrent('zone')
    this.zoneName = zoneName
  }

  feedCombat(line: ParsedActLine): void {
    if (this.inWipeTail(line.ts)) return
    const cur = this.current
    if (cur && line.ts - cur.end > this.gapMs) this.closeCurrent('gap')
    const seg = this.current ?? (this.current = {
      start: line.ts,
      end: line.ts,
      zoneName: this.zoneName,
      events: 0,
      hasEnemy: false
    })
    seg.end = line.ts
    seg.events += 1
    if (isActEnemyId(line.sourceId) || isActEnemyId(line.targetId)) seg.hasEnemy = true
  }

  /** 260 InCombat 行：ACT 战斗状态 1→0 结束当前段；0→1 解除团灭尾部抑制 */
  feedInCombat(inCombat: boolean, ts: number): void {
    this.sawInCombatLine = true
    if (this.prevInCombat === true && !inCombat) {
      const wipe = this.isWipe(ts)
      if (this.closeCurrent(wipe ? 'wipe' : 'combatEnd') && wipe) this.wipeClosedAt = ts
      this.recentPlayerDeaths = []
    } else if (this.prevInCombat === false && inCombat) {
      this.wipeClosedAt = null
    }
    this.prevInCombat = inCombat
  }

  /** 25 死亡行：记录玩家死亡；无 InCombat 信号时以死亡爆发作为团灭切段依据 */
  feedDeath(id: number, ts: number): void {
    if (!isActPlayerId(id)) return
    if (this.inWipeTail(ts)) return
    this.recentPlayerDeaths.push({ ts, id })
    if (!this.sawInCombatLine && this.isWipe(ts)) {
      if (this.closeCurrent('wipe')) this.wipeClosedAt = ts
      this.recentPlayerDeaths = []
    }
  }

  /**
   * 收尾并返回战斗列表。只保留有敌方单位参与且事件数 >= minEvents 的段
   * （过滤掉主城传送/木桩外零散动作产生的噪声段）。
   */
  finish(minEvents = 5): ActEncounter[] {
    this.closeCurrent()
    return this.done
      .filter(seg => seg.hasEnemy && seg.events >= minEvents)
      .map((seg, i) => ({
        id: i + 1,
        start: seg.start,
        end: seg.end,
        zoneName: seg.zoneName,
        events: seg.events,
        endReason: seg.endReason
      }))
  }

  /** ts 前团灭窗口内是否有足够多的不同玩家死亡（顺带清理过期死亡记录） */
  private isWipe(ts: number): boolean {
    this.recentPlayerDeaths = this.recentPlayerDeaths.filter(d => ts - d.ts <= WIPE_DEATH_WINDOW_MS)
    return new Set(this.recentPlayerDeaths.map(d => d.id)).size >= WIPE_DEATH_MIN_PLAYERS
  }

  /** 团灭尾部窗口内的事件/死亡直接丢弃；窗口过后解除抑制 */
  private inWipeTail(ts: number): boolean {
    if (this.wipeClosedAt === null) return false
    if (ts - this.wipeClosedAt <= WIPE_TAIL_MS) return true
    this.wipeClosedAt = null
    return false
  }

  private closeCurrent(reason?: ActEncounterEndReason): boolean {
    if (!this.current) return false
    this.current.endReason = reason
    this.done.push(this.current)
    this.current = null
    return true
  }
}
