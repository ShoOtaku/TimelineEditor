// PR 时间轴「模拟测试」导入向导：ACT 本地日志 / FFLogs 报告 双来源，三步（文件|报告 → 战斗 → 设置）
// 导入战斗并组装模拟事件流写入 simStore；模拟结果由 PrTimelineView 实时计算并内嵌展示，
// 修改/增删锚点后自动用同一份日志重新模拟。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Play } from 'lucide-react'
import type { ActEncounter, ActLogEvent, ActLogFileInfo, ActScanResult } from '@shared/actTypes'
import { DEFAULT_FFLOGS_API_KEY, extractFflogsReportCode } from '@shared/fflogsTypes'
import type { FflogsCastEvent, FflogsReportInfo } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import { ModalShell } from '../components/ModalShell'
import { usePrStore } from '../store/prStore'
import { validatePtlDocument } from './prModel'
import { formatTimeMs } from '../logs/logsTypes'
import { EncounterStep, FileStep } from '../logs/ActImportDialog'
import { FightStep, ReportStep } from '../logs/FflogsImportDialog'
import { ProgressBar, Stepper } from '../logs/ImportSteps'
import { loadActionNames } from '../logs/actionNames'
import { buildSimEvents, collectPetIds, collectSimSources, defaultSimSourceIds } from './sim/simEvents'
import { buildFflogsSimEvents, collectFflogsSimSources } from './sim/simFflogs'
import { useSimStore } from './sim/simStore'

const ACT_STEPS = ['文件', '战斗', '设置'] as const
const FF_STEPS = ['报告', '战斗', '设置'] as const

interface SelectedFile {
  path: string
  name: string
}

interface RunProgress {
  percent: number
  lines: number
}

interface StreamProgress {
  percent: number
  page: number
  events: number
}

interface PrSimDialogProps {
  onClose: () => void
}

export function PrSimDialog({ onClose }: PrSimDialogProps) {
  const doc = usePrStore(s => s.doc)
  const setSimSession = useSimStore(s => s.setSession)

  const [mode, setMode] = useState<'act' | 'fflogs'>('act')
  const [step, setStep] = useState(1)

  // ===== ACT 来源 =====
  const [dir, setDir] = useState('')
  const [files, setFiles] = useState<ActLogFileInfo[] | null>(null)
  const [fileListError, setFileListError] = useState('')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
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
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parseProgress, setParseProgress] = useState<RunProgress | null>(null)
  const [parsedEvents, setParsedEvents] = useState<ActLogEvent[] | null>(null)
  const [sourceIds, setSourceIds] = useState<number[]>([])

  // ===== FFLogs 来源 =====
  const [codeInput, setCodeInput] = useState('')
  const [apiKey, setApiKey] = useState(DEFAULT_FFLOGS_API_KEY)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [report, setReport] = useState<FflogsReportInfo | null>(null)
  const code = extractFflogsReportCode(codeInput)
  const [fightId, setFightId] = useState<number | null>(null)
  const selectedFight = useMemo(
    () => report?.fights.find(f => f.id === fightId) ?? null,
    [report, fightId]
  )
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [castsProgress, setCastsProgress] = useState<StreamProgress | null>(null)
  const [enemyCasts, setEnemyCasts] = useState<FflogsCastEvent[] | null>(null)
  const [ffSourceIds, setFfSourceIds] = useState<number[]>([])
  const [actionNames, setActionNames] = useState<ActionNameDatabase | undefined>(undefined)

  const reqIdRef = useRef<string | null>(null)
  const phaseRef = useRef<'scan' | 'parse' | null>(null)
  const ffReqRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const issues = useMemo(() => (doc ? validatePtlDocument(doc) : []), [doc])
  const validationErrors = useMemo(() => issues.filter(i => i.level === 'error'), [issues])

  const sources = useMemo(
    () => (parsedEvents && scanResult ? collectSimSources(parsedEvents, scanResult.actors) : []),
    [parsedEvents, scanResult]
  )
  const ffSources = useMemo(
    () => (enemyCasts && report ? collectFflogsSimSources(enemyCasts, report.enemies) : []),
    [enemyCasts, report]
  )

  // ---------- ACT 流程 ----------
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

  // ---------- FFLogs 进度/取消 ----------
  useEffect(() => {
    try {
      return window.electronAPI.onFflogsProgress(p => {
        if (p.requestId !== ffReqRef.current) return
        setCastsProgress({ percent: p.percent, page: p.page, events: p.events })
      })
    } catch {
      return undefined
    }
  }, [])

  useEffect(() => {
    return () => {
      try {
        if (reqIdRef.current) void window.electronAPI.cancelActLog(reqIdRef.current)
        if (ffReqRef.current) void window.electronAPI.cancelFflogsCasts(ffReqRef.current)
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
    if (!selectedFile || !selectedEncounter) return
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    reqIdRef.current = requestId
    phaseRef.current = 'parse'
    setParsing(true)
    setParseError('')
    setParseProgress({ percent: 0, lines: 0 })
    setParsedEvents(null)
    setStep(3)
    try {
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
      setParsedEvents(result.data)
      setSourceIds(defaultSimSourceIds(collectSimSources(result.data, scanResult?.actors ?? [])))
    } catch (err) {
      if (!cancelledRef.current) setParseError(String(err instanceof Error ? err.message : err))
    } finally {
      setParsing(false)
      reqIdRef.current = null
      phaseRef.current = null
    }
  }, [selectedFile, selectedEncounter, scanResult])

  const cancelRun = useCallback(() => {
    cancelledRef.current = true
    if (reqIdRef.current) void window.electronAPI.cancelActLog(reqIdRef.current)
  }, [])

  // ---------- FFLogs 流程 ----------
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

  // 只下载敌方（hostility=1）施法：模拟事件流不喂玩家技能，战斗边界由 FFLogs 给出
  const runDownload = useCallback(async () => {
    if (!report || !selectedFight || !code) return
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    ffReqRef.current = requestId
    setDownloading(true)
    setDownloadError('')
    setCastsProgress({ percent: 0, page: 0, events: 0 })
    setEnemyCasts(null)
    setStep(3)
    try {
      const namesPromise = loadActionNames()
      const result = await window.electronAPI.fetchFflogsCasts({
        requestId,
        code,
        apiKey: apiKey || undefined,
        start: selectedFight.start_time,
        end: selectedFight.end_time,
        hostility: 1,
        translate: true
      })
      if (!result.success) {
        if (!cancelledRef.current) setDownloadError(result.error)
        return
      }
      setEnemyCasts(result.data)
      setFfSourceIds(collectFflogsSimSources(result.data, report.enemies).map(s => s.id))
      setActionNames(await namesPromise ?? undefined)
    } catch (err) {
      if (!cancelledRef.current) setDownloadError(String(err instanceof Error ? err.message : err))
    } finally {
      setDownloading(false)
      ffReqRef.current = null
    }
  }, [report, selectedFight, code, apiKey])

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true
    if (ffReqRef.current) void window.electronAPI.cancelFflogsCasts(ffReqRef.current)
  }, [])

  // ---------- 导入并模拟 ----------
  const startSim = useCallback(() => {
    if (mode === 'act') {
      if (!parsedEvents || !selectedEncounter || !selectedFile) return
      const petIds = collectPetIds(scanResult?.actors ?? [])
      const events = buildSimEvents(parsedEvents, selectedEncounter, new Set(sourceIds), petIds)
      const label = `${selectedFile.name} · ${selectedEncounter.zoneName || '未知区域'} ${formatTimeMs(selectedEncounter.end - selectedEncounter.start)}`
      setSimSession(events, label)
    } else {
      if (!enemyCasts || !selectedFight || !report) return
      const events = buildFflogsSimEvents(enemyCasts, selectedFight, new Set(ffSourceIds), report.enemies, actionNames)
      const fightName = selectedFight.zoneName || selectedFight.name || '未知区域'
      const label = `FFLogs ${report.title} · ${fightName} ${formatTimeMs(selectedFight.end_time - selectedFight.start_time)}`
      setSimSession(events, label)
    }
    onClose()
  }, [mode, parsedEvents, selectedEncounter, selectedFile, scanResult, sourceIds,
    enemyCasts, selectedFight, report, ffSourceIds, actionNames, setSimSession, onClose])

  if (!doc) return null

  const busy = mode === 'act' ? (scanning || parsing) : downloading
  const canNext = mode === 'act'
    ? (step === 1 && selectedFile !== null) || (step === 2 && selectedEncounter !== null && !scanning)
    : (step === 1 && report !== null) || (step === 2 && selectedFight !== null)
  const canImport = mode === 'act'
    ? parsedEvents !== null && !parsing && validationErrors.length === 0 && sourceIds.length > 0
    : enemyCasts !== null && !downloading && validationErrors.length === 0 && ffSourceIds.length > 0
  const activeSources = mode === 'act' ? sources : ffSources
  const activeSourceIds = mode === 'act' ? sourceIds : ffSourceIds
  const setActiveSourceIds = mode === 'act' ? setSourceIds : setFfSourceIds
  const loadedEventCount = mode === 'act' ? parsedEvents?.length : enemyCasts?.length

  return (
    <ModalShell
      title="模拟测试 — 导入战斗"
      description="支持 ACT 本地日志与 FFLogs 报告；导入后模拟结果直接显示在时间轴上，修改/增删锚点自动用同一份日志重新模拟"
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
                onClick={() => {
                  if (mode === 'act') { if (step === 1) void runScan(); else void runParse() }
                  else { if (step === 1) setStep(2); else void runDownload() }
                }}
                className="command-button-primary">下一步</button>
            )}
            {step === 3 && (
              <button type="button" disabled={!canImport} onClick={startSim}
                className="command-button-primary !border-amber-600 !bg-amber-600 hover:!bg-amber-500">
                <Play size={14} />导入并模拟
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* 来源切换 */}
      <div className="flex gap-1.5 px-5 pt-3">
        {([['act', 'ACT 本地日志'], ['fflogs', 'FFLogs 报告']] as const).map(([m, label]) => (
          <button key={m} type="button"
            onClick={() => { setMode(m); setStep(1) }}
            className={`px-3 py-1 rounded text-xs transition-colors border
              ${mode === m ? 'border-amber-600/70 bg-amber-950/40 text-amber-200' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>
      <Stepper steps={mode === 'act' ? ACT_STEPS : FF_STEPS} step={step} />
      <div className="px-5 py-4 min-h-72">
        {mode === 'act' && step === 1 && (
          <FileStep
            dir={dir} files={files} error={fileListError}
            selectedPath={selectedFile?.path ?? null} selectedName={selectedFile?.name ?? null}
            onSelect={setSelectedFile} onChangeDir={() => void changeDirectory()}
            onRefresh={() => void loadFiles(dir || undefined)} onBrowse={() => void browseFile()} />
        )}
        {mode === 'act' && step === 2 && (
          <EncounterStep
            scanning={scanning} error={scanError} progress={scanProgress}
            gapInput={gapInput} setGapInput={setGapInput} onRescan={() => void runScan()}
            encounters={scanResult?.encounters ?? null}
            encounterId={encounterId} onSelect={setEncounterId}
            onCancel={cancelRun} />
        )}
        {mode === 'fflogs' && step === 1 && (
          <ReportStep
            codeInput={codeInput} setCodeInput={v => { setCodeInput(v); setReport(null); setReportError('') }}
            code={code} apiKey={apiKey} setApiKey={setApiKey}
            loading={reportLoading} error={reportError} report={report} onQuery={queryReport} />
        )}
        {mode === 'fflogs' && step === 2 && report && (
          <FightStep report={report} fightId={fightId} onSelect={setFightId} />
        )}
        {step === 3 && (
          <div className="space-y-4 max-w-2xl">
            {mode === 'act' && parsing && parseProgress && (
              <ProgressBar label="解析战斗事件" percent={parseProgress.percent} detail={`${parseProgress.lines} 行`} />
            )}
            {mode === 'act' && parseError && (
              <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{parseError}</div>
            )}
            {mode === 'fflogs' && downloading && castsProgress && (
              <ProgressBar label="下载敌方施法数据" percent={castsProgress.percent}
                detail={`第 ${castsProgress.page} 页 · ${castsProgress.events} 条`} />
            )}
            {mode === 'fflogs' && downloading && (
              <button type="button" onClick={cancelDownload}
                className="command-button text-red-300 border-red-900/60">取消下载</button>
            )}
            {mode === 'fflogs' && downloadError && (
              <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{downloadError}</div>
            )}
            {validationErrors.length > 0 && (
              <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300 space-y-0.5">
                <div className="font-semibold">时间轴校验未通过，无法模拟：</div>
                {validationErrors.map((i, idx) => <div key={idx}>· {i.message}</div>)}
              </div>
            )}
            {loadedEventCount !== undefined && (
              <>
                <div className="text-[11px] text-gray-500">
                  解析到 {loadedEventCount} 个战斗事件（玩家与召唤物已过滤）。选择要喂给同步规则的敌方事件来源（默认全选）：
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeSources.map(src => {
                    const checked = activeSourceIds.includes(src.id)
                    return (
                      <label key={src.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[12px] transition-colors
                          ${checked ? 'border-amber-600/70 bg-amber-950/30 text-amber-100' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setActiveSourceIds(checked
                            ? activeSourceIds.filter(x => x !== src.id)
                            : [...activeSourceIds, src.id])}
                          className="h-3.5 w-3.5 accent-amber-500" />
                        {src.name}
                        <span className="text-[10px] text-gray-500">{src.count}</span>
                      </label>
                    )
                  })}
                  {activeSources.length === 0 && (
                    <span className="text-[11px] text-gray-600 italic">该战斗没有敌方单位事件</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-600 leading-5">
                  注：Weather / ChatLog / Countdown / AddedCombatant / NpcYell 等同步类型在战斗日志中没有对应事件源，
                  这些锚点在模拟中只会自然过期；ActorControl / Lua / Manual 在插件运行时永不命中。
                </div>
              </>
            )}
            {mode === 'fflogs' && downloading && <LoaderCircle size={16} className="animate-spin text-amber-400" />}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
