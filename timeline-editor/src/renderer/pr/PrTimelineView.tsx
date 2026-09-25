import { useDeferredValue, useMemo, useState } from 'react'
import type { PtlAnchor } from '@shared/prTypes'
import { PR_SYNC_TYPE_LABELS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { useStore } from '../store'
import { askConfirm } from '../store/dialogStore'
import { formatPrTime, sortedAnchors, entriesOfAnchor, validatePtlDocument, countEntryNodes } from './prModel'
import { PrNodeTree } from './PrNodeTree'
import { PrImportLogsDialog } from './PrImportLogsDialog'
import { PrSimDialog } from './PrSimDialog'
import { useSimStore } from './sim/simStore'
import { runSimulation, summarizeSim } from './sim/simEngine'
import type { SimAnchorResult, SimEntryResult } from './sim/simEngine'

function anchorIcon(a: PtlAnchor): string {
  if (a.IsEndAnchor) return '🏁'
  if (a.IsPhaseAnchor) return '🚩'
  if (a.IsCommentAnchor) return '💬'
  if (a.IsTechnicalAnchor) return '🔧'
  return '⚓'
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
  const clipboard = usePrStore(s => s.clipboard)
  const copyEntry = usePrStore(s => s.copyEntry)
  const pasteEntry = usePrStore(s => s.pasteEntry)
  const spellLookup = useStore(s => s.spellLookup)

  const [filter, setFilter] = useState('')
  const [showIssues, setShowIssues] = useState(false)
  const [showImportLogs, setShowImportLogs] = useState(false)
  const [showSim, setShowSim] = useState(false)
  const [showSimLog, setShowSimLog] = useState(false)

  // ACT 模拟：事件流在 simStore，结果随文档编辑实时重算（同一份日志可反复模拟）
  const simEvents = useSimStore(s => s.events)
  const simLabel = useSimStore(s => s.label)
  const clearSim = useSimStore(s => s.clear)
  const deferredDoc = useDeferredValue(doc)
  const simResult = useMemo(
    () => (deferredDoc && simEvents ? runSimulation(deferredDoc, simEvents) : null),
    [deferredDoc, simEvents]
  )
  const simSummary = useMemo(() => (simResult ? summarizeSim(simResult) : null), [simResult])
  const simAnchorByGuid = useMemo(
    () => new Map((simResult?.anchors ?? []).map(a => [a.anchorGuid, a])),
    [simResult]
  )
  const simEntryByGuid = useMemo(
    () => new Map((simResult?.entries ?? []).map(e => [e.entryGuid, e])),
    [simResult]
  )
  const simLogText = useMemo(
    () => (simResult
      ? simResult.logs.map(l => `[${l.timeline == null ? '--:--.-' : formatPrTime(l.timeline)}] ${l.text}`).join('\n')
      : ''),
    [simResult]
  )

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
        <button
          onClick={() => setShowImportLogs(true)}
          className="px-2.5 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          title="从战斗日志文档导入玩家技能，按锚点同步规则分段对齐生成行为组"
        >
          📥 日志导入
        </button>
        <button
          onClick={() => setShowSim(true)}
          className="px-2.5 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          title="导入某场 ACT 日志战斗，按插件运行时语义回放事件流，检验锚点同步与行为组激活"
        >
          ▶ 模拟测试
        </button>
        <button
          onClick={() => select({ kind: 'meta' })}
          className="px-2.5 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          title="编辑时间轴名称 / 作者 / 区域 ID / 变量等"
        >
          ℹ 信息
        </button>
        <div className="flex-1" />
        {issues.length === 0 ? (
          <span className="px-2.5 py-1 text-xs rounded bg-green-900/40 text-green-400 select-none">✓ 校验通过</span>
        ) : (
          <button
            onClick={() => setShowIssues(v => !v)}
            className="px-2.5 py-1 text-xs rounded transition-colors bg-red-900/50 text-red-300 hover:bg-red-800/60"
            title="点击查看校验详情"
          >
            {`⚠ ${issues.length} 个问题`}
          </button>
        )}
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

      {/* 模拟摘要条：导入 ACT 战斗后常驻，编辑时间轴自动重新模拟 */}
      {simResult && simSummary && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-2 py-1 border-b border-gray-800 bg-gray-800/40 text-[11px] flex-shrink-0">
          <span className="text-amber-300 font-semibold">▶ 模拟</span>
          <span className="text-gray-500 truncate max-w-64" title={simLabel}>{simLabel}</span>
          {simResult.started ? (
            <>
              <span className="text-green-300">锚点 {simSummary.anchorMatched}/{simSummary.anchorSynced} 命中</span>
              {simSummary.anchorExpired > 0 && <span className="text-red-300">{simSummary.anchorExpired} 过期</span>}
              {simSummary.anchorPending > 0 && <span className="text-yellow-300">{simSummary.anchorPending} 未等到</span>}
              {simSummary.anchorUnsupported > 0 && <span className="text-gray-500">{simSummary.anchorUnsupported} 永不触发</span>}
              <span className="text-green-300">行为组 {simSummary.entryActivated}/{simSummary.entryEnabled} 激活</span>
              {simSummary.entryNotReached > 0 && <span className="text-yellow-300">{simSummary.entryNotReached} 未到达</span>}
              {simSummary.entrySegmentSkipped > 0 && <span className="text-red-300">{simSummary.entrySegmentSkipped} 段跳过</span>}
              {simSummary.entryOutOfRange + simSummary.entryInvalidBinding > 0 && (
                <span className="text-red-300">{simSummary.entryOutOfRange + simSummary.entryInvalidBinding} 越界/无效</span>
              )}
              <span className="text-gray-500">{simResult.stopped ? simResult.stopReason : '战斗结束时仍在运行'}</span>
            </>
          ) : (
            <span className="text-red-300">未能启动：{simResult.startDetail}</span>
          )}
          <div className="flex-1" />
          <span className="text-gray-600">编辑锚点后自动重新模拟</span>
          <button
            onClick={() => setShowSimLog(v => !v)}
            className="px-1.5 py-px rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            {showSimLog ? '隐藏日志' : '模拟日志'}
          </button>
          <button
            onClick={clearSim}
            className="px-1.5 py-px rounded text-gray-400 hover:text-red-300 hover:bg-gray-700 transition-colors"
            title="清除模拟结果，恢复纯编辑视图"
          >
            ✕ 清除
          </button>
        </div>
      )}
      {simResult && showSimLog && (
        <div className="max-h-44 overflow-auto border-b border-gray-800 bg-gray-950/60 flex-shrink-0">
          <pre className="p-2 text-[11px] leading-5 text-gray-300 whitespace-pre-wrap">{simLogText || '（无日志）'}</pre>
        </div>
      )}

      {/* Timeline rows — 点击空白处回到时间轴信息 */}
      <div className="flex-1 overflow-auto pb-8" onClick={() => select({ kind: 'meta' })}>
        {filteredAnchors.map(anchor => {
          const entries = entriesOfAnchor(doc, anchor.Guid)
          const isSelected = selection?.kind === 'anchor' && selection.guid === anchor.Guid
          const chip = syncChip(anchor)
          const simA = simAnchorByGuid.get(anchor.Guid)
          const canHostEntries = !anchor.IsEndAnchor && !anchor.IsCommentAnchor && !anchor.IsTechnicalAnchor
          return (
            <div key={anchor.Guid} className="border-b border-gray-800/60">
              {/* Anchor row */}
              <div
                onClick={(e) => { e.stopPropagation(); select({ kind: 'anchor', guid: anchor.Guid }) }}
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
                {simA && simA.status !== 'nosync' && <SimAnchorBadge a={simA} />}
                <div className="flex-1" />
                <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                  {canHostEntries && (
                    <button
                      onClick={(e) => { e.stopPropagation(); addEntry(anchor.Guid) }}
                      className="px-1.5 text-[11px] text-gray-400 hover:text-emerald-300" title="添加行为组"
                    >
                      ＋行为组
                    </button>
                  )}
                  {canHostEntries && clipboard?.kind === 'entry' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); pasteEntry(anchor.Guid) }}
                      className="px-1.5 text-[11px] text-sky-400 hover:text-sky-300"
                      title={`粘贴行为组「${clipboard.data.Name ?? '未命名'}」到该锚点（偏移自动收敛到本段内）`}
                    >
                      📋粘贴
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateAnchor(anchor.Guid) }}
                    className="px-1 text-[11px] text-gray-400 hover:text-gray-200" title="复制锚点"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      const n = entries.length
                      if (n > 0) {
                        const ok = await askConfirm({
                          title: '删除锚点',
                          message: `锚点「${anchor.Name || '未命名'}」下挂有 ${n} 个行为组，删除锚点会连带删除它们。`,
                          confirmLabel: '一并删除',
                          danger: true
                        })
                        if (!ok) return
                      }
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
                const simE = simEntryByGuid.get(entry.Guid)
                return (
                  <div key={entry.Guid}>
                    <div
                      onClick={(e) => { e.stopPropagation(); select({ kind: 'entry', guid: entry.Guid }) }}
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
                      <span className="text-[10px] text-gray-600 flex-shrink-0">{countEntryNodes(entry)} 节点</span>
                      {simE && <SimEntryBadge e={simE} />}
                      <div className="flex-1" />
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateEntry(entry.Guid) }}
                          className="px-1 text-[11px] text-gray-400 hover:text-gray-200" title="创建副本（同锚点）"
                        >
                          ⧉
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyEntry(entry.Guid) }}
                          className="px-1 text-[11px] text-gray-400 hover:text-sky-300" title="复制到剪贴板（可跨锚点粘贴，Ctrl+C / Ctrl+V）"
                        >
                          📋
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const n = countEntryNodes(entry)
                            if (n > 1) {
                              const ok = await askConfirm({
                                title: '删除行为组',
                                message: `行为组「${entry.Name || '未命名'}」包含 ${n} 个节点，删除后可通过 Ctrl+Z 撤销。`,
                                confirmLabel: '删除',
                                danger: true
                              })
                              if (!ok) return
                            }
                            deleteEntry(entry.Guid)
                          }}
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
      {showImportLogs && <PrImportLogsDialog onClose={() => setShowImportLogs(false)} />}
      {showSim && <PrSimDialog onClose={() => setShowSim(false)} />}
    </div>
  )
}

// ---------- 模拟结果行内徽章 ----------

const SIM_ANCHOR_BADGE: Record<string, { text: string; cls: string }> = {
  matched: { text: '命中', cls: 'bg-green-900/60 text-green-300' },
  expired: { text: '过期', cls: 'bg-red-900/60 text-red-300' },
  pending: { text: '未等到', cls: 'bg-yellow-900/60 text-yellow-300' },
  unsupported: { text: '永不触发', cls: 'bg-gray-700 text-gray-400' }
}

function SimAnchorBadge({ a }: { a: SimAnchorResult }) {
  const badge = SIM_ANCHOR_BADGE[a.status]
  if (!badge) return null
  const title = a.status === 'matched'
    ? a.forceJump
      ? 'ForceJump 触发（无事件命中）'
      : `Δ${a.delta !== undefined && a.delta >= 0 ? '+' : ''}${a.delta?.toFixed(2)}s · ${a.eventLabel ?? ''}`
    : `${a.detail ?? ''}${a.noActSource ? '；ACT 日志无此事件源' : ''}`
  return (
    <span className={`px-1.5 py-px rounded text-[10px] flex-shrink-0 ${badge.cls}`} title={title}>
      {a.forceJump ? '强跳' : badge.text}
      {a.status === 'matched' && !a.forceJump && a.delta !== undefined &&
        ` ${a.delta >= 0 ? '+' : ''}${a.delta.toFixed(1)}`}
    </span>
  )
}

const SIM_ENTRY_BADGE: Record<string, { text: string; cls: string; tip: string }> = {
  activated: { text: '激活', cls: 'bg-green-900/60 text-green-300', tip: '' },
  notReached: { text: '未到达', cls: 'bg-yellow-900/60 text-yellow-300', tip: '时钟被跳走/停止前未走到 Offset' },
  segmentSkipped: { text: '段跳过', cls: 'bg-red-900/60 text-red-300', tip: '时钟跳跃跨过整段，未补触发' },
  outOfRange: { text: '越界', cls: 'bg-red-900/60 text-red-300', tip: 'Offset 超出锚点区间，运行时跳过' },
  invalidBinding: { text: '绑定无效', cls: 'bg-red-900/60 text-red-300', tip: '绑定到注释/技术锚点，不参与分段' },
  disabled: { text: '禁用', cls: 'bg-gray-700 text-gray-500', tip: '行为组已禁用' }
}

function SimEntryBadge({ e }: { e: SimEntryResult }) {
  const badge = SIM_ENTRY_BADGE[e.status]
  if (!badge) return null
  const title = e.status === 'activated'
    ? `激活于时间轴 ${formatPrTime(e.activatedTimeline ?? 0)}`
    : badge.tip
  return (
    <span className={`px-1.5 py-px rounded text-[10px] flex-shrink-0 ${badge.cls}`} title={title}>
      {badge.text}
      {e.status === 'activated' && e.activatedTimeline !== undefined && ` ${formatPrTime(e.activatedTimeline)}`}
    </span>
  )
}
