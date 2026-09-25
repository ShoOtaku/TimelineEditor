// simFflogs 单测：FFLogs 战斗 → 模拟事件流（来源过滤 / 去重 / 类型映射 / 战斗边界）
import { describe, expect, it } from 'vitest'
import type { FflogsActor, FflogsCastEvent, FflogsFight } from '@shared/fflogsTypes'
import { buildFflogsSimEvents, collectFflogsSimSources } from './simFflogs'

const fight: FflogsFight = { id: 1, start_time: 100_000, end_time: 700_000, name: '凯夫卡', kill: true }

const enemies: FflogsActor[] = [
  { id: 10, name: '凯夫卡', type: 'Boss' },
  { id: 11, name: '众神之像', type: 'NPC' },
  { id: 12, name: '宝石兽', type: 'Pet' }
]

function cast(sec: number, sourceID: number, guid: number | undefined, type: 'cast' | 'begincast' = 'cast'): FflogsCastEvent {
  return {
    timestamp: 100_000 + sec * 1000,
    type,
    sourceID,
    sourceIsFriendly: false,
    ability: { name: `技能${guid}`, guid }
  }
}

describe('collectFflogsSimSources', () => {
  it('排除宠物，按事件数降序，名称取自 enemies', () => {
    const casts = [cast(1, 10, 100), cast(2, 10, 101), cast(3, 11, 102), cast(4, 12, 103)]
    const sources = collectFflogsSimSources(casts, enemies)
    expect(sources.map(s => s.id)).toEqual([10, 11])
    expect(sources[0]).toMatchObject({ name: '凯夫卡', count: 2 })
  })
})

describe('buildFflogsSimEvents', () => {
  it('InCombat/CombatEnd 用 FFLogs 战斗边界；begincast→CastStart、cast→ActionEffect', () => {
    const events = buildFflogsSimEvents(
      [cast(5, 10, 100, 'begincast'), cast(8, 10, 100)],
      fight, new Set([10]), enemies)
    expect(events[0]).toMatchObject({ type: 'InCombat', tsMs: fight.start_time })
    expect(events[1]).toMatchObject({ type: 'CastStart', tsMs: 105_000, params: { ActionId: '100' } })
    expect(events[2]).toMatchObject({ type: 'ActionEffect', tsMs: 108_000 })
    expect(events[3]).toMatchObject({ type: 'CombatEnd', tsMs: fight.end_time })
  })

  it('同来源同技能同类型 1s 内重复事件去重', () => {
    const events = buildFflogsSimEvents(
      [cast(5, 10, 100, 'begincast'), cast(5.5, 10, 100, 'begincast'), cast(8, 10, 100, 'begincast')],
      fight, new Set([10]), enemies)
    expect(events.filter(e => e.type === 'CastStart').map(e => e.tsMs)).toEqual([105_000, 108_000])
  })

  it('未勾选来源与无 guid 的事件不进事件流', () => {
    const events = buildFflogsSimEvents(
      [cast(5, 10, 100), cast(6, 11, 101), cast(7, 10, undefined)],
      fight, new Set([10]), enemies)
    expect(events.filter(e => e.type === 'ActionEffect').map(e => e.tsMs)).toEqual([105_000])
  })

  it('技能名按国服中文名库翻译（无映射保留原名）', () => {
    const events = buildFflogsSimEvents(
      [cast(5, 10, 100)],
      fight, new Set([10]), enemies,
      { actions: { 100: ['恶狠狠毁荡'] } } as never)
    expect(events[1].label).toContain('恶狠狠毁荡')
    expect(events[1].label).toContain('(100)')
    expect(events[1].label).toContain('凯夫卡')
  })
})
