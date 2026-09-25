// simEvents 单测：事件流组装（开怪点判定 / 敌方来源过滤 / 默认勾选）
import { describe, expect, it } from 'vitest'
import type { ActActorInfo, ActEncounter, ActLogEvent } from '@shared/actTypes'
import { buildSimEvents, collectPetIds, collectSimSources, defaultSimSourceIds } from './simEvents'

const BOSS = 0x40000001
const ADD = 0x40000002
const PET = 0x40000003 // 玩家召唤物（0x40 段但归属玩家）
const MT = 0x10000001

const actors: ActActorInfo[] = [
  { id: BOSS, name: 'BOSS', job: 0, ownerId: 0 },
  { id: ADD, name: '小怪', job: 0, ownerId: 0 },
  { id: PET, name: '小仙女', job: 0, ownerId: MT },
  { id: MT, name: '玩家MT', job: 1, ownerId: 0 }
]

const encounter: ActEncounter = { id: 1, start: 0, end: 600_000, events: 6 }

function ev(tsSec: number, sourceId: number, targetId: number, type: 'cast' | 'begincast' = 'cast'): ActLogEvent {
  return {
    ts: tsSec * 1000,
    type,
    sourceId,
    sourceName: `src${sourceId.toString(16)}`,
    abilityId: 100,
    abilityName: '技能',
    targetId
  }
}

describe('collectSimSources / collectPetIds', () => {
  it('来源只含非宠物敌方，按事件数降序', () => {
    const events = [ev(10, BOSS, MT), ev(11, BOSS, MT), ev(12, ADD, MT), ev(13, PET, MT)]
    const sources = collectSimSources(events, actors)
    expect(sources.map(s => s.id)).toEqual([BOSS, ADD])
    expect(defaultSimSourceIds(sources)).toEqual([BOSS, ADD]) // 默认全选
  })

  it('collectPetIds 收集归属者非 0 的单位', () => {
    expect(collectPetIds(actors).has(PET)).toBe(true)
    expect(collectPetIds(actors).has(BOSS)).toBe(false)
  })
})

describe('buildSimEvents 开怪点判定', () => {
  it('开怪前的玩家自身技能/召唤物治疗不算开怪；首个玩家指向敌方的事件为 t0', () => {
    const events = [
      ev(0, MT, MT),            // 开怪前自身 buff
      ev(86, PET, MT),          // 召唤物治疗（来源 0x40 但是宠物）
      ev(102, MT, BOSS),        // MT 打到 BOSS —— 真正的开怪
      ev(106, BOSS, MT, 'begincast')
    ]
    const sim = buildSimEvents(events, encounter, new Set([BOSS]), collectPetIds(actors))
    expect(sim[0].type).toBe('InCombat')
    expect(sim[0].tsMs).toBe(102_000)
    // 开怪点之后的事件才进入事件流
    expect(sim.filter(e => e.type === 'CastStart').map(e => e.tsMs)).toEqual([106_000])
    expect(sim[sim.length - 1].type).toBe('CombatEnd')
  })

  it('没有玩家先手时用首个非宠物敌方事件', () => {
    const events = [ev(50, PET, MT), ev(60, BOSS, MT, 'begincast')]
    const sim = buildSimEvents(events, encounter, new Set([BOSS]), collectPetIds(actors))
    expect(sim[0].tsMs).toBe(60_000)
  })

  it('完全没有涉及敌方的事件时回退到分段起点', () => {
    const sim = buildSimEvents([ev(10, MT, MT)], encounter, new Set([BOSS]), new Set())
    expect(sim[0].tsMs).toBe(encounter.start)
  })

  it('未勾选来源的事件不进事件流', () => {
    const events = [ev(10, MT, BOSS), ev(12, BOSS, MT, 'begincast'), ev(13, ADD, MT)]
    const sim = buildSimEvents(events, encounter, new Set([ADD]), collectPetIds(actors))
    expect(sim.some(e => e.type === 'CastStart')).toBe(false)
    expect(sim.filter(e => e.type === 'ActionEffect').map(e => e.tsMs)).toEqual([13_000])
  })
})
