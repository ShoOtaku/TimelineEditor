import type { AeFieldSpec } from '@shared/aeAssistSpecs'
import { AE_ENUMS, aeFieldLabel } from '@shared/aeAssistSpecs'
import { SpellConfigEditor } from './SpellConfigEditor'
import { TargetSelectorEditor } from './TargetSelectorEditor'
import { SimplePointSelectorEditor } from './SimplePointSelectorEditor'
import { useStore } from '../store'

interface Props {
  owner: Record<string, any>
  field: AeFieldSpec
  onChange: (key: string, value: any) => void
}

/** Field renderer driven by the members extracted from AEAssist.dll. */
export function AeAssistFieldEditor({ owner, field, onChange }: Props) {
  const value = owner[field.name]
  const label = aeFieldLabel(field)
  const spellLookup = useStore(s => s.spellLookup)

  if (field.name === 'Remark') return null // rendered once in the parent card

  if (field.type === 'SpellConfig') {
    return <Row label={label}><SpellConfigEditor config={value || {}} onChange={c => onChange(field.name, { ...(value || {}), ...c })} /></Row>
  }
  if (field.type === 'TargetSelector') {
    return <Row label={label}><TargetSelectorEditor selector={value} onChange={v => onChange(field.name, v)} /></Row>
  }
  if (field.type === 'SimplePointSelector') {
    return <Row label={label}><SimplePointSelectorEditor selector={value} onChange={v => onChange(field.name, v)} /></Row>
  }
  if (field.type === 'Vector3') {
    const vec = value || { X: 0, Y: 0, Z: 0 }
    return (
      <Row label={label}>
        <div className="grid grid-cols-3 gap-1">
          {(['X', 'Y', 'Z'] as const).map(axis => (
            <NumberField key={axis} value={vec[axis] ?? 0}
              onChange={n => onChange(field.name, { ...vec, [axis]: n })} placeholder={axis} />
          ))}
        </div>
      </Row>
    )
  }
  if (field.type === 'bool') {
    return (
      <Row label={label}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={e => onChange(field.name, e.target.checked)}
            className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[11px] text-gray-400">{value ? '开启' : '关闭'}</span>
        </label>
      </Row>
    )
  }
  if (field.type.startsWith('enum:')) {
    const enumName = field.type.slice(5)
    const options = AE_ENUMS[enumName] || []
    return (
      <Row label={label}>
        <select value={value ?? options[0]?.value ?? 0}
          onChange={e => onChange(field.name, Number(e.target.value))} className="field-input">
          {options.map(opt => <option key={`${opt.name}:${opt.value}`} value={opt.value}>{enumLabel(enumName, opt.name)} ({opt.value})</option>)}
        </select>
      </Row>
    )
  }
  if (field.type.startsWith('List<')) {
    const elementType = field.type.slice(5, -1)
    const list = Array.isArray(value) ? value : []
    if (elementType === 'SpellConfig') {
      return (
        <Row label={label}>
          <div className="space-y-1.5">
            {list.map((item, i) => (
              <details key={i} className="border border-gray-700 rounded bg-gray-800/50">
                <summary className="px-2 py-1 text-[11px] text-gray-400 cursor-pointer">
                  技能 #{i + 1}：{item.SpellId ? `${item.SpellId} ${spellLookup?.[String(item.SpellId)]?.n ?? ''}` : '未设置'}
                </summary>
                <div className="p-2">
                  <SpellConfigEditor config={item} onChange={c => onChange(field.name, list.map((x, j) => j === i ? { ...x, ...c } : x))} />
                  <button onClick={() => onChange(field.name, list.filter((_, j) => j !== i))}
                    className="text-[10px] text-red-400 hover:text-red-300 mt-1">移除该技能</button>
                </div>
              </details>
            ))}
            <button onClick={() => onChange(field.name, [...list, defaultSpellConfig()])}
              className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-0.5 rounded">＋ 添加技能</button>
          </div>
        </Row>
      )
    }
    return <PrimitiveList label={label} values={list} onChange={v => onChange(field.name, v)} numeric={elementType !== 'string'} />
  }
  if (field.type === 'string') {
    return (
      <Row label={label}>
        <input type="text" value={value ?? ''} onChange={e => onChange(field.name, e.target.value)} className="field-input" />
      </Row>
    )
  }
  if (isNumberType(field.type)) {
    const isSpellId = /^(SpellId|ActionId)$/.test(field.name)
    return (
      <Row label={label}>
        <NumberField value={value ?? 0} integer={!['float', 'double', 'decimal'].includes(field.type)}
          onChange={n => onChange(field.name, n)} />
        {isSpellId && value > 0 && (
          <div className={`text-[10px] mt-0.5 ${spellLookup?.[String(value)] ? 'text-green-400' : 'text-gray-600'}`}>
            {spellLookup?.[String(value)]?.n || '未找到技能数据'}
          </div>
        )}
      </Row>
    )
  }

  // Unknown custom/opaque field — editable JSON instead of silently omitting it
  return (
    <Row label={`${label} (${field.type})`}>
      <textarea value={JSON.stringify(value ?? {}, null, 2)} onChange={e => {
        try { onChange(field.name, JSON.parse(e.target.value)) } catch { /* keep typing */ }
      }} className="field-input h-20 font-mono text-[10px]" />
    </Row>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-1.5"><div className="text-[9px] font-medium text-gray-500 mb-0.5">{label}</div>{children}</div>
}

function NumberField({ value, onChange, integer, placeholder }: {
  value: number; onChange: (value: number) => void; integer?: boolean; placeholder?: string
}) {
  return <input type="number" step={integer ? 1 : 0.1} value={value}
    onChange={e => onChange((integer ? parseInt(e.target.value) : parseFloat(e.target.value)) || 0)}
    className="field-input" placeholder={placeholder} />
}

function PrimitiveList({ label, values, onChange, numeric }: {
  label: string; values: any[]; onChange: (values: any[]) => void; numeric: boolean
}) {
  return (
    <Row label={label}>
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map((v, i) => (
          <span key={i} className="flex items-center gap-1 bg-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-300">
            {String(v)}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="text-red-400">✕</button>
          </span>
        ))}
      </div>
      <input type={numeric ? 'number' : 'text'} placeholder="输入后按回车添加"
        onKeyDown={e => {
          if (e.key !== 'Enter') return
          const input = e.currentTarget
          const raw = input.value.trim()
          if (!raw) return
          const next = numeric ? Number(raw) : raw
          if (!numeric || Number.isFinite(next)) onChange([...values, next])
          input.value = ''
        }} className="field-input" />
    </Row>
  )
}

function isNumberType(type: string) {
  return /^(u?int|u?long|u?short|byte|sbyte|float|double|decimal)$/.test(type)
}

function enumLabel(enumName: string, name: string): string {
  const labels: Record<string, Record<string, string>> = {
    CompareType: { Equal: '等于', NotEqual: '不等于', Greater: '大于', GreaterEqual: '大于等于', Less: '小于', LessEqual: '小于等于' },
    SpellTargetType: { Target: '当前目标', Self: '自身', TargetTarget: '目标的目标', SpecifyTarget: '指定目标', Location: '地面位置', DynamicTarget: '动态目标', MapCenter: '地图中心' },
    ReceiveAbilityLimitType: { None: '无限制', TargetIsMe: '目标是自身', TargetIsOther: '目标是他人' },
    RotationType: { Face2Target: '面向目标', Back2Target: '背对目标', Custom: '自定义角度' },
    TargetType: { Self: '自身', Target: '当前目标', TargetTarget: '目标的目标', PartyMember: '队友', Enemy: '敌人' },
  }
  return labels[enumName]?.[name] || name
}

export function defaultSpellConfig() {
  return {
    Remark: '', Category: 0, SpellId: 0, CoolDowncheck: false, CoolDowncheck_time: 0,
    TargetType: 0, IsPartyMember: true, LimitJobType: 0, LimitBuffIds: [],
    LimitMaxHpType: 0, LimitHpType: 0, Location: { X: 0, Y: 0, Z: 0 },
    TargetSelector: { Enable: false, Target: 0, FilterDatas: [], NeedTargetable: false, SndFilter: 0, PMIndex: 0 },
    AutoCheckActionChange: true,
  }
}
