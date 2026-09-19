// Spec-driven renderer for condition/action DTO fields.
// Reads/writes both plain DTO fields and Params.<key> dictionary entries.
import type { PtlAction, PtlCondition, PtlQtState, PtlSkillGroupEntry } from '@shared/prTypes'
import { PR_SKILL_TYPES, PR_SKILL_TYPE_LABELS, PR_TARGET_TYPES, PR_TARGET_TYPE_LABELS } from '@shared/prTypes'
import type { PrFieldSpec, PrTypeSpec } from '@shared/prSpecs'
import { PrField, PrCheckbox, PrNumberInput, SpellNameHint } from './prFields'
import { useStore } from '../store'

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
  if (spec.fields.some(f => f.kind === 'skillRows')) out = { ...out, Skills: [createSkillGroupRow()] }
  return out
}

/** Plugin default row (NodeEditorDefaults.CreateSkillGroupEntry): 0 / Gcd / Target */
function createSkillGroupRow(): PtlSkillGroupEntry {
  return { ActionId: 0, SkillType: 'Gcd', Target: 'Target' }
}

/**
 * Best-effort Gcd/OffGcd derivation from the exported Action table
 * (t: 0=魔法 2=战技 → Gcd, 1=能力 → OffGcd) — mirrors the in-game editor's
 * Auto mode. Returns null when the id is unknown, leaving the row untouched.
 */
function deriveSkillType(actionId: number | null, lookup: Record<string, { t: number }> | null): string | null {
  if (actionId === null || !lookup) return null
  const t = lookup[String(actionId)]?.t
  if (t === 0 || t === 2) return 'Gcd'
  if (t === 1) return 'OffGcd'
  return null
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

    case 'skillRows':
      return <SkillRowsField dto={dto as PtlAction} field={field} onChange={onChange} />

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

// ---------- skill group rows (EnqueueSkillGroup) ----------

function SkillRowSelect({ value, options, labels, onChange }: {
  value: string
  options: readonly string[]
  labels: Record<string, string>
  onChange: (v: string) => void
}) {
  const known = options.includes(value)
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="field-input !py-0.5 !text-[11px] min-w-0"
    >
      {options.map(o => <option key={o} value={o}>{labels[o] ?? o}</option>)}
      {!known && <option value={value}>{value || '(未设置)'}（未识别）</option>}
    </select>
  )
}

/** Rows editor for ActionDto.Skills — mirrors the plugin's DrawEnqueueSkillGroup */
function SkillRowsField({ dto, field, onChange }: {
  dto: PtlAction
  field: PrFieldSpec
  onChange: (next: Dto) => void
}) {
  const spellLookup = useStore(s => s.spellLookup)
  const rows = dto.Skills ?? []
  const setRows = (next: PtlSkillGroupEntry[]) => onChange({ ...dto, Skills: next })

  const setRow = (i: number, changes: Partial<PtlSkillGroupEntry>) =>
    setRows(rows.map((r, ri) => ri === i ? { ...r, ...changes } : r))

  const onIdChange = (i: number, id: number | null) => {
    const row = rows[i]
    if (!row) return
    const next: PtlSkillGroupEntry = { ...row, ActionId: id }
    // 与游戏内编辑器的 Auto 一致：按技能表自动带出 GCD/能力技，用户仍可手动改
    const derived = deriveSkillType(id, spellLookup)
    if (derived) next.SkillType = derived
    setRows(rows.map((r, ri) => ri === i ? next : r))
  }

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
  }

  return (
    <PrField label={`${field.label} (${rows.length})`} hint={field.hint ?? '从上到下依次执行'}>
      <div className="space-y-1.5">
        {rows.map((row, i) => {
          if (!row) {
            return (
              <div key={i} className="flex items-center gap-1 text-[11px] text-red-400/90">
                <span className="flex-1">第 {i + 1} 行为空，请删除后重新添加</span>
                <button
                  onClick={() => setRows(rows.filter((_, ri) => ri !== i))}
                  className="px-1 text-red-500/70 hover:text-red-400" title="删除空行"
                >
                  ✕
                </button>
              </div>
            )
          }
          const id = typeof row.ActionId === 'number' ? row.ActionId : null
          const name = id ? spellLookup?.[String(id)]?.n : undefined
          return (
            <div key={i} className="rounded border border-gray-700/60 p-1 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500 w-3 flex-shrink-0">{i + 1}</span>
                <div className="w-[76px] flex-shrink-0">
                  <PrNumberInput integer value={id} onChange={v => onIdChange(i, v)} placeholder="技能ID" />
                </div>
                <span className={`text-[10px] truncate flex-1 ${name ? 'text-emerald-400/90' : 'text-gray-600'}`}>
                  {id ? (name ? `✦ ${name}` : '未找到技能') : '未设置'}
                </span>
                <button onClick={() => moveRow(i, -1)} disabled={i === 0}
                  className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200 disabled:opacity-30" title="上移">↑</button>
                <button onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}
                  className="px-0.5 text-[11px] text-gray-500 hover:text-gray-200 disabled:opacity-30" title="下移">↓</button>
                <button onClick={() => setRows(rows.filter((_, ri) => ri !== i))}
                  className="px-1 text-[11px] text-red-500/70 hover:text-red-400" title="移除">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <SkillRowSelect
                  value={row.SkillType ?? 'Gcd'}
                  options={PR_SKILL_TYPES}
                  labels={PR_SKILL_TYPE_LABELS}
                  onChange={v => setRow(i, { SkillType: v })}
                />
                <SkillRowSelect
                  value={row.Target ?? 'Target'}
                  options={PR_TARGET_TYPES}
                  labels={PR_TARGET_TYPE_LABELS}
                  onChange={v => setRow(i, { Target: v })}
                />
              </div>
            </div>
          )
        })}
        <button
          onClick={() => setRows([...rows, createSkillGroupRow()])}
          className="text-[11px] text-gray-400 hover:text-emerald-300"
        >
          ＋ 添加技能
        </button>
      </div>
    </PrField>
  )
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
