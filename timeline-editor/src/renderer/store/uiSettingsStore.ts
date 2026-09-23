import { create } from 'zustand'

interface UiSettingsState {
  /** 界面字体缩放百分比，100 = 默认大小（持久化在 ae-config.json） */
  fontSizePercent: number
  setFontSizePercent: (percent: number) => void
}

export const useUiSettings = create<UiSettingsState>((set) => ({
  fontSizePercent: 100,
  setFontSizePercent: (percent) => set({ fontSizePercent: percent })
}))
