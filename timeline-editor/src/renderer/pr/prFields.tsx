import { useStore } from '../store'

/** Labeled field row (matches PropertyPanel styling) */
export function PrField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-0.5 flex items-center gap-1.5">
        <span>{label}</span>
        {hint && <span className="text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function PrCheckbox({ label, checked, onChange, title }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; title?: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded bg-gray-700 border-gray-600"
      />
      <span className="text-[12px] text-gray-300">{label}</span>
    </label>
  )
}

/** Number input writing null when cleared */
export function PrNullableNumber({ value, onChange, step, placeholder }: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  step?: number
  placeholder?: string
}) {
  return (
    <input
      type="number"
      step={step ?? 0.1}
      value={value ?? ''}
      placeholder={placeholder ?? '未设置'}
      onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      className="field-input"
    />
  )
}

/** Spell name hint for an action id (uses the shared spell lookup from the AE store) */
export function SpellNameHint({ actionId }: { actionId: number | string | null | undefined }) {
  const spellLookup = useStore(s => s.spellLookup)
  if (actionId === null || actionId === undefined || actionId === '' || actionId === 0) return null
  const info = spellLookup?.[String(actionId)]
  return (
    <div className={`text-[10px] mt-0.5 ${info ? 'text-emerald-400/90' : 'text-gray-600'}`}>
      {info ? `✦ ${info.n}` : '未找到技能名称'}
    </div>
  )
}
