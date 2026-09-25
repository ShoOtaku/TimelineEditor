import { describe, expect, it } from 'vitest'
import { createAnchor } from './prModel'
import { matchAnchorsToLog } from './logsAlign'
import type { PtlAnchor } from '@shared/prTypes'
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
