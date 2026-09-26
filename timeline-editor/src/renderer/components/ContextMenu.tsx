import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, resolveAeClipboard } from '../store'
import { isComposite } from '@shared/types'
import { askConfirm } from '../store/dialogStore'

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
  { type: 'TreeCondNode', label: '条件 (Condition)', icon: '?' },
  { type: 'TreeActionNode', label: '动作 (Action)', icon: '⚡' },
  { type: 'TreeScriptNode', label: '脚本 (Script)', icon: '</>' },
  { type: 'TreeDelayNode', label: '延迟 (Delay)', icon: '⏱' },
  { type: 'TreeDebugNode', label: '调试 (Debug)', icon: '🐛' },
  { type: 'TreeClearWaitNode', label: '清除等待', icon: '✕' },
]

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

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

  return { menu, showMenu, hideMenu }
}

export function ContextMenu({ menu, hideMenu }: {
  menu: ContextMenuState
  hideMenu: () => void
}) {
  const addChild = useStore(s => s.addChild)
  const addSibling = useStore(s => s.addSibling)
  const deleteNode = useStore(s => s.deleteNode)
  const duplicateNode = useStore(s => s.duplicateNode)
  const copyNode = useStore(s => s.copyNode)
  const pasteNode = useStore(s => s.pasteNode)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const getNodeById = useStore(s => s.getNodeById)
  const clipboard = useStore(s => s.clipboard)

  const node = menu.nodeId !== null ? getNodeById(menu.nodeId) : null
  const isRoot = menu.nodeId === null || menu.nodeId === 0
  // Leaf nodes (condition/action/script/delay/…) cannot hold children
  const canHoldChildren = !node || isComposite(node)

  // 菜单每次打开时同步系统剪贴板（可能是在另一个实例里复制的节点），刷新「粘贴」可见性
  useEffect(() => { void resolveAeClipboard() }, [])

  // Sibling insertion is the common case on a leaf; default that submenu open there
  const [submenu, setSubmenu] = useState<'child' | 'sibling' | null>(
    canHoldChildren ? 'child' : 'sibling'
  )

  const handleAddChild = useCallback((type: string) => {
    addChild(menu.nodeId ?? 0, type)
    hideMenu()
  }, [menu.nodeId, addChild, hideMenu])

  const handleAddSibling = useCallback((type: string) => {
    if (menu.nodeId === null) return
    addSibling(menu.nodeId, type)
    hideMenu()
  }, [menu.nodeId, addSibling, hideMenu])

  const handleDelete = useCallback(async () => {
    if (menu.nodeId === null || menu.nodeId === 0) { hideMenu(); return }
    // 带子树的删除先确认；叶子节点可撤销，直接删
    const childCount = (node as any)?.Childs?.length ?? 0
    if (childCount > 0) {
      hideMenu()
      const ok = await askConfirm({
        title: '删除节点',
        message: `节点「${node?.DisplayName || menu.nodeId}」包含 ${childCount} 个子节点，将一并删除。`,
        confirmLabel: '一并删除',
        danger: true
      })
      if (!ok) return
      deleteNode(menu.nodeId)
      return
    }
    deleteNode(menu.nodeId)
    hideMenu()
  }, [menu.nodeId, node, deleteNode, hideMenu])

  const handleDuplicate = useCallback(() => {
    if (menu.nodeId !== null && menu.nodeId !== 0) duplicateNode(menu.nodeId)
    hideMenu()
  }, [menu.nodeId, duplicateNode, hideMenu])

  const handleCopy = useCallback(() => {
    if (menu.nodeId !== null && menu.nodeId !== 0) copyNode(menu.nodeId)
    hideMenu()
  }, [menu.nodeId, copyNode, hideMenu])

  const handlePaste = useCallback(() => {
    pasteNode(menu.nodeId)
    hideMenu()
  }, [menu.nodeId, pasteNode, hideMenu])

  const handleToggle = useCallback(() => {
    if (menu.nodeId !== null) toggleNodeEnabled(menu.nodeId)
    hideMenu()
  }, [menu.nodeId, toggleNodeEnabled, hideMenu])

  // Escape 关闭菜单；菜单内点击不冒泡到 window（否则会触发 hideMenu 把自己关掉）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hideMenu() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hideMenu])

  // Portal 到 body：菜单位于 zoom 容器内时，fixed 定位的 left/top 会被缩放，
  // 导致菜单偏离鼠标位置；脱离容器后按真实视口坐标渲染
  return createPortal(
    <div
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[210px] max-h-[80vh] overflow-y-auto"
      style={{ left: menu.x, top: menu.y }}
      onClick={e => e.stopPropagation()}
    >
      {node && (
        <div className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-700">
          {node.DisplayName || 'Node'} <span className="text-gray-600">#{node.Id}</span>
          {!canHoldChildren && <span className="text-gray-600 ml-1">· 叶子节点</span>}
        </div>
      )}

      {/* Add child — only for composite nodes */}
      {canHoldChildren && (
        <SubmenuHeader
          label="添加子节点"
          open={submenu === 'child'}
          onClick={() => setSubmenu(s => s === 'child' ? null : 'child')}
        />
      )}
      {canHoldChildren && submenu === 'child' && (
        <NodeTypeList onPick={handleAddChild} />
      )}

      {/* Add sibling — available on any non-root node, including leaves */}
      {!isRoot && (
        <SubmenuHeader
          label="添加同级节点"
          hint="插入到此节点之后"
          open={submenu === 'sibling'}
          onClick={() => setSubmenu(s => s === 'sibling' ? null : 'sibling')}
        />
      )}
      {!isRoot && submenu === 'sibling' && (
        <NodeTypeList onPick={handleAddSibling} />
      )}

      {clipboard && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={handlePaste}
            className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            📋 粘贴{!isRoot ? '为同级节点' : '到根节点下'}
          </button>
        </>
      )}

      {node && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={handleToggle}
            className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {node.Enable ? '🔴 禁用' : '🟢 启用'}
          </button>
          {!isRoot && (
            <>
              <button
                onClick={handleDuplicate}
                className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                ⧉ 复制为同级
              </button>
              <button
                onClick={handleCopy}
                className="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                📝 拷贝
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-1 text-sm text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
              >
                🗑 删除
              </button>
            </>
          )}
        </>
      )}
    </div>,
    document.body
  )
}

function SubmenuHeader({ label, hint, open, onClick }: {
  label: string; hint?: string; open: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1 text-sm flex items-center justify-between gap-2 transition-colors
        ${open ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
    >
      <span>
        {label}
        {hint && <span className="text-[10px] text-gray-500 ml-1.5">{hint}</span>}
      </span>
      <span className="text-gray-500">{open ? '▾' : '▸'}</span>
    </button>
  )
}

function NodeTypeList({ onPick }: { onPick: (type: string) => void }) {
  return (
    <div className="border-y border-gray-700/70 my-1 py-0.5 bg-gray-900/40">
      {ADD_NODE_TYPES.map(t => (
        <button
          key={t.type}
          onClick={() => onPick(t.type)}
          className="w-full text-left pl-6 pr-3 py-1 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
        >
          <span className="w-5 text-center">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}
