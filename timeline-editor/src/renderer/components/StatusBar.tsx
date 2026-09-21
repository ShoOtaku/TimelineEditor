import { useStore } from '../store'
import { usePrStore } from '../store/prStore'
import { useLogsStore } from '../logs/logsStore'
import { formatTimeMs } from '../logs/logsTypes'

function LogsStatusBar() {
  const doc = useLogsStore(s => s.doc)
  const filePath = useLogsStore(s => s.filePath)
  const selection = useLogsStore(s => s.selection)
  const isDirty = useLogsStore(s => s.isDirty)

  const skillUseCount = doc ? Object.values(doc.skillUses).reduce((n, list) => n + list.length, 0) : 0

  const selLabel = (() => {
    if (!selection || !doc) return null
    switch (selection.kind) {
      case 'event': {
        const ev = doc.events.find(e => e.id === selection.id)
        return ev ? `事件 ${formatTimeMs(ev.timeMs)}` : null
      }
      case 'gcd': {
        const g = doc.gcds.find(x => x.id === selection.id)
        return g ? `GCD ${g.skill} ${formatTimeMs(g.timeMs)}` : null
      }
      case 'skillUse': {
        const col = doc.columns.find(c => c.id === selection.columnId)
        const use = doc.skillUses[selection.columnId]?.find(u => u.id === selection.id)
        return col && use ? `${col.name} ${formatTimeMs(use.timeMs)}` : null
      }
      case 'column': {
        const col = doc.columns.find(c => c.id === selection.id)
        return col ? `技能列 ${col.name}` : null
      }
    }
  })()

  return (
    <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-3 gap-4 text-[11px] text-gray-400 flex-shrink-0 select-none">
      <span className="text-amber-400 font-semibold">LOGS</span>
      <span>事件: <span className="text-gray-200">{doc?.events.length ?? 0}</span></span>
      <span>技能列: <span className="text-gray-200">{doc?.columns.length ?? 0}</span></span>
      <span>使用: <span className="text-gray-200">{(doc?.gcds.length ?? 0) + skillUseCount}</span></span>
      {selLabel && <span>选中: <span className="text-amber-400">{selLabel}</span></span>}
      <div className="flex-1" />
      {doc && (
        <span className={isDirty ? 'text-yellow-400' : 'text-green-400'}>
          {isDirty ? '● 未保存' : '✓ 已保存'}
        </span>
      )}
      {filePath && (
        <span className="text-gray-500 truncate max-w-md" title={filePath}>
          {filePath}
        </span>
      )}
    </div>
  )
}

function PrStatusBar() {
  const doc = usePrStore(s => s.doc)
  const filePath = usePrStore(s => s.filePath)
  const selection = usePrStore(s => s.selection)
  const isDirty = usePrStore(s => s.isDirty)

  const selLabel = (() => {
    if (!selection) return null
    switch (selection.kind) {
      case 'meta': return '时间轴信息'
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
      {doc && (
        <span className={isDirty ? 'text-yellow-400' : 'text-green-400'}>
          {isDirty ? '● 未保存' : '✓ 已保存'}
        </span>
      )}
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
  if (editorMode === 'logs') return <LogsStatusBar />

  return (
    <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-3 gap-4 text-[11px] text-gray-400 flex-shrink-0 select-none">
      <span className="text-indigo-400 font-semibold">AE</span>
      <span>节点: <span className="text-gray-200">{nodeCount}</span></span>
      {doc?.Author ? <span>作者: <span className="text-gray-200">{doc.Author}</span></span> : null}
      {selectedNodeId !== null && (
        <span>选中: <span className="text-blue-400">#{selectedNodeId}</span></span>
      )}
      <div className="flex-1" />
      {doc && (
        <span className={isDirty ? 'text-yellow-400' : 'text-green-400'}>
          {isDirty ? '● 未保存' : '✓ 已保存'}
        </span>
      )}
      {filePath && (
        <span className="text-gray-500 truncate max-w-md" title={filePath}>
          {filePath}
        </span>
      )}
    </div>
  )
}
