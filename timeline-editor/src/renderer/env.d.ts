/// <reference types="vite/client" />

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
  loadSpellData(): Promise<{ success: boolean; data: Record<string, { n: string; t: number }>; error?: string }>
  getAeDirectory(): Promise<string>
  selectAeDirectory(): Promise<{ cancelled: boolean; directory?: string }>
  getAcrDir(): Promise<string>
  onAeDirectoryChanged(callback: (newDir: string) => void): () => void
  discoverAcrTypes(): Promise<{
    success: boolean
    error?: string
    conditions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    actions: Array<{ $type: string; displayName: string; assemblyName: string; fields: Array<{ key: string; type: string }> }>
    acrDlls: string[]
  }>
  listAcrDlls(): Promise<{ success: boolean; error?: string; dlls: string[] }>
  onAcrTypesChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
