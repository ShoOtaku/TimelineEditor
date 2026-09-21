import { beforeEach, describe, expect, it } from 'vitest'
import { useLogsStore } from './logsStore'
import { formatTimeMs, parseTimeInput } from './logsTypes'

function store() {
  return useLogsStore.getState()
}

beforeEach(() => {
  store().newDocument('测试')
})

describe('logsTypes 时间工具', () => {
  it('formatTimeMs', () => {
    expect(formatTimeMs(0)).toBe('0:00.0')
    expect(formatTimeMs(75234)).toBe('1:15.2')
    expect(formatTimeMs(600000)).toBe('10:00.0')
    expect(formatTimeMs(3661000)).toBe('1:01:01')
  })

  it('parseTimeInput 支持 m:ss / m:ss.s / 秒数', () => {
    expect(parseTimeInput('1:23')).toBe(83000)
    expect(parseTimeInput('1:23.4')).toBe(83400)
    expect(parseTimeInput('83')).toBe(83000)
    expect(parseTimeInput('83.5')).toBe(83500)
    expect(parseTimeInput('abc')).toBeNull()
    expect(parseTimeInput('')).toBeNull()
  })
})

describe('logsStore 文档', () => {
  it('newDocument 默认值', () => {
    const s = store()
    expect(s.doc).not.toBeNull()
    expect(s.doc!.lengthMs).toBe(600000)
    expect(s.doc!.offsetMs).toBe(0)
    expect(s.doc!.gcdDuration).toBe(2.5)
    expect(s.doc!.$type).toBe('LogsTimeline')
    expect(s.fileName).toBe('测试.json')
    expect(s.isDirty).toBe(true)
    expect(s.undoStack).toHaveLength(0)
  })
})

describe('logsStore 事件', () => {
  it('addEvent 按 timeMs 排序插入并返回 id', () => {
    const id1 = store().addEvent(30000, 'C')
    const id2 = store().addEvent(10000, 'A')
    const id3 = store().addEvent(20000, 'B')
    expect(new Set([id1, id2, id3]).size).toBe(3)
    expect(store().doc!.events.map(e => e.timeMs)).toEqual([10000, 20000, 30000])
    expect(store().doc!.events.map(e => e.text)).toEqual(['A', 'B', 'C'])
    expect(store().selection).toEqual({ kind: 'event', id: id3 })
  })

  it('undo/redo', () => {
    store().addEvent(10000, 'A')
    expect(store().doc!.events).toHaveLength(1)
    store().undo()
    expect(store().doc!.events).toHaveLength(0)
    expect(store().selection).toBeNull() // 选中随 undo 失效被清理
    store().redo()
    expect(store().doc!.events).toHaveLength(1)
  })

  it('moveEvent 同 tag 合并为一步撤销并重排序', () => {
    store().addEvent(50000, 'X')
    const id = store().addEvent(10000, 'A')
    const before = store().undoStack.length
    store().moveEvent(id, 60000, 'drag:1')
    store().moveEvent(id, 70000, 'drag:1')
    expect(store().undoStack.length).toBe(before + 1) // 两次拖动一次入栈
    expect(store().doc!.events.map(e => e.timeMs)).toEqual([50000, 70000])
    store().undo()
    expect(store().doc!.events.find(e => e.id === id)!.timeMs).toBe(10000)
  })

  it('deleteEvent 清理选择', () => {
    const id = store().addEvent(10000, 'A')
    store().deleteEvent(id)
    expect(store().doc!.events).toHaveLength(0)
    expect(store().selection).toBeNull()
  })
})

describe('logsStore 技能列', () => {
  it('addColumn 同匹配名同 kind 去重', () => {
    const a = store().addColumn({ name: '武装戍卫' }, 'ability')
    const b = store().addColumn({ name: '武装戍卫' }, 'ability')
    const c = store().addColumn({ name: '翅膀', matchName: '武装戍卫' }, 'ability')
    const g = store().addColumn({ name: '武装戍卫' }, 'gcd')
    expect(b).toBe(a)
    expect(c).toBe(a) // matchName 相同也算重复
    expect(g).not.toBe(a) // kind 不同不去重
    expect(store().doc!.columns).toHaveLength(2)
  })

  it('removeColumn 连带删除 skillUses', () => {
    const colId = store().addColumn({ name: '武装戍卫' }, 'ability')
    store().addSkillUse(colId, 10000)
    store().addSkillUse(colId, 20000)
    expect(store().doc!.skillUses[colId]).toHaveLength(2)
    store().removeColumn(colId)
    expect(store().doc!.columns).toHaveLength(0)
    expect(store().doc!.skillUses[colId]).toBeUndefined()
  })

  it('moveColumn 排序且跳过 gcd 列', () => {
    const a = store().addColumn({ name: 'A' }, 'ability')
    store().addColumn({ name: 'B' }, 'ability')
    store().addGcdTrack('先锋剑')
    const c = store().addColumn({ name: 'C' }, 'ability')
    // 当前顺序 [A, B, 先锋剑(gcd), C]
    const names = () => store().doc!.columns.map(x => x.name)
    store().moveColumn(c, -1) // C 上移跳过 gcd，与 B 交换 → [A, C, gcd, B]
    expect(names()).toEqual(['A', 'C', '先锋剑', 'B'])
    store().moveColumn(a, -1) // 已在最前 → no-op
    expect(names()).toEqual(['A', 'C', '先锋剑', 'B'])
    store().moveColumn(a, 1) // 与 C 交换 → [C, A, gcd, B]
    expect(names()).toEqual(['C', 'A', '先锋剑', 'B'])
    store().moveColumn(c, -1) // 已在最前 → no-op
    expect(names()).toEqual(['C', 'A', '先锋剑', 'B'])
  })
})

describe('logsStore.applyImport', () => {
  it('replace 清空对应数组再写入', () => {
    store().addEvent(10000, '旧事件')
    store().applyImport({ events: [{ timeMs: 5000, text: '新事件' }] }, 'replace')
    expect(store().doc!.events.map(e => e.text)).toEqual(['新事件'])
    expect(store().doc!.events[0].id).toBeTruthy()
  })

  it('merge 合并排序去重', () => {
    store().addEvent(5000, 'A')
    store().applyImport({
      events: [{ timeMs: 7000, text: 'B' }, { timeMs: 5000, text: 'A' }, { timeMs: 1000, text: 'C' }]
    }, 'merge')
    expect(store().doc!.events.map(e => [e.timeMs, e.text])).toEqual([
      [1000, 'C'], [5000, 'A'], [7000, 'B']
    ])
  })

  it('merge GCD 按 timeMs+skill 去重', () => {
    store().addGcdUse('先锋剑', 3000)
    store().applyImport({
      gcds: [{ timeMs: 3000, skill: '先锋剑' }, { timeMs: 3000, skill: '暴乱剑' }]
    }, 'merge')
    expect(store().doc!.gcds.map(g => g.skill)).toEqual(['先锋剑', '暴乱剑'])
  })

  it('merge 技能使用按列内 timeMs 去重；未知列跳过', () => {
    const colId = store().addColumn({ name: '武装戍卫' }, 'ability')
    store().addSkillUse(colId, 10000)
    store().applyImport({
      skillUses: {
        [colId]: [{ timeMs: 10000 }, { timeMs: 20000 }],
        ghost: [{ timeMs: 5000 }]
      }
    }, 'merge')
    expect(store().doc!.skillUses[colId].map(u => u.timeMs)).toEqual([10000, 20000])
    expect(store().doc!.skillUses.ghost).toBeUndefined()
  })

  it('lengthMs 取 max', () => {
    store().applyImport({ events: [], lengthMs: 300000 }, 'replace')
    expect(store().doc!.lengthMs).toBe(600000)
    store().applyImport({ events: [], lengthMs: 900000 }, 'replace')
    expect(store().doc!.lengthMs).toBe(900000)
  })

  it('透传技能 ID：事件/GCD 带 skillId，columnSkillIds 补到列上', () => {
    const colId = store().addColumn({ name: '武装戍卫' }, 'ability')
    store().applyImport({
      events: [{ timeMs: 5000, text: 'BOSS 施放 [死刑]', skillName: '死刑', skillId: 9001 }],
      gcds: [{ timeMs: 3000, skill: '先锋剑', skillId: 9006 }],
      columnSkillIds: { [colId]: 9005 }
    }, 'replace')
    expect(store().doc!.events[0].skillId).toBe(9001)
    expect(store().doc!.gcds[0].skillId).toBe(9006)
    expect(store().doc!.columns.find(c => c.id === colId)!.skillId).toBe(9005)
  })

  it('applyImport 可撤销', () => {
    store().applyImport({ events: [{ timeMs: 1000, text: 'X' }] }, 'replace')
    expect(store().doc!.events).toHaveLength(1)
    store().undo()
    expect(store().doc!.events).toHaveLength(0)
  })
})
