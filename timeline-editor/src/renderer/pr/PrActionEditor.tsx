import { useState } from 'react'
import type { PtlAction, PtlQtState } from '@shared/prTypes'
import {
  PR_ACTION_TYPES, PR_XSZBOX_ACTION_TYPES, PR_ACTION_TYPE_LABELS,
  PR_SKILL_TYPES, PR_SKILL_TYPE_LABELS, PR_TARGET_TYPES, PR_TARGET_TYPE_LABELS,
  PR_TARGET_MODES, PR_TARGET_MODE_LABELS, PR_POTION_MODES, PR_POTION_MODE_LABELS,
  PR_SELECTOR_MODES, PR_ROLES, PR_XSZBOX_PRESETS, PR_XSZBOX_PRESET_LABELS
} from '@shared/prTypes'
import { PrField, PrCheckbox, PrNullableNumber, SpellNameHint } from './prFields'

interface Props {
  action: PtlAction
  index: number
  onChange: (updated: PtlAction) => void
  onDelete: () => void
}

const SKILL_ACTIONS = new Set(['EnqueueSkill', 'ForceUseSkill'])
const POSITION_ACTIONS = new Set(['EnqueueLocation', 'ForceUseLocation', 'GreenMoveToPosition', 'TeleportToPosition', 'HeadingControl'])

export function PrActionEditor({ action, index, onChange, onDelete }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const type = action.Type ?? ''
  const builtins = PR_ACTION_TYPES as readonly string[]
  const xszbox = PR_XSZBOX_ACTION_TYPES as readonly string[]
  const isKnown = builtins.includes(type) || xszbox.includes(type)

  const set = (changes: Partial<PtlAction>) => onChange({ ...action, ...changes })
  const setParam = (key: string, value: string) => {
    set({ Params: { ...(action.Params ?? {}), [key]: value } })
  }

  const qtStates = action.QtStates ?? []
  const setQtState = (i: number, changes: Partial<PtlQtState>) => {
    const next = qtStates.map((q, qi) => (qi === i ? { ...q, ...changes } : q))
    set({ QtStates: next })
  }

  return (
    <div className="border border-gray-700 rounded p-2 space-y-2 bg-gray-900/40">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 flex-shrink-0">#{index + 1}</span>
        <select
          value={isKnown ? type : '__custom__'}
          onChange={e => {
            if (e.target.value !== '__custom__') set({ Type: e.target.value })
          }}
          className="field-input !py-0.5 !text-[12px]"
        >
          <optgroup label="内置动作">
            {PR_ACTION_TYPES.map(t => (
              <option key={t} value={t}>{PR_ACTION_TYPE_LABELS[t] ?? t}</option>
            ))}
          </optgroup>
          <optgroup label="XSZBox IPC">
            {PR_XSZBOX_ACTION_TYPES.map(t => (
              <option key={t} value={t}>{PR_ACTION_TYPE_LABELS[t] ?? t}</option>
            ))}
          </optgroup>
          {!isKnown && <option value="__custom__">{type || '(自定义)'}</option>}
        </select>
        <button onClick={onDelete} className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0" title="删除动作">🗑</button>
      </div>

      {!isKnown && (
        <PrField label="自定义类型名" hint="如插件 IPC 注册的动作">
          <input type="text" value={type} onChange={e => set({ Type: e.target.value })} className="field-input" />
        </PrField>
      )}

      {/* --- Skill actions --- */}
      {SKILL_ACTIONS.has(type) && (
        <>
          <PrField label="技能 ID">
            <PrNullableNumber step={1} value={action.ActionId ?? null} onChange={v => set({ ActionId: v })} />
            <SpellNameHint actionId={action.ActionId} />
          </PrField>
          <div className="grid grid-cols-2 gap-2">
            <PrField label="技能类型">
              <select value={action.SkillType ?? 'OffGcd'} onChange={e => set({ SkillType: e.target.value })} className="field-input">
                {PR_SKILL_TYPES.map(t => <option key={t} value={t}>{PR_SKILL_TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </PrField>
            <PrField label="目标">
              <select value={action.Target ?? 'Self'} onChange={e => set({ Target: e.target.value })} className="field-input">
                {PR_TARGET_TYPES.map(t => <option key={t} value={t}>{PR_TARGET_TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </PrField>
          </div>
          <PrCheckbox label="高优先级" checked={action.HighPriority ?? false} onChange={v => set({ HighPriority: v })} />
        </>
      )}

      {/* --- QT actions --- */}
      {type === 'TriggerQt' && (
        <>
          <PrField label="QT 名称">
            <input type="text" value={action.Qt ?? ''} onChange={e => set({ Qt: e.target.value || null })}
              className="field-input" placeholder="如 爆发药" />
          </PrField>
          <PrCheckbox label="设置为开启" checked={action.Enabled ?? false} onChange={v => set({ Enabled: v })}
            title="勾选=将该QT设为开，不勾选=设为关" />
        </>
      )}

      {type === 'BatchTriggerQt' && (
        <PrField label={`QT 状态列表 (${qtStates.length})`}>
          <div className="space-y-1">
            {qtStates.map((q, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="checkbox" checked={q.Enabled}
                  onChange={e => setQtState(i, { Enabled: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600 flex-shrink-0"
                  title="该QT的目标状态"
                />
                <input
                  type="text" value={q.Name ?? ''}
                  onChange={e => setQtState(i, { Name: e.target.value })}
                  className="field-input !py-0.5 !text-[11px]"
                />
                <button
                  onClick={() => set({ QtStates: qtStates.filter((_, qi) => qi !== i) })}
                  className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => set({ QtStates: [...qtStates, { Name: '', Enabled: true }] })}
              className="text-[11px] text-gray-400 hover:text-emerald-300"
            >
              ＋ 添加 QT
            </button>
          </div>
        </PrField>
      )}

      {/* --- Target actions --- */}
      {type === 'SetTarget' && (
        <>
          <PrField label="目标模式">
            <select value={action.TargetMode ?? 'DataId'} onChange={e => set({ TargetMode: e.target.value })} className="field-input">
              {PR_TARGET_MODES.map(m => <option key={m} value={m}>{PR_TARGET_MODE_LABELS[m] ?? m}</option>)}
            </select>
          </PrField>
          {action.TargetMode === 'DataId' && (
            <div className="grid grid-cols-2 gap-2">
              <PrField label="目标 DataId">
                <PrNullableNumber step={1} value={action.TargetDataId ?? null} onChange={v => set({ TargetDataId: v })} />
              </PrField>
              <PrField label="目标名称" hint="可选">
                <input type="text" value={action.TargetName ?? ''} onChange={e => set({ TargetName: e.target.value || null })} className="field-input" />
              </PrField>
            </div>
          )}
          <PrCheckbox label="选取最近的" checked={action.TargetNearest ?? false} onChange={v => set({ TargetNearest: v })} />
        </>
      )}

      {type === 'UsePotion' && (
        <PrField label="使用方式">
          <select value={action.Mode ?? 'Enqueue'} onChange={e => set({ Mode: e.target.value })} className="field-input">
            {PR_POTION_MODES.map(m => <option key={m} value={m}>{PR_POTION_MODE_LABELS[m] ?? m}</option>)}
          </select>
        </PrField>
      )}

      {type === 'SetTargetSelectorMode' && (
        <PrField label="选择器模式">
          <select value={action.Mode ?? 'None'} onChange={e => set({ Mode: e.target.value })} className="field-input">
            {PR_SELECTOR_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </PrField>
      )}

      {(type === 'CustomLog' || type === 'ExecuteCommand') && (
        <PrField label={type === 'CustomLog' ? '日志内容' : '命令'}>
          <input type="text" value={action.Message ?? ''} onChange={e => set({ Message: e.target.value || null })}
            className="field-input" placeholder={type === 'ExecuteCommand' ? '如 /echo hello' : ''} />
        </PrField>
      )}

      {POSITION_ACTIONS.has(type) && (
        <>
          {(type === 'EnqueueLocation' || type === 'ForceUseLocation') && (
            <PrField label="技能 ID">
              <PrNullableNumber step={1} value={action.ActionId ?? null} onChange={v => set({ ActionId: v })} />
              <SpellNameHint actionId={action.ActionId} />
            </PrField>
          )}
          <div className="grid grid-cols-3 gap-1">
            <PrField label="X"><PrNullableNumber value={action.PositionX ?? null} onChange={v => set({ PositionX: v })} /></PrField>
            <PrField label="Y"><PrNullableNumber value={action.PositionY ?? null} onChange={v => set({ PositionY: v })} /></PrField>
            <PrField label="Z"><PrNullableNumber value={action.PositionZ ?? null} onChange={v => set({ PositionZ: v })} /></PrField>
          </div>
          <PrField label="持续时间 (秒)" hint="可选">
            <PrNullableNumber value={action.Duration ?? null} onChange={v => set({ Duration: v })} />
          </PrField>
        </>
      )}

      {type === 'SetTimelineVariable' && (
        <PrField label="参数 (Params)" hint="键=值，每行一条">
          <textarea
            value={Object.entries(action.Params ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
            onChange={e => {
              const params: Record<string, string> = {}
              for (const line of e.target.value.split('\n')) {
                const idx = line.indexOf('=')
                if (idx > 0) params[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
              }
              set({ Params: Object.keys(params).length ? params : null })
            }}
            className="field-input font-mono !text-[11px]" rows={2} placeholder="name=值"
          />
        </PrField>
      )}

      {/* --- XSZBox IPC actions --- */}
      {type === 'xszbox.pr.preset_skill' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <PrField label="职能">
              <select value={action.Params?.role ?? 'MT'} onChange={e => setParam('role', e.target.value)} className="field-input">
                {PR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </PrField>
            <PrField label="预设">
              <select value={action.Params?.preset ?? 'RaidMitigation'} onChange={e => setParam('preset', e.target.value)} className="field-input">
                {PR_XSZBOX_PRESETS.map(p => <option key={p} value={p}>{PR_XSZBOX_PRESET_LABELS[p] ?? p}</option>)}
              </select>
            </PrField>
          </div>
          <PrField label="指定技能 ID" hint="0 = 按预设自动选择">
            <input type="text" value={action.Params?.skillId ?? '0'} onChange={e => setParam('skillId', e.target.value)} className="field-input" />
            <SpellNameHint actionId={action.Params?.skillId === '0' ? null : action.Params?.skillId} />
          </PrField>
        </>
      )}

      {type === 'xszbox.pr.role_skill' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <PrField label="职能">
              <select value={action.Params?.role ?? 'MT'} onChange={e => setParam('role', e.target.value)} className="field-input">
                {PR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </PrField>
            <PrField label="技能 ID">
              <input type="text" value={action.Params?.skillId ?? ''} onChange={e => setParam('skillId', e.target.value)} className="field-input" />
            </PrField>
          </div>
          <SpellNameHint actionId={action.Params?.skillId} />
          <PrCheckbox label="对当前目标使用" checked={(action.Params?.useTarget ?? 'False') === 'True'}
            onChange={v => setParam('useTarget', v ? 'True' : 'False')} />
        </>
      )}

      {type === 'xszbox.pr.role_position' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <PrField label="职能" hint="留空 = 全体">
              <select value={action.Params?.role ?? ''} onChange={e => setParam('role', e.target.value)} className="field-input">
                <option value="">全体</option>
                {PR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </PrField>
            <PrField label="模式">
              <input type="text" value={action.Params?.mode ?? 'SetPos'} onChange={e => setParam('mode', e.target.value)} className="field-input" />
            </PrField>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <PrField label="X"><input type="text" value={action.Params?.x ?? '0'} onChange={e => setParam('x', e.target.value)} className="field-input" /></PrField>
            <PrField label="Y"><input type="text" value={action.Params?.y ?? '0'} onChange={e => setParam('y', e.target.value)} className="field-input" /></PrField>
            <PrField label="Z"><input type="text" value={action.Params?.z ?? '0'} onChange={e => setParam('z', e.target.value)} className="field-input" /></PrField>
            <PrField label="时长ms"><input type="text" value={action.Params?.durationMs ?? '5000'} onChange={e => setParam('durationMs', e.target.value)} className="field-input" /></PrField>
          </div>
        </>
      )}

      {/* --- Advanced: full DTO fields --- */}
      <button onClick={() => setShowAdvanced(v => !v)} className="text-[10px] text-gray-500 hover:text-gray-300">
        {showAdvanced ? '▾ 收起全部字段' : '▸ 全部字段'}
      </button>
      {showAdvanced && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <PrField label="ActionId"><PrNullableNumber step={1} value={action.ActionId ?? null} onChange={v => set({ ActionId: v })} /></PrField>
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
            <PrField label="TargetDataId"><PrNullableNumber step={1} value={action.TargetDataId ?? null} onChange={v => set({ TargetDataId: v })} /></PrField>
            <PrField label="Mode">
              <input type="text" value={action.Mode ?? ''} onChange={e => set({ Mode: e.target.value || null })} className="field-input" />
            </PrField>
            <PrField label="Message">
              <input type="text" value={action.Message ?? ''} onChange={e => set({ Message: e.target.value || null })} className="field-input" />
            </PrField>
          </div>
          <div className="flex items-center gap-3">
            <PrCheckbox label="Enabled" checked={action.Enabled ?? false} onChange={v => set({ Enabled: v })} />
            <PrCheckbox label="HighPriority" checked={action.HighPriority ?? false} onChange={v => set({ HighPriority: v })} />
          </div>
          <PrField label="Params" hint="键=值，每行一条">
            <textarea
              value={Object.entries(action.Params ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
              onChange={e => {
                const params: Record<string, string> = {}
                for (const line of e.target.value.split('\n')) {
                  const idx = line.indexOf('=')
                  if (idx > 0) params[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
                }
                set({ Params: Object.keys(params).length ? params : null })
              }}
              className="field-input font-mono !text-[11px]" rows={2}
            />
          </PrField>
        </div>
      )}
    </div>
  )
}
