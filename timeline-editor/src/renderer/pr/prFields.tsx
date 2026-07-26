import { useEffect, useState } from 'react'
import { useStore } from '../store'

/** Labeled field row */
export function PrField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-0.5 flex items-baseline gap-1.5">
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

/**
 * Numeric input that keeps the raw text while typing.
 * A plain controlled number input eats intermediate states ("0." parses to 0,
 * which rewrites the field and makes decimals impossible to type).
 */
export function PrNumberInput({ value, onChange, step, integer, placeholder, className }: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  step?: number
  integer?: boolean
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const external = value === null || value === undefined ? '' : String(value)

  // Drop the draft when the value changes from elsewhere (undo, selection switch)
  useEffect(() => { setDraft(null) }, [external])

  const shown = draft ?? external

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={shown}
      step={step}
      placeholder={placeholder ?? '未设置'}
      onChange={e => {
        const raw = e.target.value
        if (!/^-?\d*\.?\d*$/.test(raw)) return  // reject non-numeric keystrokes
        setDraft(raw)
        if (raw === '' || raw === '-') { onChange(null); return }
        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
      onBlur={() => setDraft(null)}
      className={className ?? 'field-input'}
    />
  )
}

/** Spell name hint for an action id (uses the shared spell lookup) */
export function SpellNameHint({ actionId }: { actionId: number | string | null | undefined }) {
  const spellLookup = useStore(s => s.spellLookup)
  if (actionId === null || actionId === undefined || actionId === '' || Number(actionId) === 0) return null
  const info = spellLookup?.[String(actionId)]
  return (
    <div className={`text-[10px] mt-0.5 truncate ${info ? 'text-emerald-400/90' : 'text-gray-600'}`}>
      {info ? `✦ ${info.n}` : '未找到技能名称'}
    </div>
  )
}

/** key=value textarea for free-form dictionaries */
export function PrParamsTextarea({ params, onChange, rows }: {
  params: Record<string, string> | null | undefined
  onChange: (next: Record<string, string> | null) => void
  rows?: number
}) {
  return (
    <textarea
      value={Object.entries(params ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
      onChange={e => {
        const next: Record<string, string> = {}
        for (const line of e.target.value.split('\n')) {
          const idx = line.indexOf('=')
          if (idx > 0) next[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
        onChange(Object.keys(next).length ? next : null)
      }}
      className="field-input font-mono !text-[11px]"
      rows={rows ?? 2}
      placeholder="Key=Value"
    />
  )
}
