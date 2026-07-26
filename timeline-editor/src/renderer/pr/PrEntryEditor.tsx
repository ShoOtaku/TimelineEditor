import { useMemo } from 'react'
import type { PtlEntry } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { formatPrTime, functionalAnchors, segmentDuration } from './prModel'
import { PrField, PrCheckbox } from './prFields'

/** Entry (行为组) properties editor */
export function PrEntryEditor({ entry }: { entry: PtlEntry }) {
  const doc = usePrStore(s => s.doc)
  const updateEntry = usePrStore(s => s.updateEntry)

  const set = (changes: Partial<PtlEntry>) => updateEntry(entry.Guid, changes)

  const anchorOptions = useMemo(() => {
    if (!doc) return []
    const fn = functionalAnchors(doc)
    // Entries cannot bind to the end/last anchor
    return fn.slice(0, -1).filter(a => !a.IsEndAnchor)
  }, [doc])

  const segLen = doc ? segmentDuration(doc, entry.StartAnchorGuid) : null
  const anchor = doc?.Anchors.find(a => a.Guid === entry.StartAnchorGuid)
  const offsetInvalid = segLen !== null && (entry.Offset < 0 || entry.Offset >= segLen)

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
          ? `有效范围 [0, ${segLen.toFixed(1)})，实际触发 ${anchor ? formatPrTime(anchor.Time + entry.Offset) : ''}`
          : undefined}
      >
        <input
          type="number" step={0.1} value={entry.Offset}
          onChange={e => set({ Offset: parseFloat(e.target.value) || 0 })}
          className={`field-input ${offsetInvalid ? '!border-red-600' : ''}`}
        />
        {offsetInvalid && (
          <div className="text-[10px] text-red-400 mt-0.5">偏移超出锚点区间，运行时将报错</div>
        )}
      </PrField>

      <PrCheckbox label="启用" checked={entry.Enabled} onChange={v => set({ Enabled: v })} />

      <PrField label="备注">
        <input type="text" value={entry.Remark ?? ''} onChange={e => set({ Remark: e.target.value || null })}
          className="field-input" placeholder="可选备注..." />
      </PrField>

      <div className="text-[10px] text-gray-600 pt-1 border-t border-gray-700">
        在中间时间轴中展开该行为组（▸）可编辑内部节点树
      </div>
    </div>
  )
}
