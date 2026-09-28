import type { Platform } from './types'
import { createElectronPlatform } from './electron'
import { createWebPlatform } from './web'

/**
 * 平台单例 —— 渲染进程所有平台能力调用都经此入口。
 * 运行时探测：preload 注入了 window.electronAPI 即 Electron，否则为浏览器。
 */
export const platform: Platform =
  typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
    ? createElectronPlatform()
    : createWebPlatform()

export type { Platform, PlatformCapabilities } from './types'
