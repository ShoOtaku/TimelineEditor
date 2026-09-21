import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, LoaderCircle } from 'lucide-react'
import {
  DEFAULT_FFLOGS_API_KEY, extractFflogsReportCode
} from '@shared/fflogsTypes'
import type { FflogsCastEvent, FflogsFight, FflogsReportInfo } from '@shared/fflogsTypes'
import { ModalShell } from '../components/ModalShell'
import { useLogsStore } from './logsStore'
import { columnMatchName, formatTimeMs } from './logsTypes'
import type { LogsSkillColumn } from './logsTypes'
import type { ParsedFflogsData } from './fflogsImport'
import { autoAssignPlayers, buildImportPayload, parseFflogsFight } from './fflogsImport'
import { resolveActionIcons } from './actionIcons'
import { loadActionNames } from './actionNames'

const STEPS = ['报告', '战斗', '下载', '映射'] as const

interface StreamProgress {
  percent: number
  page: number
  events: number
}

interface FflogsImportDialogProps {
  onClose: () => void
}

export function FflogsImportDialog({ onClose }: FflogsImportDialogProps) {
  const docColumns = useLogsStore(s => s.doc?.columns)
  const columns = useMemo(() => docColumns ?? [], [docColumns])

  const [step, setStep] = useState(1)

  // ① 报告
  const [codeInput, setCodeInput] = useState('')
  const [apiKey, setApiKey] = useState(DEFAULT_FFLOGS_API_KEY)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [report, setReport] = useState<FflogsReportInfo | null>(null)
  const code = extractFflogsReportCode(codeInput)

  // ② 战斗
  const [fightId, setFightId] = useState<number | null>(null)
  const selectedFight = useMemo(
    () => report?.fights.find(f => f.id === fightId) ?? null,
    [report, fightId]
  )

  // ③ 下载
  const [wantEvents, setWantEvents] = useState(true)
  const [wantAbilities, setWantAbilities] = useState(true)
  const [wantGcds, setWantGcds] = useState(true)
  const [includeBegincast, setIncludeBegincast] = useState(true)
  const [filterRegex, setFilterRegex] = useState('攻击')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [skillsProgress, setSkillsProgress] = useState<StreamProgress | null>(null)
  const [eventsProgress, setEventsProgress] = useState<StreamProgress | null>(null)
  const skillsReqRef = useRef<string | null>(null)
  const eventsReqRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  // ④ 映射
  const [parsed, setParsed] = useState<ParsedFflogsData | null>(null)
  const [eventSourceIds, setEventSourceIds] = useState<number[]>([])
  const [abilitySource, setAbilitySource] = useState<Record<string, number | null>>({})
  const [gcdSource, setGcdSource] = useState<Record<string, number | null>>({})
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [resolvingIcons, setResolvingIcons] = useState(false)

  const regexError = useMemo(() => {
    try {
      new RegExp(filterRegex.trim() || '攻击')
      return ''
    } catch (err) {
      return String(err)
    }
  }, [filterRegex])

  // 下载进度按 requestId 分发
  useEffect(() => {
    try {
      return window.electronAPI.onFflogsProgress(p => {
        const update = { percent: p.percent, page: p.page, events: p.events }
        if (p.requestId === skillsReqRef.current) setSkillsProgress(update)
        else if (p.requestId === eventsReqRef.current) setEventsProgress(update)
      })
    } catch {
      return undefined
    }
  }, [])

  // 关闭（卸载）时取消进行中的下载
  useEffect(() => {
    return () => {
      try {
        if (skillsReqRef.current) void window.electronAPI.cancelFflogsCasts(skillsReqRef.current)
        if (eventsReqRef.current) void window.electronAPI.cancelFflogsCasts(eventsReqRef.current)
      } catch { /* IPC 未就绪 */ }
    }
  }, [])

  const queryReport = useCallback(async () => {
    if (!code) return
    setReportLoading(true)
    setReportError('')
    setReport(null)
    try {
      const result = await window.electronAPI.fetchFflogsReport(code, apiKey || undefined)
      if (result.success) {
        setReport(result.data)
        const last = result.data.fights[result.data.fights.length - 1]
        setFightId(last?.id ?? null)
      } else {
        setReportError(result.error)
      }
    } catch (err) {
      setReportError(String(err))
    } finally {
      setReportLoading(false)
    }
  }, [code, apiKey])

  const fetchStream = useCallback(async (
    hostility: 0 | 1,
    requestId: string,
    fight: FflogsFight,
    reportCode: string
  ): Promise<FflogsCastEvent[]> => {
    const result = await window.electronAPI.fetchFflogsCasts({
      requestId,
      code: reportCode,
      apiKey: apiKey || undefined,
      start: fight.start_time,
      end: fight.end_time,
      hostility,
      translate: true
    })
    if (!result.success) throw new Error(result.error)
    return result.data
  }, [apiKey])

  const startDownload = useCallback(async () => {
    if (!report || !selectedFight) return
    const needSkills = wantAbilities || wantGcds
    const needEvents = wantEvents
    cancelledRef.current = false
    setDownloading(true)
    setDownloadError('')
    skillsReqRef.current = needSkills ? crypto.randomUUID() : null
    eventsReqRef.current = needEvents ? crypto.randomUUID() : null
    setSkillsProgress(needSkills ? { percent: 0, page: 0, events: 0 } : null)
    setEventsProgress(needEvents ? { percent: 0, page: 0, events: 0 } : null)
    try {
      const namesPromise = loadActionNames()
      const [casts, enemyCasts] = await Promise.all([
        skillsReqRef.current
          ? fetchStream(0, skillsReqRef.current, selectedFight, report.code)
          : Promise.resolve([]),
        eventsReqRef.current
          ? fetchStream(1, eventsReqRef.current, selectedFight, report.code)
          : Promise.resolve([])
      ])
      const data = parseFflogsFight({
        report,
        casts,
        enemyCasts,
        fightStart: selectedFight.start_time,
        fightEnd: selectedFight.end_time,
        columns,
        includeBegincast,
        eventFilterRegex: filterRegex,
        actionNames: await namesPromise ?? undefined
      })
      const auto = autoAssignPlayers(data, columns)
      setParsed(data)
      setAbilitySource(auto.abilitySource)
      setGcdSource(auto.gcdSource)
      setEventSourceIds(data.bosses.map(b => b.id))
      setStep(4)
    } catch (err) {
      if (!cancelledRef.current) setDownloadError(String(err instanceof Error ? err.message : err))
    } finally {
      setDownloading(false)
      skillsReqRef.current = null
      eventsReqRef.current = null
    }
  }, [report, selectedFight, wantAbilities, wantGcds, wantEvents, columns, includeBegincast, filterRegex, fetchStream])

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true
    if (skillsReqRef.current) void window.electronAPI.cancelFflogsCasts(skillsReqRef.current)
    if (eventsReqRef.current) void window.electronAPI.cancelFflogsCasts(eventsReqRef.current)
  }, [])

  const doImport = useCallback(async () => {
    if (!parsed || !selectedFight || resolvingIcons) return
    // 选中来源的技能 guid → XIVAPI 图标（失败不阻塞导入）
    let icons: Record<number, string> | undefined
    if (wantEvents) {
      const guids: number[] = []
      for (const sourceId of eventSourceIds) {
        for (const e of parsed.eventsBySource[sourceId] ?? []) {
          if (e.guid !== undefined) guids.push(e.guid)
        }
      }
      if (guids.length > 0) {
        setResolvingIcons(true)
        try {
          icons = await resolveActionIcons(guids)
        } finally {
          setResolvingIcons(false)
        }
      }
    }
    const payload = buildImportPayload(parsed, {
      columns,
      eventSourceIds,
      abilitySource,
      gcdSource
    }, selectedFight.end_time - selectedFight.start_time, icons)
    // 未下载的分段不触碰现有数据
    if (!wantEvents) delete payload.events
    if (!wantGcds) delete payload.gcds
    if (!wantAbilities) delete payload.skillUses
    let store = useLogsStore.getState()
    if (!store.doc) {
      store.newDocument(report?.title || 'FFLogs 导入')
      store = useLogsStore.getState()
    }
    store.applyImport(payload, mode)
    onClose()
  }, [parsed, selectedFight, columns, eventSourceIds, abilitySource, gcdSource, wantEvents, wantGcds, wantAbilities, report, mode, resolvingIcons, onClose])

  const canNext = (step === 1 && report !== null) || (step === 2 && selectedFight !== null)

  return (
    <ModalShell
      title="FFLogs 导入"
      description={report ? `${report.title} · ${report.fights.length} 场战斗` : '从 FFLogs 报告导入 BOSS 事件与技能使用'}
      onClose={onClose}
      widthClass="max-w-3xl"
      footer={
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="command-button">取消</button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)} disabled={downloading}
                className="command-button">上一步</button>
            )}
            {step <= 2 && (
              <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext}
                className="command-button-primary">下一步</button>
            )}
            {step === 4 && (
              <button type="button" onClick={() => void doImport()} disabled={resolvingIcons}
                className="command-button-primary !border-amber-600 !bg-amber-600 hover:!bg-amber-500">
                {resolvingIcons
                  ? <><LoaderCircle size={14} className="animate-spin" />解析技能图标…</>
                  : <><Download size={14} />导入</>}
              </button>
            )}
          </div>
        </div>
      }
    >
      <Stepper step={step} />
      <div className="px-5 py-4 min-h-72">
        {step === 1 && (
          <ReportStep
            codeInput={codeInput} setCodeInput={v => { setCodeInput(v); setReport(null); setReportError('') }}
            code={code} apiKey={apiKey} setApiKey={setApiKey}
            loading={reportLoading} error={reportError} report={report} onQuery={queryReport} />
        )}
        {step === 2 && report && (
          <FightStep report={report} fightId={fightId} onSelect={setFightId} />
        )}
        {step === 3 && (
          <DownloadStep
            wantEvents={wantEvents} setWantEvents={setWantEvents}
            wantAbilities={wantAbilities} setWantAbilities={setWantAbilities}
            wantGcds={wantGcds} setWantGcds={setWantGcds}
            includeBegincast={includeBegincast} setIncludeBegincast={setIncludeBegincast}
            filterRegex={filterRegex} setFilterRegex={setFilterRegex} regexError={regexError}
            downloading={downloading} downloadError={downloadError}
            skillsProgress={skillsProgress} eventsProgress={eventsProgress}
            onStart={startDownload} onCancel={cancelDownload} />
        )}
        {step === 4 && parsed && (
          <MappingStep
            parsed={parsed} columns={columns}
            fightDurationMs={selectedFight ? selectedFight.end_time - selectedFight.start_time : 0}
            wantEvents={wantEvents} wantAbilities={wantAbilities} wantGcds={wantGcds}
            eventSourceIds={eventSourceIds} setEventSourceIds={setEventSourceIds}
            abilitySource={abilitySource} setAbilitySource={setAbilitySource}
            gcdSource={gcdSource} setGcdSource={setGcdSource}
            mode={mode} setMode={setMode} />
        )}
      </div>
    </ModalShell>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-700 px-5 py-3">
      {STEPS.map((label, i) => {
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
            {n < STEPS.length && <div className={`h-px flex-1 ${n < step ? 'bg-emerald-800' : 'bg-gray-700'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function ReportStep({ codeInput, setCodeInput, code, apiKey, setApiKey, loading, error, report, onQuery }: {
  codeInput: string; setCodeInput: (v: string) => void; code: string | null
  apiKey: string; setApiKey: (v: string) => void
  loading: boolean; error: string; report: FflogsReportInfo | null; onQuery: () => void
}) {
  return (
    <div className="space-y-3 max-w-xl">
      <label className="block text-xs text-gray-400">
        报告链接或 CODE
        <input
          type="text" value={codeInput} onChange={e => setCodeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && code && !loading) onQuery() }}
          placeholder="https://cn.fflogs.com/reports/9VcYMnPXHx3FCzgw 或 9VcYMnPXHx3FCzgw"
          className="field-input mt-1 font-mono" autoFocus />
      </label>
      <div className="text-[11px]">
        {code
          ? <span className="text-emerald-400">识别为报告 CODE：{code}</span>
          : codeInput.trim()
            ? <span className="text-red-400">无法从输入中识别报告 CODE</span>
            : <span className="text-gray-600">粘贴 FFLogs 报告链接，或直接输入报告 CODE</span>}
      </div>
      <label className="block text-xs text-gray-400">
        API Key（v1 classic，可用默认公共 key）
        <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
          className="field-input mt-1 font-mono" placeholder={DEFAULT_FFLOGS_API_KEY} />
      </label>
      <div>
        <button type="button" onClick={onQuery} disabled={!code || loading} className="command-button-primary">
          {loading ? <LoaderCircle size={14} className="animate-spin" /> : null}查询
        </button>
      </div>
      {error && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>
      )}
      {report && (
        <div className="flex items-center gap-2 rounded border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 size={15} />
          <span className="font-semibold">{report.title}</span>
          <span className="text-emerald-400/70">{report.fights.length} 场战斗</span>
        </div>
      )}
    </div>
  )
}

function FightStep({ report, fightId, onSelect }: {
  report: FflogsReportInfo; fightId: number | null; onSelect: (id: number) => void
}) {
  const fights = useMemo(() => [...report.fights].reverse(), [report])
  return (
    <div className="space-y-1 max-h-[420px] overflow-auto pr-1">
      {fights.map(fight => {
        const selected = fight.id === fightId
        const startClock = new Date(report.start + fight.start_time)
          .toLocaleTimeString('zh-CN', { hour12: false })
        return (
          <button key={fight.id} type="button" onClick={() => onSelect(fight.id)}
            className={`w-full flex items-center gap-2.5 rounded border px-3 py-2 text-left transition-colors
              ${selected ? 'border-amber-600/70 bg-amber-950/30' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold flex-shrink-0
              ${fight.kill ? 'bg-emerald-900/70 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}
              title={fight.kill ? '击杀' : '灭团'}>
              {fight.kill ? '✓' : '✗'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-gray-200">{fight.zoneName || fight.name || '未知区域'}</span>
              {fight.name && fight.zoneName && (
                <span className="block truncate text-[11px] text-gray-500">{fight.name}</span>
              )}
            </span>
            <span className="text-[12px] font-mono text-gray-300 flex-shrink-0">
              {formatTimeMs(fight.end_time - fight.start_time)}
            </span>
            <span className="text-[11px] text-gray-500 flex-shrink-0 w-20 text-right">{startClock}</span>
          </button>
        )
      })}
      {fights.length === 0 && <div className="py-8 text-center text-sm text-gray-500 italic">报告中没有战斗记录</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, disabled }: {
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

function ProgressBar({ label, progress }: { label: string; progress: StreamProgress }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-gray-400">
        <span>{label}</span>
        <span>{Math.round(progress.percent)}% · 第 {progress.page} 页 · {progress.events} 条</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-gray-800">
        <div className="h-full rounded bg-amber-500 transition-all" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  )
}

function DownloadStep(props: {
  wantEvents: boolean; setWantEvents: (v: boolean) => void
  wantAbilities: boolean; setWantAbilities: (v: boolean) => void
  wantGcds: boolean; setWantGcds: (v: boolean) => void
  includeBegincast: boolean; setIncludeBegincast: (v: boolean) => void
  filterRegex: string; setFilterRegex: (v: string) => void; regexError: string
  downloading: boolean; downloadError: string
  skillsProgress: StreamProgress | null; eventsProgress: StreamProgress | null
  onStart: () => void; onCancel: () => void
}) {
  const noneChecked = !props.wantEvents && !props.wantAbilities && !props.wantGcds
  return (
    <div className="space-y-3 max-w-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Toggle label="事件（BOSS/NPC）" checked={props.wantEvents} onChange={props.setWantEvents} disabled={props.downloading} />
        <Toggle label="能力技" checked={props.wantAbilities} onChange={props.setWantAbilities} disabled={props.downloading} />
        <Toggle label="GCD 技" checked={props.wantGcds} onChange={props.setWantGcds} disabled={props.downloading} />
        <Toggle label="读条时长（由开始读条事件计算）" checked={props.includeBegincast} onChange={props.setIncludeBegincast} disabled={props.downloading} />
      </div>
      <label className="block text-xs text-gray-400">
        事件过滤正则（匹配到的事件技能名将被跳过，默认过滤普攻「攻击」）
        <input type="text" value={props.filterRegex} disabled={props.downloading || !props.wantEvents}
          onChange={e => props.setFilterRegex(e.target.value)} placeholder="攻击"
          className={`field-input mt-1 font-mono ${props.regexError ? '!border-red-500' : ''}`} />
      </label>
      {props.regexError && <div className="text-[11px] text-red-400">正则无效：{props.regexError}</div>}

      {props.skillsProgress && <ProgressBar label="技能数据（玩家）" progress={props.skillsProgress} />}
      {props.eventsProgress && <ProgressBar label="事件数据（敌方）" progress={props.eventsProgress} />}
      {props.downloadError && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{props.downloadError}</div>
      )}

      <div className="flex items-center gap-2">
        {!props.downloading ? (
          <button type="button" onClick={props.onStart} disabled={noneChecked || !!props.regexError}
            className="command-button-primary !border-amber-600 !bg-amber-600 hover:!bg-amber-500">
            <Download size={14} />开始下载
          </button>
        ) : (
          <button type="button" onClick={props.onCancel} className="command-button text-red-300 border-red-900/60">
            取消下载
          </button>
        )}
        {props.downloading && <LoaderCircle size={16} className="animate-spin text-amber-400" />}
      </div>
    </div>
  )
}

function MappingStep(props: {
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
