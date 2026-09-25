// ACT 模拟会话：已导入的事件流（瞬态运行时状态，不进文档、不产生撤销步）。
// 模拟结果不存这里——PrTimelineView 用 useMemo 从 (当前文档, 事件流) 实时计算，
// 因此修改/增删锚点后自动用同一份日志重新模拟。
import { create } from 'zustand'
import type { SimInputEvent } from './simEngine'

interface SimSessionState {
  /** 已导入的模拟事件流；null = 未在模拟 */
  events: SimInputEvent[] | null
  /** 来源描述（日志文件 + 战斗） */
  label: string
  setSession: (events: SimInputEvent[], label: string) => void
  clear: () => void
}

export const useSimStore = create<SimSessionState>((set) => ({
  events: null,
  label: '',
  setSession: (events, label) => set({ events, label }),
  clear: () => set({ events: null, label: '' })
}))
