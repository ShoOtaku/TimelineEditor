// ACT 本地日志导入向导：文件 → 战斗 → 解析 → 映射
// 与 FFLogs 导入的差异仅在数据获取：本地文件流式扫描/窗口解析（主进程 actLogIpc），
// 解析后的映射/导入完全复用 parseFflogsFight 管线与 MappingStep

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react'
import type { ActEncounter, ActLogFileInfo, ActScanResult } from '@shared/actTypes'
import { ModalShell } from '../components/ModalShell'
import { useLogsStore } from './logsStore'
import { formatTimeMs } from './logsTypes'
import type { ParsedFflogsData } from './fflogsImport'
import { autoAssignPlayers, buildImportPayload } from './fflogsImport'
import { parseActLogEvents } from './actImport'
import { MappingStep, ProgressBar, Stepper, Toggle } from './ImportSteps'
import { resolveActionIcons } from './actionIcons'
import { loadActionNames } from './actionNames'

const STEPS = ['文件', '战斗', '解析', '映射'] as const

interface ActImportDialogProps {
  onClose: () => void
}

interface SelectedFile {
  path: string
  name: string
}

interface RunProgress {
  percent: number
  lines: number
}

export function ActImportDialog({ onClose }: ActImportDialogProps) {
  const docColumns = useLogsStore(s => s.doc?.columns)
  const columns = useMemo(() => docColumns ?? [], [docColumns])

  const [step, setStep] = useState(1)

  // ① 文件
  const [dir, setDir] = useState('')
  const [files, setFiles] = useState<ActLogFileInfo[] | null>(null)
  const [fileListError, setFileListError] = useState('')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)

  // ② 战斗
  const [gapInput, setGapInput] = useState('60')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanProgress, setScanProgress] = useState<RunProgress | null>(null)
  const [scanResult, setScanResult] = useState<ActScanResult | null>(null)
  const [encounterId, setEncounterId] = useState<number | null>(null)
  const selectedEncounter = useMemo(
    () => scanResult?.encounters.find(e => e.id === encounterId) ?? null,
    [scanResult, encounterId]
  )

  // ③ 解析
  const [wantEvents, setWantEvents] = useState(true)
  const [wantAbilities, setWantAbilities] = useState(true)
  const [wantGcds, setWantGcds] = useState(true)
  const [includeBegincast, setIncludeBegincast] = useState(true)
  const [filterRegex, setFilterRegex] = useState('攻击')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parseProgress, setParseProgress] = useState<RunProgress | null>(null)

  // ④ 映射
  const [parsed, setParsed] = useState<ParsedFflogsData | null>(null)
  const [eventSourceIds, setEventSourceIds] = useState<number[]>([])
  const [abilitySource, setAbilitySource] = useState<Record<string, number | null>>({})
  const [gcdSource, setGcdSource] = useState<Record<string, number | null>>({})
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [resolvingIcons, setResolvingIcons] = useState(false)

  const reqIdRef = useRef<string | null>(null)
  const phaseRef = useRef<'scan' | 'parse' | null>(null)
  const cancelledRef = useRef(false)

  const regexError = useMemo(() => {
    try {
      new RegExp(filterRegex.trim() || '攻击')
      return ''
    } catch (err) {
      return String(err)
    }
  }, [filterRegex])

  const loadFiles = useCallback(async (directory?: string) => {
    setFileListError('')
    try {
      const result = await window.electronAPI.listActLogFiles(directory)
      if (result.success) setFiles(result.data)
      else {
        setFiles([])
        setFileListError(result.error)
      }
    } catch (err) {
      setFiles([])
      setFileListError(String(err))
    }
  }, [])

  // 打开对话框时载入默认日志目录与文件列表
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const directory = await window.electronAPI.getActLogsDirectory()
        if (!mounted) return
        setDir(directory)
        void loadFiles(directory)
      } catch { /* IPC 未就绪 */ }
    })()
    return () => { mounted = false }
  }, [loadFiles])

  // 进度按 requestId + 当前阶段分发
  useEffect(() => {
    try {
      return window.electronAPI.onActProgress(p => {
        if (p.requestId !== reqIdRef.current) return
        const update = { percent: p.percent, lines: p.lines }
        if (phaseRef.current === 'scan') setScanProgress(update)
        else if (phaseRef.current === 'parse') setParseProgress(update)
      })
    } catch {
      return undefined
    }
  }, [])

  // 关闭（卸载）时取消进行中的扫描/解析
  useEffect(() => {
    return () => {
      try {
        if (reqIdRef.current) void window.electronAPI.cancelActLog(reqIdRef.current)
      } catch { /* IPC 未就绪 */ }
    }
  }, [])

  const changeDirectory = useCallback(async () => {
    try {
      const result = await window.electronAPI.selectActLogsDirectory()
      if (!result.cancelled && result.directory) {
        setDir(result.directory)
        void loadFiles(result.directory)
      }
    } catch { /* 用户取消或 IPC 未就绪 */ }
  }, [loadFiles])

  const browseFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.openActLogFileDialog()
      if (!result.cancelled && result.filePath) {
        const path = result.filePath
        setSelectedFile({ path, name: path.split(/[\\/]/).pop() ?? path })
      }
    } catch { /* 用户取消或 IPC 未就绪 */ }
  }, [])

  const runScan = useCallback(async () => {
    if (!selectedFile) return
    const gapSeconds = Number(gapInput)
    const gapMs = (Number.isFinite(gapSeconds) && gapSeconds > 0 ? Math.min(1800, gapSeconds) : 60) * 1000
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    reqIdRef.current = requestId
    phaseRef.current = 'scan'
    setScanning(true)
    setScanError('')
    setScanProgress({ percent: 0, lines: 0 })
    setScanResult(null)
    setStep(2)
    try {
      const result = await window.electronAPI.scanActLog({ requestId, path: selectedFile.path, gapMs })
      if (result.success) {
        setScanResult(result.data)
        const last = result.data.encounters[result.data.encounters.length - 1]
        setEncounterId(last?.id ?? null)
      } else if (!result.cancelled && !cancelledRef.current) {
        setScanError(result.error)
      }
    } catch (err) {
      if (!cancelledRef.current) setScanError(String(err))
    } finally {
      setScanning(false)
      reqIdRef.current = null
      phaseRef.current = null
    }
  }, [selectedFile, gapInput])

  const runParse = useCallback(async () => {
    if (!selectedFile || !selectedEncounter || !scanResult) return
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    reqIdRef.current = requestId
    phaseRef.current = 'parse'
    setParsing(true)
    setParseError('')
    setParseProgress({ percent: 0, lines: 0 })
    try {
      const namesPromise = loadActionNames()
      const result = await window.electronAPI.parseActLog({
        requestId,
        path: selectedFile.path,
        start: selectedEncounter.start,
        end: selectedEncounter.end
      })
      if (!result.success) {
        if (!result.cancelled && !cancelledRef.current) setParseError(result.error)
        return
      }
      const data = parseActLogEvents({
        events: result.data,
        actors: scanResult.actors,
        fightStart: selectedEncounter.start,
        fightEnd: selectedEncounter.end,
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
      if (!cancelledRef.current) setParseError(String(err instanceof Error ? err.message : err))
    } finally {
      setParsing(false)
      reqIdRef.current = null
      phaseRef.current = null
    }
  }, [selectedFile, selectedEncounter, scanResult, columns, includeBegincast, filterRegex])

  const cancelRun = useCallback(() => {
    cancelledRef.current = true
    if (reqIdRef.current) void window.electronAPI.cancelActLog(reqIdRef.current)
  }, [])

  const doImport = useCallback(async () => {
    if (!parsed || !selectedEncounter || resolvingIcons) return
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
    }, selectedEncounter.end - selectedEncounter.start, icons)
    // 未解析的分段不触碰现有数据
    if (!wantEvents) delete payload.events
    if (!wantGcds) delete payload.gcds
    if (!wantAbilities) delete payload.skillUses
    let store = useLogsStore.getState()
    if (!store.doc) {
      store.newDocument(selectedEncounter.zoneName || selectedFile?.name || 'ACT 导入')
      store = useLogsStore.getState()
    }
    store.applyImport(payload, mode)
    onClose()
  }, [parsed, selectedEncounter, selectedFile, columns, eventSourceIds, abilitySource, gcdSource, wantEvents, wantGcds, wantAbilities, mode, resolvingIcons, onClose])

  const canNext = (step === 1 && selectedFile !== null)
    || (step === 2 && selectedEncounter !== null && !scanning)
  const busy = scanning || parsing

  return (
    <ModalShell
      title="ACT 日志导入"
      description={selectedFile
        ? `${selectedFile.name}${scanResult ? ` · ${scanResult.encounters.length} 场战斗` : ''}`
        : '从 ACT 本地日志（FFXIVLogs/Network_*.log）导入 BOSS 事件与技能使用'}
      onClose={onClose}
      widthClass="max-w-3xl"
      footer={
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="command-button">取消</button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)} disabled={busy}
                className="command-button">上一步</button>
            )}
            {step <= 2 && (
              <button type="button" disabled={!canNext}
                onClick={() => { if (step === 1) void runScan(); else setStep(s => s + 1) }}
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
      <Stepper steps={STEPS} step={step} />
      <div className="px-5 py-4 min-h-72">
        {step === 1 && (
          <FileStep
            dir={dir} files={files} error={fileListError}
            selectedPath={selectedFile?.path ?? null} selectedName={selectedFile?.name ?? null}
            onSelect={setSelectedFile} onChangeDir={() => void changeDirectory()}
            onRefresh={() => void loadFiles(dir || undefined)} onBrowse={() => void browseFile()} />
        )}
        {step === 2 && (
          <EncounterStep
            scanning={scanning} error={scanError} progress={scanProgress}
            gapInput={gapInput} setGapInput={setGapInput} onRescan={() => void runScan()}
            encounters={scanResult?.encounters ?? null}
            encounterId={encounterId} onSelect={setEncounterId}
            onCancel={cancelRun} />
        )}
        {step === 3 && (
          <ParseStep
            wantEvents={wantEvents} setWantEvents={setWantEvents}
            wantAbilities={wantAbilities} setWantAbilities={setWantAbilities}
            wantGcds={wantGcds} setWantGcds={setWantGcds}
            includeBegincast={includeBegincast} setIncludeBegincast={setIncludeBegincast}
            filterRegex={filterRegex} setFilterRegex={setFilterRegex} regexError={regexError}
            parsing={parsing} parseError={parseError} progress={parseProgress}
            onStart={() => void runParse()} onCancel={cancelRun} />
        )}
        {step === 4 && parsed && (
          <MappingStep
            parsed={parsed} columns={columns}
            fightDurationMs={selectedEncounter ? selectedEncounter.end - selectedEncounter.start : 0}
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

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${size} B`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatFileTime(mtime: number): string {
  const d = new Date(mtime)
  return `${d.getMonth() + 1}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function FileStep(props: {
  dir: string; files: ActLogFileInfo[] | null; error: string
  selectedPath: string | null; selectedName: string | null
  onSelect: (f: SelectedFile) => void
  onChangeDir: () => void; onRefresh: () => void; onBrowse: () => void
}) {
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 flex-shrink-0">日志目录</span>
        <span className="field-input !py-1 flex-1 truncate text-gray-300" title={props.dir}>{props.dir || '…'}</span>
        <button type="button" className="command-button" onClick={props.onChangeDir}>更改</button>
        <button type="button" className="command-button" onClick={props.onRefresh} title="刷新文件列表">
          <RefreshCw size={13} />
        </button>
      </div>
      {props.error && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{props.error}</div>
      )}
      <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
        {props.files?.map(f => {
          const selected = f.path === props.selectedPath
          return (
            <button key={f.path} type="button" onClick={() => props.onSelect({ path: f.path, name: f.name })}
              className={`w-full flex items-center gap-3 rounded border px-3 py-1.5 text-left transition-colors
                ${selected ? 'border-amber-600/70 bg-amber-950/30' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800'}`}>
              <span className="min-w-0 flex-1 truncate text-[13px] text-gray-200">{f.name}</span>
              <span className="text-[11px] text-gray-500 flex-shrink-0 w-16 text-right">{formatFileSize(f.size)}</span>
              <span className="text-[11px] text-gray-500 flex-shrink-0 w-20 text-right">{formatFileTime(f.mtime)}</span>
            </button>
          )
        })}
        {props.files !== null && props.files?.length === 0 && !props.error && (
          <div className="py-8 text-center text-sm text-gray-500 italic">目录中没有 .log 文件</div>
        )}
        {props.files === null && !props.error && (
          <div className="py-8 text-center text-sm text-gray-500">读取中…</div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="command-button" onClick={props.onBrowse}>
          <FolderOpen size={14} />浏览其他文件…
        </button>
        {props.selectedName && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 size={14} /><span className="truncate max-w-96">{props.selectedName}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function EncounterStep(props: {
  scanning: boolean; error: string; progress: RunProgress | null
  gapInput: string; setGapInput: (v: string) => void; onRescan: () => void
  encounters: ActEncounter[] | null; encounterId: number | null; onSelect: (id: number) => void
  onCancel: () => void
}) {
  const list = useMemo(() => [...(props.encounters ?? [])].reverse(), [props.encounters])
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 flex-shrink-0" title="相邻战斗事件超过该间隔即切分为两场战斗">
          分段间隔（秒）
        </span>
        <input type="text" inputMode="numeric" value={props.gapInput} disabled={props.scanning}
          onChange={e => props.setGapInput(e.target.value)} className="field-input !py-1 !w-20 font-mono" />
        <button type="button" className="command-button" onClick={props.onRescan} disabled={props.scanning}>
          重新扫描
        </button>
        {props.scanning && (
          <button type="button" onClick={props.onCancel} className="command-button text-red-300 border-red-900/60">
            取消扫描
          </button>
        )}
        {props.scanning && <LoaderCircle size={16} className="animate-spin text-amber-400" />}
      </div>
      {props.scanning && props.progress && (
        <ProgressBar label="扫描日志文件" percent={props.progress.percent} detail={`${props.progress.lines} 行`} />
      )}
      {props.error && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{props.error}</div>
      )}
      {!props.scanning && list.length === 0 && !props.error && (
        <div className="py-8 text-center text-sm text-gray-500 italic">
          未在日志中检测到战斗 — 只有含敌方单位参与的连续活动才算一场战斗，可尝试调大分段间隔后重新扫描
        </div>
      )}
      <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
        {list.map(enc => {
          const selected = enc.id === props.encounterId
          return (
            <button key={enc.id} type="button" onClick={() => props.onSelect(enc.id)}
              className={`w-full flex items-center gap-2.5 rounded border px-3 py-2 text-left transition-colors
                ${selected ? 'border-amber-600/70 bg-amber-950/30' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-800'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-gray-200">{enc.zoneName || '未知区域'}</span>
                <span className="block text-[11px] text-gray-500">{enc.events} 个战斗事件</span>
              </span>
              <span className="text-[12px] font-mono text-gray-300 flex-shrink-0">
                {formatTimeMs(enc.end - enc.start)}
              </span>
              <span className="text-[11px] text-gray-500 flex-shrink-0 w-28 text-right">{formatClock(enc.start)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ParseStep(props: {
  wantEvents: boolean; setWantEvents: (v: boolean) => void
  wantAbilities: boolean; setWantAbilities: (v: boolean) => void
  wantGcds: boolean; setWantGcds: (v: boolean) => void
  includeBegincast: boolean; setIncludeBegincast: (v: boolean) => void
  filterRegex: string; setFilterRegex: (v: string) => void; regexError: string
  parsing: boolean; parseError: string; progress: RunProgress | null
  onStart: () => void; onCancel: () => void
}) {
  const noneChecked = !props.wantEvents && !props.wantAbilities && !props.wantGcds
  return (
    <div className="space-y-3 max-w-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Toggle label="事件（BOSS/NPC）" checked={props.wantEvents} onChange={props.setWantEvents} disabled={props.parsing} />
        <Toggle label="能力技" checked={props.wantAbilities} onChange={props.setWantAbilities} disabled={props.parsing} />
        <Toggle label="GCD 技" checked={props.wantGcds} onChange={props.setWantGcds} disabled={props.parsing} />
        <Toggle label="读条时长（由开始读条事件计算）" checked={props.includeBegincast} onChange={props.setIncludeBegincast} disabled={props.parsing} />
      </div>
      <label className="block text-xs text-gray-400">
        事件过滤正则（匹配到的事件技能名将被跳过，默认过滤普攻「攻击」）
        <input type="text" value={props.filterRegex} disabled={props.parsing || !props.wantEvents}
          onChange={e => props.setFilterRegex(e.target.value)} placeholder="攻击"
          className={`field-input mt-1 font-mono ${props.regexError ? '!border-red-500' : ''}`} />
      </label>
      {props.regexError && <div className="text-[11px] text-red-400">正则无效：{props.regexError}</div>}

      {props.progress && (
        <ProgressBar label="解析战斗事件" percent={props.progress.percent} detail={`${props.progress.lines} 行`} />
      )}
      {props.parseError && (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{props.parseError}</div>
      )}

      <div className="flex items-center gap-2">
        {!props.parsing ? (
          <button type="button" onClick={props.onStart} disabled={noneChecked || !!props.regexError}
            className="command-button-primary !border-amber-600 !bg-amber-600 hover:!bg-amber-500">
            <Download size={14} />开始解析
          </button>
        ) : (
          <button type="button" onClick={props.onCancel} className="command-button text-red-300 border-red-900/60">
            取消解析
          </button>
        )}
        {props.parsing && <LoaderCircle size={16} className="animate-spin text-amber-400" />}
      </div>
    </div>
  )
}
