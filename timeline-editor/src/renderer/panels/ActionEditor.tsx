import { useCallback } from 'react'
import { SpellConfigEditor } from './SpellConfigEditor'
import { TargetSelectorEditor } from './TargetSelectorEditor'
import { useStore } from '../store'
import { getSemanticField } from './semanticFields'

function getActionTitle($type: string): string {
  const short = $type.split(',')[0].split('.').pop() || $type
  const map: Record<string, string> = {
    TriggerActionCastSpell: '强制使用技能',
    TriggerActionHighPrioritySlot: '插入高优先级技能',
    TriggerActionSpellQueue: '强制使用技能队列',
    TriggerAction_SendCommand: '发送指令',
    TriggerActionSelectenemy: '切换目标',
    TriggerActionUsePotion: '使用爆发药',
    TriggerActionSwitchStop: '切换停手',
    TriggerActionLockSpell: '锁定技能',
    TriggerActionAddVariable: '设置变量',
    TriggerAction_SimpleTP: '初级TP',
    TriggerAction_MoveTo: '移动到目标',
  }
  return map[short] || short
}

export function ActionEditor({
  action,
  onChange,
  onDelete,
}: {
  action: any
  onChange: (changes: any) => void
  onDelete: () => void
}) {
  const acrActionTypes = useStore(s => s.acrActionTypes)
  const title = getActionTitle(action.$type)
  const $type = action.$type
  const isPluginType = !$type.includes('AEAssist.CombatRoutine.Trigger.TriggerAction')
  const acrDef = acrActionTypes.find(t => t.$type === $type)

  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/50 p-2 mb-2">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-300">{title}</span>
        <span className="text-[9px] text-gray-600">{$type.split(',')[0].split('.').slice(-2).join('.')}</span>
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
      </div>

      {/* 备注（通用） */}
      <FieldRow label="备注">
        <input
          type="text"
          value={action.Remark || ''}
          onChange={e => handleFieldChange('Remark', e.target.value)}
          className="field-input"
          placeholder="可选备注..."
        />
      </FieldRow>

      {/* === CastSpell / HighPrioritySlot: 技能配置 === */}
      {($type.includes('TriggerActionCastSpell') || $type.includes('TriggerActionHighPrioritySlot')) && (
        <>
          <FieldRow label="技能配置">
            <SpellConfigEditor
              config={action.SpellConfig || {}}
              onChange={(c) => handleFieldChange('SpellConfig', c)}
            />
          </FieldRow>
          {$type.includes('TriggerActionHighPrioritySlot') && (
            <>
              <FieldRow label="清除">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!action.Clear} onChange={e => handleFieldChange('Clear', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
                  <span className="text-[11px] text-gray-400">插入前清除槽位</span>
                </label>
              </FieldRow>
              <FieldRow label="双重清除">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!action.DoubleClear} onChange={e => handleFieldChange('DoubleClear', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
                  <span className="text-[11px] text-gray-400">双重清除</span>
                </label>
              </FieldRow>
            </>
          )}
        </>
      )}

      {/* SpellQueue: 技能列表 */}
      {$type.includes('TriggerActionSpellQueue') && (
        <FieldRow label="技能列表">
          <div className="space-y-1 mb-1">
            {(action.Data || []).map((spell: any, idx: number) => (
              <details key={idx} className="border border-gray-700 rounded bg-gray-800/50">
                <summary className="px-2 py-1 text-[11px] text-gray-400 cursor-pointer">
                  技能 #{idx + 1}: {spell.SpellId || '?'}
                </summary>
                <div className="p-2">
                  <SpellConfigEditor
                    config={spell}
                    onChange={(c) => {
                      const newData = [...(action.Data || [])]
                      newData[idx] = { ...newData[idx], ...c }
                      handleFieldChange('Data', newData)
                    }}
                  />
                  <button
                    onClick={() => {
                      const newData = (action.Data || []).filter((_: any, i: number) => i !== idx)
                      handleFieldChange('Data', newData)
                    }}
                    className="text-[10px] text-red-400 hover:text-red-300 mt-1"
                  >
                    移除该技能
                  </button>
                </div>
              </details>
            ))}
          </div>
          <button
            onClick={() => {
              const newSpell = {
                Remark: '', Category: 0, SpellId: 0, CoolDowncheck: false, CoolDowncheck_time: 0,
                TargetType: 0, IsPartyMember: true, LimitJobType: 0, LimitBuffIds: [],
                LimitMaxHpType: 0, LimitHpType: 0,
                Location: { X: 0, Y: 0, Z: 0 },
                TargetSelector: { Enable: false, Target: 0, FilterDatas: [], NeedTargetable: false, SndFilter: 0, PMIndex: 0 },
                AutoCheckActionChange: true
              }
              handleFieldChange('Data', [...(action.Data || []), newSpell])
            }}
            className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-0.5 rounded"
          >
            + 添加技能
          </button>
        </FieldRow>
      )}

      {/* SendCommand: 发送指令 */}
      {$type.includes('TriggerAction_SendCommand') && (
        <FieldRow label="指令">
          <input
            type="text"
            value={action.Command || ''}
            onChange={e => handleFieldChange('Command', e.target.value)}
            className="field-input"
            placeholder="例如 /aeTargetSelector on"
          />
        </FieldRow>
      )}

      {/* SelectEnemy: 切换目标 */}
      {$type.includes('TriggerActionSelectenemy') && (
        <>
          <FieldRow label="名称或ID">
            <input
              type="text"
              value={action.NameorId || ''}
              onChange={e => handleFieldChange('NameorId', e.target.value)}
              className="field-input"
              placeholder="例如 19912"
            />
          </FieldRow>
          <FieldRow label="目标选择器">
            <TargetSelectorEditor
              selector={action.TargetSelector}
              onChange={(s) => handleFieldChange('TargetSelector', s)}
            />
          </FieldRow>
        </>
      )}

      {/* UsePotion */}
      {$type.includes('TriggerActionUsePotion') && (
        <div className="text-[11px] text-gray-400 italic">使用当前装备的爆发药，无需额外配置。</div>
      )}

      {/* SwitchStop */}
      {$type.includes('TriggerActionSwitchStop') && (
        <FieldRow label="停手">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!action.Stop} onChange={e => handleFieldChange('Stop', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
            <span className="text-[11px] text-gray-400">{action.Stop ? '停手' : '恢复'}</span>
          </label>
        </FieldRow>
      )}

      {/* LockSpell */}
      {$type.includes('TriggerActionLockSpell') && (
        <>
          <FieldRow label="锁定状态">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!action.IsLock} onChange={e => handleFieldChange('IsLock', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
              <span className="text-[11px] text-gray-400">{action.IsLock ? '已锁定' : '已解锁'}</span>
            </label>
          </FieldRow>
          <FieldRow label="技能ID列表">
            <div className="flex flex-wrap gap-1 mb-1">
              {(action.IdList || []).map((id: number, idx: number) => (
                <span key={idx} className="flex items-center gap-0.5 bg-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-300">
                  {id}
                  <button
                    onClick={() => {
                      const newList = (action.IdList || []).filter((_: number, i: number) => i !== idx)
                      handleFieldChange('IdList', newList)
                    }}
                    className="text-red-400 hover:text-red-300 ml-0.5"
                  >✕</button>
                </span>
              ))}
            </div>
            <input
              type="number"
              placeholder="输入技能ID后按回车添加..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = parseInt((e.target as HTMLInputElement).value)
                  if (val > 0) {
                    handleFieldChange('IdList', [...(action.IdList || []), val]);
                    (e.target as HTMLInputElement).value = ''
                  }
                }
              }}
              className="field-input"
            />
          </FieldRow>
        </>
      )}

      {/* AddVariable */}
      {$type.includes('TriggerActionAddVariable') && (
        <>
          <FieldRow label="变量名称">
            <input
              type="text"
              value={action.VariableName || ''}
              onChange={e => handleFieldChange('VariableName', e.target.value)}
              className="field-input"
            />
          </FieldRow>
          <FieldRow label="设置值">
            <input
              type="number"
              value={action.SetVariableVaule ?? 0}
              onChange={e => handleFieldChange('SetVariableVaule', parseInt(e.target.value) || 0)}
              className="field-input"
            />
          </FieldRow>
        </>
      )}

      {/* SimpleTP */}
      {$type.includes('TriggerAction_SimpleTP') && (
        <FieldRow label="简易传送点选择器">
          {action.SimplePointSelector ? (
            <div className="space-y-1">
              <div className="flex gap-2">
                <select
                  value={action.SimplePointSelector.SelectType ?? 0}
                  onChange={e => {
                    const sps = { ...action.SimplePointSelector, SelectType: parseInt(e.target.value) }
                    handleFieldChange('SimplePointSelector', sps)
                  }}
                  className="field-input flex-1"
                >
                  <option value={0}>固定点</option>
                  <option value={1}>头顶标记</option>
                  <option value={2}>地图标记</option>
                  <option value={3}>队友位置</option>
                  <option value={4}>关联对象（连线/图标）</option>
                </select>
              </div>
              <FieldRow label="固定点坐标">
                <div className="flex gap-1">
                  <input type="number" step={0.1} value={action.SimplePointSelector.FixedPoint?.X ?? 100}
                    onChange={e => { const sps={...action.SimplePointSelector,FixedPoint:{...action.SimplePointSelector.FixedPoint,X:parseFloat(e.target.value)||0}}; handleFieldChange('SimplePointSelector',sps) }}
                    className="field-input w-1/3" placeholder="X" />
                  <input type="number" step={0.1} value={action.SimplePointSelector.FixedPoint?.Y ?? 0}
                    onChange={e => { const sps={...action.SimplePointSelector,FixedPoint:{...action.SimplePointSelector.FixedPoint,Y:parseFloat(e.target.value)||0}}; handleFieldChange('SimplePointSelector',sps) }}
                    className="field-input w-1/3" placeholder="Y" />
                  <input type="number" step={0.1} value={action.SimplePointSelector.FixedPoint?.Z ?? 100}
                    onChange={e => { const sps={...action.SimplePointSelector,FixedPoint:{...action.SimplePointSelector.FixedPoint,Z:parseFloat(e.target.value)||0}}; handleFieldChange('SimplePointSelector',sps) }}
                    className="field-input w-1/3" placeholder="Z" />
                </div>
              </FieldRow>
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 italic">未配置传送点选择器</div>
          )}
        </FieldRow>
      )}

      {/* MoveTo */}
      {$type.includes('TriggerAction_MoveTo') && (
        <>
          <FieldRow label="目标位置">
            <div className="flex gap-1">
              <input type="number" step={0.1} value={action.Pos?.X ?? 100}
                onChange={e => handleFieldChange('Pos', { ...action.Pos, X: parseFloat(e.target.value) || 0 })}
                className="field-input w-1/3" placeholder="X" />
              <input type="number" step={0.1} value={action.Pos?.Y ?? 0}
                onChange={e => handleFieldChange('Pos', { ...action.Pos, Y: parseFloat(e.target.value) || 0 })}
                className="field-input w-1/3" placeholder="Y" />
              <input type="number" step={0.1} value={action.Pos?.Z ?? 100}
                onChange={e => handleFieldChange('Pos', { ...action.Pos, Z: parseFloat(e.target.value) || 0 })}
                className="field-input w-1/3" placeholder="Z" />
            </div>
          </FieldRow>
          <FieldRow label="使用2D导航">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!action.Use2} onChange={e => handleFieldChange('Use2', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
              <span className="text-[11px] text-gray-400">使用2D导航模式</span>
            </label>
          </FieldRow>
        </>
      )}

      {/* 插件类型：显示键值对或原始JSON */}
      {isPluginType && !$type.includes('TriggerActionCastSpell') && !$type.includes('TriggerActionHighPrioritySlot') && !$type.includes('TriggerActionSpellQueue') && !$type.includes('TriggerAction_SendCommand') && !$type.includes('TriggerActionSelectenemy') && !$type.includes('TriggerActionUsePotion') && !$type.includes('TriggerActionSwitchStop') && !$type.includes('TriggerActionLockSpell') && !$type.includes('TriggerActionAddVariable') && !$type.includes('TriggerAction_SimpleTP') && !$type.includes('TriggerAction_MoveTo') && (
        <PluginActionEditor action={action} onChange={onChange} acrDef={acrDef} />
      )}
    </div>
  )
}

// ============================================================
// 插件动作编辑器 — 处理QT类键值对
// ============================================================

function PluginActionEditor({ action, onChange, acrDef }: { action: any; onChange: (changes: any) => void; acrDef?: import('@shared/types').AcrTypeDef | null }) {
  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  const hasQtValues = action.qtValues && typeof action.qtValues === 'object'
  const hasQTList = action.QTList && Array.isArray(action.QTList)
  const hasKeyValue = typeof action.Key === 'string' && 'Value' in action
  const hasQtStates = action.QtStates && typeof action.QtStates === 'object'

  // ACR registry-defined fields (used when no QT pattern matches)
  if (!hasQtValues && !hasQTList && !hasKeyValue && !hasQtStates && acrDef) {
    return (
      <>
        {acrDef.fields.map(field => {
          const value = action[field.key]
          const semantic = getSemanticField(field.key, field.type)
          const effType = semantic?.overrideType || field.type
          const label = semantic?.label || field.key
          const hasEnum = field.enumValues && field.enumValues.length > 0

          return (
            <FieldRow key={field.key} label={label}>
              {effType === 'select' && semantic?.options ? (
                <select
                  value={value ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    const numOpt = semantic.options!.find(o => String(o.value) === v)
                    handleFieldChange(field.key, numOpt && typeof numOpt.value === 'number' ? Number(v) : v)
                  }}
                  className="field-input"
                >
                  {semantic.options.map(o => (
                    <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                  ))}
                </select>
              ) : hasEnum ? (
                <select
                  value={value ?? 0}
                  onChange={e => handleFieldChange(field.key, Number(e.target.value))}
                  className="field-input"
                >
                  {field.enumValues!.map(ev => (
                    <option key={ev.value} value={ev.value}>{ev.name} ({ev.value})</option>
                  ))}
                </select>
              ) : effType === 'boolean' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={e => handleFieldChange(field.key, e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600"
                  />
                  <span className="text-[11px] text-gray-400">{label}</span>
                </label>
              ) : effType === 'number' ? (
                <input
                  type="number"
                  value={value ?? 0}
                  onChange={e => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
                  className="field-input"
                />
              ) : (
                <input
                  type="text"
                  value={value ?? ''}
                  onChange={e => handleFieldChange(field.key, e.target.value)}
                  className="field-input"
                />
              )}
            </FieldRow>
          )
        })}
      </>
    )
  }

  if (hasQtValues) {
    const entries = Object.entries(action.qtValues)
    return (
      <FieldRow label="QT 开关">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between py-0.5">
            <span className="text-[11px] text-gray-400">{key}</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!val}
                onChange={e => {
                  const newQt = { ...action.qtValues, [key]: e.target.checked }
                  handleFieldChange('qtValues', newQt)
                }}
                className="rounded bg-gray-700 border-gray-600"
              />
            </label>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-[11px] text-gray-500 italic mb-1">暂无可选项（从现有时间轴自动填充）</div>
        )}
        {/* Manual add key */}
        <div className="flex gap-1 mt-1">
          <input
            type="text"
            placeholder="手动添加开关名称..."
            className="field-input flex-1 text-[11px]"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const input = e.target as HTMLInputElement
                const key = input.value.trim()
                if (key && !(key in action.qtValues)) {
                  handleFieldChange('qtValues', { ...action.qtValues, [key]: true })
                }
                input.value = ''
              }
            }}
          />
        </div>
      </FieldRow>
    )
  }

  if (hasQTList) {
    return (
      <FieldRow label="QT 列表">
        {action.QTList.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between py-0.5">
            <span className="text-[11px] text-gray-400">{item.Key}</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!item.Value}
                onChange={e => {
                  const newList = action.QTList.map((it: any, i: number) =>
                    i === idx ? { ...it, Value: e.target.checked } : it
                  )
                  handleFieldChange('QTList', newList)
                }}
                className="rounded bg-gray-700 border-gray-600"
              />
            </label>
          </div>
        ))}
      </FieldRow>
    )
  }

  if (hasKeyValue) {
    return (
      <FieldRow label={action.Key || '设置'}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!action.Value}
            onChange={e => handleFieldChange('Value', e.target.checked)}
            className="rounded bg-gray-700 border-gray-600"
          />
          <span className="text-[11px] text-gray-400">{action.Key}</span>
        </label>
      </FieldRow>
    )
  }

  if (hasQtStates) {
    return (
      <FieldRow label="快捷QT状态">
        {Object.entries(action.QtStates).map(([key, val]) => (
          <div key={key} className="flex items-center justify-between py-0.5">
            <span className="text-[11px] text-gray-400">{key}</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!val}
                onChange={e => {
                  const newQt = { ...action.QtStates, [key]: e.target.checked }
                  handleFieldChange('QtStates', newQt)
                }}
                className="rounded bg-gray-700 border-gray-600"
              />
            </label>
          </div>
        ))}
      </FieldRow>
    )
  }

  // 通用：渲染所有未识别的键
  const knownKeys = ['$type', 'DisplayName', 'Remark', 'qtValues', 'QTList', 'Key', 'Value', 'QtStates']
  const unknownKeys = Object.keys(action).filter(k => !knownKeys.includes(k) && typeof action[k] !== 'object')

  return (
    <>
      {unknownKeys.map(key => (
        <FieldRow key={key} label={key}>
          {typeof action[key] === 'boolean' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!action[key]} onChange={e => handleFieldChange(key, e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
            </label>
          ) : (
            <input
              type="text"
              value={String(action[key] ?? '')}
              onChange={e => handleFieldChange(key, e.target.value)}
              className="field-input"
            />
          )}
        </FieldRow>
      ))}
      {unknownKeys.length === 0 && (
        <FieldRow label="原始数据">
          <textarea
            readOnly
            value={JSON.stringify(action, (k, v) => ['$type', 'DisplayName'].includes(k) ? undefined : v, 2)}
            className="field-input h-24 font-mono text-[10px] opacity-60"
          />
        </FieldRow>
      )}
    </>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="text-[9px] font-medium text-gray-500 mb-0.5">{label}</div>
      {children}
    </div>
  )
}
