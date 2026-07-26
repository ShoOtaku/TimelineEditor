import { useCallback } from 'react'
import { useStore } from '../store'
import { AeAssistFieldEditor } from './AeAssistFieldEditor'
import { PluginActionEditor } from './PluginActionEditor'
import { findAeActionSpec } from '@shared/aeAssistSpecs'

export function ActionEditor({ action, onChange, onDelete }: {
  action: any
  onChange: (changes: any) => void
  onDelete: () => void
}) {
  const acrActionTypes = useStore(s => s.acrActionTypes)
  const builtinSpec = findAeActionSpec(action.$type)
  const acrDef = !builtinSpec ? acrActionTypes.find(t => t.$type === action.$type) : null
  const title = builtinSpec?.label || builtinSpec?.displayName || action.DisplayName || shortName(action.$type)

  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/50 p-2 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-gray-300 flex-1">{title}</span>
        {builtinSpec?.category && <span className="text-[9px] text-gray-600 truncate">{builtinSpec.category}</span>}
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-300 px-1">✕</button>
      </div>

      <FieldRow label="备注">
        <input type="text" value={action.Remark || ''}
          onChange={e => handleFieldChange('Remark', e.target.value)}
          className="field-input" placeholder="可选备注..." />
      </FieldRow>

      {/* Built-in AEAssist action: exact members extracted from AEAssist.dll */}
      {builtinSpec?.fields.map(field => (
        <AeAssistFieldEditor key={field.name} owner={action} field={field} onChange={handleFieldChange} />
      ))}

      {/* ACR/plugin action — preserves specialized QT editors */}
      {!builtinSpec && <PluginActionEditor action={action} onChange={onChange} acrDef={acrDef} />}
    </div>
  )
}

function shortName(type: string): string {
  return type?.split(',')[0].split('.').pop() || type || '未知动作'
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-1.5"><div className="text-[9px] font-medium text-gray-500 mb-0.5">{label}</div>{children}</div>
}
