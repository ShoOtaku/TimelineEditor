// BOSS 事件轨道打包：按时间升序贪心分配到首个不冲突轨道（纯函数，可单测）

export interface EventTrackInput {
  id: string
  timeMs: number
  /** 读条时长；无 = 瞬发（按 0 时长） */
  durationMs?: number
}

export interface EventTrackLayout {
  /** 事件 id → 轨道下标（0 起） */
  trackIndex: Map<string, number>
  /** 轨道总数，至少 1 */
  trackCount: number
}

/** 同一轨道相邻事件的最小间隔 */
const GAP_MS = 200

export function packEventTracks(events: EventTrackInput[]): EventTrackLayout {
  const sorted = [...events].sort((a, b) => a.timeMs - b.timeMs)
  const trackEnds: number[] = []
  const trackIndex = new Map<string, number>()
  for (const ev of sorted) {
    const end = ev.timeMs + (ev.durationMs ?? 0)
    let track = trackEnds.findIndex(lastEnd => ev.timeMs >= lastEnd + GAP_MS)
    if (track === -1) {
      track = trackEnds.length
      trackEnds.push(0)
    }
    trackEnds[track] = end
    trackIndex.set(ev.id, track)
  }
  return { trackIndex, trackCount: Math.max(1, trackEnds.length) }
}
