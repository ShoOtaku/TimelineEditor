import type { PlatformApi } from '@shared/platformApi'

/**
 * 平台能力声明 —— UI 按能力显隐入口，而不是散落 isWeb 判断。
 * Web 端后续补齐某项能力时只需把对应标志翻成 true。
 */
export interface PlatformCapabilities {
  /** 具备目录级文件读写（Electron 恒 true；Web 端依赖 File System Access API，仅 Chrome/Edge） */
  fileSystemAccess: boolean
  /** 目录监视自动刷新文件列表（浏览器无法监听本地目录变化） */
  directoryWatch: boolean
  /** ACT 本地日志大文件流式扫描 */
  actLogScan: boolean
  /** ACR DLL 类型发现 */
  acrDiscovery: boolean
  /** 自动更新 */
  updater: boolean
  /** 网络代理设置 */
  proxy: boolean
}

export interface Platform extends PlatformApi {
  readonly kind: 'electron' | 'web'
  readonly capabilities: PlatformCapabilities
  /**
   * 仅 Web：以「整目录上传」方式载入目录（内存态、只读，保存时以下载导出）。
   * 用于无 File System Access API 的浏览器，或目录被浏览器拦截的系统目录（如 %APPDATA% 下）。
   */
  selectDirectoryViaUpload?(role: 'ae' | 'pr' | 'logs' | 'actLogs'): Promise<{ cancelled: boolean; directory?: string }>
}
