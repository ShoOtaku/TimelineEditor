import { describe, expect, it } from 'vitest'
import { packEventTracks } from './eventTracks'

const ev = (id: string, timeMs: number, durationMs?: number) => ({ id, timeMs, durationMs })

describe('packEventTracks', () => {
  it('空数组至少 1 条轨道', () => {
    const { trackIndex, trackCount } = packEventTracks([])
    expect(trackCount).toBe(1)
    expect(trackIndex.size).toBe(0)
  })

  it('时间重叠的事件分到不同轨道，不重叠的复用', () => {
    // a: 1000~4000 读条；b: 2000 瞬发（落在 a 读条内）；c: 5000 瞬发（与 a 间隔足够）
    const { trackIndex, trackCount } = packEventTracks([
      ev('a', 1000, 3000),
      ev('b', 2000),
      ev('c', 5000)
    ])
    expect(trackIndex.get('a')).toBe(0)
    expect(trackIndex.get('b')).toBe(1)
    expect(trackIndex.get('c')).toBe(0)
    expect(trackCount).toBe(2)
  })

  it('间隔恰好 200ms 复用轨道，199ms 开新轨道', () => {
    const exact = packEventTracks([ev('a', 1000, 1000), ev('b', 2200)])
    expect(exact.trackIndex.get('b')).toBe(0)
    expect(exact.trackCount).toBe(1)
    const tight = packEventTracks([ev('a', 1000, 1000), ev('b', 2199)])
    expect(tight.trackIndex.get('b')).toBe(1)
    expect(tight.trackCount).toBe(2)
  })

  it('同一时刻两个瞬发事件分轨', () => {
    const { trackIndex, trackCount } = packEventTracks([ev('a', 1000), ev('b', 1000)])
    expect(trackIndex.get('a')).toBe(0)
    expect(trackIndex.get('b')).toBe(1)
    expect(trackCount).toBe(2)
  })

  it('输入无序时按时间排序后打包', () => {
    const { trackIndex, trackCount } = packEventTracks([
      ev('c', 5000),
      ev('a', 1000, 3000),
      ev('b', 2000)
    ])
    expect(trackIndex.get('a')).toBe(0)
    expect(trackIndex.get('b')).toBe(1)
    expect(trackIndex.get('c')).toBe(0)
    expect(trackCount).toBe(2)
  })
})
