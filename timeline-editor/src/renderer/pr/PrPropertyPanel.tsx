import type { PtlMeta } from '@shared/prTypes'
import { PR_JOBS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { findNode } from './prModel'
import { PrField } from './prFields'
import { PrAnchorEditor } from './PrAnchorEditor'
import { PrEntryEditor } from './PrEntryEditor'
import { PrNodeEditor } from './PrNodeEditor'

function MetaEditor() {
  const doc = usePrStore(s => s.doc)!
  const updateMeta = usePrStore(s => s.updateMeta)
  const meta = doc.Meta
  const set = (changes: Partial<PtlMeta>) => updateMeta(changes)
  const jobKnown = PR_JOBS.some(j => j.id === meta.JobId)

  return (
    <div className="space-y-3">
      <PrField label="时间轴名称">
        <input type="text" value={meta.Name ?? ''} onChange={e => set({ Name: e.target.value })} className="field-input" />
      </PrField>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="职业">
          <select
            value={jobKnown ? meta.JobId : -1}
            onChange={e => set({ JobId: parseInt(e.target.value) })}
            className="field-input"
          >
            {!jobKnown && <option value={-1}>未知 ({meta.JobId})</option>}
            {PR_JOBS.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </PrField>
        <PrField label="地图 ID (TerritoryId)" hint="0 = 不限">
          <input
            type="number" step={1} value={meta.TerritoryId}
            onChange={e => set({ TerritoryId: parseInt(e.target.value) || 0 })}
            className="field-input"
          />
        </PrField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="作者">
          <input type="text" value={meta.Author ?? ''} onChange={e => set({ Author: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="ACR 作者">
          <input type="text" value={meta.AcrAuthor ?? ''} onChange={e => set({ AcrAuthor: e.target.value || null })} className="field-input" />
        </PrField>
      </div>
      <PrField label="起手 (Opener)" hint="可选">
        <input type="text" value={meta.Opener ?? ''} onChange={e => set({ Opener: e.target.value || null })} className="field-input" />
      </PrField>
      <PrField label="备注">
        <textarea value={meta.Remark ?? ''} onChange={e => set({ Remark: e.target.value || null })} className="field-input" rows={3} />
      </PrField>
      <div className="text-[10px] text-gray-600 pt-2 border-t border-gray-700 space-y-0.5">
        <div>锚点：{doc.Anchors.length} · 行为组：{doc.Entries.length} · 变量：{doc.Variables?.length ?? 0}</div>
        {meta.CreatedAt && <div>创建于：{meta.CreatedAt}</div>}
      </div>
    </div>
  )
}

/** Right-side panel for the PromeRotation editor */
export function PrPropertyPanel() {
  const doc = usePrStore(s => s.doc)
  const selection = usePrStore(s => s.selection)
  const select = usePrStore(s => s.select)

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center bg-gray-800">
        <div>
          <div className="text-4xl mb-2">⏱️</div>
          <div>未打开 PR 时间轴</div>
        </div>
      </div>
    )
  }

  let title = '时间轴信息'
  let subtitle = 'Meta'
  let body: React.ReactNode = <MetaEditor />

  if (selection?.kind === 'anchor') {
    const anchor = doc.Anchors.find(a => a.Guid === selection.guid)
    if (anchor) {
      title = anchor.Name || '(未命名锚点)'
      subtitle = `锚点 · ${anchor.Guid.slice(0, 8)}`
      body = <PrAnchorEditor anchor={anchor} />
    }
  } else if (selection?.kind === 'entry') {
    const entry = doc.Entries.find(e => e.Guid === selection.guid)
    if (entry) {
      title = entry.Name || '(未命名行为组)'
      subtitle = `行为组 · ${entry.Guid.slice(0, 8)}`
      body = <PrEntryEditor entry={entry} />
    }
  } else if (selection?.kind === 'node') {
    const entry = doc.Entries.find(e => e.Guid === selection.entryGuid)
    const node = entry ? findNode(entry.EntryGroup, selection.nodeId) : null
    if (entry && node) {
      title = node.Name || '(未命名节点)'
      subtitle = `${entry.Name ?? '行为组'} › 节点 #${node.Id}`
      body = <PrNodeEditor entryGuid={entry.Guid} node={node} />
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-200 truncate">{title}</div>
          <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>
        </div>
        {selection && selection.kind !== 'meta' && (
          <button
            onClick={() => select({ kind: 'meta' })}
            className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex-shrink-0"
            title="查看时间轴信息"
          >
            ℹ 信息
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {body}
      </div>
    </div>
  )
}
