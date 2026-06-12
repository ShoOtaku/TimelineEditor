import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

interface ContextMenuState {
  x: number
  y: number
  nodeId: number | null
}

const ADD_NODE_TYPES = [
  { type: 'TreeSequence', label: '序列 (Sequence)', icon: '→' },
  { type: 'TreeParallel', label: '并行 (Parallel)', icon: '⇉' },
  { type: 'TreeSelect', label: '选择 (Select)', icon: '◇' },
  { type: 'TreeLoop', label: '循环 (Loop)', icon: '↻' },
  { type: 'TreeCondNode', label: '条件 (Condition)', icon: '🔍' },
  { type: 'TreeActionNode', label: '动作 (Action)', icon: '⚡' },
  { type: 'TreeScriptNode', label: '脚本 (Script)', icon: '</>' },
  { type: 'TreeDelayNode', label: '延迟 (Delay)', icon: '⏱' },
  { type: 'TreeDebugNode', label: '调试 (Debug)', icon: '🐛' },
  { type: 'TreeClearWaitNode', label: '清除等待', icon: '✕' },
]

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const showMenu = useCallback((x: number, y: number, nodeId: number | null) => {
    setMenu({ x, y, nodeId })
  }, [])

  const hideMenu = useCallback(() => {
    setMenu(null)
  }, [])

  useEffect(() => {
    const handler = () => hideMenu()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [hideMenu])

  // Prevent the menu click from bubbling to the window handler
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const handler = (e: MouseEvent) => e.stopPropagation()
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [menu])

  return { menu, showMenu, hideMenu, ref }
}

export function ContextMenu({ menu, hideMenu }: {
  menu: ContextMenuState
  hideMenu: () => void
}) {
  const addChild = useStore(s => s.addChild)
  const deleteNode = useStore(s => s.deleteNode)
  const duplicateNode = useStore(s => s.duplicateNode)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const getNodeById = useStore(s => s.getNodeById)

  const node = menu.nodeId !== null ? getNodeById(menu.nodeId) : null

  const handleAddChild = useCallback((type: string) => {
    const parentId = menu.nodeId ?? 0
    addChild(parentId, type)
    hideMenu()
  }, [menu.nodeId, addChild, hideMenu])

  const handleDelete = useCallback(() => {
    if (menu.nodeId !== null && menu.nodeId !== 0) {
      deleteNode(menu.nodeId)
    }
    hideMenu()
  }, [menu.nodeId, deleteNode, hideMenu])

  const handleDuplicate = useCallback(() => {
    if (menu.nodeId !== null && menu.nodeId !== 0) {
      duplicateNode(menu.nodeId)
    }
    hideMenu()
  }, [menu.nodeId, duplicateNode, hideMenu])

  const handleToggle = useCallback(() => {
    if (menu.nodeId !== null) {
      toggleNodeEnabled(menu.nodeId)
    }
    hideMenu()
  }, [menu.nodeId, toggleNodeEnabled, hideMenu])

  return (
    <div
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[200px] overflow-hidden"
      style={{ left: menu.x, top: menu.y }}
    >
      {/* Node info */}
      {node && (
        <div className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-700">
          {node.DisplayName || 'Node'} <span className="text-gray-600">#{node.Id}</span>
        </div>
      )}

      {/* Add child nodes */}
      <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Add Child Node</div>
      {ADD_NODE_TYPES.map(t => (
        <button
          key={t.type}
          onClick={() => handleAddChild(t.type)}
          className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
        >
          <span className="w-5 text-center">{t.icon}</span>
          {t.label}
        </button>
      ))}

      {node && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={handleToggle}
            className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {node.Enable ? '🔴 Disable' : '🟢 Enable'}
          </button>
          <button
            onClick={handleDuplicate}
            className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            disabled={menu.nodeId === 0}
          >
            📋 Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-1 text-sm text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
            disabled={menu.nodeId === 0}
          >
            🗑 Delete
          </button>
        </>
      )}
    </div>
  )
}
