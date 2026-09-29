// logMerge 单测：来源归一化（开怪点/宠物/去重）、多场对齐合并（多 ID/配对/过滤）、文档生成
import { describe, expect, it } from 'vitest'
import type { ActActorInfo, ActEncounter, ActLogEvent } from '@shared/actTypes'
import type { FflogsActor, FflogsCastEvent, FflogsFight } from '@shared/fflogsTypes'
import {
  buildActBossFight, buildFflogsBossFight, buildTimelineFromClusters,
  mergeBossFights, type BossLogFight, type MergedCluster
} from './logMerge'
import { validatePtlDocument } from './prModel'

const BOSS = 0x40000001
const ADD = 0x40000002
const PET = 0x40000003
const MT = 0x10000001

const actors: ActActorInfo[] = [
  { id: BOSS, name: 'BOSS', job: 0, ownerId: 0 },
  { id: ADD, name: '小怪', job: 0, ownerId: 0 },
  { id: PET, name: '小仙女', job: 0, ownerId: MT },
  { id: MT, name: '玩家MT', job: 1, ownerId: 0 }
]

const encounter: ActEncounter = { id: 1, start: 0, end: 600_000, events: 10, zoneName: '测试副本' }

function actEv(tsSec: number, sourceId: number, targetId: number, abilityId = 100, type: 'cast' | 'begincast' = 'cast'): ActLogEvent {
  return {
    ts: tsSec * 1000,
    type,
    sourceId,
    sourceName: `src${sourceId.toString(16)}`,
    abilityId,
    abilityName: `技能${abilityId}`,
    targetId
  }
}

describe('buildActBossFight', () => {
  it('开怪点相对时间；宠物与开怪前事件剔除；begincast→start', () => {
    const events = [
      actEv(0, MT, MT),                       // 开怪前自身 buff
      actEv(50, PET, MT),                     // 召唤物（不算开怪）
      actEv(100, MT, BOSS),                   // 开怪
      actEv(105, BOSS, MT, 1001, 'begincast'),
      actEv(108, BOSS, MT, 1001),
      actEv(110, PET, MT, 2000),              // 宠物事件剔除
      actEv(112, ADD, MT, 3000)
    ]
    const fight = buildActBossFight('k1', 'ACT 战斗', events, actors, encounter)
    expect(fight.events.map(e => [e.tMs, e.kind, e.id])).toEqual([
      [5000, 'start', 1001],
      [8000, 'effect', 1001],
      [12000, 'effect', 3000]
    ])
    expect(fight.durationMs).toBe(500_000)
    expect(fight.selectedSourceIds).toEqual([BOSS, ADD])
  })

  it('同键 1s 去重：22 行 AOE 每个目标一行只留一个事件', () => {
    const events = [
      actEv(100, MT, BOSS),                     // 开怪
      actEv(105, BOSS, MT, 1001),
      actEv(105, BOSS, 0x10000002, 1001),       // AOE 第二目标 → 去重
      actEv(105.5, BOSS, 0x10000003, 1001),     // 500ms 内重复 → 去重
      actEv(107, BOSS, MT, 1001)                // 2s 后同技能 → 保留（另一次施法）
    ]
    const fight = buildActBossFight('k1', 'ACT 战斗', events, actors, encounter)
    expect(fight.events.map(e => [e.tMs, e.id])).toEqual([[5000, 1001], [7000, 1001]])
  })
})

const ffFight: FflogsFight = { id: 3, start_time: 1_000_000, end_time: 1_600_000, name: '测试BOSS', zoneName: '测试副本' }
const ffEnemies: FflogsActor[] = [
  { id: 10, name: 'BOSS', type: 'Boss' },
  { id: 11, name: '宝石兽', type: 'Pet' }
]

function ffCast(offsetMs: number, sourceID: number, guid: number | undefined, type = 'cast'): FflogsCastEvent {
  return {
    timestamp: ffFight.start_time + offsetMs,
    type,
    sourceID,
    sourceIsFriendly: false,
    ability: { name: `ff技能${guid}`, guid }
  }
}

describe('buildFflogsBossFight', () => {
  it('战斗边界即开怪点；Pet/无 guid 剔除；同键 1s 去重', () => {
    const casts = [
      ffCast(5000, 10, 1001, 'begincast'),
      ffCast(5400, 10, 1001, 'begincast'),  // 400ms 重复（读条刷新）→ 去重
      ffCast(8000, 10, 1001),
      ffCast(9000, 11, 2000),               // Pet → 剔除
      ffCast(9500, 10, undefined),          // 无 guid → 剔除
      ffCast(10000, 10, 3000)
    ]
    const fight = buildFflogsBossFight('k2', 'FFLogs 战斗', casts, ffFight, ffEnemies)
    expect(fight.events.map(e => [e.tMs, e.kind, e.id])).toEqual([
      [5000, 'start', 1001],
      [8000, 'effect', 1001],
      [10000, 'effect', 3000]
    ])
    expect(fight.sources.map(s => s.id)).toEqual([10])
  })
})

function makeFight(events: BossLogFight['events'], key = 'f'): BossLogFight {
  return {
    key,
    label: key,
    source: 'act',
    durationMs: 600_000,
    events,
    sources: [{ id: BOSS, name: 'BOSS', count: events.length }],
    selectedSourceIds: [BOSS]
  }
}

function bossEv(tMs: number, id: number, kind: 'start' | 'effect' = 'start'): BossLogFight['events'][number] {
  return { tMs, kind, id, name: `技能${id}`, sourceId: BOSS }
}

describe('mergeBossFights', () => {
  it('两场同一次施法对齐为一个簇，时间取中位数', () => {
    const f1 = makeFight([bossEv(10_000, 100), bossEv(20_000, 200)])
    const f2 = makeFight([bossEv(10_800, 100), bossEv(20_600, 200)])
    const clusters = mergeBossFights([f1, f2])
    expect(clusters).toHaveLength(2)
    expect(clusters[0].timeMs).toBe(10_400)
    expect(clusters[0].fightCount).toBe(2)
    expect(clusters[0].ids).toEqual([100])
  })

  it('跨场 id 不同（同一技能多个 ID）合并为一个簇', () => {
    const f1 = makeFight([bossEv(10_000, 100)])
    const f2 = makeFight([bossEv(10_500, 200)])
    const f3 = makeFight([bossEv(10_200, 300)])
    const clusters = mergeBossFights([f1, f2, f3])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].ids).toEqual([100, 200, 300])
    expect(clusters[0].fightCount).toBe(3)
  })

  it('同一场不同时刻的技能不合并（两次施法）', () => {
    const f1 = makeFight([bossEv(10_000, 100), bossEv(10_500, 200)])
    const f2 = makeFight([bossEv(10_200, 100), bossEv(10_400, 200)])
    const clusters = mergeBossFights([f1, f2])
    expect(clusters).toHaveLength(2)
    expect(clusters.map(c => c.ids)).toEqual([[100], [200]])
  })

  it('同一场同一时刻的多个技能合并为一个簇（一个锚点）', () => {
    const f1 = makeFight([bossEv(10_000, 100), bossEv(10_000, 200)])
    const f2 = makeFight([bossEv(10_300, 100), bossEv(10_300, 200)])
    const clusters = mergeBossFights([f1, f2])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].ids).toEqual([100, 200])
    expect(clusters[0].fightCount).toBe(2)
    expect(clusters[0].timeMs).toBe(10_150)
    expect(clusters[0].perFight[0].timesMs).toHaveLength(2)
  })

  it('同一场连续读条不会被限宽窗口链式合并', () => {
    const f1 = makeFight([bossEv(0, 100), bossEv(2_000, 100), bossEv(4_000, 100), bossEv(6_000, 100)])
    const clusters = mergeBossFights([f1], { windowMs: 2500 })
    expect(clusters).toHaveLength(4)
  })

  it('读条与判定各自生成锚点（默认）；includeEffectAnchors=false 只留读条', () => {
    const f1 = makeFight([bossEv(10_000, 100, 'start'), bossEv(12_500, 100, 'effect')])
    const withPair = mergeBossFights([f1])
    expect(withPair.map(c => [c.kind, c.paired])).toEqual([['start', false], ['effect', true]])
    const filtered = mergeBossFights([f1], { includeEffectAnchors: false })
    expect(filtered.map(c => c.kind)).toEqual(['start'])
  })

  it('无配对读条的瞬发技能保留 ActionEffect 锚点', () => {
    const f1 = makeFight([bossEv(10_000, 100, 'start'), bossEv(20_000, 999, 'effect')])
    const clusters = mergeBossFights([f1])
    expect(clusters.map(c => [c.kind, c.ids[0]])).toEqual([['start', 100], ['effect', 999]])
  })

  it('minFights 过滤偶发事件', () => {
    const f1 = makeFight([bossEv(10_000, 100), bossEv(30_000, 500)])
    const f2 = makeFight([bossEv(10_500, 100)])
    const clusters = mergeBossFights([f1, f2], { minFights: 2 })
    expect(clusters).toHaveLength(1)
    expect(clusters[0].ids).toEqual([100])
  })

  it('未勾选来源的事件不参与合并', () => {
    const fight = makeFight([bossEv(10_000, 100), { ...bossEv(12_000, 200), sourceId: ADD }], 'f')
    fight.sources.push({ id: ADD, name: '小怪', count: 1 })
    fight.selectedSourceIds = [BOSS]
    const clusters = mergeBossFights([fight])
    expect(clusters.map(c => c.ids)).toEqual([[100]])
  })
})

function cluster(timeMs: number, ids: number[], kind: 'start' | 'effect' = 'start', fightCount = 2): MergedCluster {
  return {
    timeMs, kind, ids,
    names: ids.map(id => `技能${id}`),
    fightCount,
    perFight: [{ fightIndex: 0, timesMs: [timeMs] }],
    paired: false
  }
}

describe('buildTimelineFromClusters', () => {
  it('首锚点 InCombat@0，末锚点 End，时间严格递增，多 ID 写 Regex', () => {
    const doc = buildTimelineFromClusters([
      cluster(10_000, [100]),
      cluster(10_000, [200]),                    // 同时刻第二个技能 → 时间错开
      cluster(20_000, [300, 301], 'start', 3)    // 多 ID
    ], { name: '测试', sourceLabels: ['日志A', '日志B'] })
    const fn = doc.Anchors
    expect(fn[0].Time).toBe(0)
    expect(fn[0].Sync?.Type).toBe('InCombat')
    expect(fn[fn.length - 1].IsEndAnchor).toBe(true)
    for (let i = 1; i < fn.length; i++) expect(fn[i].Time).toBeGreaterThan(fn[i - 1].Time)
    const single = fn[1]
    expect(single.Sync?.Params.ActionId).toBe('100')
    expect(single.Sync?.Type).toBe('CastStart')
    expect(single.Name).toContain('开始读条')
    const multi = fn[3]
    expect(multi.Sync?.Params.Regex).toBe('^(?:300|301)$')
    expect(multi.Name).toContain('⚠')
    expect(multi.Remark).toContain('多个 ID')
    expect(multi.Remark).toContain('3 场')
    expect(doc.Meta.Remark).toContain('日志A')
    expect(doc.Meta.Remark).toContain('模拟测试')
    expect(validatePtlDocument(doc).filter(i => i.level === 'error')).toEqual([])
  })

  it('同一时刻多技能合并的锚点：Regex 同步、不带 ⚠、备注说明合并', () => {
    const doc = buildTimelineFromClusters([{
      timeMs: 10_000, kind: 'start', ids: [100, 200], names: ['技能100', '技能200'],
      fightCount: 2,
      perFight: [
        { fightIndex: 0, timesMs: [10_000, 10_000] },
        { fightIndex: 1, timesMs: [10_300, 10_300] }
      ],
      paired: false
    }], { name: '测试', sourceLabels: [] })
    const anchor = doc.Anchors[1]
    expect(anchor.Sync?.Params.Regex).toBe('^(?:100|200)$')
    expect(anchor.Name).not.toContain('⚠')
    expect(anchor.Remark).toContain('同一时刻')
    expect(anchor.Remark).not.toContain('请实测确认')
  })

  it('空簇时只剩首尾锚点（仍是合法文档）', () => {
    const doc = buildTimelineFromClusters([], { name: '空', sourceLabels: [] })
    expect(doc.Anchors).toHaveLength(2)
    expect(validatePtlDocument(doc).filter(i => i.level === 'error')).toEqual([])
  })
})
