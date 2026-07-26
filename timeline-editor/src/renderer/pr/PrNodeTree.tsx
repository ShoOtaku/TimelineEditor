import { useState, useCallback, useEffect, useMemo } from 'react'
import type { PtlNode } from '@shared/prTypes'
import {
  PR_NODE_TYPES, PR_NODE_TEMPLATE_LABELS, PR_NODE_TYPE_ICONS, PR_NODE_TYPE_COLORS,
  PR_COND_NODE_MODE_LABELS
} from '@shared/prTypes'
import { conditionLabel, actionLabel } from '@shared/prSpecs'
import { isCompositeNode } from './prModel'
import { usePrStore } from '../store/prStore'

export function nodeSummary(node: PtlNode): string {
  switch (node.Type) {
    case 'serial':
    case 'parallel':
      return `${node.Children?.length ?? 0} 子节点`
    case 'branch': {
      const conds = node.Conditions ?? (node.Condition ? [node.Condition] : [])
      const logic = node.UseAndLogic === false ? 'OR' : 'AND'
      return `${conds.length} 条件 (${logic}) · 真/假分支`
    }
    case 'delay':
      return `${node.DelayMs ?? 0} ms`
    case 'csharprunningaction':
      return `C# 持续 ${node.Duration ?? 0}s`
    case 'condition': {
      const conds = node.Conditions ?? (node.Condition ? [node.Condition] : [])
      const mode = PR_COND_NODE_MODE_LABELS[(node.Mode ?? 'wait').toLowerCase()] ?? node.Mode ?? ''
      const names = conds.map(c => conditionLabel(c.Type)).join(', ')
      return `${mode}${names ? ' · ' + names : ' · 无条件'}`
    }
    case 'action': {
      const acts = node.Actions ?? (node.Action ? [node.Action] : [])
      if (acts.length === 0) return '无动作'
      const names = acts.slice(0, 3).map(a => actionLabel(a.Type)).join(', ')
      return acts.length > 3 ? `${names} 等 ${acts.length} 个` : names
    }
    default:
      return node.Type
  }
}

interface MenuState {
  x: number
  y: number
  nodeId: number
  isRoot: boolean
  composite: boolean
  canUp: boolean
  canDown: boolean
}

/** Node tree rendered under an expanded entry */
export function PrNodeTree({ entryGuid, root }: { entryGuid: string; root: PtlNode }) {
  const selection = usePrStore(s => s.selection)
  const select = usePrStore(s => s.select)
  const collapsedNodes = usePrStore(s => s.collapsedNodes)
  const toggleNodeCollapsed = usePrStore(s => s.toggleNodeCollapsed)
  const addEntryNode = usePrStore(s => s.addEntryNode)
  const addSiblingNode = usePrStore(s => s.addSiblingNode)
  const deleteEntryNode = usePrStore(s => s.deleteEntryNode)
  const moveEntryNode = usePrStore(s => s.moveEntryNode)
  const duplicateEntryNode = usePrStore(s => s.duplicateEntryNode)
  const updateEntryNode = usePrStore(s => s.updateEntryNode)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [submenu, setSubmenu] = useState<'child' | 'sibling' | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => { setMenu(null); setSubmenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onEsc)
    }
  }, [menu])

  const openMenu = useCallback((e: React.MouseEvent, node: PtlNode, siblings: PtlNode[], index: number) => {
    e.preventDefault()
    e.stopPropagation()
    select({ kind: 'node', entryGuid, nodeId: node.Id })
    setSubmenu(null)
    setMenu({
      x: e.clientX, y: e.clientY, nodeId: node.Id,
      isRoot: node.Id === root.Id,
      composite: isCompositeNode(node),
      canUp: index > 0,
      canDown: index < siblings.length - 1
    })
  }, [entryGuid, root.Id, select])

  const menuNode = useMemo(() => menu, [menu])

  const renderNode = (node: PtlNode, depth: number, siblings: PtlNode[], index: number): React.ReactNode => {
    const isSelected = selection?.kind === 'node' && selection.entryGuid === entryGuid && selection.nodeId === node.Id
    const composite = isCompositeNode(node)
    const isRoot = node.Id === root.Id
    const hasChildren = (node.Children?.length ?? 0) > 0
    const collapseKey = `${entryGuid}:${node.Id}`
    const collapsed = !!collapsedNodes[collapseKey]

    return (
      <div key={node.Id}>
        <div
          onClick={(e) => { e.stopPropagation(); select({ kind: 'node', entryGuid, nodeId: node.Id }) }}
          onContextMenu={(e) => openMenu(e, node, siblings, index)}
          className={`group flex items-center gap-1 py-[3px] pr-2 cursor-pointer text-[12px] transition-colors border-l-2
            ${isSelected ? 'bg-emerald-900/40 border-emerald-500' : 'border-transparent hover:bg-gray-700/50'}`}
          style={{ paddingLeft: 30 + depth * 14 }}
          title="右键打开节点操作菜单"
        >
          <button
            onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleNodeCollapsed(collapseKey) }}
            className={`w-3 flex-shrink-0 text-[10px] ${hasChildren ? 'text-gray-500 hover:text-gray-200' : 'text-transparent cursor-default'}`}
          >
            {hasChildren ? (collapsed ? '▸' : '▾') : '·'}
          </button>
          <span className="flex-shrink-0">{PR_NODE_TYPE_ICONS[node.Type] ?? '·'}</span>
          <span className={`flex-shrink-0 ${node.Enabled ? (PR_NODE_TYPE_COLORS[node.Type] ?? 'text-gray-300') : 'text-gray-600 line-through'}`}>
            {node.Name || PR_NODE_TEMPLATE_LABELS[node.Type] || node.Type}
          </span>
          <span className="text-[10px] text-gray-500 truncate flex-1">{nodeSummary(node)}</span>

          {/* Always-visible actions (dimmed until hover/selection) */}
          <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity
            ${isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}>
            {composite && (
              <button
                onClick={(e) => { e.stopPropagation(); openMenu(e, node, siblings, index); setSubmenu('child') }}
                title="添加子节点"
                className="px-1 text-[12px] text-gray-400 hover:text-emerald-300"
              >
                ＋
              </button>
            )}
            {!isRoot && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); moveEntryNode(entryGuid, node.Id, -1) }}
                  disabled={index === 0}
                  title="上移" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-100 disabled:opacity-25">↑</button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveEntryNode(entryGuid, node.Id, 1) }}
                  disabled={index === siblings.length - 1}
                  title="下移" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-100 disabled:opacity-25">↓</button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateEntryNode(entryGuid, node.Id) }}
                  title="复制" className="px-0.5 text-[11px] text-gray-400 hover:text-gray-100">⧉</button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteEntryNode(entryGuid, node.Id) }}
                  title="删除" className="px-0.5 text-[11px] text-red-500/70 hover:text-red-400">🗑</button>
              </>
            )}
          </div>
        </div>
        {!collapsed && (node.Children ?? []).map((child, i) => renderNode(child, depth + 1, node.Children!, i))}
      </div>
    )
  }

  return (
    <>
      {renderNode(root, 0, [root], 0)}

      {menuNode && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 text-[12px] min-w-40"
          style={{ left: menuNode.x, top: menuNode.y }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
        >
          {menuNode.composite && (
            <MenuItem
              label="添加子节点"
              suffix="▸"
              active={submenu === 'child'}
              onClick={() => setSubmenu(submenu === 'child' ? null : 'child')}
            />
          )}
          {!menuNode.isRoot && (
            <MenuItem
              label="添加同级节点"
              suffix="▸"
              active={submenu === 'sibling'}
              onClick={() => setSubmenu(submenu === 'sibling' ? null : 'sibling')}
            />
          )}

          {submenu && (
            <div className="border-y border-gray-700 my-1 py-1 bg-gray-850">
              {PR_NODE_TYPES.map(t => (
                <div
                  key={t}
                  onClick={() => {
                    if (submenu === 'child') addEntryNode(entryGuid, menuNode.nodeId, t)
                    else addSiblingNode(entryGuid, menuNode.nodeId, t)
                    setMenu(null); setSubmenu(null)
                  }}
                  className="pl-6 pr-3 py-1 cursor-pointer text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                >
                  <span>{PR_NODE_TYPE_ICONS[t]}</span>
                  <span>{PR_NODE_TEMPLATE_LABELS[t]}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-700 my-1" />
          <MenuItem
            label="切换启用/禁用"
            onClick={() => {
              const cur = usePrStore.getState()
              const entry = cur.doc?.Entries.find(e => e.Guid === entryGuid)
              if (entry) {
                let target: PtlNode | null = null
                const walk = (n: PtlNode) => { if (n.Id === menuNode.nodeId) target = n; (n.Children ?? []).forEach(walk) }
                walk(entry.EntryGroup)
                if (target) updateEntryNode(entryGuid, menuNode.nodeId, { Enabled: !(target as PtlNode).Enabled })
              }
              setMenu(null)
            }}
          />
          {!menuNode.isRoot && (
            <>
              <MenuItem label="复制节点" onClick={() => { duplicateEntryNode(entryGuid, menuNode.nodeId); setMenu(null) }} />
              <MenuItem label="上移" disabled={!menuNode.canUp} onClick={() => { moveEntryNode(entryGuid, menuNode.nodeId, -1); setMenu(null) }} />
              <MenuItem label="下移" disabled={!menuNode.canDown} onClick={() => { moveEntryNode(entryGuid, menuNode.nodeId, 1); setMenu(null) }} />
              <div className="border-t border-gray-700 my-1" />
              <MenuItem label="删除节点" danger onClick={() => { deleteEntryNode(entryGuid, menuNode.nodeId); setMenu(null) }} />
            </>
          )}
        </div>
      )}
    </>
  )
}

function MenuItem({ label, onClick, disabled, danger, suffix, active }: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  suffix?: string
  active?: boolean
}) {
  return (
    <div
      onClick={() => { if (!disabled) onClick() }}
      className={`px-3 py-1 flex items-center justify-between gap-3
        ${disabled
          ? 'text-gray-600 cursor-default'
          : danger
            ? 'text-red-400 hover:bg-red-900/40 cursor-pointer'
            : `text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer ${active ? 'bg-gray-700' : ''}`}`}
    >
      <span>{label}</span>
      {suffix && <span className="text-gray-500">{suffix}</span>}
    </div>
  )
}
