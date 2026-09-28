// PR 时间轴「日志生成时间轴」导入向导：ACT 本地日志 / FFLogs 报告双来源，三步
// （添加战斗 → 事件来源 → 合并预览）。支持把多场战斗加入清单做对比融合：
// 同一次施法跨场对齐为一个锚点，跨场 id 不同（同一技能多个 ID）合并为 Regex 同步。
// 副本没有 cactbot 时间轴时从日志直接生成锚点骨架（不生成行为组）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ListPlus, X } from 'lucide-react'
import type { ActLogFileInfo, ActScanResult } from '@shared/actTypes'
import { DEFAULT_FFLOGS_API_KEY, extractFflogsReportCode } from '@shared/fflogsTypes'
import type { FflogsReportInfo } from '@shared/fflogsTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import { ModalShell } from '../components/ModalShell'
import { askAlert, askConfirm } from '../store/dialogStore'
import { usePrStore } from '../store/prStore'
import { platform } from '../platform'
import { formatPrTime } from './prModel'
import { formatTimeMs } from '../logs/logsTypes'
import { EncounterStep, FileStep } from '../logs/ActImportDialog'
import { FightStep, ReportStep } from '../logs/FflogsImportDialog'
import { ProgressBar, Stepper } from '../logs/ImportSteps'
import { loadActionNames } from '../logs/actionNames'
import {
  buildActBossFight, buildFflogsBossFight, buildTimelineFromClusters,
  DEFAULT_MERGE_OPTIONS, LOG_IMPORT_TEST_WARNING, mergeBossFights,
  type BossLogFight
} from './logMerge'

const STEPS = ['添加战斗', '事件来源', '合并预览'] as const

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

interface PrBossImportDialogProps {
  onClose: () => void
}

export function PrBossImportDialog({ onClose }: PrBossImportDialogProps) {
  const isDirty = usePrStore(s => s.isDirty)
  const importDocument = usePrStore(s => s.importDocument)

  const [mode, setMode] = useState<'act' | 'fflogs'>('act')
  const [step, setStep] = useState(1)
  const [basket, setBasket] = useState<BossLogFight[]>([])

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

  // ===== 合并选项 =====
  const [windowInput, setWindowInput] = useState(String(DEFAULT_MERGE_OPTIONS.windowMs / 1000))
  const [minFights, setMinFights] = useState(1)
  const [includeEffectAnchors, setIncludeEffectAnchors] = useState(true)
  const [docName, setDocName] = useState('')
  const docNameTouched = useRef(false)

  const reqIdRef = useRef<string | null>(null)
  const phaseRef = useRef<'scan' | 'parse' | null>(null)
  const ffReqRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const busy = scanning || parsing || downloading

  const windowMs = useMemo(() => {
    const seconds = Number(windowInput)
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(10, seconds) * 1000 : DEFAULT_MERGE_OPTIONS.windowMs
  }, [windowInput])

  const clusters = useMemo(
    () => mergeBossFights(basket, { windowMs, minFights, includeEffectAnchors }),
    [basket, windowMs, minFights, includeEffectAnchors]
  )

  // ---------- 战斗清单 ----------
  const appendFight = useCallback((fight: BossLogFight) => {
    setBasket(list => [...list, fight])
    if (!docNameTouched.current && fight.zoneName) setDocName(fight.zoneName)
  }, [])

  const removeFight = useCallback((key: string) => {
    setBasket(list => list.filter(f => f.key !== key))
  }, [])

  const toggleFightSource = useCallback((key: string, sourceId: number, checked: boolean) => {
    setBasket(list => list.map(f => f.key !== key ? f : {
      ...f,
      selectedSourceIds: checked
        ? [...f.selectedSourceIds, sourceId]
        : f.selectedSourceIds.filter(id => id !== sourceId)
    }))
  }, [])

  // ---------- ACT 流程 ----------
  const loadFiles = useCallback(async (directory?: string) => {
    setFileListError('')
    try {
      const result = await platform.listActLogFiles(directory)
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
        const directory = await platform.getActLogsDirectory()
        if (!mounted) return
        setDir(directory)
        void loadFiles(directory)
      } catch { /* IPC 未就绪 */ }
    })()
    return () => { mounted = false }
  }, [loadFiles])

  useEffect(() => {
    try {
      return platform.onActProgress(p => {
        if (p.requestId !== reqIdRef.current) return
        const update = { percent: p.percent, lines: p.lines }
        if (phaseRef.current === 'scan') setScanProgress(update)
        else if (phaseRef.current === 'parse') setParseProgress(update)
      })
    } catch {
      return undefined
    }
  }, [])

  useEffect(() => {
    try {
      return platform.onFflogsProgress(p => {
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
        if (reqIdRef.current) void platform.cancelActLog(reqIdRef.current)
        if (ffReqRef.current) void platform.cancelFflogsCasts(ffReqRef.current)
      } catch { /* IPC 未就绪 */ }
    }
  }, [])

  const changeDirectory = useCallback(async () => {
    try {
      const result = await platform.selectActLogsDirectory()
      if (!result.cancelled && result.directory) {
        setDir(result.directory)
        void loadFiles(result.directory)
      }
    } catch { /* 用户取消或 IPC 未就绪 */ }
  }, [loadFiles])

  const browseFile = useCallback(async () => {
    try {
      const result = await platform.openActLogFileDialog()
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
    try {
      const result = await platform.scanActLog({ requestId, path: selectedFile.path, gapMs })
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

  /** 解析选中的战斗并追加到清单（同一文件可重复添加多场） */
  const addActFight = useCallback(async () => {
    if (!selectedFile || !selectedEncounter || !scanResult) return
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    reqIdRef.current = requestId
    phaseRef.current = 'parse'
    setParsing(true)
    setParseError('')
    setParseProgress({ percent: 0, lines: 0 })
    try {
      const result = await platform.parseActLog({
        requestId,
        path: selectedFile.path,
        start: selectedEncounter.start,
        end: selectedEncounter.end
      })
      if (!result.success) {
        if (!result.cancelled && !cancelledRef.current) setParseError(result.error)
        return
      }
      const label = `${selectedFile.name} · ${selectedEncounter.zoneName || '未知区域'} ${formatTimeMs(selectedEncounter.end - selectedEncounter.start)}`
      appendFight(buildActBossFight(
        crypto.randomUUID(), label, result.data, scanResult.actors, selectedEncounter
      ))
    } catch (err) {
      if (!cancelledRef.current) setParseError(String(err instanceof Error ? err.message : err))
    } finally {
      setParsing(false)
      reqIdRef.current = null
      phaseRef.current = null
    }
  }, [selectedFile, selectedEncounter, scanResult, appendFight])

  const cancelRun = useCallback(() => {
    cancelledRef.current = true
    if (reqIdRef.current) void platform.cancelActLog(reqIdRef.current)
  }, [])

  // ---------- FFLogs 流程 ----------
  const queryReport = useCallback(async () => {
    if (!code) return
    setReportLoading(true)
    setReportError('')
    setReport(null)
    try {
      const result = await platform.fetchFflogsReport(code, apiKey || undefined)
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

  /** 只下载敌方（hostility=1）施法；同一报告可重复添加多把 */
  const addFflogsFight = useCallback(async () => {
    if (!report || !selectedFight || !code) return
    cancelledRef.current = false
    const requestId = crypto.randomUUID()
    ffReqRef.current = requestId
    setDownloading(true)
    setDownloadError('')
    setCastsProgress({ percent: 0, page: 0, events: 0 })
    try {
      const namesPromise = loadActionNames()
      const result = await platform.fetchFflogsCasts({
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
      const names: ActionNameDatabase | undefined = await namesPromise ?? undefined
      const fightName = selectedFight.zoneName || selectedFight.name || '未知区域'
      const label = `FFLogs ${report.title} · ${fightName} #${selectedFight.id} ${formatTimeMs(selectedFight.end_time - selectedFight.start_time)}`
      appendFight(buildFflogsBossFight(
        crypto.randomUUID(), label, result.data, selectedFight, report.enemies, names
      ))
    } catch (err) {
      if (!cancelledRef.current) setDownloadError(String(err instanceof Error ? err.message : err))
    } finally {
      setDownloading(false)
      ffReqRef.current = null
    }
  }, [report, selectedFight, code, apiKey, appendFight])

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true
    if (ffReqRef.current) void platform.cancelFflogsCasts(ffReqRef.current)
  }, [])

  // ---------- 导入 ----------
  const doImport = useCallback(async () => {
    const name = docName.trim() || '日志时间轴'
    if (isDirty && !await askConfirm({
      title: '替换当前未保存的时间轴？',
      message: '导入会用日志生成的时间轴替换当前编辑内容，磁盘文件不会被修改。',
      confirmLabel: '替换并导入',
      danger: true
    })) return
    const doc = buildTimelineFromClusters(clusters, {
      name,
      sourceLabels: basket.map(f => f.label)
    })
    importDocument(doc, name)
    onClose()
    const multiId = clusters.filter(c => c.ids.length > 1).length
    void askAlert({
      title: '导入完成',
      message: `已生成 ${clusters.length} 个技能锚点` +
        (multiId ? `，其中 ${multiId} 个合并了多个技能 ID（锚点带 ⚠ 标记与备注）` : '') +
        `。\n${LOG_IMPORT_TEST_WARNING}`
    })
  }, [clusters, docName, basket, isDirty, importDocument, onClose])

  const canNext = step === 1 ? basket.length > 0 && !busy
    : step === 2 ? basket.every(f => f.selectedSourceIds.length > 0)
      : false

  return (
    <ModalShell
      title="从日志生成时间轴"
      description="适用于没有 cactbot 收录的副本：从 ACT 本地日志 / FFLogs 报告提取 BOSS 施法生成锚点；可添加多场战斗对比融合"
      onClose={onClose}
      widthClass="max-w-5xl"
      footer={
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="command-button">取消</button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)} disabled={busy}
                className="command-button">上一步</button>
            )}
            {step < 3 && (
              <button type="button" disabled={!canNext} onClick={() => setStep(s => s + 1)}
                className="command-button-primary">下一步</button>
            )}
            {step === 3 && (
              <button type="button" disabled={clusters.length === 0} onClick={() => void doImport()}
                className="command-button-primary !border-amber-600 !bg-amber-600 hover:!bg-amber-500">
                <ListPlus size={14} />导入时间轴（{clusters.length} 个锚点）
              </button>
            )}
          </div>
        </div>
      }
    >
      <Stepper steps={STEPS} step={step} />
      <div className="px-5 py-4 min-h-96">
        {step === 1 && (
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex gap-1.5">
                {([['act', 'ACT 本地日志'], ['fflogs', 'FFLogs 报告']] as const).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`px-3 py-1 rounded text-xs transition-colors border
                      ${mode === m ? 'border-amber-600/70 bg-amber-950/40 text-amber-200' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'act' && (
                <div className="space-y-4">
                  <FileStep
                    dir={dir} files={files} error={fileListError}
                    selectedPath={selectedFile?.path ?? null} selectedName={selectedFile?.name ?? null}
                    onSelect={f => { setSelectedFile(f); setScanResult(null); setParseError('') }}
                    onChangeDir={() => void changeDirectory()}
                    onRefresh={() => void loadFiles(dir || undefined)} onBrowse={() => void browseFile()} />
                  {selectedFile && !scanResult && (
                    <button type="button" onClick={() => void runScan()} disabled={scanning}
                      className="command-button-primary">
                      {scanning ? '扫描中…' : '扫描战斗'}
                    </button>
                  )}
                  {(scanResult || scanning || scanError) && (
                    <EncounterStep
                      scanning={scanning} error={scanError} progress={scanProgress}
                      gapInput={gapInput} setGapInput={setGapInput} onRescan={() => void runScan()}
                      encounters={scanResult?.encounters ?? null}
                      encounterId={encounterId} onSelect={setEncounterId}
                      onCancel={cancelRun} />
                  )}
                  {scanResult && (
                    <div className="space-y-2">
                      <button type="button" onClick={() => void addActFight()}
                        disabled={!selectedEncounter || parsing}
                        className="command-button-primary">
                        <ListPlus size={14} />{parsing ? '解析中…' : '解析并添加到清单'}
                      </button>
                      {parsing && parseProgress && (
                        <ProgressBar label="解析战斗事件" percent={parseProgress.percent} detail={`${parseProgress.lines} 行`} />
                      )}
                      {parseError && (
                        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{parseError}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {mode === 'fflogs' && (
                <div className="space-y-4">
                  <ReportStep
                    codeInput={codeInput} setCodeInput={v => { setCodeInput(v); setReport(null); setReportError('') }}
                    code={code} apiKey={apiKey} setApiKey={setApiKey}
                    loading={reportLoading} error={reportError} report={report} onQuery={queryReport} />
                  {report && (
                    <>
                      <FightStep report={report} fightId={fightId} onSelect={setFightId} />
                      <div className="space-y-2">
                        <button type="button" onClick={() => void addFflogsFight()}
                          disabled={!selectedFight || downloading}
                          className="command-button-primary">
                          <ListPlus size={14} />{downloading ? '下载中…' : '下载并添加到清单'}
                        </button>
                        {downloading && castsProgress && (
                          <ProgressBar label="下载敌方施法数据" percent={castsProgress.percent}
                            detail={`第 ${castsProgress.page} 页 · ${castsProgress.events} 条`} />
                        )}
                        {downloading && (
                          <button type="button" onClick={cancelDownload}
                            className="command-button text-red-300 border-red-900/60">取消下载</button>
                        )}
                        {downloadError && (
                          <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{downloadError}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <FightBasket basket={basket} onRemove={removeFight} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4 max-w-3xl">
            <div className="text-[11px] text-gray-500">
              选择每场战斗中要纳入时间轴的敌方事件来源（默认全选；小怪/无关单位可取消勾选）：
            </div>
            {basket.map(fight => (
              <div key={fight.key} className="rounded border border-gray-700 px-3 py-2">
                <div className="mb-1.5 truncate text-xs text-gray-300" title={fight.label}>{fight.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {fight.sources.map(src => {
                    const checked = fight.selectedSourceIds.includes(src.id)
                    return (
                      <label key={src.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[12px] transition-colors
                          ${checked ? 'border-amber-600/70 bg-amber-950/30 text-amber-100' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => toggleFightSource(fight.key, src.id, !checked)}
                          className="h-3.5 w-3.5 accent-amber-500" />
                        {src.name}
                        <span className="text-[10px] text-gray-500">{src.count}</span>
                      </label>
                    )
                  })}
                  {fight.sources.length === 0 && (
                    <span className="text-[11px] text-gray-600 italic">该战斗没有敌方单位事件</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{LOG_IMPORT_TEST_WARNING}</span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="w-56 text-xs text-gray-400">文档名称
                <input type="text" value={docName}
                  onChange={e => { docNameTouched.current = true; setDocName(e.target.value) }}
                  className="field-input mt-1" placeholder="日志时间轴" />
              </label>
              <label className="w-36 text-xs text-gray-400" title="同一次施法在不同日志中的时间差不超过该值即对齐为一个锚点">合并窗口（秒）
                <input type="number" min={0.5} max={10} step={0.5} value={windowInput}
                  onChange={e => setWindowInput(e.target.value)} className="field-input mt-1" />
              </label>
              <label className="w-36 text-xs text-gray-400" title="只保留在至少 N 场战斗中出现的技能（滤掉偶发事件）">最少出现场次
                <select value={minFights} onChange={e => setMinFights(Number(e.target.value))} className="field-input mt-1">
                  {Array.from({ length: basket.length }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} / {basket.length} 场</option>
                  ))}
                </select>
              </label>
              <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-gray-300"
                title="读条技能的判定事件也生成锚点（xxx 开始读条 / xxx 判定 各一个）；关闭后只保留「开始读条」锚点">
                <input type="checkbox" checked={includeEffectAnchors}
                  onChange={e => setIncludeEffectAnchors(e.target.checked)}
                  className="h-4 w-4 accent-amber-500" />
                同时生成判定锚点
              </label>
            </div>
            <MergePreviewTable clusters={clusters} basket={basket} />
          </div>
        )}
      </div>
    </ModalShell>
  )
}

/** 战斗清单侧栏：已添加的每场战斗（来源标签 + 事件数 + 移除） */
function FightBasket({ basket, onRemove }: { basket: BossLogFight[]; onRemove: (key: string) => void }) {
  return (
    <aside className="w-72 shrink-0 rounded border border-gray-700 bg-gray-950/40 p-2.5 self-start">
      <div className="mb-1.5 text-[11px] font-semibold uppercase text-gray-500">
        战斗清单（{basket.length} 场）
      </div>
      {basket.length === 0 && (
        <div className="py-3 text-center text-[11px] leading-5 text-gray-600">
          扫描/下载战斗后点「添加到清单」<br />添加多场可对比融合
        </div>
      )}
      <div className="space-y-1.5">
        {basket.map((fight, index) => (
          <div key={fight.key} className="flex items-center gap-2 rounded border border-gray-700/80 bg-gray-800/60 px-2 py-1.5">
            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold
              ${fight.source === 'act' ? 'bg-sky-950 text-sky-300' : 'bg-violet-950 text-violet-300'}`}>
              {fight.source === 'act' ? 'ACT' : 'FFL'}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300" title={fight.label}>
              {index + 1}. {fight.label}
            </span>
            <span className="shrink-0 text-[10px] text-gray-500">{fight.events.length} 事件</span>
            <button type="button" onClick={() => onRemove(fight.key)}
              className="shrink-0 text-gray-500 hover:text-red-300" aria-label="移除" title="移除">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}

/** 合并预览对比表：每行一个对齐后的锚点（多 ID 高亮 ⚠；各场时间悬浮可见） */
function MergePreviewTable({ clusters, basket }: {
  clusters: ReturnType<typeof mergeBossFights>
  basket: BossLogFight[]
}) {
  if (clusters.length === 0) {
    return <div className="py-8 text-center text-xs text-gray-600 italic">当前选项下没有可导入的锚点</div>
  }
  return (
    <div className="max-h-80 overflow-auto rounded border border-gray-700">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-800 text-[10px] uppercase text-gray-500">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium">时间</th>
            <th className="px-2.5 py-1.5 text-left font-medium">技能</th>
            <th className="px-2.5 py-1.5 text-left font-medium">ID</th>
            <th className="px-2.5 py-1.5 text-left font-medium">类型</th>
            <th className="px-2.5 py-1.5 text-left font-medium">出现</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {clusters.map((cluster, index) => {
            const multiId = cluster.ids.length > 1
            const perFightTitle = cluster.perFight
              .map(p => `${basket[p.fightIndex]?.label ?? `第 ${p.fightIndex + 1} 场`}: ${p.timesMs.map(t => formatPrTime(t / 1000)).join(', ')}`)
              .join('\n')
            return (
              <tr key={index} className="text-gray-300 hover:bg-gray-800/50" title={perFightTitle}>
                <td className="px-2.5 py-1 font-mono text-gray-400">{formatPrTime(cluster.timeMs / 1000)}</td>
                <td className="max-w-52 truncate px-2.5 py-1" title={cluster.names.join(' / ')}>
                  {multiId && <AlertTriangle size={12} className="mr-1 inline text-amber-400" aria-label="多个技能 ID" />}
                  {cluster.names[0]}
                </td>
                <td className={`px-2.5 py-1 font-mono text-[11px] ${multiId ? 'text-amber-300' : 'text-gray-500'}`}>
                  {cluster.ids.join(' | ')}
                </td>
                <td className="px-2.5 py-1 text-gray-500">{cluster.kind === 'start' ? '开始读条' : '判定'}</td>
                <td className="px-2.5 py-1">
                  <span className={cluster.fightCount < basket.length ? 'text-amber-400' : 'text-gray-400'}>
                    {cluster.fightCount}/{basket.length}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
