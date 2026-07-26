import type { EditorMode } from '../store/prStore'

interface ToolbarProps {
  mode: EditorMode
  onToggleMode: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleScript: () => void
  showScript: boolean
  onToggleAcrViewer: () => void
  showAcrViewer: boolean
  onNewPr: () => void
  fileName: string | null
  isDirty: boolean
  updateAvailable?: boolean
  onCheckUpdate?: () => void
}

export function Toolbar({
  mode, onToggleMode, onOpen, onSave, onSaveAs, onToggleScript, showScript,
  onToggleAcrViewer, showAcrViewer, onNewPr, fileName, isDirty, updateAvailable, onCheckUpdate
}: ToolbarProps) {
  const isPr = mode === 'pr'

  const handleSelectAeDir = async () => {
    const result = await window.electronAPI.selectAeDirectory()
    if (!result.cancelled) {
      console.log('AE directory changed to:', result.directory)
    }
  }

  const handleSelectPrDir = async () => {
    const result = await window.electronAPI.selectPrDirectory()
    if (!result.cancelled) {
      console.log('PR directory changed to:', result.directory)
    }
  }

  return (
    <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-1 select-none flex-shrink-0">
      {/* Mode switch */}
      <button
        onClick={onToggleMode}
        className={`px-3 py-1 text-sm rounded font-semibold transition-colors ${
          isPr
            ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
            : 'bg-indigo-700 hover:bg-indigo-600 text-white'
        }`}
        title={isPr ? '当前：PromeRotation 时间轴，点击切换到 AE 时间轴' : '当前：AE 时间轴，点击切换到 PromeRotation 时间轴'}
      >
        {isPr ? '⏱ PR 时间轴' : '🌲 AE 时间轴'}
      </button>

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {/* File operations */}
      {isPr && (
        <button onClick={onNewPr} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="新建 PR 时间轴">
          ✚ 新建
        </button>
      )}
      <button onClick={onOpen} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="Open (Ctrl+O)">
        📂 Open
      </button>
      <button onClick={onSave} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="Save (Ctrl+S)">
        💾 Save
      </button>
      <button onClick={onSaveAs} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="Save As">
        📄 Save As
      </button>

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {/* Edit */}
      <button onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))}
        className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="Undo (Ctrl+Z)">
        ↩
      </button>
      <button onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))}
        className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors" title="Redo (Ctrl+Y)">
        ↪
      </button>

      {!isPr && (
        <>
          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* View (AE only) */}
          <button onClick={onToggleScript}
            className={`px-3 py-1 text-sm rounded transition-colors ${showScript ? 'bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Toggle Script Editor">
            {'</>'} Script
          </button>

          <button onClick={onToggleAcrViewer}
            className={`px-3 py-1 text-sm rounded transition-colors ${showAcrViewer ? 'bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            title="Toggle ACR Type Viewer">
            🔍 ACR
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* Check for Updates */}
      {onCheckUpdate && (
        <button
          onClick={onCheckUpdate}
          className={`px-2 py-1 text-sm rounded transition-colors relative ${
            updateAvailable
              ? 'bg-green-800 hover:bg-green-700 text-green-300'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
          }`}
          title="检查更新"
        >
          🔄 更新
          {updateAvailable && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border border-gray-800" />
          )}
        </button>
      )}

      {/* Directory settings */}
      {isPr ? (
        <button
          onClick={handleSelectPrDir}
          className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          title="选择 PromeRotation PureTimelines 目录"
        >
          ⚙ PR目录
        </button>
      ) : (
        <button
          onClick={handleSelectAeDir}
          className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          title="选择 AE 目录"
        >
          ⚙ 设置
        </button>
      )}

      {/* Title */}
      <span className="text-sm text-gray-400 truncate max-w-md">
        {fileName || 'Untitled'}
        {isDirty && <span className="text-yellow-400 ml-1">●</span>}
      </span>
    </div>
  )
}
