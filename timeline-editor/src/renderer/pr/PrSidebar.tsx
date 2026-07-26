import { useCallback, useEffect, useState } from 'react'
import { usePrStore } from '../store/prStore'
import { askConfirm } from '../store/dialogStore'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

/** PromeRotation PureTimelines directory browser */
export function PrSidebar() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [rootDir, setRootDir] = useState<string>('')
  const [currentDir, setCurrentDir] = useState<string>('')
  const loadFile = usePrStore(s => s.loadFile)
  const filePath = usePrStore(s => s.filePath)
  const isDirty = usePrStore(s => s.isDirty)

  const loadDirectory = useCallback(async (dir: string) => {
    const result = await window.electronAPI.listDir(dir)
    if (result.success && result.entries) {
      const entries: FileEntry[] = []
      for (const e of result.entries) {
        if (!e.isDirectory && !e.name.endsWith('.json')) continue
        entries.push({
          name: e.name,
          path: `${dir}/${e.name}`.replace(/\\/g, '/'),
          isDirectory: e.isDirectory
        })
      }
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setFiles(entries)
      setCurrentDir(dir)
    } else {
      setFiles([])
      setCurrentDir(dir)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const dir = await window.electronAPI.getPrDirectory()
      const normalized = dir.replace(/\\/g, '/')
      setRootDir(normalized)
      loadDirectory(normalized)
    })()
  }, [loadDirectory])

  useEffect(() => {
    const unsub = window.electronAPI.onPrDirectoryChanged((newDir: string) => {
      const normalized = newDir.replace(/\\/g, '/')
      setRootDir(normalized)
      loadDirectory(normalized)
    })
    return unsub
  }, [loadDirectory])

  const handleClick = useCallback(async (entry: FileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path)
      return
    }
    if (isDirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        message: `当前时间轴有未保存的修改，打开「${entry.name}」将丢失这些修改。`,
        confirmLabel: '放弃并打开',
        danger: true
      })
      if (!ok) return
    }
    const ok = await loadFile(entry.path)
    if (ok) document.title = `Timeline Editor - ${entry.name}`
  }, [loadFile, loadDirectory, isDirty])

  const handleGoUp = useCallback(() => {
    if (currentDir === rootDir) return
    const parent = currentDir.replace(/[/\\][^/\\]+$/, '')
    if (parent && parent !== currentDir) loadDirectory(parent)
  }, [currentDir, rootDir, loadDirectory])

  const handleRefresh = useCallback(() => {
    if (currentDir) loadDirectory(currentDir)
  }, [currentDir, loadDirectory])

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="p-2 border-b border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">PR 时间轴</div>
          <button
            onClick={handleRefresh}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            title="刷新文件列表"
          >
            ⟳
          </button>
        </div>
        <div className="text-[10px] text-gray-500 truncate" title={currentDir}>
          {currentDir || 'Loading...'}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {currentDir !== rootDir && (
          <div
            onClick={handleGoUp}
            className="px-3 py-1.5 text-sm cursor-pointer text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors border-l-2 border-transparent"
          >
            📁 ..
          </div>
        )}
        {files.map(entry => (
          <div
            key={entry.path}
            onClick={() => handleClick(entry)}
            className={`px-3 py-1.5 text-sm cursor-pointer truncate transition-colors border-l-2
              ${entry.path === filePath
                ? 'bg-emerald-900/40 border-emerald-500 text-emerald-200'
                : 'border-transparent hover:bg-gray-700 text-gray-300 hover:text-gray-100'}`}
            title={entry.path}
          >
            <span className="mr-2">{entry.isDirectory ? '📁' : '⏱️'}</span>
            {entry.name}
          </div>
        ))}
        {files.length === 0 && (
          <div className="p-3 text-sm text-gray-500 italic">
            目录为空或不存在
            <div className="text-[11px] mt-1 text-gray-600">可通过工具栏 ⚙ PR目录 选择 PureTimelines 文件夹</div>
          </div>
        )}
      </div>
    </div>
  )
}
