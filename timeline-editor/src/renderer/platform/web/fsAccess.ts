// File System Access API 的最小类型声明 —— 不同 TS lib 版本覆盖不一，统一走本地声明避免编译期依赖。

export interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
}

export interface FilePickerType {
  description?: string
  accept: Record<string, string[]>
}

export interface OpenFilePickerOptions {
  types?: FilePickerType[]
  multiple?: boolean
}

export interface SaveFilePickerOptions {
  suggestedName?: string
  types?: FilePickerType[]
}

export interface FsAccessPicker {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

export function getFsAccessPicker(): FsAccessPicker {
  if (typeof window === 'undefined') return {}
  return window as unknown as FsAccessPicker
}

export function hasFileSystemAccess(): boolean {
  const w = getFsAccessPicker()
  return typeof w.showDirectoryPicker === 'function'
}

type PermissionCapableHandle = FileSystemHandle & {
  queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

/**
 * 确保句柄权限。requestPermission 需要用户手势，无手势时会抛异常 —— 此处吞掉返回 false，
 * 由调用方给出「请重新选择目录」的可见错误。
 */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> {
  const h = handle as PermissionCapableHandle
  if (typeof h.queryPermission !== 'function' || typeof h.requestPermission !== 'function') return true
  try {
    if ((await h.queryPermission({ mode })) === 'granted') return true
    return (await h.requestPermission({ mode })) === 'granted'
  } catch {
    return false
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/** 部分 TS lib 版本的 FileSystemDirectoryHandle 不含异步迭代方法，本地补声明 */
export type DirectoryHandleEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
}
