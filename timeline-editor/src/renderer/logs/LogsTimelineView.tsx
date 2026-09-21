import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import type { LogsEvent, LogsGcdUse, LogsSkillColumn, LogsSkillUse } from './logsTypes'
import { columnMatchName, formatTimeMs } from './logsTypes'
import type { LogsSelection } from './logsStore'
import { LOGS_DEFAULT_ZOOM, useAbilityColumns, useGcdTracks, useLogsStore } from './logsStore'
import { lookupSkill, useJobSkillDb } from './skillDb'
import { packEventTracks } from './eventTracks'
import type { EventTrackLayout } from './eventTracks'
import { askPrompt, isDialogOpen } from '../store/dialogStore'

const RULER_W = 64
const TRACK_W = 68
const GCD_W = 56
const COL_W = 56
const HEADER_H = 44
const ICON = 20
const CD_W = 24
const BOTTOM_PAD = 80

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

function tickStepSec(pps: number): number {
  for (const s of TICK_STEPS) if (s * pps >= 48) return s
  return TICK_STEPS[TICK_STEPS.length - 1]
}

const clampMs = (ms: number, lengthMs: number) => Math.max(0, Math.min(lengthMs, ms))

/** 图标，加载失败回退为首字符占位块 */
function SkillIcon({ src, name, x, y, size = ICON }: {
  src?: string; name: string; x: number; y: number; size?: number
}) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <g>
        <rect x={x} y={y} width={size} height={size} rx={3} fill="#374151" stroke="#4b5563" strokeWidth={1} />
        <text x={x + size / 2} y={y + size / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.55} fill="#d1d5db">{name.charAt(0) || '?'}</text>
      </g>
    )
  }
  return <image href={src} x={x} y={y} width={size} height={size} onError={() => setErr(true)} />
}

interface ItemDragProps {
  yOf: (ms: number) => number
  selectedId: string | null
  onItemDown: (e: React.MouseEvent, sel: LogsSelection, move: (ms: number, tag: string) => void) => void
}

const EventsLayer = memo(function EventsLayer({ events, tracks, x, pps, svgH, yOf, selectedId, onItemDown, moveEvent }: {
  events: LogsEvent[]; tracks: EventTrackLayout; x: number; pps: number; svgH: number
} & ItemDragProps & { moveEvent: (id: string, ms: number, tag?: string) => void }) {
  return (
    <g>
      <defs>
        {Array.from({ length: tracks.trackCount }, (_, t) => (
          <clipPath key={t} id={`logs-ev-clip-${t}`}>
            <rect x={x + t * TRACK_W} y={0} width={TRACK_W} height={svgH} />
          </clipPath>
        ))}
      </defs>
      {events.map(ev => {
        const y = yOf(ev.timeMs)
        if (y < -20) return null
        const track = tracks.trackIndex.get(ev.id) ?? 0
        const tx = x + track * TRACK_W
        const selected = selectedId === ev.id
        const dur = ev.durationMs
        const castH = dur !== undefined ? Math.max(4, dur / 1000 * pps) : 0
        const label = ev.skillName ?? ev.text
        return (
          <g key={ev.id} className="cursor-grab"
            onMouseDown={e => onItemDown(e, { kind: 'event', id: ev.id }, (ms, tag) => moveEvent(ev.id, ms, tag))}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}>
            <title>{ev.text}{ev.skillId !== undefined ? ` · ID ${ev.skillId}` : ''}{dur !== undefined ? ` · 读条 ${(dur / 1000).toFixed(1)}s` : ' · 瞬发'}{ev.dmg !== undefined ? ` · ${ev.dmg}` : ''}</title>
            {dur !== undefined
              ? <rect x={tx + 2} y={y + 10} width={22} height={castH}
                  fill="#f59e0b" opacity={0.22} stroke="#f59e0b" strokeOpacity={0.55} strokeWidth={1} />
              : <line x1={tx + 16} y1={y + 17} x2={tx + 16} y2={y + 25}
                  stroke="#cbd5e1" strokeWidth={2.5} strokeLinecap="round" />}
            {selected && <rect x={tx} y={y - 13} width={26} height={26} rx={4}
              fill="none" stroke="#fbbf24" strokeWidth={1.5} />}
            <SkillIcon src={ev.icon} name={label} x={tx + 3} y={y - 10} />
            <text x={tx + 27} y={y + 4} fontSize={11} clipPath={`url(#logs-ev-clip-${track})`}
              fill={selected ? '#fcd34d' : '#94a3b8'} className="select-none">
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
})

const GcdLayer = memo(function GcdLayer({ gcds, x, icons, yOf, selectedId, onItemDown, moveGcdUse }: {
  gcds: LogsGcdUse[]; x: number; icons: Map<string, string | undefined>
} & ItemDragProps & { moveGcdUse: (id: string, ms: number, tag?: string) => void }) {
  return (
    <g>
      {gcds.map(g => {
        const y = yOf(g.timeMs)
        if (y < -ICON) return null
        const selected = selectedId === g.id
        return (
          <g key={g.id} className="cursor-grab"
            onMouseDown={e => onItemDown(e, { kind: 'gcd', id: g.id }, (ms, tag) => moveGcdUse(g.id, ms, tag))}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}>
            {selected && <rect x={x + GCD_W / 2 - 13} y={y - 13} width={26} height={26} rx={4}
              fill="none" stroke="#fbbf24" strokeWidth={1.5} />}
            <title>{g.skill}{g.skillId !== undefined ? ` · ID ${g.skillId}` : ''}</title>
            <SkillIcon src={icons.get(g.skill)} name={g.skill} x={x + GCD_W / 2 - ICON / 2} y={y - ICON / 2} />
          </g>
        )
      })}
    </g>
  )
})

const AbilityLayer = memo(function AbilityLayer({ column, uses, x, pps, icon, yOf, selectedId, onItemDown, moveSkillUse }: {
  column: LogsSkillColumn; uses: LogsSkillUse[]; x: number; pps: number; icon?: string
} & ItemDragProps & { moveSkillUse: (columnId: string, useId: string, ms: number, tag?: string) => void }) {
  const cx = x + COL_W / 2
  return (
    <g>
      {uses.map(u => {
        const y = yOf(u.timeMs)
        if (y < -ICON) return null
        const selected = selectedId === u.id
        const cdH = column.cd ? column.cd * pps : 0
        return (
          <g key={u.id} className="cursor-grab"
            onMouseDown={e => onItemDown(e, { kind: 'skillUse', id: u.id, columnId: column.id }, (ms, tag) => moveSkillUse(column.id, u.id, ms, tag))}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}>
            {cdH > 0 && (
              <rect x={cx - CD_W / 2} y={y} width={CD_W} height={cdH} fill="#6b7280" opacity={0.25} />
            )}
            {column.duration !== undefined && column.duration > 0 && (
              <rect x={cx - CD_W / 2} y={y} width={CD_W} height={column.duration * pps}
                fill="#22c55e" opacity={0.4} stroke="#22c55e" strokeOpacity={0.8} strokeWidth={1} />
            )}
            {selected && <rect x={cx - 13} y={y - 13} width={26} height={26} rx={4}
              fill="none" stroke="#fbbf24" strokeWidth={1.5} />}
            <title>{column.name}{column.skillId !== undefined ? ` · ID ${column.skillId}` : ''}</title>
            <SkillIcon src={icon} name={column.name} x={cx - ICON / 2} y={y - ICON / 2} />
          </g>
        )
      })}
    </g>
  )
})

const RulerLayer = memo(function RulerLayer({ lengthMs, pps, totalW }: {
  lengthMs: number; pps: number; totalW: number
}) {
  const ticks = useMemo(() => {
    const step = tickStepSec(pps)
    const lengthSec = lengthMs / 1000
    const out: number[] = []
    for (let s = 0; s <= lengthSec + 0.001; s += step) out.push(Math.round(s))
    return out
  }, [lengthMs, pps])
  return (
    <g>
      {ticks.map(sec => {
        const y = sec * pps
        const minute = sec % 60 === 0
        return (
          <g key={sec}>
            <line x1={RULER_W} y1={y} x2={totalW} y2={y} stroke={minute ? '#374151' : '#1f2937'} strokeWidth={1} />
            <line x1={RULER_W - (minute ? 10 : 6)} y1={y} x2={RULER_W} y2={y} stroke="#4b5563" strokeWidth={1} />
            <text x={6} y={y + 4} fontSize={11} fill={minute ? '#e5e7eb' : '#9ca3af'}
              fontWeight={minute ? 700 : 400} className="select-none">
              {formatTimeMs(sec * 1000)}
            </text>
          </g>
        )
      })}
    </g>
  )
})

function EmptyState({ loadError }: { loadError: string | null }) {
  const newDocument = useLogsStore(s => s.newDocument)
  const handleNew = async () => {
    const name = await askPrompt({
      title: '新建战斗日志时间轴',
      message: '时间轴名称',
      defaultValue: '新战斗日志',
      placeholder: '如：绝伊甸 P1 减伤轴'
    })
    if (name === null) return
    newDocument(name || '新战斗日志')
    // 引导第二步：新建后自动切到左侧「技能」Tab
    document.dispatchEvent(new CustomEvent('logs:showSkills'))
  }
  return (
    <div className="h-full flex items-center justify-center text-gray-500 bg-gray-900">
      <div className="max-w-md p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">📜</div>
          <div className="text-sm mb-1 text-gray-300">战斗日志时间轴</div>
          <div className="text-xs text-gray-600 mb-5">
            从 FFLogs 导入战斗记录，在垂直时间轴上排布 BOSS 事件与技能使用
          </div>
        </div>
        <div className="space-y-2.5 text-left">
          <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <StepBadge n={1} />
              <span className="text-xs font-semibold text-gray-200">新建文件</span>
            </div>
            <div className="text-[11px] text-gray-500 mb-2 pl-7">创建一个空的时间轴文档，或打开已有文件</div>
            <div className="flex gap-2 pl-7">
              <button onClick={handleNew} className="command-button-primary">新建</button>
              <button onClick={() => document.dispatchEvent(new CustomEvent('editor:open'))} className="command-button">打开</button>
            </div>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <StepBadge n={2} />
              <span className="text-xs font-semibold text-gray-200">选择技能</span>
            </div>
            <div className="text-[11px] text-gray-500 pl-7">
              在左侧「技能」Tab 按职业挑选要安排的技能（如 圣盾阵、暗影卫），点击添加为技能列
            </div>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <StepBadge n={3} />
              <span className="text-xs font-semibold text-gray-200">导入 FFLogs</span>
            </div>
            <div className="text-[11px] text-gray-500 mb-2 pl-7">
              粘贴报告链接并选择战斗，把 BOSS 事件与所选技能的实际使用导入时间轴
            </div>
            <div className="pl-7">
              <button onClick={() => document.dispatchEvent(new CustomEvent('logs:openFflogs'))}
                className="command-button border-amber-700 bg-amber-900/60 text-amber-100 hover:bg-amber-800">
                FFLogs 导入
              </button>
            </div>
          </div>
        </div>
        {loadError && (
          <div className="mt-3 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded p-2">{loadError}</div>
        )}
      </div>
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-900/70 border border-amber-700 text-[11px] font-bold text-amber-200">
      {n}
    </span>
  )
}

/** 中心画布：垂直 SVG 时间轴（时间向下流逝） */
export function LogsTimelineView() {
  const doc = useLogsStore(s => s.doc)
  const loadError = useLogsStore(s => s.loadError)
  const selection = useLogsStore(s => s.selection)
  const cursorMs = useLogsStore(s => s.cursorMs)
  const pps = useLogsStore(s => s.pxPerSec)
  const select = useLogsStore(s => s.select)
  const setCursor = useLogsStore(s => s.setCursor)
  const setZoom = useLogsStore(s => s.setZoom)
  const moveEvent = useLogsStore(s => s.moveEvent)
  const moveGcdUse = useLogsStore(s => s.moveGcdUse)
  const moveSkillUse = useLogsStore(s => s.moveSkillUse)
  const addEvent = useLogsStore(s => s.addEvent)
  const addGcdUse = useLogsStore(s => s.addGcdUse)
  const addSkillUse = useLogsStore(s => s.addSkillUse)
  const abilityCols = useAbilityColumns()
  const gcdTracks = useGcdTracks()
  const skillDb = useJobSkillDb()

  const scrollRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const lastGcdSkillRef = useRef<string | null>(null)
  const pendingZoomAnchor = useRef<{ dispMs: number; offsetY: number } | null>(null)

  const lengthMs = doc?.lengthMs ?? 0
  const offsetMs = doc?.offsetMs ?? 0

  const yOf = useCallback((ms: number) => (ms + offsetMs) / 1000 * pps, [offsetMs, pps])

  // 事件区：按读条重叠打包为多轨道，每轨道固定 68px
  const eventTracks = useMemo(() => packEventTracks(doc?.events ?? []), [doc?.events])
  const eventW = eventTracks.trackCount * TRACK_W
  const eventX = RULER_W
  const gcdX = eventX + eventW
  const colX = (i: number) => gcdX + GCD_W + i * COL_W
  const totalW = colX(abilityCols.length)
  const svgH = Math.ceil(lengthMs / 1000 * pps) + BOTTOM_PAD

  const gcdIcons = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const track of gcdTracks) {
      map.set(columnMatchName(track), track.icon ?? lookupSkill(skillDb, columnMatchName(track))?.def.icon)
    }
    return map
  }, [gcdTracks, skillDb])

  const abilityIcons = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const col of abilityCols) {
      map.set(col.id, col.icon ?? lookupSkill(skillDb, columnMatchName(col))?.def.icon)
    }
    return map
  }, [abilityCols, skillDb])

  const clientYToMs = useCallback((clientY: number): number => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top + el.scrollTop - HEADER_H
    const ms = Math.round((y / pps * 1000 - offsetMs) / 100) * 100
    return clampMs(ms, lengthMs)
  }, [pps, offsetMs, lengthMs])

  const onItemDown = useCallback((
    e: React.MouseEvent,
    sel: LogsSelection,
    move: (ms: number, tag: string) => void
  ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    select(sel)
    // 拖拽：整段拖动合并为一步撤销（tag = 本次拖拽会话）
    const tag = `drag:${crypto.randomUUID()}`
    const onMove = (ev: MouseEvent) => move(clientYToMs(ev.clientY), tag)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [select, clientYToMs])

  // Ctrl+滚轮缩放（以鼠标位置为锚点）
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !doc) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const offsetY = e.clientY - rect.top
      const yContent = offsetY + el.scrollTop - HEADER_H
      pendingZoomAnchor.current = { dispMs: yContent / pps * 1000, offsetY }
      setZoom(pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc, pps, setZoom])

  useLayoutEffect(() => {
    const pending = pendingZoomAnchor.current
    const el = scrollRef.current
    if (!pending || !el) return
    pendingZoomAnchor.current = null
    el.scrollTop = pending.dispMs / 1000 * pps + HEADER_H - pending.offsetY
  }, [pps])

  // Esc 取消光标线
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isDialogOpen()) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      setCursor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCursor])

  const svgPointToMs = useCallback((e: React.MouseEvent): number => {
    const svg = svgRef.current
    if (!svg) return 0
    const y = e.clientY - svg.getBoundingClientRect().top
    const ms = Math.round((y / pps * 1000 - offsetMs) / 100) * 100
    return clampMs(ms, lengthMs)
  }, [pps, offsetMs, lengthMs])

  const laneAtX = useCallback((clientX: number): { kind: 'event' | 'gcd' | 'column'; columnId?: string } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const x = clientX - svg.getBoundingClientRect().left
    if (x >= eventX && x < gcdX) return { kind: 'event' }
    if (x >= gcdX && x < gcdX + GCD_W) return { kind: 'gcd' }
    for (let i = 0; i < abilityCols.length; i++) {
      const left = gcdX + GCD_W + i * COL_W
      if (x >= left && x < left + COL_W) return { kind: 'column', columnId: abilityCols[i].id }
    }
    return null
  }, [eventX, gcdX, abilityCols])

  const onSvgClick = useCallback((e: React.MouseEvent) => {
    setCursor(svgPointToMs(e))
    select(null)
  }, [svgPointToMs, setCursor, select])

  const onSvgDoubleClick = useCallback((e: React.MouseEvent) => {
    const ms = svgPointToMs(e)
    const lane = laneAtX(e.clientX)
    if (!lane) return
    if (lane.kind === 'event') {
      addEvent(ms, '新事件')
    } else if (lane.kind === 'gcd') {
      const skill = gcdTracks.length === 1
        ? columnMatchName(gcdTracks[0])
        : lastGcdSkillRef.current ?? (gcdTracks[0] ? columnMatchName(gcdTracks[0]) : null)
      if (!skill) return
      lastGcdSkillRef.current = skill
      addGcdUse(skill, ms)
    } else if (lane.columnId) {
      addSkillUse(lane.columnId, ms)
    }
  }, [svgPointToMs, laneAtX, gcdTracks, addEvent, addGcdUse, addSkillUse])

  const onSvgMouseMove = useCallback((e: React.MouseEvent) => {
    setHoverMs(svgPointToMs(e))
  }, [svgPointToMs])

  const fitZoom = useCallback(() => {
    const el = scrollRef.current
    if (!el || !lengthMs) return
    setZoom((el.clientHeight - HEADER_H) / (lengthMs / 1000))
  }, [lengthMs, setZoom])

  if (!doc) return <EmptyState loadError={loadError} />

  const selectedId = selection?.id ?? null
  const cursorY = cursorMs !== null ? yOf(cursorMs) : null

  return (
    <div className="h-full flex flex-col bg-gray-900 overflow-hidden relative">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ width: totalW, minWidth: '100%' }} className="relative">
          {/* 吸顶列头 */}
          <div className="sticky top-0 z-20 flex items-stretch border-b border-gray-700 bg-gray-900/95 backdrop-blur-sm"
            style={{ height: HEADER_H, width: totalW }}>
            <div style={{ width: RULER_W }} className="flex-shrink-0 flex items-end pb-1 pl-2 text-[10px] text-gray-500 select-none">
              时间
            </div>
            <div style={{ width: eventW }} className="flex-shrink-0 flex items-end gap-1.5 pb-1 pl-2 text-[11px] font-semibold text-gray-400 select-none">
              BOSS 事件
              <span className="rounded border border-gray-700 bg-gray-800 px-1 text-[10px] font-normal text-gray-500">
                {eventTracks.trackCount} 轨道
              </span>
            </div>
            <div style={{ width: GCD_W }} className="flex-shrink-0 flex items-end justify-center pb-1 text-[11px] font-semibold text-gray-400 select-none">
              GCD
            </div>
            {abilityCols.map(col => {
              const selected = selection?.kind === 'column' && selection.id === col.id
              return (
                <button key={col.id} type="button" onClick={() => select({ kind: 'column', id: col.id })}
                  style={{ width: COL_W }}
                  className={`flex-shrink-0 flex flex-col items-center justify-end pb-0.5 border-l transition-colors
                    ${selected ? 'border-amber-600/60 bg-amber-950/40' : 'border-gray-800 hover:bg-gray-800/70'}`}
                  title={`${col.name}${col.skillId !== undefined ? ` · ID ${col.skillId}` : ''}${col.cd ? ` · CD ${col.cd}s` : ''}`}>
                  <HeaderIcon src={abilityIcons.get(col.id)} name={col.name} />
                  <span className={`text-[11px] leading-4 max-w-full truncate px-0.5 ${selected ? 'text-amber-300' : 'text-gray-300'}`}>
                    {col.name}
                  </span>
                </button>
              )
            })}
          </div>

          <svg ref={svgRef} width={totalW} height={svgH} className="block"
            onClick={onSvgClick}
            onDoubleClick={onSvgDoubleClick}
            onMouseMove={onSvgMouseMove}
            onMouseLeave={() => setHoverMs(null)}>
            {/* 车道背景与分隔线 */}
            <rect x={eventX} y={0} width={eventW} height={svgH} fill="#0f172a" opacity={0.35} />
            {Array.from({ length: eventTracks.trackCount - 1 }, (_, i) => (
              <line key={i} x1={eventX + (i + 1) * TRACK_W} y1={0} x2={eventX + (i + 1) * TRACK_W} y2={svgH} stroke="#1f2937" />
            ))}
            <line x1={gcdX} y1={0} x2={gcdX} y2={svgH} stroke="#1f2937" />
            {abilityCols.map((col, i) => (
              <line key={col.id} x1={colX(i)} y1={0} x2={colX(i)} y2={svgH} stroke="#1f2937" />
            ))}

            <RulerLayer lengthMs={lengthMs} pps={pps} totalW={totalW} />

            {/* 悬停十字线 */}
            {hoverMs !== null && (
              <g className="pointer-events-none">
                <line x1={0} y1={yOf(hoverMs)} x2={totalW} y2={yOf(hoverMs)} stroke="#64748b" strokeWidth={0.5} opacity={0.6} />
                <text x={4} y={yOf(hoverMs) - 4} fontSize={10} fill="#94a3b8" className="select-none">
                  {formatTimeMs(hoverMs)}
                </text>
              </g>
            )}

            <EventsLayer events={doc.events} tracks={eventTracks} x={eventX} pps={pps} svgH={svgH} yOf={yOf}
              selectedId={selection?.kind === 'event' ? selectedId : null}
              onItemDown={onItemDown} moveEvent={moveEvent} />
            <GcdLayer gcds={doc.gcds} x={gcdX} icons={gcdIcons} yOf={yOf}
              selectedId={selection?.kind === 'gcd' ? selectedId : null}
              onItemDown={onItemDown} moveGcdUse={moveGcdUse} />
            {abilityCols.map((col, i) => (
              <AbilityLayer key={col.id} column={col} uses={doc.skillUses[col.id] ?? []} x={colX(i)} pps={pps}
                icon={abilityIcons.get(col.id)} yOf={yOf}
                selectedId={selection?.kind === 'skillUse' && selection.columnId === col.id ? selectedId : null}
                onItemDown={onItemDown} moveSkillUse={moveSkillUse} />
            ))}

            {/* 光标线 */}
            {cursorY !== null && (
              <g className="pointer-events-none">
                <line x1={0} y1={cursorY} x2={totalW} y2={cursorY} stroke="#3b82f6" strokeWidth={1.5} />
                <rect x={2} y={cursorY - 9} width={52} height={14} rx={3} fill="#1d4ed8" />
                <text x={6} y={cursorY + 1} fontSize={10} fill="#eff6ff" className="select-none">
                  {formatTimeMs(cursorMs!)}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* 缩放控件 */}
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded border border-gray-700 bg-gray-800/95 px-1 py-0.5 shadow-lg">
        <button type="button" className="icon-button !h-6 !w-6" title="缩小" onClick={() => setZoom(pps / 1.25)}>
          <Minus size={13} />
        </button>
        <button type="button" className="px-1.5 text-[11px] text-gray-300 hover:text-white min-w-11 text-center"
          title="恢复默认缩放" onClick={() => setZoom(LOGS_DEFAULT_ZOOM)}>
          {Math.round(pps / LOGS_DEFAULT_ZOOM * 100)}%
        </button>
        <button type="button" className="icon-button !h-6 !w-6" title="放大" onClick={() => setZoom(pps * 1.25)}>
          <Plus size={13} />
        </button>
        <button type="button" className="command-button !h-6 !px-2 !text-[11px] ml-1" title="按时间轴总长度适应可视高度" onClick={fitZoom}>
          <Maximize size={12} />适应
        </button>
      </div>
    </div>
  )
}

/** 列头用 HTML 图标（带 onError 回退） */
function HeaderIcon({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="h-5 w-5 rounded bg-gray-600 border border-gray-500 flex items-center justify-center text-[11px] text-gray-200 select-none">
        {name.charAt(0) || '?'}
      </div>
    )
  }
  return <img src={src} alt="" width={20} height={20} className="rounded" draggable={false} onError={() => setErr(true)} />
}
