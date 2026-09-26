import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

type UpdatePhase =
  | 'checking'
  | 'available'
  | 'no-update'
  | 'downloading'
  | 'download-done'
  | 'installing'
  | 'error'

interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string | null
  zipUrl: string | null
}

interface DownloadProgress {
  percent: number
  downloaded: number
  total: number
  speed: string
}

interface UpdateDialogProps {
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UpdateDialog({ onClose }: UpdateDialogProps) {
  const [phase, setPhase] = useState<UpdatePhase>('checking')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<DownloadProgress>({ percent: 0, downloaded: 0, total: 0, speed: '' })
  const [errorMsg, setErrorMsg] = useState('')
  const [zipPath, setZipPath] = useState('')

  // Check for updates on mount
  useEffect(() => {
    check()
  }, [])

  // Listen for download progress
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateProgress((p) => {
      setProgress(p)
    })
    return unsub
  }, [])

  const check = useCallback(async () => {
    setPhase('checking')
    setErrorMsg('')
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (result.error) {
        setErrorMsg(result.error)
        setPhase('error')
        return
      }
      setUpdateInfo(result)
      if (result.hasUpdate) {
        setPhase('available')
      } else {
        setPhase('no-update')
      }
    } catch (err) {
      setErrorMsg(String(err))
      setPhase('error')
    }
  }, [])

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.zipUrl) return
    setPhase('downloading')
    setErrorMsg('')
    try {
      const result = await window.electronAPI.downloadUpdate(updateInfo.zipUrl)
      if (result.success && result.zipPath) {
        setZipPath(result.zipPath)
        setPhase('download-done')
      } else {
        setErrorMsg(result.error || 'Download failed')
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(String(err))
      setPhase('error')
    }
  }, [updateInfo])

  const handleInstall = useCallback(async () => {
    if (!zipPath) return
    setPhase('installing')
    setErrorMsg('')
    try {
      await window.electronAPI.installUpdate(zipPath)
      // Main process will quit the app shortly — don't show error
    } catch (err) {
      setErrorMsg(String(err))
      setPhase('error')
    }
  }, [zipPath])

  const width = phase === 'available' ? 420 : 380

  // Portal 到 body：避免被界面缩放（zoom）放大后超出窗口；面板限高并允许内部滚动
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div
        style={{ width }}
        className="max-w-full max-h-[calc(100vh-48px)] overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-2xl transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-gray-200 font-semibold text-sm">软件更新</h2>
          <button
            onClick={onClose}
            disabled={phase === 'downloading' || phase === 'installing'}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          {phase === 'checking' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full" />
              <span className="text-gray-300 text-sm">正在检查更新...</span>
            </div>
          )}

          {phase === 'no-update' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="text-3xl">✅</div>
              <span className="text-gray-300 text-sm">已是最新版本</span>
              {updateInfo && (
                <span className="text-gray-500 text-xs">当前版本 v{updateInfo.currentVersion}</span>
              )}
              <button
                onClick={onClose}
                className="mt-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
              >
                确定
              </button>
            </div>
          )}

          {phase === 'available' && updateInfo && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">当前版本：</span>
                <span className="text-gray-300">v{updateInfo.currentVersion}</span>
                <span className="text-gray-500 mx-1">→</span>
                <span className="text-green-400 font-semibold">v{updateInfo.latestVersion}</span>
              </div>

              {updateInfo.releaseNotes && (
                <div>
                  <div className="text-gray-400 text-xs mb-1">更新内容：</div>
                  <div className="bg-gray-900 rounded p-2 max-h-32 overflow-y-auto text-gray-300 text-xs whitespace-pre-wrap leading-relaxed">
                    {updateInfo.releaseNotes}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleDownload}
                  className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                >
                  下载更新
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                >
                  稍后
                </button>
              </div>
            </div>
          )}

          {phase === 'downloading' && (
            <div className="flex flex-col gap-3 py-2">
              <span className="text-gray-300 text-sm">正在下载更新...</span>

              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(progress.percent, 2)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-gray-400">
                <span>{progress.percent}%</span>
                <span>
                  {progress.total > 0
                    ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                    : formatBytes(progress.downloaded)}
                  {progress.speed ? ` · ${progress.speed}` : ''}
                </span>
              </div>
            </div>
          )}

          {phase === 'download-done' && (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="text-3xl">✅</div>
              <span className="text-gray-300 text-sm">下载完成</span>
              <span className="text-gray-500 text-xs">点击安装将自动重启应用</span>
              <button
                onClick={handleInstall}
                className="mt-1 px-6 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
              >
                立即安装并重启
              </button>
            </div>
          )}

          {phase === 'installing' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full" />
              <span className="text-gray-300 text-sm">正在安装更新，应用即将重启...</span>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="text-3xl">⚠️</div>
              <span className="text-red-400 text-sm">更新出错</span>
              {errorMsg && (
                <span className="text-gray-500 text-xs text-center max-w-full break-words">{errorMsg}</span>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={check}
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                >
                  重试
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
