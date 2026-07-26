import { useState } from 'react'
import type { PtlCondition } from '@shared/prTypes'
import { PR_CONDITION_TYPES, PR_CONDITION_TYPE_LABELS, PR_COMPARE_MODES, PR_TARGET_TYPES, PR_TARGET_TYPE_LABELS } from '@shared/prTypes'
import { PrField, PrCheckbox, PrNullableNumber, SpellNameHint } from './prFields'

interface Props {
  condition: PtlCondition
  index: number
  onChange: (updated: PtlCondition) => void
  onDelete: () => void
}

/** Which primary fields each known condition type uses */
const PRIMARY_FIELDS: Record<string, string[]> = {
  SkillCooldown: ['ActionId', 'Mode', 'Value', 'Immediate'],
  TargetSelectable: ['ActionId', 'Value', 'Immediate'],
  HasBuffFriendly: ['BuffId', 'Target', 'Immediate'],
  BuffTimeFriendly: ['BuffId', 'Target', 'Mode', 'Value', 'Immediate'],
  CastStart: ['ActionId', 'Regex'],
  ActionEffect: ['ActionId', 'Regex'],
  InCombat: ['Value'],
  Countdown: ['Mode', 'Value'],
  ChatLog: ['Regex'],
  InstanceContentText: ['Regex'],
  PlayerPosition: ['Params'],
  Weather: ['Value', 'Regex'],
  TimelineRole: ['Params'],
  TimelineVariable: ['Params']
}

export function PrConditionEditor({ condition, index, onChange, onDelete }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const type = condition.Type ?? ''
  const isKnown = (PR_CONDITION_TYPES as readonly string[]).includes(type)
  const primary = PRIMARY_FIELDS[type] ?? []
  const show = (f: string) => primary.includes(f)

  const set = (changes: Partial<PtlCondition>) => onChange({ ...condition, ...changes })

  const setParamsText = (text: string) => {
    const params: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const idx = line.indexOf('=')
      if (idx > 0) params[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    set({ Params: Object.keys(params).length ? params : null })
  }

  return (
    <div className="border border-gray-700 rounded p-2 space-y-2 bg-gray-850 bg-gray-900/40">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 flex-shrink-0">#{index + 1}</span>
        <select
          value={isKnown ? type : '__custom__'}
          onChange={e => {
            if (e.target.value !== '__custom__') set({ Type: e.target.value })
          }}
          className="field-input !py-0.5 !text-[12px]"
        >
          {PR_CONDITION_TYPES.map(t => (
            <option key={t} value={t}>{PR_CONDITION_TYPE_LABELS[t] ?? t}</option>
          ))}
          {!isKnown && <option value="__custom__">{type || '(自定义)'}</option>}
        </select>
        <button onClick={onDelete} className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0" title="删除条件">🗑</button>
      </div>

      {!isKnown && (
        <PrField label="自定义类型名">
          <input type="text" value={type} onChange={e => set({ Type: e.target.value })} className="field-input" />
        </PrField>
      )}

      {show('ActionId') && (
        <PrField label={type === 'TargetSelectable' ? '目标 DataId' : '技能 ID'}>
          <PrNullableNumber step={1} value={condition.ActionId ?? null} onChange={v => set({ ActionId: v })} />
          {type !== 'TargetSelectable' && <SpellNameHint actionId={condition.ActionId} />}
        </PrField>
      )}

      {show('BuffId') && (
        <PrField label="Buff ID">
          <PrNullableNumber step={1} value={condition.BuffId ?? null} onChange={v => set({ BuffId: v })} />
        </PrField>
      )}

      {show('Target') && (
        <PrField label="目标">
          <select value={condition.Target ?? ''} onChange={e => set({ Target: e.target.value || null })} className="field-input">
            <option value="">未设置</option>
            {PR_TARGET_TYPES.map(t => (
              <option key={t} value={t}>{PR_TARGET_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </PrField>
      )}

      {show('Mode') && (
        <PrField label="比较符">
          <select value={condition.Mode ?? ''} onChange={e => set({ Mode: e.target.value || null })} className="field-input">
            <option value="">未设置</option>
            {PR_COMPARE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </PrField>
      )}

      {show('Value') && (
        <PrField label="比较值 (Value)">
          <PrNullableNumber value={condition.Value ?? null} onChange={v => set({ Value: v })} />
        </PrField>
      )}

      {show('Regex') && (
        <PrField label="正则 (Regex)">
          <input type="text" value={condition.Regex ?? ''} onChange={e => set({ Regex: e.target.value || null })}
            className="field-input" placeholder="可选" />
        </PrField>
      )}

      {show('Params') && (
        <PrField label="参数 (Params)" hint="键=值，每行一条">
          <textarea
            value={Object.entries(condition.Params ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
            onChange={e => setParamsText(e.target.value)}
            className="field-input font-mono !text-[11px]" rows={2} placeholder="Key=Value"
          />
        </PrField>
      )}

      <div className="flex items-center gap-3">
        {show('Immediate') && (
          <PrCheckbox label="立即判定" checked={condition.Immediate ?? false} onChange={v => set({ Immediate: v })}
            title="Immediate: 只判定一次，不等待" />
        )}
        <PrCheckbox label="取反" checked={condition.Negate ?? false} onChange={v => set({ Negate: v })} />
      </div>

      <button onClick={() => setShowAdvanced(v => !v)} className="text-[10px] text-gray-500 hover:text-gray-300">
        {showAdvanced ? '▾ 收起全部字段' : '▸ 全部字段'}
      </button>
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2">
          <PrField label="ActionId"><PrNullableNumber step={1} value={condition.ActionId ?? null} onChange={v => set({ ActionId: v })} /></PrField>
          <PrField label="BuffId"><PrNullableNumber step={1} value={condition.BuffId ?? null} onChange={v => set({ BuffId: v })} /></PrField>
          <PrField label="Mode">
            <input type="text" value={condition.Mode ?? ''} onChange={e => set({ Mode: e.target.value || null })} className="field-input" />
          </PrField>
          <PrField label="Value"><PrNullableNumber value={condition.Value ?? null} onChange={v => set({ Value: v })} /></PrField>
          <PrField label="Target">
            <input type="text" value={condition.Target ?? ''} onChange={e => set({ Target: e.target.value || null })} className="field-input" />
          </PrField>
          <PrField label="Regex">
            <input type="text" value={condition.Regex ?? ''} onChange={e => set({ Regex: e.target.value || null })} className="field-input" />
          </PrField>
        </div>
      )}
    </div>
  )
}
