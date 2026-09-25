import { describe, expect, it } from 'vitest'
import {
  ActEncounterTracker,
  isActEnemyId,
  isActPlayerId,
  parseActTimestamp,
  parseAddCombatantLine,
  parseChangeZoneLine,
  parseCombatLine
} from './actLogParser'
import type { ParsedActLine } from './actLogParser'

// 全部样本取自真实 ACT 日志（FFXIVLogs/Network_30300_20260916.log）
const TS = '2026-09-16T20:42:45.2260000+08:00'

describe('parseActTimestamp', () => {
  it('解析 7 位小数控件的时间戳', () => {
    expect(parseActTimestamp(TS)).toBe(Date.parse('2026-09-16T20:42:45.226+08:00'))
  })
  it('不同时区偏移得到相同时刻', () => {
    expect(parseActTimestamp('2026-09-16T12:42:45.2260000+00:00')).toBe(parseActTimestamp(TS))
  })
  it('非法输入返回 NaN', () => {
    expect(Number.isNaN(parseActTimestamp('not-a-date'))).toBe(true)
  })
})

describe('id 分类', () => {
  it('0x10 段为玩家', () => {
    expect(isActPlayerId(0x10022A2C)).toBe(true)
    expect(isActPlayerId(0x400004A1)).toBe(false)
  })
  it('0x40 段为敌方', () => {
    expect(isActEnemyId(0x400004A1)).toBe(true)
    expect(isActEnemyId(0x40008189)).toBe(true)
    expect(isActEnemyId(0x10022A2C)).toBe(false)
    expect(isActEnemyId(0xE0000000)).toBe(false)
  })
})

describe('parseCombatLine', () => {
  it('解析 21 Ability 行', () => {
    const line = '21|2026-09-16T20:42:49.6930000+08:00|10022A2C|戈墨|05|传送|10022A2C|戈墨|3D|4A80000|1B|58000|0|0|0|0|0|0|0|0|0|0|0|200391|200391|10000|10000|||26.63|28.03|1.20|1.05|00003E11|0|1|00||01|05|05|2.100|AAF8|88f07231661acdb6'
    const e = parseCombatLine(line)
    expect(e).not.toBeNull()
    expect(e!.type).toBe('cast')
    expect(e!.ts).toBe(parseActTimestamp('2026-09-16T20:42:49.6930000+08:00'))
    expect(e!.sourceId).toBe(0x10022A2C)
    expect(e!.sourceName).toBe('戈墨')
    expect(e!.abilityId).toBe(5)
    expect(e!.abilityName).toBe('传送')
    expect(e!.targetId).toBe(0x10022A2C)
  })

  it('解析 20 StartsCast 行为 begincast', () => {
    const line = '20|2026-09-16T20:54:07.6470000+08:00|400004A1|鬼哭队卫士|362|强突|400004A1|鬼哭队卫士|2.200|100.88|55.13|-8.20|2.11|26583066026050b2'
    const e = parseCombatLine(line)
    expect(e).not.toBeNull()
    expect(e!.type).toBe('begincast')
    expect(e!.sourceId).toBe(0x400004A1)
    expect(e!.abilityId).toBe(0x362)
    expect(e!.abilityName).toBe('强突')
  })

  it('解析 22 AOE 行（字段布局同 21）', () => {
    const line = '22|2026-09-16T21:00:00.0000000+08:00|4000ABCD|BOSS|1D6B|钢铁风暴|10022A2C|戈墨|720003|4E0000|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|0|'
    const e = parseCombatLine(line)
    expect(e).not.toBeNull()
    expect(e!.type).toBe('cast')
    expect(e!.sourceId).toBe(0x4000ABCD)
    expect(e!.targetId).toBe(0x10022A2C)
    expect(e!.abilityName).toBe('钢铁风暴')
  })

  it('忽略非战斗行', () => {
    expect(parseCombatLine('251|2026-09-16T20:41:48.6676689+08:00|Process ffxiv_dx11 started|ed3db4a7b1b596d6')).toBeNull()
    expect(parseCombatLine('01|2026-09-16T20:41:54.2560000+08:00|84|格里达尼亚新街|f4c6bce0be0b3be8')).toBeNull()
    expect(parseCombatLine('03|2026-09-16T20:41:54.2560000+08:00|10019C03|小四斋|20|64|0000|461|拂晓之间|0|0|296882|296882|10000|10000|||40.97|32.07|1.20|-2.06|91399125552cf288')).toBeNull()
    expect(parseCombatLine('')).toBeNull()
    expect(parseCombatLine('21|bad')).toBeNull()
  })
})

describe('parseChangeZoneLine', () => {
  it('解析 01 行', () => {
    const z = parseChangeZoneLine('01|2026-09-16T20:41:54.2560000+08:00|84|格里达尼亚新街|f4c6bce0be0b3be8')
    expect(z).not.toBeNull()
    expect(z!.zoneName).toBe('格里达尼亚新街')
    expect(z!.ts).toBe(parseActTimestamp('2026-09-16T20:41:54.2560000+08:00'))
  })
  it('忽略其他行', () => {
    expect(parseChangeZoneLine('21|x')).toBeNull()
  })
})

describe('parseAddCombatantLine', () => {
  it('解析玩家（保留职业，归属者为 0）', () => {
    const a = parseAddCombatantLine('03|2026-09-16T20:41:54.2560000+08:00|10019C03|小四斋|20|64|0000|461|拂晓之间|0|0|296882|296882|10000|10000|||40.97|32.07|1.20|-2.06|91399125552cf288')
    expect(a).toEqual({ id: 0x10019C03, name: '小四斋', job: 0x20, ownerId: 0 })
  })
  it('解析敌方单位（归属者 0）', () => {
    const a = parseAddCombatantLine('03|2026-09-16T20:53:00.0000000+08:00|400004A1|鬼哭队卫士|00|64|0000|461||0|0|6100|6100|10000|10000|||103.41|51.68|-7.61|0.06|abc')
    expect(a).toEqual({ id: 0x400004A1, name: '鬼哭队卫士', job: 0, ownerId: 0 })
  })
  it('解析宠物（归属者指向主人玩家）', () => {
    const a = parseAddCombatantLine('03|2026-09-16T20:46:45.4120000+08:00|4000627B|朝日小仙女|00|5D|10023352|00||1398|1008|79454|87176|10000|10000|||36.51|61.39|-1.65|2.38|abc')
    expect(a).toEqual({ id: 0x4000627B, name: '朝日小仙女', job: 0, ownerId: 0x10023352 })
  })
  it('忽略其他行', () => {
    expect(parseAddCombatantLine('21|x')).toBeNull()
  })
})

function combat(ts: number, sourceId: number, targetId = 0): ParsedActLine {
  return { ts, type: 'cast', sourceId, sourceName: 'x', abilityId: 1, abilityName: 'a', targetId }
}

const PLAYER = 0x10000001
const ENEMY = 0x40000001

describe('ActEncounterTracker', () => {
  it('按间隔切分战斗，只保留有敌方参与的段', () => {
    const t = new ActEncounterTracker(60_000)
    // 段 1：玩家对木桩，3 个事件
    t.feedCombat(combat(0, PLAYER, ENEMY))
    t.feedCombat(combat(10_000, PLAYER, ENEMY))
    t.feedCombat(combat(20_000, ENEMY, PLAYER))
    // 段 2：主城传送（无敌方）——间隔 70s 后
    t.feedCombat(combat(90_000, PLAYER, PLAYER))
    // 段 3：下一场战斗
    t.feedCombat(combat(200_000, PLAYER, ENEMY))
    t.feedCombat(combat(210_000, PLAYER, ENEMY))
    const list = t.finish(1)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: 1, start: 0, end: 20_000, events: 3 })
    expect(list[1]).toMatchObject({ id: 2, start: 200_000, end: 210_000, events: 2 })
  })

  it('minEvents 过滤事件过少的段', () => {
    const t = new ActEncounterTracker(60_000)
    t.feedCombat(combat(0, PLAYER, ENEMY))
    t.feedCombat(combat(1_000, PLAYER, ENEMY))
    expect(t.finish(5)).toHaveLength(0)
  })

  it('区域切换切断战斗并记录区域名', () => {
    const t = new ActEncounterTracker(60_000)
    t.changeZone('甲贺都市')
    t.feedCombat(combat(0, PLAYER, ENEMY))
    t.changeZone('乙贺都市')
    t.feedCombat(combat(10_000, PLAYER, ENEMY))
    const list = t.finish(1)
    expect(list).toHaveLength(2)
    expect(list[0].zoneName).toBe('甲贺都市')
    expect(list[1].zoneName).toBe('乙贺都市')
  })

  it('敌方来源同样标记 hasEnemy', () => {
    const t = new ActEncounterTracker(60_000)
    t.feedCombat(combat(0, ENEMY, PLAYER))
    expect(t.finish(1)).toHaveLength(1)
  })

  it('无敌方参与的段被丢弃', () => {
    const t = new ActEncounterTracker(60_000)
    t.feedCombat(combat(0, PLAYER, PLAYER))
    t.feedCombat(combat(1_000, PLAYER, 0xE0000000))
    expect(t.finish(1)).toHaveLength(0)
  })
})
