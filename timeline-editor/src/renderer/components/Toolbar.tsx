interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleScript: () => void
  showScript: boolean
  onToggleAcrViewer: () => void
  showAcrViewer: boolean
  fileName: string | null
  isDirty: boolean
}

export function Toolbar({ onOpen, onSave, onSaveAs, onToggleScript, showScript, onToggleAcrViewer, showAcrViewer, fileName, isDirty }: ToolbarProps) {
  const handleSelectAeDir = async () => {
    const result = await window.electronAPI.selectAeDirectory()
    if (!result.cancelled) {
      console.log('AE directory changed to:', result.directory)
    }
  }

  return (
    <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-1 select-none flex-shrink-0">
      {/* File operations */}
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

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {/* View */}
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

      <div className="flex-1" />

      {/* Select AE Directory */}
      <button
        onClick={handleSelectAeDir}
        className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
        title="选择 AE 目录"
      >
        ⚙ 设置
      </button>

      {/* Title */}
      <span className="text-sm text-gray-400 truncate max-w-md">
        {fileName || 'Untitled'}
        {isDirty && <span className="text-yellow-400 ml-1">●</span>}
      </span>
    </div>
  )
}
