import { useMemo, useState } from 'react'
import type { PtlAnchor, PtlEntry } from '@shared/prTypes'
import { PR_SYNC_TYPE_LABELS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { useStore } from '../store'
import { formatPrTime, sortedAnchors, entriesOfAnchor, validatePtlDocument } from './prModel'
import { PrNodeTree } from './PrNodeTree'

function anchorIcon(a: PtlAnchor): string {
  if (a.IsEndAnchor) return '🏁'
  if (a.IsPhaseAnchor) return '🚩'
  if (a.IsCommentAnchor) return '💬'
  if (a.IsTechnicalAnchor) return '🔧'
  return '⚓'
}

function countNodes(entry: PtlEntry): number {
  let count = 0
  function walk(n: { Children?: { Id: number }[] | null }) {
    count++
    for (const c of (n.Children ?? []) as { Children?: never[] | null }[]) walk(c)
  }
  walk(entry.EntryGroup)
  return count
}

/** Center view: time-ordered anchors with their entries and expandable node trees */
export function PrTimelineView() {
  const doc = usePrStore(s => s.doc)
  const loadError = usePrStore(s => s.loadError)
  const selection = usePrStore(s => s.selection)
  const select = usePrStore(s => s.select)
  const expandedEntries = usePrStore(s => s.expandedEntries)
  const toggleExpanded = usePrStore(s => s.toggleExpanded)
  const addAnchor = usePrStore(s => s.addAnchor)
  const addEntry = usePrStore(s => s.addEntry)
  const deleteAnchor = usePrStore(s => s.deleteAnchor)
  const duplicateAnchor = usePrStore(s => s.duplicateAnchor)
  const deleteEntry = usePrStore(s => s.deleteEntry)
  const duplicateEntry = usePrStore(s => s.duplicateEntry)
  const spellLookup = useStore(s => s.spellLookup)

  const [filter, setFilter] = useState('')
  const [showIssues, setShowIssues] = useState(false)

  const anchors = useMemo(() => (doc ? sortedAnchors(doc) : []), [doc])
  const issues = useMemo(() => (doc ? validatePtlDocument(doc) : []), [doc])

  const filteredAnchors = useMemo(() => {
    if (!filter.trim()) return anchors
    const f = filter.trim().toLowerCase()
    return anchors.filter(a => {
      if ((a.Name ?? '').toLowerCase().includes(f)) return true
      if (a.Sync?.Params?.ActionId?.includes(f)) return true
      if (doc && entriesOfAnchor(doc, a.Guid).some(e => (e.Name ?? '').toLowerCase().includes(f))) return true
      return false
    })
  }, [anchors, filter, doc])

  const syncChip = (a: PtlAnchor): string | null => {
    if (!a.Sync || a.Sync.Type === 'None') return null
    const label = PR_SYNC_TYPE_LABELS[a.Sync.Type] ?? a.Sync.Type
    const actionId = a.Sync.Params?.ActionId
    if (actionId) {
      const name = spellLookup?.[actionId]?.n
      return `${label}·${name ?? actionId}`
    }
    return label
  }

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-900">
        <div className="text-center max-w-md p-6">
          <div className="text-4xl mb-3">⏱️</div>
          <div className="text-sm mb-1">PromeRotation 时间轴编辑器</div>
          <div className="text-xs text-gray-600 mb-3">
            从左侧选择 PureTimelines 目录中的时间轴文件，或使用工具栏「新建」创建
          </div>
          {loadError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded p-2">{loadError}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Header: search + issues + add */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-800 flex-shrink-0">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="搜索锚点 / 行为组 / 技能ID..."
          className="field-input !w-64"
        />
        <button
          onClick={() => addAnchor()}
          className="px-2.5 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
        >
          ＋ 锚点
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowIssues(v => !v)}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            issues.length === 0
              ? 'bg-green-900/40 text-green-400'
              : 'bg-red-900/50 text-red-300 hover:bg-red-800/60'
          }`}
          title="点击查看校验详情"
        >
          {issues.length === 0 ? '✓ 校验通过' : `⚠ ${issues.length} 个问题`}
        </button>
      </div>

      {/* Validation issues */}
      {showIssues && issues.length > 0 && (
        <div className="max-h-36 overflow-auto border-b border-gray-800 bg-red-950/20 flex-shrink-0">
          {issues.map((issue, i) => (
            <div
              key={i}
              onClick={() => {
                if (issue.anchorGuid) select({ kind: 'anchor', guid: issue.anchorGuid })
                else if (issue.entryGuid) select({ kind: 'entry', guid: issue.entryGuid })
              }}
              className="px-3 py-1 text-[11px] text-red-300 cursor-pointer hover:bg-red-900/30"
            >
              ⛔ {issue.message}
            </div>
          ))}
        </div>
      )}

      {/* Timeline rows */}
      <div className="flex-1 overflow-auto pb-8">
        {filteredAnchors.map(anchor => {
          const entries = entriesOfAnchor(doc, anchor.Guid)
          const isSelected = selection?.kind === 'anchor' && selection.guid === anchor.Guid
          const chip = syncChip(anchor)
          const canHostEntries = !anchor.IsEndAnchor && !anchor.IsCommentAnchor && !anchor.IsTechnicalAnchor
          return (
            <div key={anchor.Guid} className="border-b border-gray-800/60">
              {/* Anchor row */}
              <div
                onClick={() => select({ kind: 'anchor', guid: anchor.Guid })}
                className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors border-l-2
                  ${isSelected ? 'bg-emerald-900/40 border-emerald-500' : 'border-transparent hover:bg-gray-800'}`}
              >
                <span className={`font-mono text-[11px] w-14 text-right flex-shrink-0 ${
                  anchor.IsCommentAnchor || anchor.IsTechnicalAnchor ? 'text-gray-600' : 'text-amber-300/90'
                }`}>
                  {formatPrTime(anchor.Time)}
                </span>
                <span className="flex-shrink-0">{anchorIcon(anchor)}</span>
                <span className={`text-[13px] truncate ${
                  anchor.Enabled
                    ? anchor.IsCommentAnchor ? 'text-gray-500 italic' : 'text-gray-200'
                    : 'text-gray-600 line-through'
                }`}>
                  {anchor.Name || '(未命名锚点)'}
                </span>
                {chip && (
                  <span className="px-1.5 py-px rounded bg-sky-950/70 text-sky-300/90 text-[10px] flex-shrink-0 max-w-56 truncate">
                    {chip}
                  </span>
                )}
                {anchor.Sync?.JumpTargetTime != null && (
                  <span className="px-1.5 py-px rounded bg-purple-950/70 text-purple-300/90 text-[10px] flex-shrink-0"
                    title="同步命中后跳转到该时间">
                    ↪ {formatPrTime(anchor.Sync.JumpTargetTime)}
                  </span>
                )}
                <div className="flex-1" />
                <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                  {canHostEntries && (
                    <button
                      onClick={(e) => { e.stopPropagation(); addEntry(anchor.Guid) }}
                      className="px-1.5 text-[11px] text-gray-400 hover:text-emerald-300" title="添加行为组"
                    >
                      ＋行为组
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateAnchor(anchor.Guid) }}
                    className="px-1 text-[11px] text-gray-400 hover:text-gray-200" title="复制锚点"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const n = entries.length
                      if (n > 0 && !window.confirm(`删除锚点将同时删除其 ${n} 个行为组，确定？`)) return
                      deleteAnchor(anchor.Guid)
                    }}
                    className="px-1 text-[11px] text-red-500/70 hover:text-red-400" title="删除锚点"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Entry rows */}
              {entries.map(entry => {
                const entrySelected = selection?.kind === 'entry' && selection.guid === entry.Guid
                const expanded = !!expandedEntries[entry.Guid]
                return (
                  <div key={entry.Guid}>
                    <div
                      onClick={() => select({ kind: 'entry', guid: entry.Guid })}
                      className={`group flex items-center gap-1.5 pl-7 pr-2 py-1 cursor-pointer text-[12px] transition-colors border-l-2
                        ${entrySelected ? 'bg-emerald-900/40 border-emerald-500' : 'border-transparent hover:bg-gray-800/70'}`}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.Guid) }}
                        className="w-4 text-gray-500 hover:text-gray-300 flex-shrink-0"
                        title={expanded ? '收起节点树' : '展开节点树'}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                      <span className="font-mono text-[10px] text-emerald-400/80 flex-shrink-0">
                        +{entry.Offset}s
                      </span>
                      <span className={`truncate ${entry.Enabled ? 'text-gray-300' : 'text-gray-600 line-through'}`}>
                        {entry.Name || '(未命名行为组)'}
                      </span>
                      <span className="text-[10px] text-gray-600 flex-shrink-0">{countNodes(entry)} 节点</span>
                      <div className="flex-1" />
                      <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateEntry(entry.Guid) }}
                          className="px-1 text-[11px] text-gray-400 hover:text-gray-200" title="复制行为组"
                        >
                          ⧉
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteEntry(entry.Guid) }}
                          className="px-1 text-[11px] text-red-500/70 hover:text-red-400" title="删除行为组"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    {expanded && <PrNodeTree entryGuid={entry.Guid} root={entry.EntryGroup} />}
                  </div>
                )
              })}
            </div>
          )
        })}
        {filteredAnchors.length === 0 && (
          <div className="p-4 text-sm text-gray-500 italic">没有匹配的锚点</div>
        )}
      </div>
    </div>
  )
}
