import { useMemo, useState } from 'react'
import type { PtlEntry } from '@shared/prTypes'
import { PR_NODE_TYPES, PR_NODE_TEMPLATE_LABELS, PR_NODE_TYPE_ICONS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { formatPrTime, functionalAnchors, segmentDuration, walkNodes } from './prModel'
import { PrField, PrCheckbox, PrNumberInput } from './prFields'
import { nodeSummary } from './PrNodeTree'

/** Entry (行为组) properties + direct access to its node tree */
export function PrEntryEditor({ entry }: { entry: PtlEntry }) {
  const doc = usePrStore(s => s.doc)
  const updateEntry = usePrStore(s => s.updateEntry)
  const addEntryNode = usePrStore(s => s.addEntryNode)
  const select = usePrStore(s => s.select)
  const [picker, setPicker] = useState(false)

  const set = (changes: Partial<PtlEntry>) => updateEntry(entry.Guid, changes)

  const anchorOptions = useMemo(() => {
    if (!doc) return []
    const fn = functionalAnchors(doc)
    // Entries cannot bind to the end anchor or to the last functional anchor
    return fn.slice(0, -1).filter(a => !a.IsEndAnchor)
  }, [doc])

  const nodeCount = useMemo(() => {
    let n = 0
    walkNodes(entry.EntryGroup, () => { n++ })
    return n
  }, [entry.EntryGroup])

  const segLen = doc ? segmentDuration(doc, entry.StartAnchorGuid) : null
  const anchor = doc?.Anchors.find(a => a.Guid === entry.StartAnchorGuid)
  const offsetInvalid = segLen !== null && (entry.Offset < 0 || entry.Offset >= segLen)
  const root = entry.EntryGroup

  return (
    <div className="space-y-3">
      <PrField label="行为组名称">
        <input type="text" value={entry.Name ?? ''} onChange={e => set({ Name: e.target.value })} className="field-input" />
      </PrField>

      <PrField label="绑定锚点">
        <select
          value={entry.StartAnchorGuid}
          onChange={e => set({ StartAnchorGuid: e.target.value })}
          className="field-input"
        >
          {!anchorOptions.some(a => a.Guid === entry.StartAnchorGuid) && (
            <option value={entry.StartAnchorGuid}>⚠ 无效锚点 ({entry.StartAnchorGuid.slice(0, 8)}…)</option>
          )}
          {anchorOptions.map(a => (
            <option key={a.Guid} value={a.Guid}>
              {formatPrTime(a.Time)} · {a.Name || '(未命名)'}
            </option>
          ))}
        </select>
      </PrField>

      <PrField
        label="偏移 (秒)"
        hint={segLen !== null
          ? `范围 [0, ${segLen.toFixed(1)})，触发于 ${anchor ? formatPrTime(anchor.Time + entry.Offset) : ''}`
          : undefined}
      >
        <PrNumberInput
          value={entry.Offset}
          onChange={v => set({ Offset: v ?? 0 })}
          className={`field-input ${offsetInvalid ? '!border-red-600' : ''}`}
        />
        {offsetInvalid && <div className="text-[10px] text-red-400 mt-0.5">偏移超出锚点区间，运行时将报错</div>}
      </PrField>

      <PrCheckbox label="启用" checked={entry.Enabled} onChange={v => set({ Enabled: v })} />

      <PrField label="备注">
        <input type="text" value={entry.Remark ?? ''} onChange={e => set({ Remark: e.target.value || null })}
          className="field-input" placeholder="可选备注..." />
      </PrField>

      {/* Node tree entry point — editing used to be hidden behind the timeline caret */}
      <div className="pt-2 border-t border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-sky-400">节点树 ({nodeCount} 个节点)</div>
          <button
            onClick={() => setPicker(p => !p)}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              picker ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
          >
            ＋ 添加节点
          </button>
        </div>

        {picker && (
          <div className="grid grid-cols-2 gap-1 p-1.5 bg-gray-900/60 border border-gray-700 rounded">
            {PR_NODE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => { addEntryNode(entry.Guid, root.Id, t); setPicker(false) }}
                className="px-2 py-1 text-[11px] text-left bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded flex items-center gap-1.5"
              >
                <span>{PR_NODE_TYPE_ICONS[t]}</span>
                <span className="truncate">{PR_NODE_TEMPLATE_LABELS[t]}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => select({ kind: 'node', entryGuid: entry.Guid, nodeId: root.Id })}
          className="w-full px-2 py-1.5 text-left text-[11px] bg-gray-900/50 hover:bg-gray-700/60 border border-gray-700 rounded transition-colors"
        >
          <span className="mr-1.5">{PR_NODE_TYPE_ICONS[root.Type]}</span>
          <span className="text-gray-200">{root.Name || '行为组'}</span>
          <span className="text-gray-500 ml-2">{nodeSummary(root)}</span>
          <span className="text-gray-600 ml-2">→ 编辑根节点</span>
        </button>

        <div className="text-[10px] text-gray-600">
          中间时间轴中已展开该行为组的节点树，可点击节点编辑、右键打开操作菜单
        </div>
      </div>
    </div>
  )
}
