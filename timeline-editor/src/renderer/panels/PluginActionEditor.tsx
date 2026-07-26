import { useCallback } from 'react'
import type { AcrTypeDef } from '@shared/types'
import { getSemanticField } from './semanticFields'

/** Editor for ACR/plugin actions — recognizes common QT container shapes. */
export function PluginActionEditor({ action, onChange, acrDef }: {
  action: any
  onChange: (changes: any) => void
  acrDef?: AcrTypeDef | null
}) {
  const change = useCallback((key: string, value: any) => onChange({ [key]: value }), [onChange])
  const hasQtValues = action.qtValues && typeof action.qtValues === 'object'
  const hasQTList = action.QTList && Array.isArray(action.QTList)
  const hasKeyValue = typeof action.Key === 'string' && 'Value' in action
  const hasQtStates = action.QtStates && typeof action.QtStates === 'object'

  if (!hasQtValues && !hasQTList && !hasKeyValue && !hasQtStates && acrDef) {
    return (
      <>
        {acrDef.fields.map(field => {
          const value = action[field.key]
          const semantic = getSemanticField(field.key, field.type)
          const effectiveType = semantic?.overrideType || field.type
          const label = semantic?.label || field.key
          const hasEnum = field.enumValues && field.enumValues.length > 0

          return (
            <FieldRow key={field.key} label={label}>
              {effectiveType === 'select' && semantic?.options ? (
                <select value={value ?? ''} onChange={e => {
                  const option = semantic.options!.find(o => String(o.value) === e.target.value)
                  change(field.key, option && typeof option.value === 'number' ? Number(e.target.value) : e.target.value)
                }} className="field-input">
                  {semantic.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                </select>
              ) : hasEnum ? (
                <select value={value ?? field.enumValues![0].value}
                  onChange={e => change(field.key, Number(e.target.value))} className="field-input">
                  {field.enumValues!.map(v => <option key={v.value} value={v.value}>{v.name} ({v.value})</option>)}
                </select>
              ) : effectiveType === 'boolean' ? (
                <Checkbox checked={!!value} onChange={v => change(field.key, v)} />
              ) : effectiveType === 'number' ? (
                <input type="number" value={value ?? 0}
                  onChange={e => change(field.key, parseFloat(e.target.value) || 0)} className="field-input" />
              ) : effectiveType === 'object' ? (
                <textarea value={JSON.stringify(value ?? {}, null, 2)} onChange={e => {
                  try { change(field.key, JSON.parse(e.target.value)) } catch { /* keep typing */ }
                }} className="field-input h-20 font-mono text-[10px]" />
              ) : (
                <input type="text" value={value ?? ''} onChange={e => change(field.key, e.target.value)} className="field-input" />
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
        {entries.map(([key, value]) => (
          <ToggleRow key={key} label={key} checked={!!value}
            onChange={v => change('qtValues', { ...action.qtValues, [key]: v })} />
        ))}
        {entries.length === 0 && <div className="text-[11px] text-gray-500 italic mb-1">暂无可选项（从现有时间轴自动填充）</div>}
        <AddTextInput placeholder="手动添加开关名称..." onAdd={key => {
          if (!(key in action.qtValues)) change('qtValues', { ...action.qtValues, [key]: true })
        }} />
      </FieldRow>
    )
  }

  if (hasQTList) {
    return (
      <FieldRow label="QT 列表">
        {action.QTList.map((item: any, index: number) => (
          <ToggleRow key={index} label={item.Key} checked={!!item.Value}
            onChange={value => change('QTList', action.QTList.map((x: any, i: number) => i === index ? { ...x, Value: value } : x))} />
        ))}
      </FieldRow>
    )
  }

  if (hasKeyValue) {
    return <FieldRow label={action.Key || '设置'}><Checkbox checked={!!action.Value} onChange={v => change('Value', v)} label={action.Key} /></FieldRow>
  }

  if (hasQtStates) {
    return (
      <FieldRow label="快捷 QT 状态">
        {Object.entries(action.QtStates).map(([key, value]) => (
          <ToggleRow key={key} label={key} checked={!!value}
            onChange={v => change('QtStates', { ...action.QtStates, [key]: v })} />
        ))}
      </FieldRow>
    )
  }

  const ignored = ['$type', 'DisplayName', 'Remark', 'qtValues', 'QTList', 'Key', 'Value', 'QtStates']
  const primitiveKeys = Object.keys(action).filter(key => !ignored.includes(key) && typeof action[key] !== 'object')

  return (
    <>
      {primitiveKeys.map(key => (
        <FieldRow key={key} label={key}>
          {typeof action[key] === 'boolean'
            ? <Checkbox checked={!!action[key]} onChange={v => change(key, v)} />
            : <input type="text" value={String(action[key] ?? '')} onChange={e => change(key, e.target.value)} className="field-input" />}
        </FieldRow>
      ))}
      {primitiveKeys.length === 0 && (
        <FieldRow label="原始 JSON">
          <textarea value={JSON.stringify(action, (key, value) => ['$type', 'DisplayName'].includes(key) ? undefined : value, 2)}
            onChange={e => { try { onChange(JSON.parse(e.target.value)) } catch { /* keep typing */ } }}
            className="field-input h-24 font-mono text-[10px]" />
        </FieldRow>
      )}
    </>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-1.5"><div className="text-[9px] font-medium text-gray-500 mb-0.5">{label}</div>{children}</div>
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
      {label && <span className="text-[11px] text-gray-400">{label}</span>}
    </label>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between py-0.5"><span className="text-[11px] text-gray-400">{label}</span><Checkbox checked={checked} onChange={onChange} /></div>
}

function AddTextInput({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  return <input type="text" placeholder={placeholder} className="field-input mt-1 text-[11px]"
    onKeyDown={e => {
      if (e.key !== 'Enter') return
      const value = e.currentTarget.value.trim()
      if (value) onAdd(value)
      e.currentTarget.value = ''
    }} />
}
