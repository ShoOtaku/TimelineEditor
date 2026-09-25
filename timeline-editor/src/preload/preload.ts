import { contextBridge, ipcRenderer } from 'electron'
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

const api = {
  readFile: (filePath: string): Promise<FileResult> =>
    ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string): Promise<FileResult> =>
    ipcRenderer.invoke('file:write', filePath, content),
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('file:exists', filePath),
  fileStat: (filePath: string): Promise<FileStatResult> =>
    ipcRenderer.invoke('file:stat', filePath),
  listDir: (dirPath: string): Promise<DirListResult> =>
    ipcRenderer.invoke('file:listDir', dirPath),
  openFileDialog: (): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName?: string): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),
  getDefaultDir: (): Promise<string> =>
    ipcRenderer.invoke('app:getDefaultDir'),
  getBackupDir: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('app:getBackupDir', filePath),

  // Spell data
  loadSpellData: (): Promise<{ success: boolean; data: Record<string, { n: string; c?: number; t: number; ct?: number; p?: number }>; error?: string }> =>
    ipcRenderer.invoke('app:loadSpellData'),

  // AE directory
  getAeDirectory: (): Promise<string> =>
    ipcRenderer.invoke('app:getAeDirectory'),
  selectAeDirectory: (): Promise<{ cancelled: boolean; directory?: string }> =>
    ipcRenderer.invoke('dialog:selectAeDirectory'),
  getAcrDir: (): Promise<string> =>
    ipcRenderer.invoke('app:getAcrDir'),
  onAeDirectoryChanged: (callback: (newDir: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, newDir: string) => callback(newDir)
    ipcRenderer.on('ae:directoryChanged', handler)
    return () => ipcRenderer.removeListener('ae:directoryChanged', handler)
  },

  // PromeRotation (PureTimeline)
  getPrDirectory: (): Promise<string> =>
    ipcRenderer.invoke('app:getPrDir'),
  selectPrDirectory: (): Promise<{ cancelled: boolean; directory?: string }> =>
    ipcRenderer.invoke('dialog:selectPrDirectory'),
  openPrFileDialog: (): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:openPrFile'),
  savePrFileDialog: (defaultName?: string): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:savePrFile', defaultName),
  onPrDirectoryChanged: (callback: (newDir: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, newDir: string) => callback(newDir)
    ipcRenderer.on('pr:directoryChanged', handler)
    return () => ipcRenderer.removeListener('pr:directoryChanged', handler)
  },

  // FFLogs
  fetchFflogsReport: (code: string, apiKey?: string): Promise<FflogsResult<FflogsReportInfo>> =>
    ipcRenderer.invoke('fflogs:fetchReport', code, apiKey),
  fetchFflogsCasts: (req: FflogsFetchCastsRequest): Promise<FflogsResult<FflogsCastEvent[]>> =>
    ipcRenderer.invoke('fflogs:fetchCasts', req),
  cancelFflogsCasts: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('fflogs:cancelCasts', requestId),
  onFflogsProgress: (callback: (p: FflogsFetchProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: FflogsFetchProgress) => callback(p)
    ipcRenderer.on('fflogs:progress', handler)
    return () => ipcRenderer.removeListener('fflogs:progress', handler)
  },

  // ACT 本地日志
  listActLogFiles: (dir?: string): Promise<ActResult<ActLogFileInfo[]>> =>
    ipcRenderer.invoke('act:listFiles', dir),
  scanActLog: (req: ActScanRequest): Promise<ActResult<ActScanResult>> =>
    ipcRenderer.invoke('act:scan', req),
  parseActLog: (req: ActParseRequest): Promise<ActResult<ActLogEvent[]>> =>
    ipcRenderer.invoke('act:parse', req),
  cancelActLog: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('act:cancel', requestId),
  onActProgress: (callback: (p: ActProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: ActProgress) => callback(p)
    ipcRenderer.on('act:progress', handler)
    return () => ipcRenderer.removeListener('act:progress', handler)
  },
  getActLogsDirectory: (): Promise<string> =>
    ipcRenderer.invoke('app:getActLogsDir'),
  selectActLogsDirectory: (): Promise<{ cancelled: boolean; directory?: string }> =>
    ipcRenderer.invoke('dialog:selectActLogsDirectory'),
  openActLogFileDialog: (): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:openActLogFile'),
  onActLogsDirectoryChanged: (callback: (newDir: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, newDir: string) => callback(newDir)
    ipcRenderer.on('actLogs:directoryChanged', handler)
    return () => ipcRenderer.removeListener('actLogs:directoryChanged', handler)
  },

  // Job skill database
  loadJobSkills: (): Promise<{ success: boolean; data?: JobSkillDatabase; error?: string }> =>
    ipcRenderer.invoke('app:loadJobSkills'),
  loadActionNames: (): Promise<{ success: boolean; data?: ActionNameDatabase; error?: string }> =>
    ipcRenderer.invoke('app:loadActionNames'),

  // Logs (combat log timelines) directory
  getLogsDirectory: (): Promise<string> =>
    ipcRenderer.invoke('app:getLogsDir'),
  selectLogsDirectory: (): Promise<{ cancelled: boolean; directory?: string }> =>
    ipcRenderer.invoke('dialog:selectLogsDirectory'),
  openLogsFileDialog: (): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:openLogsFile'),
  saveLogsFileDialog: (defaultName?: string): Promise<DialogResult> =>
    ipcRenderer.invoke('dialog:saveLogsFile', defaultName),
  onLogsDirectoryChanged: (callback: (newDir: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, newDir: string) => callback(newDir)
    ipcRenderer.on('logs:directoryChanged', handler)
    return () => ipcRenderer.removeListener('logs:directoryChanged', handler)
  },

  // App settings and cactbot network access
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),
  setProxySettings: (settings: ProxySettings): Promise<
    { success: true; settings: ProxySettings } | { success: false; error: string }
  > => ipcRenderer.invoke('settings:setProxy', settings),
  setFontSize: (percent: number): Promise<
    { success: true; fontSizePercent: number } | { success: false; error: string }
  > => ipcRenderer.invoke('settings:setFontSize', percent),
  listCactbotFiles: (refresh = false): Promise<CactbotCatalogResult> =>
    ipcRenderer.invoke('cactbot:list', refresh),
  downloadCactbotFile: (path: string, hasLocalization: boolean): Promise<CactbotDownloadResult> =>
    ipcRenderer.invoke('cactbot:download', path, hasLocalization),
  testCactbotProxy: (): Promise<ProxyTestResult> =>
    ipcRenderer.invoke('cactbot:testProxy'),

  // ACR types
  discoverAcrTypes: (): Promise<{
    success: boolean
    error?: string
    conditions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    actions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    acrDlls: string[]
  }> =>
    ipcRenderer.invoke('acr:discoverTypes'),
  listAcrDlls: (): Promise<{ success: boolean; error?: string; dlls: string[] }> =>
    ipcRenderer.invoke('acr:listDlls'),
  onAcrTypesChanged: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('acr:typesChanged', handler)
    return () => ipcRenderer.removeListener('acr:typesChanged', handler)
  },

  // Updater
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('updater:getVersion'),
  checkForUpdates: (): Promise<{
    hasUpdate: boolean
    currentVersion: string
    latestVersion: string | null
    zipUrl: string | null
    releaseNotes: string | null
    error?: string
  }> =>
    ipcRenderer.invoke('updater:check'),
  downloadUpdate: (zipUrl: string): Promise<{ success: boolean; zipPath?: string; error?: string }> =>
    ipcRenderer.invoke('updater:download', zipUrl),
  installUpdate: (zipPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('updater:install', zipPath),
  onUpdateProgress: (callback: (progress: { percent: number; downloaded: number; total: number; speed: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; downloaded: number; total: number; speed: string }) => callback(progress)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.removeListener('updater:progress', handler)
  },
  onUpdateAvailable: (callback: (info: { latestVersion: string; releaseNotes?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { latestVersion: string; releaseNotes?: string }) => callback(info)
    ipcRenderer.on('updater:available', handler)
    return () => ipcRenderer.removeListener('updater:available', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
