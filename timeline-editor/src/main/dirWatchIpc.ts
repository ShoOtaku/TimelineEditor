// 目录监视 IPC：侧栏监视当前显示的目录，内容变化（新建/保存/删除/重命名）时通知渲染进程刷新文件列表
import { watch, type FSWatcher } from 'fs'
import { ipcMain } from 'electron'

// 保存等操作会连发多个事件，去抖后只通知一次
const DEBOUNCE_MS = 250

interface WatchRecord {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
}

export function registerDirWatchIpc(): void {
  // key = `${webContents.id}:${directory}`，按发送方隔离，窗口销毁时自动清理
  const watchers = new Map<string, WatchRecord>()

  const stop = (key: string) => {
    const record = watchers.get(key)
    if (!record) return
    if (record.timer) clearTimeout(record.timer)
    record.watcher.close()
    watchers.delete(key)
  }

  ipcMain.handle('dir:watch', (event, directory: string) => {
    if (typeof directory !== 'string' || !directory) return { success: false, error: 'invalid directory' }
    const sender = event.sender
    const key = `${sender.id}:${directory}`
    if (watchers.has(key)) return { success: true }
    try {
      const record: WatchRecord = { watcher: null as unknown as FSWatcher, timer: null }
      record.watcher = watch(directory, { persistent: false }, () => {
        if (record.timer) clearTimeout(record.timer)
        record.timer = setTimeout(() => {
          record.timer = null
          if (!sender.isDestroyed()) sender.send('dir:changed', directory)
        }, DEBOUNCE_MS)
      })
      record.watcher.on('error', () => stop(key)) // 目录被删除等情况，放弃监视
      watchers.set(key, record)
      sender.once('destroyed', () => stop(key))
      return { success: true }
    } catch (error) { // 目录不存在等，仅本次不自动刷新
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('dir:unwatch', (event, directory: string) => {
    stop(`${event.sender.id}:${directory}`)
    return { success: true }
  })
}
