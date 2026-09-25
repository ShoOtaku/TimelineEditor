import { describe, expect, it } from 'vitest'
import { createAnchor } from './prModel'
import { buildSkillEntries, matchAnchorsToLog, resolveAutoTarget } from './logsAlign'
import type { PtlAnchor, PtlEntry } from '@shared/prTypes'
import type { LogsEvent } from '../logs/logsTypes'

function anchor(time: number, actionId?: number): PtlAnchor {
  const a = createAnchor(time)
  a.Sync = actionId === undefined
    ? null
    : { Type: 'ActionEffect', Params: { ActionId: String(actionId) }, IsForceJump: false, WindowBefore: 0, WindowAfter: 0 }
  return a
}

const ev = (id: string, timeMs: number, skillId: number): LogsEvent => ({ id, timeMs, text: '', skillId })

describe('matchAnchorsToLog 留空（skips）', () => {
  it('留空锚点不参与匹配，由相邻锚点插值补齐', () => {
    // PR 10s 处的技能在日志里 50s 才出现（并非一一对应）：
    // 自动匹配会把后面的事件错配到前面的锚点，留空后改为插值
    const anchors = [anchor(0), anchor(10, 100), anchor(20, 200)]
    const events = [ev('e1', 50000, 100), ev('e2', 20000, 200)]

    const auto = matchAnchorsToLog(anchors, events)
    expect(auto.find(m => m.anchorGuid === anchors[1].Guid)?.logMs).toBe(50000) // 错配现状

    const skipped = matchAnchorsToLog(anchors, events, undefined, new Set([anchors[1].Guid]))
    const m1 = skipped.find(m => m.anchorGuid === anchors[1].Guid)!
    expect(m1.method).toBe('interpolated')
    expect(m1.eventId).toBeUndefined()
    expect(m1.logMs).toBe(10000) // 0 ~ 20000 线性插值中点
    const m2 = skipped.find(m => m.anchorGuid === anchors[2].Guid)!
    expect(m2.eventId).toBe('e2') // 后续锚点不受影响
  })

  it('留空后后续锚点仍以最后已确定锚点为基准（单调约束不重置）', () => {
    const anchors = [anchor(0), anchor(10, 100), anchor(20, 200)]
    const events = [ev('e1', 12000, 200), ev('e2', 25000, 200)]

    const matches = matchAnchorsToLog(anchors, events, undefined, new Set([anchors[1].Guid]))
    const m2 = matches.find(m => m.anchorGuid === anchors[2].Guid)!
    // 期望时刻按 0s 锚点推算为 20s，应选 25s 的事件而不是 12s 的
    expect(m2.eventId).toBe('e2')
    const m1 = matches.find(m => m.anchorGuid === anchors[1].Guid)!
    expect(m2.logMs).toBeGreaterThan(m1.logMs)
  })

  it('钉选与留空同时存在时留空优先', () => {
    const anchors = [anchor(0), anchor(10, 100), anchor(20, 200)]
    const events = [ev('e1', 10000, 100), ev('e2', 20000, 200)]

    const matches = matchAnchorsToLog(
      anchors, events,
      new Map([[anchors[1].Guid, 'e1']]),
      new Set([anchors[1].Guid])
    )
    expect(matches.find(m => m.anchorGuid === anchors[1].Guid)?.method).toBe('interpolated')
  })
})

describe('resolveAutoTarget（与游戏内编辑器 Auto 一致）', () => {
  const lookup = {
    '9': { r: -1 },   // 先锋剑：近战（运行时按武器射程判定，>0）
    '142': { r: 25 }, // 冰结：远程
    '10': { r: 0 },   // 铁壁：自身
    '999': {}         // 无射程数据（MCP/CSV 兜底导出）
  }

  it('EffectRange=0 → Self，非 0（含近战 -1）→ Target', () => {
    expect(resolveAutoTarget(10, lookup)).toBe('Self')
    expect(resolveAutoTarget(142, lookup)).toBe('Target')
    expect(resolveAutoTarget(9, lookup)).toBe('Target')
  })

  it('未知技能 / 缺射程数据 / 无表 → 回退 Self', () => {
    expect(resolveAutoTarget(999, lookup)).toBe('Self')
    expect(resolveAutoTarget(12345, lookup)).toBe('Self')
    expect(resolveAutoTarget(undefined, lookup)).toBe('Self')
    expect(resolveAutoTarget(142, null)).toBe('Self')
    expect(resolveAutoTarget(142, undefined)).toBe('Self')
  })
})

describe('buildSkillEntries 目标解析', () => {
  it('按技能表写入 Target 字段（Auto 结果）', () => {
    const lookup = { '9': { r: -1 }, '10': { r: 0 } }
    const anchors = [anchor(0)]
    const matches = [{ anchorGuid: anchors[0].Guid, prTime: 0, logMs: 0, method: 'start' as const }]
    const placements = [
      { use: { timeMs: 1000, name: '先锋剑', skillId: 9, kind: 'gcd' as const }, anchorGuid: anchors[0].Guid, offset: 1, clamped: false },
      { use: { timeMs: 2000, name: '铁壁', skillId: 10, kind: 'ability' as const }, anchorGuid: anchors[0].Guid, offset: 2, clamped: false }
    ]

    const entries = buildSkillEntries(placements, matches, lookup)
    const targetOf = (e: PtlEntry) => e.EntryGroup.Children?.[0]?.Actions?.[0]?.Target
    expect(targetOf(entries[0])).toBe('Target')
    expect(targetOf(entries[1])).toBe('Self')

    // 不传技能表：保持旧行为（全部 Self）
    const fallback = buildSkillEntries(placements, matches)
    expect(fallback.every(e => targetOf(e) === 'Self')).toBe(true)
  })
})
