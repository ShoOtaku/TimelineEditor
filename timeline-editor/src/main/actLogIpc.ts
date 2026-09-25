// ACT 本地日志导入的 IPC：日志目录管理、文件列表、流式扫描（战斗分段）、时间窗解析
// 解析本身在 actLogScanner/actLogParser（无 electron 依赖），这里只做校验/进度/取消

import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type {
  ActLogEvent, ActLogFileInfo, ActParseRequest, ActProgress, ActResult,
  ActScanRequest, ActScanResult
} from '../shared/actTypes'
import { getActLogsDirectory, setActLogsDirectory } from './appConfig'
import { ActCancelledError, parseActLogWindow, scanActLogFile } from './actLogScanner'

const MAX_GAP_MS = 30 * 60_000

interface RequestState {
  cancelled: boolean
}

const requests = new Map<string, RequestState>()

export function registerActLogIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:getActLogsDir', () => getActLogsDirectory())

  ipcMain.handle('dialog:selectActLogsDirectory', async () => {
    const window = getWindow()
    if (!window) return { cancelled: true }
    const result = await dialog.showOpenDialog(window, {
      title: '选择 ACT 日志目录（FFXIVLogs）',
      defaultPath: getActLogsDirectory(),
      properties: ['openDirectory']
    })
    const directory = result.filePaths[0]
    if (result.canceled || !directory) return { cancelled: true }
    await setActLogsDirectory(directory)
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('actLogs:directoryChanged', directory))
    return { cancelled: false, directory }
  })

  ipcMain.handle('dialog:openActLogFile', async () => {
    const window = getWindow()
    if (!window) return { cancelled: true }
    const result = await dialog.showOpenDialog(window, {
      title: '打开 ACT 日志文件',
      defaultPath: getActLogsDirectory(),
      filters: [
        { name: 'ACT Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    return { cancelled: result.canceled, filePath: result.filePaths[0] || null }
  })

  ipcMain.handle('act:listFiles', (_event, dir?: string) => listLogFiles(dir))

  ipcMain.handle('act:scan', (event, req: ActScanRequest) => {
    const validationError = validateRequest(req, ['requestId', 'path'])
    if (validationError) return { success: false, error: validationError }
    if (typeof req.gapMs !== 'number' || !Number.isFinite(req.gapMs) || req.gapMs < 1000 || req.gapMs > MAX_GAP_MS) {
      return { success: false, error: '分段间隔无效（1 秒 – 30 分钟）' }
    }
    return runWithState(event, req.requestId, opts => scanActLogFile(req.path, req.gapMs, opts))
  })

  ipcMain.handle('act:parse', (event, req: ActParseRequest) => {
    const validationError = validateRequest(req, ['requestId', 'path'])
    if (validationError) return { success: false, error: validationError }
    if (typeof req.start !== 'number' || typeof req.end !== 'number' || !(req.start < req.end)) {
      return { success: false, error: '时间范围无效（start 必须小于 end）' }
    }
    return runWithState(event, req.requestId, opts => parseActLogWindow(req.path, req.start, req.end, opts))
  })

  ipcMain.handle('act:cancel', (_event, requestId: string) => {
    const state = typeof requestId === 'string' ? requests.get(requestId) : undefined
    if (state) state.cancelled = true
  })
}

function validateRequest(req: unknown, keys: string[]): string | null {
  if (!req || typeof req !== 'object') return '请求参数无效'
  for (const key of keys) {
    const value = (req as Record<string, unknown>)[key]
    if (typeof value !== 'string' || !value) return `缺少 ${key}`
  }
  return null
}

async function runWithState<T>(
  event: IpcMainInvokeEvent,
  requestId: string,
  run: (opts: { isCancelled: () => boolean; onProgress: (percent: number, lines: number) => void }) => Promise<T>
): Promise<ActResult<T>> {
  const state: RequestState = { cancelled: false }
  requests.set(requestId, state)
  try {
    const data = await run({
      isCancelled: () => state.cancelled,
      onProgress: (percent, lines) => {
        const progress: ActProgress = { requestId, percent, lines }
        if (!event.sender.isDestroyed()) event.sender.send('act:progress', progress)
      }
    })
    return { success: true, data }
  } catch (error) {
    if (error instanceof ActCancelledError) return { success: false, error: error.message, cancelled: true }
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    requests.delete(requestId)
  }
}

async function listLogFiles(dir?: string): Promise<ActResult<ActLogFileInfo[]>> {
  const directory = typeof dir === 'string' && dir.trim() ? dir : getActLogsDirectory()
  try {
    const entries = await readdir(directory)
    const files: ActLogFileInfo[] = []
    for (const name of entries) {
      if (!/\.log$/i.test(name)) continue
      const path = join(directory, name)
      try {
        const info = await stat(path)
        if (info.isFile()) files.push({ name, path, size: info.size, mtime: info.mtimeMs })
      } catch {
        // 单个文件 stat 失败（被占用/被删除）不阻塞列表
      }
    }
    files.sort((a, b) => b.mtime - a.mtime)
    return { success: true, data: files }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
