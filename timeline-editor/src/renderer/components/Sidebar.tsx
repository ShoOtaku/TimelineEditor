import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export function Sidebar() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [defaultDir, setDefaultDir] = useState<string>('')
  const [aeDir, setAeDir] = useState<string>('')
  const [currentDir, setCurrentDir] = useState<string>('')
  const loadFile = useStore(s => s.loadFile)
  const filePath = useStore(s => s.filePath)

  const loadDirectory = useCallback(async (dir: string) => {
    const result = await window.electronAPI.listDir(dir)
    if (result.success && result.entries) {
      const entries: FileEntry[] = []
      for (const e of result.entries) {
        if (e.isDirectory && e.name === 'bak') continue
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
    }
  }, [])

  // Initial load
  useEffect(() => {
    (async () => {
      const dir = await window.electronAPI.getDefaultDir()
      const ae = await window.electronAPI.getAeDirectory()
      setDefaultDir(dir)
      setAeDir(ae)
      setCurrentDir(dir)
      loadDirectory(dir)
    })()
  }, [loadDirectory])

  // Listen for AE directory changes
  useEffect(() => {
    const unsub = window.electronAPI.onAeDirectoryChanged(async (newAeDir: string) => {
      setAeDir(newAeDir)
      const newTriggerlinesDir = newAeDir.replace(/\\/g, '/') + '/Triggerlines'
      setDefaultDir(newTriggerlinesDir)
      setCurrentDir(newTriggerlinesDir)
      loadDirectory(newTriggerlinesDir)
    })
    return unsub
  }, [loadDirectory])

  const handleClick = useCallback(async (entry: FileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path)
    } else {
      await loadFile(entry.path)
      document.title = `Timeline Editor - ${entry.name}`
    }
  }, [loadFile, loadDirectory])

  const handleGoUp = useCallback(() => {
    if (currentDir === defaultDir) return
    const parent = currentDir.replace(/[/\\][^/\\]+$/, '')
    if (parent && parent !== currentDir) {
      loadDirectory(parent)
    }
  }, [currentDir, defaultDir, loadDirectory])

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="p-2 border-b border-gray-700">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Files</div>
        <div className="text-[10px] text-gray-500 truncate" title={currentDir}>
          {currentDir || 'Loading...'}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {currentDir !== defaultDir && (
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
                ? 'bg-blue-900/40 border-blue-500 text-blue-200'
                : 'border-transparent hover:bg-gray-700 text-gray-300 hover:text-gray-100'}`}
            title={entry.path}
          >
            <span className="mr-2">{entry.isDirectory ? '📁' : entry.name.endsWith('.txt') ? '📝' : '📋'}</span>
            {entry.name}
          </div>
        ))}
        {files.length === 0 && currentDir === defaultDir && (
          <div className="p-3 text-sm text-gray-500 italic">No files found</div>
        )}
      </div>
    </div>
  )
}
