import { useState } from 'react'
import type { PtlCondition } from '@shared/prTypes'
import { PR_CONDITION_SPECS, findConditionSpec, PR_DTO_CONDITION_FIELDS } from '@shared/prSpecs'
import { PrField, PrNumberInput, PrCheckbox, PrParamsTextarea } from './prFields'
import { SpecFields } from './prSpecEditor'

interface Props {
  condition: PtlCondition
  index: number
  onChange: (updated: PtlCondition) => void
  onDelete: () => void
  onMove?: (dir: -1 | 1) => void
}

export function PrConditionEditor({ condition, index, onChange, onDelete, onMove }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const spec = findConditionSpec(condition.Type)
  const type = condition.Type ?? ''

  return (
    <div className="border border-gray-700 rounded bg-gray-900/40">
      <div className="flex items-center gap-1 p-1.5 border-b border-gray-700/60">
        <span className="text-[10px] text-gray-500 flex-shrink-0 w-4">{index + 1}</span>
        <select
          value={spec ? spec.key : '__custom__'}
          onChange={e => { if (e.target.value !== '__custom__') onChange({ ...condition, Type: e.target.value }) }}
          className="field-input !py-0.5 !text-[12px]"
        >
          {PR_CONDITION_SPECS.map(s => (
            <option key={s.key} value={s.key}>{s.label}{s.deprecated ? '（废弃）' : ''}</option>
          ))}
          {!spec && <option value="__custom__">{type || '(自定义)'}</option>}
        </select>
        {onMove && (
          <>
            <button onClick={() => onMove(-1)} className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200" title="上移">↑</button>
            <button onClick={() => onMove(1)} className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200" title="下移">↓</button>
          </>
        )}
        <button onClick={onDelete} className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0" title="删除条件">🗑</button>
      </div>

      <div className="p-2 space-y-2">
        {spec?.note && <div className="text-[10px] text-amber-400/80">⚠ {spec.note}</div>}

        {!spec && (
          <PrField label="自定义类型键" hint="ACR / 插件注册的条件">
            <input type="text" value={type} onChange={e => onChange({ ...condition, Type: e.target.value })} className="field-input" />
          </PrField>
        )}

        {spec
          ? <SpecFields dto={condition} spec={spec} onChange={next => onChange(next as PtlCondition)} />
          : <RawConditionFields condition={condition} onChange={onChange} />}

        {spec && (
          <>
            <button onClick={() => setShowRaw(v => !v)} className="text-[10px] text-gray-500 hover:text-gray-300">
              {showRaw ? '▾ 收起原始字段' : '▸ 原始字段'}
            </button>
            {showRaw && <RawConditionFields condition={condition} onChange={onChange} />}
          </>
        )}
      </div>
    </div>
  )
}

/** Full ConditionDto field set — fallback for unknown types and the raw view */
function RawConditionFields({ condition, onChange }: { condition: PtlCondition; onChange: (c: PtlCondition) => void }) {
  const set = (changes: Partial<PtlCondition>) => onChange({ ...condition, ...changes })
  return (
    <div className="space-y-2 border-t border-gray-700/60 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <PrField label="ActionId">
          <PrNumberInput integer value={condition.ActionId ?? null} onChange={v => set({ ActionId: v })} />
        </PrField>
        <PrField label="BuffId">
          <PrNumberInput integer value={condition.BuffId ?? null} onChange={v => set({ BuffId: v })} />
        </PrField>
        <PrField label="Mode">
          <input type="text" value={condition.Mode ?? ''} onChange={e => set({ Mode: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="Value">
          <PrNumberInput value={condition.Value ?? null} onChange={v => set({ Value: v })} />
        </PrField>
        <PrField label="Target">
          <input type="text" value={condition.Target ?? ''} onChange={e => set({ Target: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="Regex">
          <input type="text" value={condition.Regex ?? ''} onChange={e => set({ Regex: e.target.value || null })} className="field-input" />
        </PrField>
      </div>
      <div className="flex items-center gap-3">
        <PrCheckbox label="Immediate" checked={condition.Immediate ?? false} onChange={v => set({ Immediate: v })} />
        <PrCheckbox label="Negate" checked={condition.Negate ?? false} onChange={v => set({ Negate: v })} />
      </div>
      <PrField label="Params" hint="键=值，每行一条">
        <PrParamsTextarea params={condition.Params} onChange={p => set({ Params: p })} />
      </PrField>
      {/* Preserve any field not covered above (round-trip visibility) */}
      {Object.keys(condition).filter(k => !(PR_DTO_CONDITION_FIELDS as readonly string[]).includes(k)).length > 0 && (
        <div className="text-[10px] text-gray-600">
          其它保留字段：{Object.keys(condition).filter(k => !(PR_DTO_CONDITION_FIELDS as readonly string[]).includes(k)).join(', ')}
        </div>
      )}
    </div>
  )
}
