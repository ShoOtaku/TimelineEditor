// 导入向导共享组件：步骤条 / 开关 / 进度条 / 映射步骤
// 映射步骤消费 parseFflogsFight 的产出，FFLogs 与 ACT 导入向导共用

import { useMemo } from 'react'
import type { LogsSkillColumn } from './logsTypes'
import { columnMatchName, formatTimeMs } from './logsTypes'
import type { ParsedFflogsData } from './fflogsImport'

export function Stepper({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-700 px-5 py-3">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold flex-shrink-0
              ${current ? 'border-amber-600 bg-amber-900/70 text-amber-200'
                : done ? 'border-emerald-700 bg-emerald-900/60 text-emerald-300'
                  : 'border-gray-700 bg-gray-800 text-gray-500'}`}>
              {done ? '✓' : n}
            </div>
            <span className={`text-xs flex-shrink-0 ${current ? 'text-amber-200 font-semibold' : done ? 'text-emerald-300/80' : 'text-gray-500'}`}>
              {label}
            </span>
            {n < steps.length && <div className={`h-px flex-1 ${n < step ? 'bg-emerald-800' : 'bg-gray-700'}`} />}
          </div>
        )
      })}
    </div>
  )
}

export function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-2 text-xs text-gray-300 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-amber-500" />
      {label}
    </label>
  )
}

export function ProgressBar({ label, percent, detail }: {
  label: string; percent: number; detail: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-gray-400">
        <span>{label}</span>
        <span>{Math.round(percent)}% · {detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-gray-800">
        <div className="h-full rounded bg-amber-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function MappingStep(props: {
  parsed: ParsedFflogsData
  columns: LogsSkillColumn[]
  fightDurationMs: number
  wantEvents: boolean; wantAbilities: boolean; wantGcds: boolean
  eventSourceIds: number[]; setEventSourceIds: (v: number[]) => void
  abilitySource: Record<string, number | null>; setAbilitySource: (v: Record<string, number | null>) => void
  gcdSource: Record<string, number | null>; setGcdSource: (v: Record<string, number | null>) => void
  mode: 'replace' | 'merge'; setMode: (v: 'replace' | 'merge') => void
}) {
  const { parsed, columns } = props
  const playerName = useMemo(() => {
    const map = new Map(parsed.players.map(p => [p.id, p]))
    return (id: number) => map.get(id)
  }, [parsed])

  const abilityCols = columns.filter(c => c.kind === 'ability')
  const gcdCols = columns.filter(c => c.kind === 'gcd')
  const totalEvents = Object.values(parsed.eventsBySource).reduce((n, list) => n + list.length, 0)

  const toggleSource = (id: number) => {
    props.setEventSourceIds(props.eventSourceIds.includes(id)
      ? props.eventSourceIds.filter(x => x !== id)
      : [...props.eventSourceIds, id])
  }

  const sourceSelect = (
    perPlayer: Record<number, number[]> | undefined,
    value: number | null,
    onChange: (v: number | null) => void
  ) => {
    const options = Object.entries(perPlayer ?? {})
      .map(([id, times]) => ({ id: Number(id), count: times.length }))
      .filter(o => o.count > 0 && playerName(o.id))
      .sort((a, b) => b.count - a.count)
    return (
      <select value={String(value ?? -1)} className="field-input !py-0.5 !w-52"
        onChange={e => onChange(e.target.value === '-1' ? null : Number(e.target.value))}>
        <option value={-1}>不导入</option>
        {options.map(o => {
          const p = playerName(o.id)!
          return <option key={o.id} value={o.id}>{p.name} - {p.job}（{o.count} 次）</option>
        })}
        {options.length === 0 && <option disabled>（无记录）</option>}
      </select>
    )
  }

  return (
    <div className="space-y-4 max-h-[420px] overflow-auto pr-1">
      <div className="text-[11px] text-gray-500">
        战斗时长 {formatTimeMs(props.fightDurationMs)} · 解析到 {totalEvents} 个敌方事件
      </div>

      {props.wantEvents && (
        <section>
          <div className="mb-1.5 text-[11px] font-semibold text-gray-400">事件来源（勾选导入其读条事件）</div>
          <div className="flex flex-wrap gap-1.5">
            {[...parsed.bosses.map(b => ({ ...b, tag: 'BOSS' })), ...parsed.npcs.map(n => ({ ...n, tag: 'NPC' }))].map(src => {
              const checked = props.eventSourceIds.includes(src.id)
              const count = parsed.eventsBySource[src.id]?.length ?? 0
              return (
                <label key={src.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[12px] transition-colors
                    ${checked ? 'border-amber-600/70 bg-amber-950/30 text-amber-100' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSource(src.id)}
                    className="h-3.5 w-3.5 accent-amber-500" />
                  {src.name}
                  <span className="text-[10px] text-gray-500">{src.tag} · {count}</span>
                </label>
              )
            })}
            {parsed.bosses.length + parsed.npcs.length === 0 && (
              <span className="text-[11px] text-gray-600 italic">该战斗没有敌方单位事件</span>
            )}
          </div>
        </section>
      )}

      {props.wantAbilities && (
        <section>
          <div className="mb-1.5 text-[11px] font-semibold text-gray-400">能力技来源（每列选择数据来源玩家）</div>
          {abilityCols.length === 0 && (
            <div className="text-[11px] text-gray-600 italic">当前文档没有能力技列 — 可先在「技能」页添加，导入后重新执行</div>
          )}
          <div className="space-y-1">
            {abilityCols.map(col => (
              <div key={col.id} className="flex items-center gap-3">
                <span className="w-28 truncate text-[12px] text-gray-300" title={columnMatchName(col)}>{col.name}</span>
                {sourceSelect(parsed.abilityCasts[columnMatchName(col)], props.abilitySource[col.id] ?? null,
                  v => props.setAbilitySource({ ...props.abilitySource, [col.id]: v }))}
              </div>
            ))}
          </div>
        </section>
      )}

      {props.wantGcds && (
        <section>
          <div className="mb-1.5 text-[11px] font-semibold text-gray-400">GCD 来源</div>
          {gcdCols.length === 0 && (
            <div className="text-[11px] text-gray-600 italic">当前文档没有 GCD 跟踪技能</div>
          )}
          <div className="space-y-1">
            {gcdCols.map(col => {
              const key = columnMatchName(col)
              return (
                <div key={col.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-[12px] text-gray-300" title={key}>{col.name}</span>
                  {sourceSelect(parsed.gcdCasts[key], props.gcdSource[key] ?? null,
                    v => props.setGcdSource({ ...props.gcdSource, [key]: v }))}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-1.5 text-[11px] font-semibold text-gray-400">导入模式</div>
        <div className="flex gap-4">
          {([['replace', '替换当前内容'], ['merge', '追加合并（按时间去重）']] as const).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
              <input type="radio" name="logs-import-mode" checked={props.mode === value}
                onChange={() => props.setMode(value)} className="h-3.5 w-3.5 accent-amber-500" />
              {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
