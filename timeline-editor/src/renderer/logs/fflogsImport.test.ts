import { describe, expect, it } from 'vitest'
import type { FflogsCastEvent, FflogsReportInfo } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { LogsSkillColumn } from './logsTypes'
import { autoAssignPlayers, buildImportPayload, parseFflogsFight } from './fflogsImport'

const report: FflogsReportInfo = {
  code: 'abc123',
  title: '测试报告',
  start: 1000000,
  end: 2000000,
  fights: [],
  friendlies: [
    { id: 1, name: '玩家甲', type: 'Paladin' },
    { id: 2, name: '玩家乙', type: 'DarkKnight' },
    { id: 3, name: 'Limit Break', type: 'LimitBreak' },
    { id: 4, name: '其他场的玩家', type: 'Samurai' }   // 报告里但不在本场的实体
  ],
  enemies: [
    { id: 10, name: '终极BOSS', type: 'Boss' },
    { id: 11, name: '小怪', type: 'NPC' },
    { id: 12, name: '其他场的BOSS', type: 'Boss' },
    { id: 13, name: '其他场的怪', type: 'NPC' }
  ]
}

const columns: LogsSkillColumn[] = [
  { id: 'c1', kind: 'ability', name: '翅膀', matchName: '武装戍卫' },
  { id: 'c2', kind: 'gcd', name: '先锋剑' },
  { id: 'c3', kind: 'ability', name: '干预' }
]

function cast(timestamp: number, sourceID: number, name: string, type = 'cast', guid?: number): FflogsCastEvent {
  return { timestamp, type, sourceID, sourceIsFriendly: sourceID < 10, ability: { name, guid } }
}

// 战斗从报告时间 5000ms 处开始（验证时间偏移）
const FIGHT_START = 5000
const FIGHT_END = 65000

const casts: FflogsCastEvent[] = [
  cast(13000, 1, '武装戍卫', 'begincast'),
  cast(15000, 1, '武装戍卫', 'cast', 9005),
  cast(15500, 1, '武装戍卫'),   // 距上次记录 500ms → 去重丢弃
  cast(17000, 1, '武装戍卫'),
  cast(16000, 2, '武装戍卫'),
  cast(8000, 1, '先锋剑', 'cast', 9006),
  cast(9000, 1, '先锋剑'),
  cast(12000, 1, '未跟踪技能')  // 不匹配任何列 → 忽略
]

const enemyCasts: FflogsCastEvent[] = [
  cast(17000, 10, '死刑', 'begincast', 9001),   // 与 20000 的 cast 配对 → 读条 3000ms
  cast(20000, 10, '死刑', 'cast', 9001),
  cast(20500, 10, '死刑', 'cast', 9001),        // 同 source+技能+type 1000ms 内 → 去重丢弃
  cast(21000, 10, '攻击'),                       // 被默认过滤正则命中
  cast(22000, 10, '全屏AOE', 'begincast', 9003), // 无配对 cast → 不生成事件
  cast(23000, 11, '冲锋', 'cast', 9002),
  cast(24000, 10, '死刑', 'cast', 9001)          // 配对已被 20000 消费 → 瞬发
]

function parse(overrides: Partial<Parameters<typeof parseFflogsFight>[0]> = {}) {
  return parseFflogsFight({
    report,
    casts,
    enemyCasts,
    fightStart: FIGHT_START,
    fightEnd: FIGHT_END,
    columns,
    includeBegincast: false,
    eventFilterRegex: '攻击',
    ...overrides
  })
}

describe('parseFflogsFight', () => {
  it('拆分玩家/BOSS/NPC，排除 LimitBreak 与本场未出现的实体', () => {
    const parsed = parse()
    expect(parsed.players.map(p => p.id)).toEqual([1, 2])
    expect(parsed.players[0].job).toBe('Paladin')
    expect(parsed.bosses.map(b => b.id)).toEqual([10])
    expect(parsed.npcs.map(n => n.id)).toEqual([11])
  })

  it('实体只保留所选战斗有施法记录的；未下载的数据流对应列表为空', () => {
    // casts/enemyCasts 按战斗时间窗下载，报告范围的玩家 4 / BOSS 12 / NPC 13 不出现
    const parsed = parse()
    expect(parsed.players.some(p => p.id === 4)).toBe(false)
    expect(parsed.bosses.some(b => b.id === 12)).toBe(false)
    expect(parsed.npcs.some(n => n.id === 13)).toBe(false)
    // 只下载事件流时玩家列表为空（映射页对应分区不显示）
    expect(parse({ casts: [] }).players).toEqual([])
    // 只下载技能流时敌方列表为空
    const skillsOnly = parse({ enemyCasts: [] })
    expect(skillsOnly.bosses).toEqual([])
    expect(skillsOnly.npcs).toEqual([])
  })

  it('按 matchName 匹配技能并转为战斗相对时间，1000ms 内去重', () => {
    const parsed = parse()
    // 别名「翅膀」经 matchName「武装戍卫」匹配；15500 的记录被去重
    expect(parsed.abilityCasts['武装戍卫'][1]).toEqual([10000, 12000])
    expect(parsed.abilityCasts['武装戍卫'][2]).toEqual([11000])
    // 未跟踪技能不进入结果
    expect(parsed.abilityCasts['未跟踪技能']).toBeUndefined()
    expect(parsed.gcdCasts['先锋剑'][1]).toEqual([3000, 4000])
  })

  it('includeBegincast 不影响玩家施放统计（只计 cast）', () => {
    const parsed = parse({ includeBegincast: true })
    expect(parsed.abilityCasts['武装戍卫'][1]).toEqual([10000, 12000])
  })

  it('记录技能名 → guid 映射（skillIds）', () => {
    const parsed = parse()
    // 玩家流首个未被去重的 cast 提供 guid
    expect(parsed.skillIds['武装戍卫']).toBe(9005)
    expect(parsed.skillIds['先锋剑']).toBe(9006)
    // 敌方流（过滤正则命中的「攻击」无 guid 也不记录）
    expect(parsed.skillIds['死刑']).toBe(9001)
    expect(parsed.skillIds['冲锋']).toBe(9002)
    expect(parsed.skillIds['攻击']).toBeUndefined()
    expect(parsed.skillIds['未跟踪技能']).toBeUndefined() // 无 guid
  })

  it('敌方事件：过滤正则命中跳过，文本与字段正确', () => {
    const parsed = parse()
    const boss = parsed.eventsBySource[10]
    expect(boss.map(e => e.text)).toEqual(['终极BOSS 施放 [死刑]', '终极BOSS 施放 [死刑]'])
    expect(boss[0].timeMs).toBe(15000)
    expect(boss[0].skillName).toBe('死刑')
    expect(boss[0].guid).toBe(9001)
    // 「攻击」被过滤
    expect(boss.some(e => e.text.includes('攻击'))).toBe(false)
    expect(parsed.eventsBySource[11]).toEqual([
      { timeMs: 18000, text: '小怪 施放 [冲锋]', skillName: '冲锋', durationMs: undefined, guid: 9002 }
    ])
  })

  it('includeBegincast 时用开始读条事件配对计算读条时长', () => {
    const parsed = parse({ includeBegincast: true })
    const boss = parsed.eventsBySource[10]
    // 17000 begincast 与 20000 cast 配对 → 3000ms；24000 cast 无配对 → 瞬发（undefined）
    expect(boss.map(e => [e.timeMs, e.durationMs])).toEqual([[15000, 3000], [19000, undefined]])
    // 不再生成「开始读条」文本事件；无配对的 begincast 不产生事件
    expect(boss.some(e => e.text.includes('开始读条'))).toBe(false)
    expect(boss.some(e => e.skillName === '全屏AOE')).toBe(false)
  })

  it('includeBegincast 为 false 时全部按瞬发处理', () => {
    const parsed = parse()
    const boss = parsed.eventsBySource[10]
    expect(boss.map(e => e.durationMs)).toEqual([undefined, undefined])
  })

  it('读条时长过短钳制下限，配对间隔异常按瞬发处理', () => {
    const parsed = parse({
      includeBegincast: true,
      enemyCasts: [
        cast(10000, 10, '短读条', 'begincast'),
        cast(10300, 10, '短读条'),          // 300ms → 钳 500
        cast(20000, 10, '超长读条', 'begincast'),
        cast(60000, 10, '超长读条')         // 40000ms > 30000 → 配对无效，瞬发
      ]
    })
    const boss = parsed.eventsBySource[10]
    expect(boss.map(e => [e.skillName, e.durationMs])).toEqual([['短读条', 500], ['超长读条', undefined]])
  })

  it('非法正则按默认「攻击」处理', () => {
    const parsed = parse({ eventFilterRegex: '[' })
    const boss = parsed.eventsBySource[10]
    expect(boss.some(e => e.text.includes('攻击'))).toBe(false)
    expect(boss.some(e => e.text.includes('死刑'))).toBe(true)
  })
})

describe('parseFflogsFight 中文名翻译（actionNames）', () => {
  // 模拟 FFLogs 对 7.x 新技能返回英文名的场景
  const actionNames: ActionNameDatabase = {
    version: 1, generatedAt: '', source: 'test',
    actions: {
      7: ['攻击'],
      25746: ['圣盾阵', 2950],
      47804: ['遗弃末世']
    }
  }

  it('玩家技能英文名按 guid 译为中文并匹配列', () => {
    const parsed = parse({
      actionNames,
      columns: [{ id: 'c4', kind: 'ability', name: '圣盾阵' }],
      casts: [cast(10000, 1, 'Holy Sheltron', 'cast', 25746)]
    })
    expect(parsed.abilityCasts['圣盾阵'][1]).toEqual([5000])
  })

  it('敌方事件名按 guid 译为中文，begincast 配对仍生效；无映射保留原名', () => {
    const parsed = parse({
      actionNames,
      includeBegincast: true,
      enemyCasts: [
        cast(17000, 10, 'Forsaken', 'begincast', 47804),
        cast(20000, 10, 'Forsaken', 'cast', 47804),
        cast(21000, 10, 'Unknown Skill', 'cast', 99999)
      ]
    })
    const boss = parsed.eventsBySource[10]
    expect(boss.map(e => e.skillName)).toEqual(['遗弃末世', 'Unknown Skill'])
    expect(boss[0].text).toBe('终极BOSS 施放 [遗弃末世]')
    expect(boss[0].durationMs).toBe(3000)
    expect(boss[0].guid).toBe(47804)
  })

  it('过滤正则作用于翻译后的中文名', () => {
    const parsed = parse({
      actionNames,
      enemyCasts: [cast(10000, 10, 'attack', 'cast', 7)]
    })
    expect(parsed.eventsBySource[10] ?? []).toEqual([])
  })

  it('缺省 actionNames 时保留 FFLogs 原名', () => {
    const parsed = parse({
      columns: [{ id: 'c4', kind: 'ability', name: '圣盾阵' }],
      casts: [cast(10000, 1, 'Holy Sheltron', 'cast', 25746)]
    })
    expect(parsed.abilityCasts['圣盾阵']).toBeUndefined()
  })
})

describe('autoAssignPlayers', () => {
  it('每个技能选施放次数最多的玩家', () => {
    const parsed = parse()
    const auto = autoAssignPlayers(parsed, columns)
    expect(auto.abilitySource['c1']).toBe(1)  // 甲 2 次 > 乙 1 次
    expect(auto.abilitySource['c3']).toBeNull() // 干预无记录
    expect(auto.gcdSource['先锋剑']).toBe(1)
  })
})

describe('buildImportPayload', () => {
  it('生成 applyImport 入参形状', () => {
    const parsed = parse()
    const payload = buildImportPayload(parsed, {
      columns,
      eventSourceIds: [10],
      abilitySource: { c1: 1, c3: null },
      gcdSource: { 先锋剑: 1 }
    }, FIGHT_END - FIGHT_START)
    expect(payload.lengthMs).toBe(60000)
    expect(payload.events).toHaveLength(2) // 仅 BOSS(10) 的事件
    expect(payload.events![0]).toEqual({
      timeMs: 15000,
      text: '终极BOSS 施放 [死刑]',
      skillName: '死刑',
      skillId: 9001,
      durationMs: undefined,
      icon: undefined
    })
    expect(payload.gcds).toEqual([
      { timeMs: 3000, skill: '先锋剑', skillId: 9006 },
      { timeMs: 4000, skill: '先锋剑', skillId: 9006 }
    ])
    expect(payload.skillUses!['c1']).toEqual([{ timeMs: 10000 }, { timeMs: 12000 }])
    expect(payload.skillUses!['c3']).toBeUndefined() // null 来源不导入
    // 列技能 ID：c1=武装戍卫(9005)、c2=先锋剑(9006)；c3「干预」无 cast → 不收录
    expect(payload.columnSkillIds).toEqual({ c1: 9005, c2: 9006 })
  })

  it('多事件来源合并并按时间排序', () => {
    const parsed = parse()
    const payload = buildImportPayload(parsed, {
      columns,
      eventSourceIds: [11, 10],
      abilitySource: {},
      gcdSource: {}
    }, 60000)
    expect(payload.events!.map(e => e.timeMs)).toEqual([15000, 18000, 19000])
  })

  it('用 icons 映射按 guid 写入事件图标', () => {
    const parsed = parse()
    const payload = buildImportPayload(parsed, {
      columns,
      eventSourceIds: [10, 11],
      abilitySource: {},
      gcdSource: {}
    }, 60000, { 9001: 'https://xivapi.com/i/09001.png' })
    expect(payload.events!.map(e => e.icon)).toEqual([
      'https://xivapi.com/i/09001.png',
      undefined, // 冲锋 guid 9002 未解析
      'https://xivapi.com/i/09001.png'
    ])
  })
})
