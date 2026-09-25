// ACT 日志窗口事件 → 模拟事件流转换（纯函数）。
// 事件源映射：ACT 20 行（StartsCast）→ CastStart；21/22 行（Ability/AOE）→ ActionEffect；
// 战斗段开始 → InCombat（近似插件的玩家 ConditionFlag.InCombat 边沿，可能差 <1s）；
// 战斗段结束 → CombatEnd（插件在战斗结束时 Stop + Reload）。
// ActionId 用十进制字符串，与插件 StartCast/ActionEffect 捕获的 eventParams 一致。
// 只保留敌方（0x40 段）事件：玩家（0x10 段）与玩家召唤物（03 行归属者非 0）一律过滤。

import type { ActActorInfo, ActEncounter, ActLogEvent } from '@shared/actTypes'
import { isActEnemyId, isActPlayerId } from '@shared/actTypes'
import type { SimInputEvent } from './simEngine'

export interface SimSource {
  id: number
  name: string
  count: number
}

/** 统计窗口事件中的敌方来源单位（按事件数降序；玩家召唤物/化身不列入） */
export function collectSimSources(events: ActLogEvent[], actors: ActActorInfo[]): SimSource[] {
  const ownerById = new Map(actors.map(a => [a.id, a.ownerId]))
  const map = new Map<number, SimSource>()
  for (const ev of events) {
    if (!isActEnemyId(ev.sourceId)) continue
    if ((ownerById.get(ev.sourceId) ?? 0) !== 0) continue // 玩家召唤物/化身
    const s = map.get(ev.sourceId) ?? { id: ev.sourceId, name: ev.sourceName, count: 0 }
    s.count++
    map.set(ev.sourceId, s)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** 默认勾选：全部敌方来源 */
export function defaultSimSourceIds(sources: SimSource[]): number[] {
  return sources.map(s => s.id)
}

/** 玩家召唤物/化身 id 集合（03 行归属者非 0） */
export function collectPetIds(actors: ActActorInfo[]): Set<number> {
  return new Set(actors.filter(a => a.ownerId !== 0).map(a => a.id))
}

/**
 * 组装模拟事件流：InCombat → 所选敌方来源的 CastStart/ActionEffect → CombatEnd。
 * 玩家与玩家召唤物的事件不进入匹配事件流（敌方来源由 collectSimSources 提供，已过滤）。
 *
 * InCombat 映射为「开怪时刻」= 首个 非宠物敌方来源 或 玩家指向敌方 的战斗事件：
 * ACT 分段从第一个战斗事件起算，其中可能混有开怪前的玩家行动（道具/疾跑/召唤物治疗等），
 * 而插件的 InCombat 是玩家进战边沿 ≈ 首个打到敌方的技能/敌方首个动作。
 */
export function buildSimEvents(
  events: ActLogEvent[],
  encounter: ActEncounter,
  sourceIds: ReadonlySet<number>,
  petIds: ReadonlySet<number> = new Set()
): SimInputEvent[] {
  let pullTs = Infinity
  for (const ev of events) {
    const enemyAction = isActEnemyId(ev.sourceId) && !petIds.has(ev.sourceId)
    const playerHitsEnemy = isActPlayerId(ev.sourceId)
      && ev.targetId !== undefined && isActEnemyId(ev.targetId) && !petIds.has(ev.targetId)
    if ((enemyAction || playerHitsEnemy) && ev.ts < pullTs) pullTs = ev.ts
  }
  const startTs = Number.isFinite(pullTs) ? pullTs : encounter.start
  const out: SimInputEvent[] = [
    { tsMs: startTs, type: 'InCombat', params: {}, label: '进入战斗（首个涉及敌方的事件）' }
  ]
  for (const ev of events) {
    if (!sourceIds.has(ev.sourceId)) continue
    if (ev.ts < startTs) continue
    out.push({
      tsMs: ev.ts,
      type: ev.type === 'begincast' ? 'CastStart' : 'ActionEffect',
      params: { ActionId: String(ev.abilityId) },
      label: `${ev.abilityName} (${ev.abilityId}) · ${ev.sourceName}`
    })
  }
  out.push({ tsMs: encounter.end, type: 'CombatEnd', params: {}, label: '战斗结束' })
  return out.sort((a, b) => a.tsMs - b.tsMs)
}
