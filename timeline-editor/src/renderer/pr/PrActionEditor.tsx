import { useState } from 'react'
import type { PtlAction } from '@shared/prTypes'
import { PR_ACTION_SPECS, findActionSpec, PR_DTO_ACTION_FIELDS } from '@shared/prSpecs'
import { PrField, PrNumberInput, PrCheckbox, PrParamsTextarea } from './prFields'
import { SpecFields } from './prSpecEditor'

interface Props {
  action: PtlAction
  index: number
  onChange: (updated: PtlAction) => void
  onDelete: () => void
  onMove?: (dir: -1 | 1) => void
}

export function PrActionEditor({ action, index, onChange, onDelete, onMove }: Props) {
  const [showRaw, setShowRaw] = useState(false)
  const spec = findActionSpec(action.Type)
  const type = action.Type ?? ''

  const builtins = PR_ACTION_SPECS.filter(s => !s.group)
  const plugins = PR_ACTION_SPECS.filter(s => s.group)

  return (
    <div className="border border-gray-700 rounded bg-gray-900/40">
      <div className="flex items-center gap-1 p-1.5 border-b border-gray-700/60">
        <span className="text-[10px] text-gray-500 flex-shrink-0 w-4">{index + 1}</span>
        <select
          value={spec ? spec.key : '__custom__'}
          onChange={e => { if (e.target.value !== '__custom__') onChange({ ...action, Type: e.target.value }) }}
          className="field-input !py-0.5 !text-[12px]"
        >
          <optgroup label="内置动作">
            {builtins.map(s => (
              <option key={s.key} value={s.key}>{s.label}{s.deprecated ? '（废弃）' : ''}</option>
            ))}
          </optgroup>
          <optgroup label="XSZBox 插件">
            {plugins.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </optgroup>
          {!spec && <option value="__custom__">{type || '(自定义)'}</option>}
        </select>
        {onMove && (
          <>
            <button onClick={() => onMove(-1)} className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200" title="上移">↑</button>
            <button onClick={() => onMove(1)} className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200" title="下移">↓</button>
          </>
        )}
        <button onClick={onDelete} className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0" title="删除动作">🗑</button>
      </div>

      <div className="p-2 space-y-2">
        {spec?.note && <div className="text-[10px] text-amber-400/80">⚠ {spec.note}</div>}

        {!spec && (
          <PrField label="自定义类型键" hint="插件 IPC 注册的动作">
            <input type="text" value={type} onChange={e => onChange({ ...action, Type: e.target.value })} className="field-input" />
          </PrField>
        )}

        {spec
          ? <SpecFields dto={action} spec={spec} onChange={next => onChange(next as PtlAction)} />
          : <RawActionFields action={action} onChange={onChange} />}

        {spec && (
          <>
            <button onClick={() => setShowRaw(v => !v)} className="text-[10px] text-gray-500 hover:text-gray-300">
              {showRaw ? '▾ 收起原始字段' : '▸ 原始字段'}
            </button>
            {showRaw && <RawActionFields action={action} onChange={onChange} />}
          </>
        )}
      </div>
    </div>
  )
}

/** Full ActionDto field set — fallback for unknown types and the raw view */
function RawActionFields({ action, onChange }: { action: PtlAction; onChange: (a: PtlAction) => void }) {
  const set = (changes: Partial<PtlAction>) => onChange({ ...action, ...changes })
  const extras = Object.keys(action).filter(k => !(PR_DTO_ACTION_FIELDS as readonly string[]).includes(k))
  return (
    <div className="space-y-2 border-t border-gray-700/60 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <PrField label="ActionId">
          <PrNumberInput integer value={action.ActionId ?? null} onChange={v => set({ ActionId: v })} />
        </PrField>
        <PrField label="Qt">
          <input type="text" value={action.Qt ?? ''} onChange={e => set({ Qt: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="SkillType">
          <input type="text" value={action.SkillType ?? ''} onChange={e => set({ SkillType: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="Target">
          <input type="text" value={action.Target ?? ''} onChange={e => set({ Target: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="TargetMode">
          <input type="text" value={action.TargetMode ?? ''} onChange={e => set({ TargetMode: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="TargetDataId">
          <PrNumberInput integer value={action.TargetDataId ?? null} onChange={v => set({ TargetDataId: v })} />
        </PrField>
        <PrField label="Mode">
          <input type="text" value={action.Mode ?? ''} onChange={e => set({ Mode: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="Message">
          <input type="text" value={action.Message ?? ''} onChange={e => set({ Message: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="Duration">
          <PrNumberInput value={action.Duration ?? null} onChange={v => set({ Duration: v })} />
        </PrField>
      </div>
      <div className="flex items-center gap-3">
        <PrCheckbox label="Enabled" checked={action.Enabled ?? false} onChange={v => set({ Enabled: v })} />
        <PrCheckbox label="HighPriority" checked={action.HighPriority ?? false} onChange={v => set({ HighPriority: v })} />
        <PrCheckbox label="TargetNearest" checked={action.TargetNearest ?? false} onChange={v => set({ TargetNearest: v })} />
      </div>
      <PrField label="Params" hint="键=值，每行一条">
        <PrParamsTextarea params={action.Params} onChange={p => set({ Params: p })} />
      </PrField>
      {extras.length > 0 && (
        <div className="text-[10px] text-gray-600">其它保留字段：{extras.join(', ')}</div>
      )}
    </div>
  )
}
