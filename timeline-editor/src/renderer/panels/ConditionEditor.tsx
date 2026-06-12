import { useCallback } from 'react'
import { TargetSelectorEditor } from './TargetSelectorEditor'
import { useStore } from '../store'
import { getSemanticField } from './semanticFields'

interface CondFieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  options?: { value: string | number; label: string }[]
  placeholder?: string
  step?: number
}

function getCondDefs($type: string): CondFieldDef[] | null {
  if ($type.includes('TriggerCondEnemyCastSpell')) return [
    { key: 'RegexNameOrId', label: '技能名称或ID', type: 'text', placeholder: '例如 48370 或 制裁之光' },
    { key: 'NeedTargetable', label: '需要可选中', type: 'checkbox' },
  ]
  if ($type.includes('TriggerCondCheckSpellCd')) return [
    { key: 'SpellId', label: '技能ID', type: 'number' },
    { key: 'CoolDown', label: '冷却时间（秒）', type: 'number' },
    { key: 'Larger', label: 'CD ≥ 此值', type: 'checkbox' },
  ]
  if ($type.includes('TriggerCondReceviceAbilityEffect')) return [
    { key: 'ActionId', label: '技能ID', type: 'number' },
    { key: 'CheckIsMe', label: '仅检测自身', type: 'checkbox' },
    { key: 'LimitType', label: '限制类型', type: 'number' },
  ]
  if ($type.includes('TriggerCondReceviceNoTargetAbilityEffect')) return [
    { key: 'ActionId', label: '技能ID', type: 'number' },
  ]
  if ($type.includes('TriggerCondCheckLastSpell')) return [
    { key: 'SpellId', label: '技能ID', type: 'number' },
  ]
  if ($type.includes('TriggerCondAfterSpell')) return [
    { key: 'SpellId', label: '技能ID', type: 'number' },
  ]
  if ($type.includes('TriggerCondVariable')) return [
    { key: 'VariableName', label: '变量名称', type: 'text' },
    { key: 'CompareType', label: '比较方式', type: 'select', options: [
      { value: 0, label: '== （等于）' },
      { value: 1, label: '!= （不等于）' },
      { value: 2, label: '> （大于）' },
      { value: 3, label: '< （小于）' },
      { value: 4, label: '≥ （大于等于）' },
      { value: 5, label: '≤ （小于等于）' },
    ]},
    { key: 'VariableVaule', label: '值', type: 'number' },
  ]
  if ($type.includes('TriggerCondOnWeatherIdChanged')) return [
    { key: 'WeatherId', label: '天气ID', type: 'number' },
  ]
  if ($type.includes('TriggerCondAfterBattleStart')) return [
    { key: 'Delay', label: '延迟（秒）', type: 'number', step: 1 },
  ]
  if ($type.includes('TriggerCondCheckPartyRole')) return [
    { key: 'PartyRole', label: '职能', type: 'select', options: [
      { value: 'MT', label: 'MT' }, { value: 'ST', label: 'ST' },
      { value: 'H1', label: 'H1' }, { value: 'H2', label: 'H2' },
      { value: 'D1', label: 'D1' }, { value: 'D2', label: 'D2' },
      { value: 'D3', label: 'D3' }, { value: 'D4', label: 'D4' },
    ]},
  ]
  if ($type.includes('TriggerCondGameLog')) return [
    { key: 'RegexValue', label: '匹配文本', type: 'text', placeholder: '例如 小心点小心点，哈哈！' },
    { key: 'LimitMsgType', label: '按消息类型过滤', type: 'checkbox' },
    { key: 'MsgType', label: '消息类型编号', type: 'number' },
  ]
  if ($type.includes('TriggerCondAfterUnitIsTargetable')) return [
    { key: 'DataId', label: '单位DataId', type: 'number' },
  ]
  if ($type.includes('TriggerCondAfterUnitRemove')) return [
    { key: 'DataId', label: '单位DataId', type: 'number' },
  ]
  if ($type.includes('TriggerCondActorControlTargetIcon')) return [
    { key: 'Args0', label: '图标ID', type: 'number' },
  ]
  if ($type.includes('TriggerCondCheckRecentlyTether')) return [
    { key: 'Args0', label: '连线ID', type: 'number' },
    { key: 'CheckTime', label: '检测时间（秒）', type: 'number', step: 0.1 },
  ]
  if ($type.includes('TriggerCondMapEffect')) return [
    { key: 'Pos', label: '位置索引', type: 'number' },
    { key: 'Arg0', label: '参数0', type: 'number' },
    { key: 'Arg1', label: '参数1', type: 'number' },
  ]
  if ($type.includes('TriggerCondBeforeBattleTime')) return [
    { key: 'TargetTime', label: '在此时间（秒）之前', type: 'number' },
  ]
  if ($type.includes('TriggerCondWaitTarget')) return [
    // 使用目标选择器 — 下面特殊处理
  ]
  return null // 未知类型 — 使用通用JSON编辑
}

function getCondDisplayName($type: string): string {
  const short = $type.split(',')[0].split('.').pop() || $type
  const map: Record<string, string> = {
    TriggerCondEnemyCastSpell: '敌人读条使用技能',
    TriggerCondCheckSpellCd: '检测技能CD',
    TriggerCondReceviceAbilityEffect: '等待技能效果',
    TriggerCondCheckLastSpell: '检测自身技能使用',
    TriggerCondAfterSpell: '等待技能释放',
    TriggerCondVariable: '变量检测',
    TriggerCondOnWeatherIdChanged: '天气变化',
    TriggerCondAfterBattleStart: '战斗计时器',
    TriggerCondCheckPartyRole: '自身职能检测',
    TriggerCondGameLog: '聊天监控',
    TriggerCondAfterUnitIsTargetable: '等待目标可选中',
    TriggerCondActorControlTargetIcon: '技能点名图标',
    TriggerCondReceviceNoTargetAbilityEffect: '无目标技能效果',
    TriggerCondCheckRecentlyTether: '最近连线检测',
    TriggerCondAfterUnitRemove: '等待目标消失',
    TriggerCondMapEffect: '地图效果',
    TriggerCondBeforeBattleTime: '战斗时间之前',
    TriggerCondWaitTarget: '等待目标',
  }
  return map[short] || short
}

export function ConditionEditor({
  condition,
  onChange,
  onDelete,
}: {
  condition: any
  onChange: (changes: any) => void
  onDelete: () => void
}) {
  const acrConditionTypes = useStore(s => s.acrConditionTypes)
  const defs = getCondDefs(condition.$type)
  const displayName = getCondDisplayName(condition.$type)
  const isWaitTarget = condition.$type.includes('TriggerCondWaitTarget')

  // Look up ACR field definitions if this is a non-built-in type
  const acrDef = !defs && !isWaitTarget
    ? acrConditionTypes.find(t => t.$type === condition.$type)
    : null

  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/50 p-2 mb-2">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-300">{displayName}</span>
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
      </div>

      {/* 备注（通用） */}
      <FieldRow label="备注">
        <input
          type="text"
          value={condition.Remark || ''}
          onChange={e => handleFieldChange('Remark', e.target.value)}
          className="field-input"
          placeholder="可选备注..."
        />
      </FieldRow>

      {/* WaitTarget 目标选择器 */}
      {isWaitTarget && (
        <FieldRow label="目标选择器">
          <TargetSelectorEditor
            selector={condition.TargetSelector}
            onChange={(s) => handleFieldChange('TargetSelector', s)}
          />
        </FieldRow>
      )}

      {/* 类型专属字段 */}
      {defs && defs.map(def => {
        const value = condition[def.key]
        return (
          <FieldRow key={def.key} label={def.label}>
            {def.type === 'checkbox' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={e => handleFieldChange(def.key, e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-[11px] text-gray-400">{def.label}</span>
              </label>
            ) : def.type === 'select' ? (
              <select
                value={value ?? ''}
                onChange={e => {
                  const v = e.target.value
                  const numOpt = def.options?.find(o => String(o.value) === v)
                  handleFieldChange(def.key, numOpt && typeof numOpt.value === 'number' ? Number(v) : v)
                }}
                className="field-input"
              >
                {def.options?.map(o => (
                  <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={def.type}
                step={def.step}
                value={def.type === 'number' ? (value ?? 0) : (value ?? '')}
                onChange={e => handleFieldChange(def.key, def.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                className="field-input"
                placeholder={def.placeholder}
              />
            )}
          </FieldRow>
        )
      })}

      {/* ACR 类型：根据注册表渲染字段 */}
      {acrDef && acrDef.fields.map(field => {
        const value = condition[field.key]
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

      {/* 未知类型：原始JSON编辑 */}
      {!defs && !isWaitTarget && !acrDef && (
        <FieldRow label="原始JSON">
          <textarea
            value={JSON.stringify(condition, (key, val) => key === '$type' || key === 'DisplayName' ? undefined : val, 2)}
            onChange={e => {
              try {
                const parsed = JSON.parse(e.target.value)
                onChange(parsed)
              } catch { /* 忽略输入过程中的解析错误 */ }
            }}
            className="field-input h-20 font-mono text-[10px]"
          />
        </FieldRow>
      )}
    </div>
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
