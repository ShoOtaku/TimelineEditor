/// <reference types="vite/client" />

import type {
  AppSettings, CactbotCatalogResult, CactbotDownloadResult,
  ProxySettings, ProxyTestResult
} from '../shared/cactbotTypes'
import type {
  FflogsCastEvent, FflogsFetchCastsRequest, FflogsFetchProgress,
  FflogsReportInfo, FflogsResult
} from '../shared/fflogsTypes'
import type {
  ActLogEvent, ActLogFileInfo, ActParseRequest, ActProgress,
  ActResult, ActScanRequest, ActScanResult
} from '../shared/actTypes'
import type { JobSkillDatabase } from '../shared/jobSkillTypes'
import type { ActionNameDatabase } from '../shared/actionNameTypes'

interface ElectronFileResult {
  success: boolean
  content?: string
  error?: string
}

interface ElectronDirEntry {
  name: string
  isDirectory: boolean
}

interface ElectronDirListResult {
  success: boolean
  entries?: ElectronDirEntry[]
  error?: string
}

interface ElectronDialogResult {
  cancelled: boolean
  filePath: string | null
}

interface ElectronAPI {
  readFile(filePath: string): Promise<ElectronFileResult>
  writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>
  fileExists(filePath: string): Promise<boolean>
  fileStat(filePath: string): Promise<{ success: boolean; size?: number; mtime?: number; isDirectory?: boolean; error?: string }>
  listDir(dirPath: string): Promise<ElectronDirListResult>
  openFileDialog(): Promise<ElectronDialogResult>
  saveFileDialog(defaultName?: string): Promise<ElectronDialogResult>
  getDefaultDir(): Promise<string>
  getBackupDir(filePath: string): Promise<string>
  clipboardWriteText(text: string): Promise<{ success: boolean }>
  clipboardReadText(): Promise<string>
  loadSpellData(): Promise<{ success: boolean; data: Record<string, { n: string; c?: number; t: number; ct?: number; p?: number; r?: number }>; error?: string }>
  getAeDirectory(): Promise<string>
  selectAeDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  getAcrDir(): Promise<string>
  onAeDirectoryChanged(callback: (newDir: string) => void): () => void

  // PromeRotation (PureTimeline)
  getPrDirectory(): Promise<string>
  selectPrDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  openPrFileDialog(): Promise<ElectronDialogResult>
  savePrFileDialog(defaultName?: string): Promise<ElectronDialogResult>
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
  openActLogFileDialog(): Promise<ElectronDialogResult>
  onActLogsDirectoryChanged(callback: (newDir: string) => void): () => void

  // Job skill database
  loadJobSkills(): Promise<{ success: boolean; data?: JobSkillDatabase; error?: string }>
  loadActionNames(): Promise<{ success: boolean; data?: ActionNameDatabase; error?: string }>

  // Logs (combat log timelines) directory
  getLogsDirectory(): Promise<string>
  selectLogsDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  openLogsFileDialog(): Promise<ElectronDialogResult>
  saveLogsFileDialog(defaultName?: string): Promise<ElectronDialogResult>
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

  discoverAcrTypes(): Promise<{
    success: boolean
    error?: string
    conditions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    actions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    acrDlls: string[]
  }>
  listAcrDlls(): Promise<{ success: boolean; error?: string; dlls: string[] }>
  onAcrTypesChanged(callback: () => void): () => void

  // Updater
  getVersion(): Promise<string>
  checkForUpdates(): Promise<{
    hasUpdate: boolean
    currentVersion: string
    latestVersion: string | null
    zipUrl: string | null
    releaseNotes: string | null
    error?: string
  }>
  downloadUpdate(zipUrl: string): Promise<{ success: boolean; zipPath?: string; error?: string }>
  installUpdate(zipPath: string): Promise<{ success: boolean; error?: string }>
  onUpdateProgress(callback: (progress: { percent: number; downloaded: number; total: number; speed: string }) => void): () => void
  onUpdateAvailable(callback: (info: { latestVersion: string; releaseNotes?: string }) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
