import type { Platform } from './types'

/** Electron 平台：直接复用 preload 暴露的 window.electronAPI，全部能力可用 */
export function createElectronPlatform(): Platform {
  return {
    kind: 'electron',
    capabilities: {
      fileSystemAccess: true,
      directoryWatch: true,
      actLogScan: true,
      acrDiscovery: true,
      updater: true,
      proxy: true
    },
    ...window.electronAPI
  }
}
