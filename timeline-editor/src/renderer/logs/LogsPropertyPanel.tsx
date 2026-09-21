import { useEffect, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import type { LogsEvent, LogsSkillColumn } from './logsTypes'
import { columnMatchName, formatTimeMs, parseTimeInput } from './logsTypes'
import { useLogsStore } from './logsStore'
import { PrField, PrNumberInput } from '../pr/prFields'
import { SkillIconImg } from './logsIcon'
import { askConfirm } from '../store/dialogStore'

/** 时间输入：支持 m:ss / m:ss.s / 秒数，非编辑态显示格式化时间 */
function TimeInput({ valueMs, onChange, max }: { valueMs: number; onChange: (ms: number) => void; max?: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [valueMs])
  const valid = draft === null || parseTimeInput(draft) !== null
  return (
    <input
      type="text"
      value={draft ?? formatTimeMs(valueMs)}
      onChange={e => {
        setDraft(e.target.value)
        const ms = parseTimeInput(e.target.value)
        if (ms !== null) onChange(Math.max(0, max !== undefined ? Math.min(max, ms) : ms))
      }}
      onBlur={() => setDraft(null)}
      className={`field-input ${valid ? '' : '!border-red-500'}`}
      placeholder="m:ss 或秒"
    />
  )
}

function DocSettings() {
  const doc = useLogsStore(s => s.doc)!
  const updateDocMeta = useLogsStore(s => s.updateDocMeta)
  const applyImport = useLogsStore(s => s.applyImport)

  const skillUseCount = Object.values(doc.skillUses).reduce((n, list) => n + list.length, 0)

  const clearEvents = async () => {
    const ok = await askConfirm({
      title: '清空事件',
      message: `将删除全部 ${doc.events.length} 个事件（可通过 Ctrl+Z 撤销）。`,
      confirmLabel: '清空',
      danger: true
    })
    if (ok) applyImport({ events: [] }, 'replace')
  }
  const clearSkills = async () => {
    const ok = await askConfirm({
      title: '清空技能使用',
      message: `将删除全部 ${doc.gcds.length} 个 GCD 使用与 ${skillUseCount} 个能力技使用（可通过 Ctrl+Z 撤销）。`,
      confirmLabel: '清空',
      danger: true
    })
    if (ok) applyImport({ gcds: [], skillUses: {} }, 'replace')
  }

  return (
    <div className="space-y-3">
      <PrField label="时间轴名称">
        <input type="text" value={doc.name} className="field-input"
          onChange={e => updateDocMeta({ name: e.target.value }, 'meta:name')} />
      </PrField>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="总时长（秒）">
          <PrNumberInput value={doc.lengthMs / 1000}
            onChange={v => updateDocMeta({ lengthMs: Math.max(1000, Math.round((v ?? 600) * 1000)) }, 'meta:lengthMs')} />
        </PrField>
        <PrField label="GCD（秒）">
          <PrNumberInput value={doc.gcdDuration}
            onChange={v => updateDocMeta({ gcdDuration: Math.max(0.5, v ?? 2.5) }, 'meta:gcdDuration')} />
        </PrField>
      </div>
      <PrField label="时间轴提前量（秒）" hint="渲染时整体偏移">
        <PrNumberInput value={doc.offsetMs / 1000}
          onChange={v => updateDocMeta({ offsetMs: Math.round((v ?? 0) * 1000) }, 'meta:offsetMs')} />
      </PrField>

      <button onClick={() => document.dispatchEvent(new CustomEvent('logs:openFflogs'))}
        className="command-button w-full border-amber-700 bg-amber-900/60 text-amber-100 hover:bg-amber-800">
        <Download size={14} />FFLogs 导入
      </button>

      <div className="text-[10px] text-gray-500 border-t border-gray-700/60 pt-2">
        事件 {doc.events.length} · GCD {doc.gcds.length} · 技能使用 {skillUseCount} · 技能列 {doc.columns.length}
      </div>

      <div className="border-t border-gray-700/60 pt-2 space-y-1.5">
        <div className="text-[10px] text-red-400/80">危险区</div>
        <div className="flex gap-2">
          <button onClick={clearEvents} disabled={doc.events.length === 0}
            className="command-button flex-1 !h-7 text-red-300 border-red-900/60 hover:bg-red-950/40">
            清空事件
          </button>
          <button onClick={clearSkills} disabled={doc.gcds.length === 0 && skillUseCount === 0}
            className="command-button flex-1 !h-7 text-red-300 border-red-900/60 hover:bg-red-950/40">
            清空技能使用
          </button>
        </div>
      </div>
    </div>
  )
}

function EventEditor({ event }: { event: LogsEvent }) {
  const updateEvent = useLogsStore(s => s.updateEvent)
  const moveEvent = useLogsStore(s => s.moveEvent)
  const deleteEvent = useLogsStore(s => s.deleteEvent)
  const lengthMs = useLogsStore(s => s.doc!.lengthMs)

  return (
    <div className="space-y-3">
      <PrField label="时间" hint="m:ss 或秒">
        <TimeInput valueMs={event.timeMs} max={lengthMs}
          onChange={ms => moveEvent(event.id, ms, `prop:event:${event.id}`)} />
      </PrField>
      <PrField label="文本">
        <input type="text" value={event.text} className="field-input"
          onChange={e => updateEvent(event.id, { text: e.target.value }, `event:${event.id}:text`)} />
      </PrField>
      <PrField label="读条时长（秒）" hint="留空或 0 = 瞬发">
        <PrNumberInput value={event.durationMs === undefined ? undefined : event.durationMs / 1000}
          onChange={v => updateEvent(event.id, { durationMs: v ? Math.round(v * 1000) : undefined }, `event:${event.id}:durationMs`)} />
      </PrField>
      <PrField label="技能 ID" hint="FFLogs ability guid，可选">
        <PrNumberInput integer value={event.skillId}
          onChange={v => updateEvent(event.id, { skillId: v ?? undefined }, `event:${event.id}:skillId`)} />
      </PrField>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="伤害" hint="可选">
          <PrNumberInput value={event.dmg}
            onChange={v => updateEvent(event.id, { dmg: v ?? undefined }, `event:${event.id}:dmg`)} />
        </PrField>
        <PrField label="伤害类型">
          <select value={event.dmgType ?? ''} className="field-input"
            onChange={e => updateEvent(event.id, { dmgType: (e.target.value || undefined) as LogsEvent['dmgType'] })}>
            <option value="">未设置</option>
            <option value="normal">物理</option>
            <option value="magic">魔法</option>
            <option value="true">真实</option>
          </select>
        </PrField>
      </div>
      <button onClick={() => deleteEvent(event.id)}
        className="command-button w-full text-red-300 border-red-900/60 hover:bg-red-950/40">
        <Trash2 size={13} />删除事件
      </button>
    </div>
  )
}

function GcdUseEditor({ useId }: { useId: string }) {
  const doc = useLogsStore(s => s.doc)!
  const moveGcdUse = useLogsStore(s => s.moveGcdUse)
  const updateGcdUse = useLogsStore(s => s.updateGcdUse)
  const deleteGcdUse = useLogsStore(s => s.deleteGcdUse)
  const use = doc.gcds.find(g => g.id === useId)
  if (!use) return null
  return (
    <div className="space-y-3">
      <PrField label="时间" hint="m:ss 或秒">
        <TimeInput valueMs={use.timeMs} max={doc.lengthMs}
          onChange={ms => moveGcdUse(use.id, ms, `prop:gcd:${use.id}`)} />
      </PrField>
      <PrField label="技能">
        <input type="text" value={use.skill} readOnly className="field-input opacity-60" />
      </PrField>
      <PrField label="技能 ID" hint="可选">
        <PrNumberInput integer value={use.skillId}
          onChange={v => updateGcdUse(use.id, { skillId: v ?? undefined }, `gcd:${use.id}:skillId`)} />
      </PrField>
      <button onClick={() => deleteGcdUse(use.id)}
        className="command-button w-full text-red-300 border-red-900/60 hover:bg-red-950/40">
        <Trash2 size={13} />删除
      </button>
    </div>
  )
}

function SkillUseEditor({ columnId, useId }: { columnId: string; useId: string }) {
  const doc = useLogsStore(s => s.doc)!
  const moveSkillUse = useLogsStore(s => s.moveSkillUse)
  const deleteSkillUse = useLogsStore(s => s.deleteSkillUse)
  const col = doc.columns.find(c => c.id === columnId)
  const use = doc.skillUses[columnId]?.find(u => u.id === useId)
  if (!col || !use) return null
  return (
    <div className="space-y-3">
      <PrField label="时间" hint="m:ss 或秒">
        <TimeInput valueMs={use.timeMs} max={doc.lengthMs}
          onChange={ms => moveSkillUse(columnId, use.id, ms, `prop:use:${use.id}`)} />
      </PrField>
      <PrField label="技能">
        <input type="text" value={col.name} readOnly className="field-input opacity-60" />
      </PrField>
      <button onClick={() => deleteSkillUse(columnId, use.id)}
        className="command-button w-full text-red-300 border-red-900/60 hover:bg-red-950/40">
        <Trash2 size={13} />删除
      </button>
    </div>
  )
}

function ColumnEditor({ column }: { column: LogsSkillColumn }) {
  const updateColumn = useLogsStore(s => s.updateColumn)
  const removeColumn = useLogsStore(s => s.removeColumn)
  const uses = useLogsStore(s => s.doc!.skillUses[column.id]?.length ?? 0)

  const set = (patch: Partial<Omit<LogsSkillColumn, 'id' | 'kind'>>, field: string) =>
    updateColumn(column.id, patch, `col:${column.id}:${field}`)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1">
        <SkillIconImg src={column.icon} name={column.name} size={32} />
        <div className="text-[11px] text-gray-500">
          {column.kind === 'ability' ? `能力技列 · ${uses} 次使用` : 'GCD 跟踪'}
          {column.skillId !== undefined ? ` · ID ${column.skillId}` : ''}
        </div>
      </div>
      <PrField label="显示名">
        <input type="text" value={column.name} className="field-input"
          onChange={e => set({ name: e.target.value }, 'name')} />
      </PrField>
      <PrField label="日志匹配名" hint="留空 = 同显示名；FFLogs 导入时按此匹配">
        <input type="text" value={column.matchName ?? ''} placeholder={column.name} className="field-input"
          onChange={e => set({ matchName: e.target.value || undefined }, 'matchName')} />
      </PrField>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="CD（秒）" hint="灰色区域">
          <PrNumberInput value={column.cd} onChange={v => set({ cd: v ?? undefined }, 'cd')} />
        </PrField>
        <PrField label="持续（秒）" hint="绿色区域">
          <PrNumberInput value={column.duration} onChange={v => set({ duration: v ?? undefined }, 'duration')} />
        </PrField>
      </div>
      <PrField label="图标 URL" hint="留空 = 技能库查找">
        <input type="text" value={column.icon ?? ''} className="field-input" placeholder="https://…"
          onChange={e => set({ icon: e.target.value || undefined }, 'icon')} />
      </PrField>
      <PrField label="技能 ID" hint="展示用；技能库/FFLogs 导入自动填充，留空 = 未设置">
        <PrNumberInput integer value={column.skillId} onChange={v => set({ skillId: v ?? undefined }, 'skillId')} />
      </PrField>
      {column.intro && (
        <div className="text-[10px] text-gray-500 leading-4 border-t border-gray-700/60 pt-2">{column.intro}</div>
      )}
      <button onClick={() => removeColumn(column.id)}
        className="command-button w-full text-red-300 border-red-900/60 hover:bg-red-950/40">
        <Trash2 size={13} />删除列{column.kind === 'ability' && uses > 0 ? `（连带 ${uses} 次使用）` : ''}
      </button>
    </div>
  )
}

const KIND_LABELS = {
  event: '事件',
  gcd: 'GCD 使用',
  skillUse: '技能使用',
  column: '技能列'
} as const

/** 右侧上下文属性面板 */
export function LogsPropertyPanel() {
  const doc = useLogsStore(s => s.doc)
  const selection = useLogsStore(s => s.selection)
  const select = useLogsStore(s => s.select)

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center bg-gray-800">
        <div>
          <div className="text-4xl mb-2">📜</div>
          <div>未打开战斗日志时间轴</div>
        </div>
      </div>
    )
  }

  let title = '文档设置'
  let subtitle = doc.name
  let body: React.ReactNode = <DocSettings />

  if (selection?.kind === 'event') {
    const event = doc.events.find(e => e.id === selection.id)
    if (event) {
      title = event.text || '(空事件)'
      subtitle = `事件 · ${formatTimeMs(event.timeMs)}${event.skillId !== undefined ? ` · ID ${event.skillId}` : ''}`
      body = <EventEditor event={event} />
    }
  } else if (selection?.kind === 'gcd') {
    const use = doc.gcds.find(g => g.id === selection.id)
    if (use) {
      title = use.skill
      subtitle = `GCD 使用 · ${formatTimeMs(use.timeMs)}${use.skillId !== undefined ? ` · ID ${use.skillId}` : ''}`
      body = <GcdUseEditor useId={use.id} />
    }
  } else if (selection?.kind === 'skillUse') {
    const col = doc.columns.find(c => c.id === selection.columnId)
    const use = doc.skillUses[selection.columnId]?.find(u => u.id === selection.id)
    if (col && use) {
      title = col.name
      subtitle = `技能使用 · ${formatTimeMs(use.timeMs)}${col.skillId !== undefined ? ` · ID ${col.skillId}` : ''}`
      body = <SkillUseEditor columnId={col.id} useId={use.id} />
    }
  } else if (selection?.kind === 'column') {
    const col = doc.columns.find(c => c.id === selection.id)
    if (col) {
      title = col.name
      subtitle = `${KIND_LABELS.column} · 匹配「${columnMatchName(col)}」`
      body = <ColumnEditor column={col} />
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-200 truncate">{title}</div>
          <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>
        </div>
        {selection && (
          <button onClick={() => select(null)}
            className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex-shrink-0"
            title="返回文档设置">
            ℹ 文档
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {body}
      </div>
    </div>
  )
}
