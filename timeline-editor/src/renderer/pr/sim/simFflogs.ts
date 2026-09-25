// FFLogs 报告战斗 → 模拟事件流转换（纯函数）。
// 与 ACT 路径的差异：casts 无 targetID，但 FFLogs 战斗边界（fight.start_time/end_time）
// 本身就是真实开怪/结束时刻，无需开怪点推断；宠物按 report.enemies 的 type='Pet' 过滤；
// 同一来源同一技能同类型 1s 内的重复事件去重（防读条刷新重复消费 PendingSync）。

import type { FflogsActor, FflogsCastEvent, FflogsFight } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { SimInputEvent } from './simEngine'
import type { SimSource } from './simEvents'

const DEDUP_WINDOW_MS = 1000

/** 敌方施法来源统计（排除宠物；按事件数降序） */
export function collectFflogsSimSources(enemyCasts: FflogsCastEvent[], enemies: FflogsActor[]): SimSource[] {
  const meta = new Map(enemies.map(a => [a.id, a]))
  const map = new Map<number, SimSource>()
  for (const c of enemyCasts) {
    if (c.type !== 'cast' && c.type !== 'begincast') continue
    const actor = meta.get(c.sourceID)
    if (actor?.type === 'Pet') continue
    const s = map.get(c.sourceID) ?? { id: c.sourceID, name: actor?.name ?? String(c.sourceID), count: 0 }
    s.count++
    map.set(c.sourceID, s)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/**
 * 组装模拟事件流：InCombat（fight.start_time）→ 所选敌方来源的 CastStart/ActionEffect → CombatEnd。
 * 无 guid 的技能事件跳过（没有 ActionId 可供匹配，空 Params 反而会误配任意事件）。
 */
export function buildFflogsSimEvents(
  enemyCasts: FflogsCastEvent[],
  fight: FflogsFight,
  sourceIds: ReadonlySet<number>,
  enemies: FflogsActor[] = [],
  actionNames?: ActionNameDatabase
): SimInputEvent[] {
  const nameOf = (ability: FflogsCastEvent['ability']): string =>
    ability.guid !== undefined ? (actionNames?.actions[ability.guid]?.[0] || ability.name) : ability.name
  const sourceNameOf = (id: number): string =>
    enemies.find(a => a.id === id)?.name ?? String(id)

  const out: SimInputEvent[] = [
    { tsMs: fight.start_time, type: 'InCombat', params: {}, label: '进入战斗（FFLogs 战斗起点）' }
  ]
  const last = new Map<string, number>()
  const sorted = [...enemyCasts].sort((a, b) => a.timestamp - b.timestamp)
  for (const c of sorted) {
    if (c.type !== 'cast' && c.type !== 'begincast') continue
    if (!sourceIds.has(c.sourceID)) continue
    if (c.ability.guid === undefined) continue
    const key = `${c.sourceID}|${c.ability.guid}|${c.type}`
    const prev = last.get(key)
    if (prev !== undefined && c.timestamp - prev < DEDUP_WINDOW_MS) continue
    last.set(key, c.timestamp)
    out.push({
      tsMs: c.timestamp,
      type: c.type === 'begincast' ? 'CastStart' : 'ActionEffect',
      params: { ActionId: String(c.ability.guid) },
      label: `${nameOf(c.ability)} (${c.ability.guid}) · ${sourceNameOf(c.sourceID)}`
    })
  }
  out.push({ tsMs: fight.end_time, type: 'CombatEnd', params: {}, label: '战斗结束' })
  return out
}
