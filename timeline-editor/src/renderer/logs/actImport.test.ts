import { describe, expect, it } from 'vitest'
import type { ActActorInfo, ActLogEvent } from '@shared/actTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { LogsSkillColumn } from './logsTypes'
import { autoAssignPlayers, buildImportPayload } from './fflogsImport'
import { ACT_JOB_NAMES, parseActLogEvents } from './actImport'

const PLAYER_A = 0x10022A2C // 戈墨（骑士）
const PLAYER_B = 0x10023C5E // 右代宫楼座
const BOSS = 0x4000F001
const ADD = 0x4000F002
const FAIRY = 0x4000F010    // 朝日小仙女（玩家宠物，敌方 id 段）
const ENV = 0xE0000000

// 战斗从 5000ms 处开始（验证相对时间）
const FIGHT_START = 5000
const FIGHT_END = 65000

const actors: ActActorInfo[] = [
  { id: PLAYER_A, name: '戈墨', job: 19, ownerId: 0 },   // 骑士
  { id: PLAYER_B, name: '右代宫楼座', job: 32, ownerId: 0 }, // 占星术士
  { id: FAIRY, name: '朝日小仙女', job: 0, ownerId: PLAYER_B } // 玩家宠物
]

const columns: LogsSkillColumn[] = [
  { id: 'c1', kind: 'ability', name: '翅膀', matchName: '武装戍卫' },
  { id: 'c2', kind: 'gcd', name: '先锋剑' },
  { id: 'c3', kind: 'ability', name: '干预' }
]

function ev(ts: number, sourceId: number, sourceName: string, abilityName: string, type: 'cast' | 'begincast' = 'cast', abilityId = 9000): ActLogEvent {
  return { ts, type, sourceId, sourceName, abilityId, abilityName }
}

const events: ActLogEvent[] = [
  // 玩家技能
  ev(8000, PLAYER_A, '戈墨', '先锋剑', 'cast', 9006),
  ev(9000, PLAYER_A, '戈墨', '先锋剑', 'cast', 9006),
  ev(15000, PLAYER_A, '戈墨', '武装戍卫', 'cast', 9005),
  ev(15200, PLAYER_A, '戈墨', '武装戍卫', 'cast', 9005), // 200ms 后同技能 → 去重丢弃
  ev(16000, PLAYER_B, '右代宫楼座', '武装戍卫', 'cast', 9005),
  ev(12000, PLAYER_A, '戈墨', '未跟踪技能'),
  ev(12500, ENV, '', '环境技能'),                          // 非 0x10/0x40 段 → 忽略
  // BOSS：读条 3s 后判定 + AOE 每目标一行（同刻 3 行）+ 普攻过滤
  ev(17000, BOSS, '终极BOSS', '死刑', 'begincast', 9001),
  ev(20000, BOSS, '终极BOSS', '死刑', 'cast', 9001),
  ev(30000, BOSS, '终极BOSS', '全屏AOE', 'begincast', 9003),
  ev(34000, BOSS, '终极BOSS', '全屏AOE', 'cast', 9003),
  ev(34000, BOSS, '终极BOSS', '全屏AOE', 'cast', 9003), // 22 行按目标拆分 → 去重为 1 个事件
  ev(34001, BOSS, '终极BOSS', '全屏AOE', 'cast', 9003),
  ev(21000, BOSS, '终极BOSS', '攻击', 'cast', 871),
  ev(23000, ADD, '小怪', '冲锋', 'cast', 9002),
  // 玩家宠物（归属者非 0）：施法次数再多也不应被标成 BOSS
  ev(24000, FAIRY, '朝日小仙女', '仙光的拥抱', 'cast', 802),
  ev(25000, FAIRY, '朝日小仙女', '仙光的拥抱', 'cast', 802),
  ev(26000, FAIRY, '朝日小仙女', '仙光的拥抱', 'cast', 802),
  ev(27000, FAIRY, '朝日小仙女', '仙光的拥抱', 'cast', 802)
]

function parse(overrides: Partial<Parameters<typeof parseActLogEvents>[0]> = {}) {
  return parseActLogEvents({
    events,
    actors,
    fightStart: FIGHT_START,
    fightEnd: FIGHT_END,
    columns,
    includeBegincast: true,
    eventFilterRegex: '攻击',
    ...overrides
  })
}

describe('parseActLogEvents', () => {
  it('玩家按 0x10 段归入 friendlies 并带职业名', () => {
    const parsed = parse()
    expect(parsed.players.map(p => p.id).sort()).toEqual([PLAYER_A, PLAYER_B].sort())
    const a = parsed.players.find(p => p.id === PLAYER_A)!
    expect(a.name).toBe('戈墨')
    expect(a.job).toBe('骑士')
    expect(parsed.players.find(p => p.id === PLAYER_B)!.job).toBe('占星术士')
  })

  it('单位表缺失的玩家职业回退为冒险者', () => {
    const parsed = parse({ actors: [] })
    expect(parsed.players.find(p => p.id === PLAYER_A)!.job).toBe('冒险者')
  })

  it('敌方按施法次数标 BOSS（最多者）/NPC，宠物（归属者非 0）不参与 BOSS 启发式', () => {
    const parsed = parse()
    expect(parsed.bosses.map(b => b.id)).toEqual([BOSS])
    expect(parsed.npcs.map(n => n.id)).toEqual([ADD, FAIRY])
  })

  it('玩家技能按列匹配（含别名）并换算相对时间', () => {
    const parsed = parse()
    expect(parsed.gcdCasts['先锋剑']?.[PLAYER_A]).toEqual([3000, 4000])
    expect(parsed.abilityCasts['武装戍卫']?.[PLAYER_A]).toEqual([10000])
    expect(parsed.abilityCasts['武装戍卫']?.[PLAYER_B]).toEqual([11000])
    expect(parsed.abilityCasts['干预']).toBeUndefined()
  })

  it('BOSS 事件：begincast 配对读条时长，AOE 多目标行去重，普攻被过滤', () => {
    const parsed = parse()
    const bossEvents = parsed.eventsBySource[BOSS]
    expect(bossEvents.map(e => e.skillName)).toEqual(['死刑', '全屏AOE'])
    expect(bossEvents[0]).toMatchObject({ timeMs: 15000, durationMs: 3000, guid: 9001 })
    expect(bossEvents[0].text).toBe('终极BOSS 施放 [死刑]')
    expect(bossEvents[1]).toMatchObject({ timeMs: 29000, durationMs: 4000 })
    const addEvents = parsed.eventsBySource[ADD]
    expect(addEvents).toHaveLength(1)
    expect(addEvents[0].durationMs).toBeUndefined() // 无 begincast 配对 → 瞬发
  })

  it('技能 ID 按 guid 记录', () => {
    const parsed = parse()
    expect(parsed.skillIds['先锋剑']).toBe(9006)
    expect(parsed.skillIds['死刑']).toBe(9001)
  })

  it('接 autoAssignPlayers + buildImportPayload 产出与 FFLogs 相同的 payload', () => {
    const parsed = parse()
    const auto = autoAssignPlayers(parsed, columns)
    expect(auto.abilitySource.c1).toBe(PLAYER_A)
    expect(auto.gcdSource['先锋剑']).toBe(PLAYER_A)
    const payload = buildImportPayload(parsed, {
      columns,
      eventSourceIds: [BOSS],
      abilitySource: auto.abilitySource,
      gcdSource: auto.gcdSource
    }, FIGHT_END - FIGHT_START)
    expect(payload.lengthMs).toBe(60000)
    expect(payload.events).toHaveLength(2)
    expect(payload.gcds).toEqual([
      { timeMs: 3000, skill: '先锋剑', skillId: 9006 },
      { timeMs: 4000, skill: '先锋剑', skillId: 9006 }
    ])
    expect(payload.skillUses?.c1).toEqual([{ timeMs: 10000 }])
    expect(payload.columnSkillIds).toMatchObject({ c1: 9005, c2: 9006 })
  })

  it('中文名库按 guid 覆盖 ACT 原名（unknown_xxx 等）', () => {
    const actionNames: ActionNameDatabase = { version: 1, generatedAt: '', source: 'test', actions: { 9001: ['超级死刑'] } }
    const parsed = parse({ actionNames })
    expect(parsed.eventsBySource[BOSS][0].skillName).toBe('超级死刑')
    expect(parsed.eventsBySource[BOSS][0].text).toBe('终极BOSS 施放 [超级死刑]')
  })

  it('ACT_JOB_NAMES 覆盖全部特职', () => {
    for (const job of [19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41]) {
      expect(ACT_JOB_NAMES[job], `job ${job}`).toBeTruthy()
    }
  })
})
