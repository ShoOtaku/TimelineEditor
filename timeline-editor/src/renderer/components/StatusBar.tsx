import { useStore } from '../store'

export function StatusBar() {
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
