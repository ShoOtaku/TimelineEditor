// Web 文件系统 —— 用 File System Access API 实现与 Electron 相同的「路径字符串」语义。
//
// 路径方案：虚拟路径 `/<根名>/<子路径>`。根名对应用户授权过的目录句柄（persist 到 IndexedDB），
// 经系统文件对话框单独选取的文件挂在 `/picked/<文件名>` 下。
// UI 层只见到普通字符串路径，无需感知句柄。
//
// 降级（Firefox/Safari 等无 File System Access 的浏览器）：
//   目录选择 → <input webkitdirectory> 整目录上传，载入内存（仅本会话）
//   打开文件 → <input type=file> 上传
//   保存/另存为 → Blob 下载导出（无法写回本地）

import type { DirEntry, DirListResult, DialogResult, FileResult, FileStatResult } from '@shared/platformApi'
import { ensurePermission, getFsAccessPicker, hasFileSystemAccess, isNotFound } from './fsAccess'
import type { DirectoryHandleEntries } from './fsAccess'
import { idbGet, idbPut } from './idb'

const PICKED_ROOT = 'picked'

/** 统一为以 / 分隔、无首尾多余斜杠的相对段序列；解析 '.'/'..' 段 */
function normalizePath(path: string): string[] {
  const segments: string[] = []
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    if (!raw || raw === '.') continue
    if (raw === '..') { segments.pop(); continue }
    segments.push(raw)
  }
  return segments
}

function toVirtualPath(segments: string[]): string {
  return `/${segments.join('/')}`
}

function baseName(path: string): string {
  const segments = normalizePath(path)
  return segments[segments.length - 1] ?? 'download.json'
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return '文件访问权限被拒绝'
  return error instanceof Error ? error.message : String(error)
}

type HandleWithCompare = FileSystemHandle & {
  isSameEntry?: (other: FileSystemHandle) => Promise<boolean>
}

async function isSameEntry(a: FileSystemHandle, b: FileSystemHandle): Promise<boolean> {
  const compare = (a as HandleWithCompare).isSameEntry
  if (typeof compare !== 'function') return false
  try { return await compare.call(a, b) } catch { return false }
}

function triggerDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export class WebFileSystem {
  private roots = new Map<string, FileSystemDirectoryHandle>()
  private picked = new Map<string, FileSystemFileHandle>()
  /** 上传降级的文件内容（虚拟路径 → File），仅存在于无 FSA 的浏览器会话内 */
  private uploaded = new Map<string, File>()
  /** 上传目录树中出现过的目录虚拟路径（含根），供 listDir 推导 */
  private uploadDirs = new Set<string>()
  private readonly fsaSupported = hasFileSystemAccess()

  /** 恢复根目录句柄（启动时按持久化的虚拟路径首段从 IndexedDB 取回） */
  async restoreRoot(virtualDir: string): Promise<void> {
    const [name] = normalizePath(virtualDir)
    if (!name || name === PICKED_ROOT || this.roots.has(name)) return
    try {
      const handle = await idbGet<FileSystemDirectoryHandle>(`root:${name}`)
      if (handle) this.roots.set(name, handle)
    } catch { /* IndexedDB 不可用则要求用户重新选择目录 */ }
  }

  /** 弹出目录选择器并注册为新的根，返回虚拟路径；无 FSA 时退化为整目录上传 */
  async selectDirectory(): Promise<{ cancelled: boolean; directory?: string }> {
    const picker = getFsAccessPicker()
    if (picker.showDirectoryPicker) {
      let handle: FileSystemDirectoryHandle
      try {
        handle = await picker.showDirectoryPicker({ mode: 'readwrite' })
      } catch {
        return { cancelled: true }
      }
      const name = await this.registerRoot(handle)
      try { await idbPut(`root:${name}`, handle) } catch { /* 持久化失败不影响本次会话 */ }
      return { cancelled: false, directory: `/${name}` }
    }
    return this.selectDirectoryViaUpload()
  }

  private async registerRoot(handle: FileSystemDirectoryHandle): Promise<string> {
    for (const [name, existing] of this.roots) {
      if (await isSameEntry(existing, handle)) return name
    }
    return this.allocateRootName(handle.name)
  }

  private allocateRootName(rawName: string): string {
    const base = rawName.replace(/[\\/]/g, '_') || 'dir'
    let name = base
    let n = 2
    while (this.roots.has(name) || this.uploadDirs.has(`/${name}`)) name = `${base}#${n++}`
    return name
  }

  // ---- 上传降级（无 File System Access API）----

  /** 整目录上传（webkitdirectory），返回根目录虚拟路径；无 FSA 或系统目录被拦截时使用 */
  selectDirectoryViaUpload(): Promise<{ cancelled: boolean; directory?: string }> {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.webkitdirectory = true
      input.onchange = () => {
        const files = Array.from(input.files ?? [])
        if (files.length === 0) { resolve({ cancelled: true }); return }
        resolve({ cancelled: false, directory: this.registerUploadedDirectory(files) })
      }
      input.addEventListener('cancel', () => resolve({ cancelled: true }))
      input.click()
    })
  }

  /** 把 webkitdirectory 选入的文件整批登记进内存表，返回根目录虚拟路径 */
  private registerUploadedDirectory(files: File[]): string {
    const firstRelative = files[0]?.webkitRelativePath ?? ''
    const rootName = this.allocateRootName(firstRelative.split('/')[0] || 'dir')
    for (const file of files) {
      const relative = file.webkitRelativePath.split('/').slice(1) // 去掉原根名，换成我们的根名
      if (relative.length === 0 || relative.some(seg => !seg)) continue
      const segments = [rootName, ...relative]
      for (let depth = 1; depth < segments.length; depth++) {
        this.uploadDirs.add(toVirtualPath(segments.slice(0, depth)))
      }
      this.uploaded.set(toVirtualPath(segments), file)
    }
    return `/${rootName}`
  }

  private pickFileViaUpload(): Promise<DialogResult> {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.txt'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) { resolve({ cancelled: true, filePath: null }); return }
        let path = `/${PICKED_ROOT}/${file.name}`
        let n = 2
        while (this.uploaded.has(path)) path = `/${PICKED_ROOT}/${file.name} (${n++})`
        this.uploaded.set(path, file)
        resolve({ cancelled: false, filePath: path })
      }
      input.addEventListener('cancel', () => resolve({ cancelled: true, filePath: null }))
      input.click()
    })
  }

  // ---- 句柄解析 ----

  /** 给选取的文件句柄分配虚拟路径：优先归入已授权根目录（可跨会话解析），否则进 picked 表 */
  private async pathForFile(file: FileSystemFileHandle): Promise<string> {
    for (const [name, root] of this.roots) {
      try {
        const relative = await root.resolve(file)
        if (relative) return `/${[name, ...relative].join('/')}`
      } catch { /* resolve 失败按未归属处理 */ }
    }
    for (const [path, existing] of this.picked) {
      if (await isSameEntry(existing, file)) return path
    }
    const base = file.name || 'file'
    let path = `/${PICKED_ROOT}/${base}`
    let n = 2
    while (this.picked.has(path)) path = `/${PICKED_ROOT}/${base} (${n++})`
    this.picked.set(path, file)
    return path
  }

  private async walkToDir(segments: string[]): Promise<FileSystemDirectoryHandle | null> {
    if (segments.length === 0) return null
    const root = this.roots.get(segments[0])
    if (!root) return null
    let dir = root
    for (let i = 1; i < segments.length; i++) {
      try {
        dir = await dir.getDirectoryHandle(segments[i])
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    }
    return dir
  }

  private async resolveFile(path: string, create = false): Promise<FileSystemFileHandle | null> {
    const segments = normalizePath(path)
    if (segments.length === 0) return null
    if (segments[0] === PICKED_ROOT) return this.picked.get(toVirtualPath(segments)) ?? null
    const dir = await this.walkToDir(segments.slice(0, -1))
    if (!dir) return null
    try {
      return await dir.getFileHandle(segments[segments.length - 1], { create })
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  private async resolveDir(path: string): Promise<FileSystemDirectoryHandle | null> {
    return this.walkToDir(normalizePath(path))
  }

  // ---- PlatformApi 文件操作 ----

  async readFile(path: string): Promise<FileResult> {
    const uploaded = this.uploaded.get(toVirtualPath(normalizePath(path)))
    if (uploaded) {
      try {
        return { success: true, content: await uploaded.text() }
      } catch (error) {
        return { success: false, error: formatError(error) }
      }
    }
    try {
      const handle = await this.resolveFile(path)
      if (!handle) return { success: false, error: '文件不存在，或所在目录尚未授权访问' }
      if (!(await ensurePermission(handle, 'read'))) {
        return { success: false, error: '读取权限未授予，请重新选择目录' }
      }
      const file = await handle.getFile()
      return { success: true, content: await file.text() }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  async writeFile(path: string, content: string): Promise<FileResult> {
    // 无 FSA 的浏览器无法写回本地，保存 = 下载导出
    if (!this.fsaSupported) {
      try {
        triggerDownload(content, baseName(path))
        return { success: true }
      } catch (error) {
        return { success: false, error: formatError(error) }
      }
    }
    try {
      const handle = await this.resolveFile(path, true)
      if (!handle) return { success: false, error: '所在目录尚未授权访问，请通过「另存为」选择保存位置' }
      if (!(await ensurePermission(handle, 'readwrite'))) {
        return { success: false, error: '写入权限未授予，请重新选择目录或使用「另存为」' }
      }
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return { success: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  async fileExists(path: string): Promise<boolean> {
    const virtual = toVirtualPath(normalizePath(path))
    if (this.uploaded.has(virtual) || this.uploadDirs.has(virtual)) return true
    try {
      return (await this.resolveFile(path)) !== null || (await this.resolveDir(path)) !== null
    } catch {
      return false
    }
  }

  async fileStat(path: string): Promise<FileStatResult> {
    const virtual = toVirtualPath(normalizePath(path))
    const uploaded = this.uploaded.get(virtual)
    if (uploaded) return { success: true, size: uploaded.size, mtime: uploaded.lastModified, isDirectory: false }
    if (this.uploadDirs.has(virtual)) return { success: true, isDirectory: true }
    try {
      const file = await this.resolveFile(path)
      if (file) {
        const f = await file.getFile()
        return { success: true, size: f.size, mtime: f.lastModified, isDirectory: false }
      }
      const dir = await this.resolveDir(path)
      if (dir) return { success: true, isDirectory: true }
      return { success: false, error: '文件不存在' }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  async listDir(path: string): Promise<DirListResult> {
    const virtual = toVirtualPath(normalizePath(path))
    if (this.uploadDirs.has(virtual)) return this.listUploadedDir(virtual)
    try {
      const dir = await this.resolveDir(path)
      if (!dir) return { success: false, error: '目录不存在，或尚未授权访问' }
      if (!(await ensurePermission(dir, 'read'))) {
        return { success: false, error: '目录访问权限未授予，请重新选择目录' }
      }
      const entries: DirEntry[] = []
      for await (const [name, child] of (dir as DirectoryHandleEntries).entries()) {
        entries.push({ name, isDirectory: child.kind === 'directory' })
      }
      return { success: true, entries }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  /** 从上传登记表推导某目录的直接子项（所有祖先目录在登记时已入 uploadDirs） */
  private listUploadedDir(virtual: string): DirListResult {
    const prefix = `${virtual}/`
    const children = new Map<string, boolean>()
    for (const dirPath of this.uploadDirs) {
      if (!dirPath.startsWith(prefix)) continue
      const rest = dirPath.slice(prefix.length)
      if (!rest.includes('/')) children.set(rest, true) // 直接子目录
    }
    for (const filePath of this.uploaded.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      if (!rest.includes('/')) children.set(rest, false) // 直接子文件
    }
    const entries: DirEntry[] = [...children].map(([name, isDirectory]) => ({ name, isDirectory }))
    return { success: true, entries }
  }

  async openFile(accept: Record<string, string[]>): Promise<DialogResult> {
    const picker = getFsAccessPicker()
    if (!picker.showOpenFilePicker) return this.pickFileViaUpload()
    try {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: '时间轴文件', accept }],
        multiple: false
      })
      if (!handle) return { cancelled: true, filePath: null }
      return { cancelled: false, filePath: await this.pathForFile(handle) }
    } catch {
      return { cancelled: true, filePath: null }
    }
  }

  async saveFileAs(defaultName?: string): Promise<DialogResult> {
    const picker = getFsAccessPicker()
    if (!picker.showSaveFilePicker) {
      // 降级：不产生句柄，登记虚拟路径，writeFile 时以下载导出
      const name = defaultName || 'download.json'
      return { cancelled: false, filePath: `/${PICKED_ROOT}/${name}` }
    }
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      })
      return { cancelled: false, filePath: await this.pathForFile(handle) }
    } catch {
      return { cancelled: true, filePath: null }
    }
  }
}
