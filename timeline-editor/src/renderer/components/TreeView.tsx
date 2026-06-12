import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store'
import type { TreeNode } from '@shared/types'
import { isComposite, getDisplayType } from '@shared/types'
import { useContextMenu, ContextMenu } from './ContextMenu'

// --- Icon and color helpers ---

function getNodeIcon(node: TreeNode): string {
  const t = node.$type
  if (t.includes('TreeSequence')) return '→'
  if (t.includes('TreeParallel')) return '⇉'
  if (t.includes('TreeSelect')) return '◇'
  if (t.includes('TreeLoop')) return '↻'
  if (t.includes('TreeCondNode')) return '?'
  if (t.includes('TreeActionNode')) return '⚡'
  if (t.includes('TreeScriptNode')) return '</>'
  if (t.includes('TreeDelayNode')) return '⏱'
  if (t.includes('TreeDebugNode')) return '🐛'
  if (t.includes('TreeClearWaitNode')) return '✕'
  if (t.includes('TreePrintDebugInfoNode')) return '📝'
  return '●'
}

function getNodeSummary(node: TreeNode): string {
  if ('Delay' in node && typeof (node as any).Delay === 'number') {
    return `⏱ ${(node as any).Delay.toFixed(2)}s`
  }
  if ('Script' in node && typeof (node as any).Script === 'string' && (node as any).Script) {
    return `</> ${(node as any).Remark || 'script'}`
  }
  if ('TriggerConds' in node && Array.isArray((node as any).TriggerConds)) {
    const conds = (node as any).TriggerConds
    const names = conds.map((c: any) => c.Remark || c.DisplayName?.split('/').pop() || 'cond').join(', ')
    return `? ${names}`.slice(0, 60)
  }
  if ('TriggerActions' in node && Array.isArray((node as any).TriggerActions)) {
    const actions = (node as any).TriggerActions
    const names = actions.map((a: any) => a.Remark || a.DisplayName?.split('/').pop() || 'action').join(', ')
    return `⚡ ${names}`.slice(0, 60)
  }
  if ('LoopCount' in node) return `↻ x${(node as any).LoopCount}`
  return ''
}

// --- TreeNodeRow ---

interface TreeNodeRowProps {
  node: TreeNode
  depth: number
  parentId: number | null
  showMenu: (x: number, y: number, nodeId: number | null) => void
  onDropNode: (dragId: number, targetId: number, position: 'before' | 'after' | 'inside') => void
}

function TreeNodeRow({ node, depth, parentId, showMenu, onDropNode }: TreeNodeRowProps) {
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const selectNode = useStore(s => s.selectNode)
  const selectScriptNode = useStore(s => s.selectScriptNode)
  const [collapsed, setCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState<'none' | 'top' | 'mid' | 'bot'>('none')
  const isSelected = selectedNodeId === node.Id
  const isComp = isComposite(node)
  const isEnabled = node.Enable !== false
  const kind = getDisplayType(node)
  const hasScript = node.$type.includes('TreeScriptNode')

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectNode(node.Id)
  }, [node.Id, selectNode])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isComp) {
      setCollapsed(c => !c)
    }
  }, [isComp])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    showMenu(e.clientX, e.clientY, node.Id)
  }, [node.Id, showMenu])

  const handleScriptClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasScript) {
      selectScriptNode(node.Id)
      document.dispatchEvent(new CustomEvent('editor:toggleScript'))
    }
  }, [node.Id, hasScript, selectScriptNode])

  const handleAddChild = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    showMenu(e.clientX, e.clientY, node.Id)
  }, [node.Id, showMenu])

  // ── Drag & Drop ──────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(node.Id))
    e.dataTransfer.effectAllowed = 'move'
    // Set a drag image offset so the cursor is on the node
    const target = e.currentTarget as HTMLElement
    e.dataTransfer.setDragImage(target, 20, 10)
  }, [node.Id])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const relY = e.clientY - rect.top
    const h = rect.height

    if (isComp && relY > h * 0.25 && relY < h * 0.75) {
      setDragOver('mid') // drop inside
    } else if (relY < h * 0.5) {
      setDragOver('top') // drop before
    } else {
      setDragOver('bot') // drop after
    }
  }, [isComp])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we actually left the element (not entering a child)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOver('none')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver('none')
    const dragId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!dragId || dragId === node.Id) return

    if (dragOver === 'mid' && isComp) {
      // Drop inside as child
      onDropNode(dragId, node.Id, 'inside')
    } else if (dragOver === 'top') {
      onDropNode(dragId, node.Id, 'before')
    } else {
      onDropNode(dragId, node.Id, 'after')
    }
  }, [dragOver, isComp, node.Id, onDropNode])

  const childCount = isComp ? (node as any).Childs?.length || 0 : 0
  const borderColor = `rgba(${Math.round(node.Color.X * 255)}, ${Math.round(node.Color.Y * 255)}, ${Math.round(node.Color.Z * 255)}, ${node.Color.W})`

  return (
    <>
      <div
        draggable
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex items-center gap-1 px-2 py-1 cursor-pointer select-none border-l-2 transition-colors text-[12px]
          ${isSelected ? 'bg-blue-900/50 border-blue-500' : 'border-transparent hover:bg-gray-800/60'}
          ${!isEnabled ? 'opacity-40' : ''}
          ${node.Important ? 'font-bold' : ''}
          ${dragOver === 'top' ? 'border-t-2 border-t-blue-400' : ''}
          ${dragOver === 'bot' ? 'border-b-2 border-b-blue-400' : ''}
          ${dragOver === 'mid' ? 'bg-blue-900/30 border-2 border-blue-400 rounded' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px`, borderLeftColor: isSelected ? undefined : borderColor }}
        title={`#${node.Id} ${kind}${node.Remark ? ' — ' + node.Remark : ''}`}
        data-node-id={node.Id}
      >
        {/* Expand/collapse arrow */}
        <span className="w-4 text-center flex-shrink-0 text-gray-500">
          {isComp ? (
            collapsed ? '▶' : '▼'
          ) : (
            <span className="text-[8px] text-gray-600">·</span>
          )}
        </span>

        {/* Icon */}
        <span className="w-4 text-center flex-shrink-0">{getNodeIcon(node)}</span>

        {/* DisplayName */}
        <span className="text-gray-200 truncate flex-1 min-w-0">
          {node.DisplayName || kind}
          {node.Remark && (
            <span className="text-[11px] text-yellow-400/80 ml-2">— {node.Remark}</span>
          )}
        </span>

        {/* Summary */}
        <span className="text-[10px] text-gray-500 truncate max-w-[180px]">
          {getNodeSummary(node)}
        </span>

        {/* Script badge */}
        {hasScript && (
          <button
            onClick={handleScriptClick}
            className="px-1.5 py-0.5 text-[9px] bg-purple-800/60 hover:bg-purple-700 text-purple-300 rounded flex-shrink-0"
          >
            {'</>'}
          </button>
        )}

        {/* Child count + add button */}
        <span className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          {isComp && (
            <button
              onClick={handleAddChild}
              className="text-[11px] text-gray-600 hover:text-blue-400 hover:bg-gray-700 rounded px-1 leading-none transition-colors"
              title="添加子节点"
            >
              +
            </button>
          )}
          {childCount > 0 && (
            <span className="text-[9px] text-gray-600">{childCount}</span>
          )}
        </span>
      </div>

      {/* Children */}
      {isComp && !collapsed && (node as any).Childs?.map((child: TreeNode) => (
        <TreeNodeRow
          key={child.Id}
          node={child}
          depth={depth + 1}
          parentId={node.Id}
          showMenu={showMenu}
          onDropNode={onDropNode}
        />
      ))}
    </>
  )
}

// --- TreeView ---

export function TreeView() {
  const doc = useStore(s => s.doc)
  const selectNode = useStore(s => s.selectNode)
  const moveNode = useStore(s => s.moveNode)
  const getNodeById = useStore(s => s.getNodeById)
  const getParentId = useStore(s => s.getParentId)
  const addChild = useStore(s => s.addChild)
  const { menu, showMenu, hideMenu } = useContextMenu()

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    showMenu(e.clientX, e.clientY, 0) // 0 = root
  }, [showMenu])

  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    // Only deselect when clicking the empty pane background
    if ((e.target as HTMLElement).closest('[data-node-id]')) return
    selectNode(null)
  }, [selectNode])

  // ── Drop on empty pane area → move to root ──────────
  const handlePaneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handlePaneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dragId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!dragId) return
    const node = getNodeById(dragId)
    if (!node) return
    // Move to root — find the root Childs array index
    // Append to end of root
    moveNode(dragId, 0, -1)
  }, [getNodeById, moveNode])

  // ── Drop handler passed to TreeNodeRow ──────────────
  const handleDropNode = useCallback((dragId: number, targetId: number, position: 'before' | 'after' | 'inside') => {
    const draggedNode = getNodeById(dragId)
    const targetNode = getNodeById(targetId)
    if (!draggedNode || !targetNode) return

    if (position === 'inside') {
      // Drop as child — append to target's children
      moveNode(dragId, targetId, -1)
    } else {
      // Drop before/after — insert at sibling position
      const tParentId = getParentId(targetId)
      if (tParentId === null) return

      // Get the parent's children to find the target index
      const parentNode = tParentId === 0
        ? { Childs: doc?.TreeRoot.Childs } as any
        : getNodeById(tParentId)
      if (!parentNode || !Array.isArray(parentNode.Childs)) return

      const targetIndex = parentNode.Childs.findIndex((c: TreeNode) => c.Id === targetId)
      if (targetIndex === -1) return

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      moveNode(dragId, tParentId, insertIndex)
    }
  }, [getNodeById, getParentId, moveNode, doc])

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <div className="text-4xl mb-2">📂</div>
          <div>打开时间轴文件以查看树结构</div>
        </div>
      </div>
    )
  }

  // Root pseudo-node: wraps all top-level children
  const rootNode: TreeNode = {
    $type: '__Root__',
    DisplayName: doc.Name || doc.TreeRoot.DisplayName || 'Root',
    Id: 0,
    Enable: true,
    Important: false,
    Color: { X: 1, Y: 1, Z: 1, W: 1 },
    Remark: '',
    Tag: '',
    Childs: doc.TreeRoot.Childs
  } as any

  return (
    <div
      className="h-full overflow-auto bg-gray-900 py-1"
      onClick={handlePaneClick}
      onContextMenu={handlePaneContextMenu}
      onDragOver={handlePaneDragOver}
      onDrop={handlePaneDrop}
    >
      <TreeNodeRow
        node={rootNode}
        depth={0}
        parentId={null}
        showMenu={showMenu}
        onDropNode={handleDropNode}
      />
      {menu && <ContextMenu menu={menu} hideMenu={hideMenu} />}
    </div>
  )
}
