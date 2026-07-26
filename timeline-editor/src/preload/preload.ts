import { contextBridge, ipcRenderer } from 'electron'

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
  loadSpellData: (): Promise<{ success: boolean; data: Record<string, { n: string; t: number }>; error?: string }> =>
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
