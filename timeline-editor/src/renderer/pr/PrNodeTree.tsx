import { useState, useCallback, useEffect } from 'react'
import type { PtlNode } from '@shared/prTypes'
import {
  PR_NODE_TYPES, PR_NODE_TYPE_LABELS, PR_NODE_TYPE_ICONS,
  PR_ACTION_TYPE_LABELS, PR_CONDITION_TYPE_LABELS
} from '@shared/prTypes'
import { isCompositeNode } from './prModel'
import { usePrStore } from '../store/prStore'

function nodeSummary(node: PtlNode): string {
  switch (node.Type) {
    case 'serial':
    case 'parallel':
    case 'branch':
      return `${node.Children?.length ?? 0} 子节点`
    case 'delay':
      return `${node.DelayMs ?? 0} ms`
    case 'condition': {
      const conds = node.Conditions ?? (node.Condition ? [node.Condition] : [])
      const names = conds.map(c => PR_CONDITION_TYPE_LABELS[c.Type ?? ''] ?? c.Type ?? '?').join(', ')
      return `${node.Mode === 'wait' ? '等待 ' : ''}${names || '无条件'}`
    }
    case 'action': {
      const acts = node.Actions ?? (node.Action ? [node.Action] : [])
      if (acts.length === 0) return '无动作'
      const names = acts.slice(0, 3).map(a => PR_ACTION_TYPE_LABELS[a.Type ?? ''] ?? a.Type ?? '?').join(', ')
      return acts.length > 3 ? `${names} 等 ${acts.length} 个` : names
    }
    default:
      return node.Type
  }
}

interface AddMenuState {
  parentNodeId: number
  x: number
  y: number
}

/** Recursive node tree rows rendered under an expanded entry */
export function PrNodeTree({ entryGuid, root }: { entryGuid: string; root: PtlNode }) {
  const selection = usePrStore(s => s.selection)
  const select = usePrStore(s => s.select)
  const addEntryNode = usePrStore(s => s.addEntryNode)
  const deleteEntryNode = usePrStore(s => s.deleteEntryNode)
  const moveEntryNode = usePrStore(s => s.moveEntryNode)
  const duplicateEntryNode = usePrStore(s => s.duplicateEntryNode)
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)

  useEffect(() => {
    if (!addMenu) return
    const close = () => setAddMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [addMenu])

  const handleAddClick = useCallback((e: React.MouseEvent, parentNodeId: number) => {
    e.stopPropagation()
    setAddMenu({ parentNodeId, x: e.clientX, y: e.clientY })
  }, [])

  const renderNode = (node: PtlNode, depth: number, siblings: PtlNode[], index: number): React.ReactNode => {
    const isSelected = selection?.kind === 'node' && selection.entryGuid === entryGuid && selection.nodeId === node.Id
    const composite = isCompositeNode(node)
    const isRoot = node.Id === root.Id
    return (
      <div key={node.Id}>
        <div
          onClick={(e) => { e.stopPropagation(); select({ kind: 'node', entryGuid, nodeId: node.Id }) }}
          className={`group flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer text-[12px] transition-colors border-l-2
            ${isSelected
              ? 'bg-emerald-900/40 border-emerald-500'
              : 'border-transparent hover:bg-gray-700/60'}`}
          style={{ paddingLeft: 44 + depth * 16 }}
        >
          <span className="opacity-80">{PR_NODE_TYPE_ICONS[node.Type] ?? '·'}</span>
          <span className={`${node.Enabled ? 'text-gray-300' : 'text-gray-600 line-through'}`}>
            {node.Name || PR_NODE_TYPE_LABELS[node.Type] || node.Type}
          </span>
          <span className="text-[10px] text-gray-500 truncate flex-1">{nodeSummary(node)}</span>
          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
            {composite && (
              <button onClick={(e) => handleAddClick(e, node.Id)} title="添加子节点"
                className="px-1 text-[11px] text-gray-400 hover:text-emerald-300">＋</button>
            )}
            {!isRoot && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); moveEntryNode(entryGuid, node.Id, -1) }}
                  disabled={index === 0}
                  title="上移" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-200 disabled:opacity-30">↑</button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveEntryNode(entryGuid, node.Id, 1) }}
                  disabled={index === siblings.length - 1}
                  title="下移" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-200 disabled:opacity-30">↓</button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateEntryNode(entryGuid, node.Id) }}
                  title="复制" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-200">⧉</button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteEntryNode(entryGuid, node.Id) }}
                  title="删除" className="px-0.5 text-[11px] text-red-500/70 hover:text-red-400">🗑</button>
              </>
            )}
          </div>
        </div>
        {(node.Children ?? []).map((child, i) => renderNode(child, depth + 1, node.Children!, i))}
      </div>
    )
  }

  return (
    <>
      {renderNode(root, 0, [root], 0)}
      {addMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 text-sm"
          style={{ left: addMenu.x, top: addMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {PR_NODE_TYPES.map(t => (
            <div
              key={t}
              onClick={() => { addEntryNode(entryGuid, addMenu.parentNodeId, t); setAddMenu(null) }}
              className="px-3 py-1 cursor-pointer text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
            >
              <span>{PR_NODE_TYPE_ICONS[t]}</span>
              <span>{PR_NODE_TYPE_LABELS[t]}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
