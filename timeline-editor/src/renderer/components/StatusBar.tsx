import { useStore } from '../store'
import { usePrStore } from '../store/prStore'

function PrStatusBar() {
  const doc = usePrStore(s => s.doc)
  const filePath = usePrStore(s => s.filePath)
  const selection = usePrStore(s => s.selection)
  const isDirty = usePrStore(s => s.isDirty)
  const undoStackLen = usePrStore(s => s.undoStack.length)

  const selLabel = (() => {
    if (!selection) return null
    switch (selection.kind) {
      case 'meta': return 'Meta'
      case 'anchor': return `锚点 ${selection.guid.slice(0, 8)}`
      case 'entry': return `行为组 ${selection.guid.slice(0, 8)}`
      case 'node': return `节点 #${selection.nodeId}`
    }
  })()

  return (
    <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-3 gap-4 text-[11px] text-gray-400 flex-shrink-0 select-none">
      <span className="text-emerald-400 font-semibold">PR</span>
      <span>锚点: <span className="text-gray-200">{doc?.Anchors.length ?? 0}</span></span>
      <span>行为组: <span className="text-gray-200">{doc?.Entries.length ?? 0}</span></span>
      {selLabel && <span>选中: <span className="text-emerald-400">{selLabel}</span></span>}
      <div className="flex-1" />
      <span>Undo: <span className="text-gray-200">{undoStackLen}</span></span>
      <span className={isDirty ? 'text-yellow-400' : 'text-green-400'}>
        {isDirty ? '● Unsaved' : '✓ Saved'}
      </span>
      {filePath && (
        <span className="text-gray-500 truncate max-w-md" title={filePath}>
          {filePath}
        </span>
      )}
    </div>
  )
}

export function StatusBar() {
  const editorMode = usePrStore(s => s.editorMode)
  const doc = useStore(s => s.doc)
  const filePath = useStore(s => s.filePath)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const isDirty = useStore(s => s.isDirty)
  const undoStackLen = useStore(s => s.undoStack.length)

  const nodeCount = (() => {
    if (!doc) return 0
    let count = 0
    function walk(n: any) {
      count++
      if (n.Childs && Array.isArray(n.Childs)) {
        for (const c of n.Childs) walk(c)
      }
    }
    walk(doc.TreeRoot)
    return count
  })()

  if (editorMode === 'pr') return <PrStatusBar />

  return (
    <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-3 gap-4 text-[11px] text-gray-400 flex-shrink-0 select-none">
      <span>Nodes: <span className="text-gray-200">{nodeCount}</span></span>
      {selectedNodeId !== null && (
        <span>Selected: <span className="text-blue-400">#{selectedNodeId}</span></span>
      )}
      <div className="flex-1" />
      <span>Undo: <span className="text-gray-200">{undoStackLen}</span></span>
      <span className={isDirty ? 'text-yellow-400' : 'text-green-400'}>
        {isDirty ? '● Unsaved' : '✓ Saved'}
      </span>
      {filePath && (
        <span className="text-gray-500 truncate max-w-md" title={filePath}>
          {filePath}
        </span>
      )}
    </div>
  )
}
