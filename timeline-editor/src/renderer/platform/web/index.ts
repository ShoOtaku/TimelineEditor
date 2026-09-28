// Web 平台适配器 —— 在浏览器中实现与 Electron 相同的 PlatformApi 契约。
//
// 能力映射：
//   文件系统   → File System Access API（虚拟路径，句柄存 IndexedDB）
//   设置       → localStorage
//   静态数据   → 构建产物内的 fetch（actions.json 等）
//   FFLogs     → 浏览器直连 cn.fflogs.com（API 带 CORS 头）
//   cactbot    → 浏览器直连 GitHub API / raw
//   ACT 扫描   → 暂不支持（P3 移植流式扫描）
//   ACR 发现   → 暂不支持（P2 移植 dotnetMeta）
//   自动更新   → 无意义（网页即最新）

import type { AppSettings, ProxySettings } from '@shared/cactbotTypes'
import type {
  AcrDiscoveryResult, DialogResult, FileResult, UpdateCheckResult
} from '@shared/platformApi'
import type { ActLogEvent, ActLogFileInfo, ActParseRequest, ActResult, ActScanRequest, ActScanResult } from '@shared/actTypes'
import type { JobSkillDatabase } from '@shared/jobSkillTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { Platform } from '../types'
import { Emitter } from './emitter'
import { hasFileSystemAccess } from './fsAccess'
import { WebFileSystem } from './fs'
import { WebFflogs } from './fflogs'
import { WebCactbot } from './cactbot'
import { WebSettings } from './settings'

declare const __APP_VERSION__: string | undefined

const JSON_ACCEPT: Record<string, string[]> = { 'application/json': ['.json', '.txt'] }

function actUnsupported<T>(): ActResult<T> {
  return { success: false, error: '网页版暂不支持 ACT 日志导入，请使用桌面版' }
}

export function createWebPlatform(): Platform {
  const fs = new WebFileSystem()
  const settings = new WebSettings()
  const fflogs = new WebFflogs()
  const cactbot = new WebCactbot()

  const aeDirChanged = new Emitter<string>()
  const prDirChanged = new Emitter<string>()
  const logsDirChanged = new Emitter<string>()
  const actLogsDirChanged = new Emitter<string>()

  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'web'

  /** 读取持久化目录并尽力恢复句柄（权限可能在首次操作时才会真正授予） */
  async function persistedDirectory(key: 'aeDirectory' | 'prDirectory' | 'logsDirectory' | 'actLogsDirectory'): Promise<string> {
    const dir = settings.read()[key]
    if (dir) await fs.restoreRoot(dir)
    return dir
  }

  async function selectDirectoryInto(
    key: 'aeDirectory' | 'prDirectory' | 'logsDirectory' | 'actLogsDirectory',
    emitter: Emitter<string>
  ): Promise<{ cancelled: boolean; directory?: string }> {
    const result = await fs.selectDirectory()
    if (result.cancelled || !result.directory) return { cancelled: true }
    settings.patch({ [key]: result.directory })
    emitter.emit(result.directory)
    return result
  }

  const ROLE_TARGET = {
    ae: ['aeDirectory', aeDirChanged],
    pr: ['prDirectory', prDirChanged],
    logs: ['logsDirectory', logsDirChanged],
    actLogs: ['actLogsDirectory', actLogsDirChanged]
  } as const

  async function fetchStaticJson<T>(file: string): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${file}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { success: true, data: await response.json() as T }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    kind: 'web',
    capabilities: {
      fileSystemAccess: hasFileSystemAccess(),
      directoryWatch: false,
      actLogScan: false,
      acrDiscovery: false,
      updater: false,
      proxy: false
    },

    // ---- 文件系统 ----
    readFile: (path) => fs.readFile(path),
    writeFile: (path, content) => fs.writeFile(path, content),
    fileExists: (path) => fs.fileExists(path),
    fileStat: (path) => fs.fileStat(path),
    listDir: (path) => fs.listDir(path),

    // 浏览器无法监听本地目录变化；文件列表依赖手动刷新
    watchDir: () => Promise.resolve({ success: true }),
    unwatchDir: () => Promise.resolve({ success: true }),
    onDirChanged: () => () => { /* no-op */ },

    openFileDialog: (): Promise<DialogResult> => fs.openFile(JSON_ACCEPT),
    saveFileDialog: (defaultName?: string): Promise<DialogResult> => fs.saveFileAs(defaultName),
    getDefaultDir: async () => {
      const ae = await persistedDirectory('aeDirectory')
      return ae ? `${ae}/Triggerlines` : ''
    },
    getBackupDir: (filePath) => Promise.resolve(`${filePath}/../bak`),

    // ---- 系统剪贴板 ----
    clipboardWriteText: async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        return { success: true }
      } catch {
        return { success: false }
      }
    },
    clipboardReadText: async () => {
      try { return await navigator.clipboard.readText() } catch { return '' }
    },

    // ---- 静态数据 ----
    loadSpellData: async () => {
      const result = await fetchStaticJson<Record<string, { n: string; c?: number; t: number; ct?: number; p?: number; r?: number }>>('actions.json')
      return { success: result.success, data: result.data ?? {}, error: result.error }
    },
    loadJobSkills: () => fetchStaticJson<JobSkillDatabase>('job-skills.json'),
    loadActionNames: () => fetchStaticJson<ActionNameDatabase>('action-names-cn.json'),

    // ---- AE 目录 ----
    getAeDirectory: () => persistedDirectory('aeDirectory'),
    selectAeDirectory: () => selectDirectoryInto('aeDirectory', aeDirChanged),
    getAcrDir: async () => {
      const ae = await persistedDirectory('aeDirectory')
      return ae ? `${ae}/ACR` : ''
    },
    onAeDirectoryChanged: (cb) => aeDirChanged.on(cb),

    // ---- PR 目录 ----
    getPrDirectory: () => persistedDirectory('prDirectory'),
    selectPrDirectory: () => selectDirectoryInto('prDirectory', prDirChanged),
    openPrFileDialog: () => fs.openFile(JSON_ACCEPT),
    savePrFileDialog: (defaultName?: string) => fs.saveFileAs(defaultName),
    onPrDirectoryChanged: (cb) => prDirChanged.on(cb),

    // ---- FFLogs（直连，CORS 已实测可用）----
    fetchFflogsReport: (code, apiKey) => fflogs.fetchReport(code, apiKey),
    fetchFflogsCasts: (req) => fflogs.fetchCasts(req),
    cancelFflogsCasts: (requestId) => fflogs.cancelCasts(requestId),
    onFflogsProgress: (cb) => fflogs.onProgress(cb),

    // ---- ACT 本地日志（暂不支持）----
    listActLogFiles: (): Promise<ActResult<ActLogFileInfo[]>> => Promise.resolve(actUnsupported()),
    scanActLog: (_req: ActScanRequest): Promise<ActResult<ActScanResult>> => Promise.resolve(actUnsupported()),
    parseActLog: (_req: ActParseRequest): Promise<ActResult<ActLogEvent[]>> => Promise.resolve(actUnsupported()),
    cancelActLog: () => Promise.resolve(),
    onActProgress: () => () => { /* no-op */ },
    getActLogsDirectory: () => persistedDirectory('actLogsDirectory'),
    selectActLogsDirectory: () => selectDirectoryInto('actLogsDirectory', actLogsDirChanged),
    openActLogFileDialog: (): Promise<DialogResult> => Promise.resolve({ cancelled: true, filePath: null }),
    onActLogsDirectoryChanged: (cb) => actLogsDirChanged.on(cb),

    // ---- Logs 目录 ----
    getLogsDirectory: () => persistedDirectory('logsDirectory'),
    selectLogsDirectory: () => selectDirectoryInto('logsDirectory', logsDirChanged),
    openLogsFileDialog: () => fs.openFile(JSON_ACCEPT),
    saveLogsFileDialog: (defaultName?: string) => fs.saveFileAs(defaultName),
    onLogsDirectoryChanged: (cb) => logsDirChanged.on(cb),

    // ---- 设置 ----
    getSettings: () => Promise.resolve(settings.read()),
    setProxySettings: (proxy: ProxySettings) => {
      // 浏览器无法设置代理；仅存取偏好以保持设置页行为一致
      settings.patch({ proxy })
      return Promise.resolve({ success: true as const, settings: proxy })
    },
    setFontSize: (percent: number) => {
      const clamped = Math.min(200, Math.max(50, Math.round(percent)))
      settings.patch({ fontSizePercent: clamped })
      return Promise.resolve({ success: true as const, fontSizePercent: clamped })
    },

    // ---- cactbot（直连 GitHub）----
    listCactbotFiles: (refresh?: boolean) => cactbot.listFiles(refresh),
    downloadCactbotFile: (path, hasLocalization) => cactbot.downloadFile(path, hasLocalization),
    testCactbotProxy: () => cactbot.testConnection(),

    // ---- ACR 类型发现（暂不支持）----
    discoverAcrTypes: (): Promise<AcrDiscoveryResult> => Promise.resolve({
      success: false,
      error: '网页版暂不支持 ACR 类型发现，请使用桌面版',
      conditions: [],
      actions: [],
      acrDlls: []
    }),
    listAcrDlls: () => Promise.resolve({ success: true, dlls: [] }),
    onAcrTypesChanged: () => () => { /* no-op */ },

    // ---- 自动更新（网页即最新，无需更新）----
    getVersion: () => Promise.resolve(version),
    checkForUpdates: (): Promise<UpdateCheckResult> => Promise.resolve({
      hasUpdate: false,
      currentVersion: version,
      latestVersion: null,
      zipUrl: null,
      releaseNotes: null
    }),
    downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: false, error: '网页版无需下载更新，刷新页面即为最新版本' }),
    installUpdate: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: false, error: '网页版无需安装更新' }),
    onUpdateProgress: () => () => { /* no-op */ },
    onUpdateAvailable: () => () => { /* no-op */ },

    // ---- Web 专属：上传模式目录载入（系统目录被浏览器拦截时的退路）----
    selectDirectoryViaUpload: async (role) => {
      const result = await fs.selectDirectoryViaUpload()
      if (result.cancelled || !result.directory) return { cancelled: true }
      const [key, emitter] = ROLE_TARGET[role]
      settings.patch({ [key]: result.directory })
      emitter.emit(result.directory)
      return result
    }
  }
}
