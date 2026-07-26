import { useCallback } from 'react'
import { useStore } from '../store'
import { getSemanticField } from './semanticFields'
import { AeAssistFieldEditor } from './AeAssistFieldEditor'
import { findAeConditionSpec } from '@shared/aeAssistSpecs'

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
  const builtinSpec = findAeConditionSpec(condition.$type)
  const acrDef = !builtinSpec ? acrConditionTypes.find(t => t.$type === condition.$type) : null
  const displayName = builtinSpec?.label || builtinSpec?.displayName || condition.DisplayName || shortName(condition.$type)

  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/50 p-2 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-gray-300 flex-1">{displayName}</span>
        {builtinSpec?.category && <span className="text-[9px] text-gray-600 truncate">{builtinSpec.category}</span>}
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
      </div>

      <FieldRow label="备注">
        <input type="text" value={condition.Remark || ''}
          onChange={e => handleFieldChange('Remark', e.target.value)}
          className="field-input" placeholder="可选备注..." />
      </FieldRow>

      {/* Built-in AEAssist type: exact members extracted from AEAssist.dll */}
      {builtinSpec?.fields.map(field => (
        <AeAssistFieldEditor key={field.name} owner={condition} field={field} onChange={handleFieldChange} />
      ))}

      {/* ACR type: field metadata discovered from its DLL / timeline samples */}
      {acrDef?.fields.map(field => {
        const value = condition[field.key]
        const semantic = getSemanticField(field.key, field.type)
        const effectiveType = semantic?.overrideType || field.type
        const label = semantic?.label || field.key
        const hasEnum = field.enumValues && field.enumValues.length > 0

        return (
          <FieldRow key={field.key} label={label}>
            {effectiveType === 'select' && semantic?.options ? (
              <select value={value ?? ''} onChange={e => {
                const option = semantic.options!.find(o => String(o.value) === e.target.value)
                handleFieldChange(field.key, option && typeof option.value === 'number' ? Number(e.target.value) : e.target.value)
              }} className="field-input">
                {semantic.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
              </select>
            ) : hasEnum ? (
              <select value={value ?? field.enumValues![0].value}
                onChange={e => handleFieldChange(field.key, Number(e.target.value))} className="field-input">
                {field.enumValues!.map(e => <option key={e.value} value={e.value}>{e.name} ({e.value})</option>)}
              </select>
            ) : effectiveType === 'boolean' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!value} onChange={e => handleFieldChange(field.key, e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-[11px] text-gray-400">{value ? '开启' : '关闭'}</span>
              </label>
            ) : effectiveType === 'number' ? (
              <input type="number" value={value ?? 0}
                onChange={e => handleFieldChange(field.key, parseFloat(e.target.value) || 0)} className="field-input" />
            ) : effectiveType === 'object' ? (
              <textarea value={JSON.stringify(value ?? {}, null, 2)} onChange={e => {
                try { handleFieldChange(field.key, JSON.parse(e.target.value)) } catch { /* keep typing */ }
              }} className="field-input h-20 font-mono text-[10px]" />
            ) : (
              <input type="text" value={value ?? ''}
                onChange={e => handleFieldChange(field.key, e.target.value)} className="field-input" />
            )}
          </FieldRow>
        )
      })}

      {!builtinSpec && !acrDef && (
        <FieldRow label="原始 JSON（未识别类型）">
          <textarea
            value={JSON.stringify(condition, (key, val) => key === '$type' || key === 'DisplayName' ? undefined : val, 2)}
            onChange={e => {
              try { onChange(JSON.parse(e.target.value)) } catch { /* keep typing */ }
            }}
            className="field-input h-24 font-mono text-[10px]"
          />
        </FieldRow>
      )}
    </div>
  )
}

function shortName(type: string): string {
  return type?.split(',')[0].split('.').pop() || type || '未知条件'
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-1.5"><div className="text-[9px] font-medium text-gray-500 mb-0.5">{label}</div>{children}</div>
}
