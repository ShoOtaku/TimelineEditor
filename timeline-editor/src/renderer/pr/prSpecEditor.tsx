// Spec-driven renderer for condition/action DTO fields.
// Reads/writes both plain DTO fields and Params.<key> dictionary entries.
import type { PtlAction, PtlCondition, PtlQtState } from '@shared/prTypes'
import type { PrFieldSpec, PrTypeSpec } from '@shared/prSpecs'
import { PrField, PrCheckbox, PrNumberInput, SpellNameHint } from './prFields'

type Dto = PtlAction | PtlCondition

// ---------- path get/set (supports `Params.<key>`) ----------

export function getPath(dto: Dto, path: string): unknown {
  if (path.startsWith('Params.')) {
    return (dto.Params as Record<string, string> | null | undefined)?.[path.slice(7)]
  }
  return dto[path]
}

export function setPath(dto: Dto, path: string, value: unknown): Dto {
  if (path.startsWith('Params.')) {
    const key = path.slice(7)
    const params = { ...(dto.Params ?? {}) }
    if (value === null || value === undefined || value === '') delete params[key]
    else params[key] = String(value)
    return { ...dto, Params: Object.keys(params).length ? params : null }
  }
  return { ...dto, [path]: value }
}

/** Params values are strings; C# bool.TryParse accepts "True"/"true" */
function readBool(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') return raw.toLowerCase() === 'true'
  return false
}

function readNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw !== '') {
    const n = parseFloat(raw)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function isParamsPath(path: string) { return path.startsWith('Params.') }

/** Apply a spec's declared defaults to a freshly created DTO */
export function applySpecDefaults<T extends Dto>(dto: T, spec: PrTypeSpec): T {
  let out = dto
  for (const f of spec.fields) {
    if (f.def === undefined) continue
    if (f.kind === 'position') {
      out = { ...out, PositionX: 0, PositionY: 0, PositionZ: 0 }
      continue
    }
    const value = f.kind === 'bool' && isParamsPath(f.path)
      ? (f.def ? 'True' : 'False')
      : f.def
    out = setPath(out, f.path, value) as T
  }
  if (spec.fields.some(f => f.kind === 'qtStates')) out = { ...out, QtStates: [] }
  return out
}

function shouldShow(dto: Dto, field: PrFieldSpec): boolean {
  if (!field.showWhen) return true
  const current = getPath(dto, field.showWhen.path)
  const spec = field.showWhen
  const fallback = spec.equals[0]
  const value = current === undefined || current === null || current === '' ? fallback : String(current)
  return spec.equals.includes(value)
}

// ---------- single field renderer ----------

function SpecField({ dto, field, onChange }: {
  dto: Dto
  field: PrFieldSpec
  onChange: (next: Dto) => void
}) {
  const write = (value: unknown) => onChange(setPath(dto, field.path, value))
  const raw = getPath(dto, field.path)

  switch (field.kind) {
    case 'bool': {
      const checked = readBool(raw)
      return (
        <PrCheckbox
          label={field.label}
          title={field.hint}
          checked={checked}
          onChange={v => write(isParamsPath(field.path) ? (v ? 'True' : 'False') : v)}
        />
      )
    }

    case 'position':
      return (
        <PrField label={field.label} hint={field.hint}>
          <div className="grid grid-cols-3 gap-1">
            {(['PositionX', 'PositionY', 'PositionZ'] as const).map((axis, i) => (
              <div key={axis}>
                <div className="text-[9px] text-gray-600 mb-0.5">{'XYZ'[i]}</div>
                <PrNumberInput
                  value={readNumber(dto[axis])}
                  onChange={v => onChange({ ...dto, [axis]: v })}
                />
              </div>
            ))}
          </div>
        </PrField>
      )

    case 'script':
      return (
        <PrField label={field.label} hint={field.hint ?? '在下方脚本面板可获得完整编辑器'}>
          <textarea
            value={(raw as string) ?? ''}
            onChange={e => write(e.target.value)}
            className="field-input font-mono !text-[11px]"
            rows={6}
            spellCheck={false}
          />
        </PrField>
      )

    case 'qtStates': {
      const states: PtlQtState[] = ((dto as PtlAction).QtStates ?? [])
      const setStates = (next: PtlQtState[]) => onChange({ ...dto, QtStates: next })
      return (
        <PrField label={`${field.label} (${states.length})`} hint="勾选=开启该QT">
          <div className="space-y-1">
            {states.map((q, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="checkbox" checked={q.Enabled}
                  onChange={e => setStates(states.map((s, si) => si === i ? { ...s, Enabled: e.target.checked } : s))}
                  className="rounded bg-gray-700 border-gray-600 flex-shrink-0"
                />
                <input
                  type="text" value={q.Name ?? ''}
                  onChange={e => setStates(states.map((s, si) => si === i ? { ...s, Name: e.target.value } : s))}
                  className="field-input !py-0.5 !text-[11px]"
                />
                <button
                  onClick={() => setStates(states.filter((_, si) => si !== i))}
                  className="px-1 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setStates([...states, { Name: '', Enabled: true }])}
              className="text-[11px] text-gray-400 hover:text-emerald-300"
            >
              ＋ 添加 QT
            </button>
          </div>
        </PrField>
      )
    }

    case 'enum':
    case 'compare':
    case 'target':
    case 'skillType': {
      const options = field.options ?? []
      const current = raw === null || raw === undefined ? '' : String(raw)
      const known = options.includes(current)
      return (
        <PrField label={field.label} hint={field.hint}>
          <select
            value={known ? current : (current === '' ? String(field.def ?? '') : '__other__')}
            onChange={e => { if (e.target.value !== '__other__') write(e.target.value) }}
            className="field-input"
          >
            {options.map(o => (
              <option key={o} value={o}>{field.optionLabels?.[o] ?? (o === '' ? '(空)' : o)}</option>
            ))}
            {!known && current !== '' && <option value="__other__">{current}（未识别）</option>}
          </select>
        </PrField>
      )
    }

    case 'actionId':
      return (
        <PrField label={field.label} hint={field.hint}>
          <PrNumberInput
            integer
            value={readNumber(raw)}
            onChange={v => write(isParamsPath(field.path) ? (v === null ? '' : String(v)) : v)}
          />
          <SpellNameHint actionId={readNumber(raw)} />
        </PrField>
      )

    case 'buffId':
    case 'dataId':
    case 'int':
      return (
        <PrField label={field.label} hint={field.hint}>
          <PrNumberInput
            integer
            value={readNumber(raw)}
            onChange={v => write(isParamsPath(field.path) ? (v === null ? '' : String(v)) : v)}
          />
        </PrField>
      )

    case 'float':
      return (
        <PrField label={field.label} hint={field.hint}>
          <PrNumberInput
            value={readNumber(raw)}
            onChange={v => write(isParamsPath(field.path) ? (v === null ? '' : String(v)) : v)}
          />
        </PrField>
      )

    case 'text':
    default:
      return (
        <PrField label={field.label} hint={field.hint}>
          <input
            type="text"
            value={(raw as string) ?? ''}
            onChange={e => write(e.target.value === '' && !isParamsPath(field.path) ? null : e.target.value)}
            className="field-input"
          />
        </PrField>
      )
  }
}

// ---------- whole-spec renderer ----------

export function SpecFields({ dto, spec, onChange }: {
  dto: Dto
  spec: PrTypeSpec
  onChange: (next: Dto) => void
}) {
  const visible = spec.fields.filter(f => shouldShow(dto, f))
  if (visible.length === 0) {
    return <div className="text-[11px] text-gray-600 italic">该类型无需参数</div>
  }
  return (
    <div className="space-y-2">
      {visible.map(f => (
        <SpecField key={f.path} dto={dto} field={f} onChange={onChange} />
      ))}
    </div>
  )
}
