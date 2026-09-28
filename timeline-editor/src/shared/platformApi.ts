// 平台能力契约 —— Electron(preload contextBridge)与 Web(浏览器适配器)共用同一份接口。
// 渲染进程不直接依赖 window.electronAPI，而是经 src/renderer/platform 的单例访问。

import type {
  AppSettings, CactbotCatalogResult, CactbotDownloadResult,
  ProxySettings, ProxyTestResult
} from './cactbotTypes'
import type {
  FflogsCastEvent, FflogsFetchCastsRequest, FflogsFetchProgress,
  FflogsReportInfo, FflogsResult
} from './fflogsTypes'
import type {
  ActLogEvent, ActLogFileInfo, ActParseRequest, ActProgress,
  ActResult, ActScanRequest, ActScanResult
} from './actTypes'
import type { JobSkillDatabase } from './jobSkillTypes'
import type { ActionNameDatabase } from './actionNameTypes'

export interface FileResult {
  success: boolean
  content?: string
  error?: string
}

export interface FileStatResult {
  success: boolean
  size?: number
  mtime?: number
  isDirectory?: boolean
  error?: string
}

export interface DirEntry {
  name: string
  isDirectory: boolean
}

export interface DirListResult {
  success: boolean
  entries?: DirEntry[]
  error?: string
}

export interface DialogResult {
  cancelled: boolean
  filePath: string | null
}

export interface AcrTypeSummary {
  $type: string
  displayName: string
  assemblyName: string
  fields: Array<{ key: string; type: string }>
}

export interface AcrDiscoveryResult {
  success: boolean
  error?: string
  conditions: AcrTypeSummary[]
  actions: AcrTypeSummary[]
  acrDlls: string[]
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  zipUrl: string | null
  releaseNotes: string | null
  error?: string
}

export interface UpdateProgress {
  percent: number
  downloaded: number
  total: number
  speed: string
}

export interface PlatformApi {
  readFile(filePath: string): Promise<FileResult>
  writeFile(filePath: string, content: string): Promise<FileResult>
  fileExists(filePath: string): Promise<boolean>
  fileStat(filePath: string): Promise<FileStatResult>
  listDir(dirPath: string): Promise<DirListResult>

  // 目录监视（文件列表自动刷新）；Web 端为 no-op
  watchDir(dirPath: string): Promise<{ success: boolean; error?: string }>
  unwatchDir(dirPath: string): Promise<{ success: boolean }>
  onDirChanged(callback: (dir: string) => void): () => void

  openFileDialog(): Promise<DialogResult>
  saveFileDialog(defaultName?: string): Promise<DialogResult>
  getDefaultDir(): Promise<string>
  getBackupDir(filePath: string): Promise<string>

  // 系统剪贴板（跨实例复制粘贴）
  clipboardWriteText(text: string): Promise<{ success: boolean }>
  clipboardReadText(): Promise<string>

  // 静态数据（actions.json / job-skills.json / action-names-cn.json）
  loadSpellData(): Promise<{
    success: boolean
    data: Record<string, { n: string; c?: number; t: number; ct?: number; p?: number; r?: number }>
    error?: string
  }>
  loadJobSkills(): Promise<{ success: boolean; data?: JobSkillDatabase; error?: string }>
  loadActionNames(): Promise<{ success: boolean; data?: ActionNameDatabase; error?: string }>

  // AE directory
  getAeDirectory(): Promise<string>
  selectAeDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  getAcrDir(): Promise<string>
  onAeDirectoryChanged(callback: (newDir: string) => void): () => void

  // PromeRotation (PureTimeline)
  getPrDirectory(): Promise<string>
  selectPrDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  openPrFileDialog(): Promise<DialogResult>
  savePrFileDialog(defaultName?: string): Promise<DialogResult>
  onPrDirectoryChanged(callback: (newDir: string) => void): () => void

  // FFLogs
  fetchFflogsReport(code: string, apiKey?: string): Promise<FflogsResult<FflogsReportInfo>>
  fetchFflogsCasts(req: FflogsFetchCastsRequest): Promise<FflogsResult<FflogsCastEvent[]>>
  cancelFflogsCasts(requestId: string): Promise<void>
  onFflogsProgress(callback: (p: FflogsFetchProgress) => void): () => void

  // ACT 本地日志
  listActLogFiles(dir?: string): Promise<ActResult<ActLogFileInfo[]>>
  scanActLog(req: ActScanRequest): Promise<ActResult<ActScanResult>>
  parseActLog(req: ActParseRequest): Promise<ActResult<ActLogEvent[]>>
  cancelActLog(requestId: string): Promise<void>
  onActProgress(callback: (p: ActProgress) => void): () => void
  getActLogsDirectory(): Promise<string>
  selectActLogsDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  openActLogFileDialog(): Promise<DialogResult>
  onActLogsDirectoryChanged(callback: (newDir: string) => void): () => void

  // Logs (combat log timelines) directory
  getLogsDirectory(): Promise<string>
  selectLogsDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  openLogsFileDialog(): Promise<DialogResult>
  saveLogsFileDialog(defaultName?: string): Promise<DialogResult>
  onLogsDirectoryChanged(callback: (newDir: string) => void): () => void

  // App settings and cactbot network access
  getSettings(): Promise<AppSettings>
  setProxySettings(settings: ProxySettings): Promise<
    { success: true; settings: ProxySettings } | { success: false; error: string }
  >
  setFontSize(percent: number): Promise<
    { success: true; fontSizePercent: number } | { success: false; error: string }
  >
  listCactbotFiles(refresh?: boolean): Promise<CactbotCatalogResult>
  downloadCactbotFile(path: string, hasLocalization: boolean): Promise<CactbotDownloadResult>
  testCactbotProxy(): Promise<ProxyTestResult>

  // ACR types
  discoverAcrTypes(): Promise<AcrDiscoveryResult>
  listAcrDlls(): Promise<{ success: boolean; error?: string; dlls: string[] }>
  onAcrTypesChanged(callback: () => void): () => void

  // Updater
  getVersion(): Promise<string>
  checkForUpdates(): Promise<UpdateCheckResult>
  downloadUpdate(zipUrl: string): Promise<{ success: boolean; zipPath?: string; error?: string }>
  installUpdate(zipPath: string): Promise<{ success: boolean; error?: string }>
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void
  onUpdateAvailable(callback: (info: { latestVersion: string; releaseNotes?: string }) => void): () => void
}
