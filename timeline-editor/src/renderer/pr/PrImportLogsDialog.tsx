// PR 时间轴「从战斗日志导入」向导：选日志 → 锚点对齐预览/改选 → 技能落位预览 → 批量生成 enqueueskill 行为组
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModalShell } from '../components/ModalShell'
import { usePrStore } from '../store/prStore'
import { useStore } from '../store'
import { askAlert } from '../store/dialogStore'
import { functionalAnchors, formatPrTime } from './prModel'
import { formatTimeMs, isLogsTimelineDoc } from '../logs/logsTypes'
import type { LogsTimelineDoc } from '../logs/logsTypes'
import {
  alignedEventMs, anchorCastStart, buildSkillEntries, candidateEventsForAnchor,
  collectSkillUses, matchAnchorsToLog, placeSkills
} from './logsAlign'

const STEPS = ['选择日志', '锚点对齐', '导入预览'] as const

/** 下拉框中「留空」选项的哨兵值（事件 id 不会取到该值） */
const SKIP_VALUE = '__skip__'

const METHOD_BADGE: Record<string, { text: string; cls: string }> = {
  start: { text: '起点', cls: 'bg-gray-700 text-gray-300' },
  exact: { text: '精确', cls: 'bg-green-900/60 text-green-300' },
  interpolated: { text: '插值', cls: 'bg-yellow-900/60 text-yellow-300' },
  extrapolated: { text: '外推', cls: 'bg-red-900/60 text-red-300' }
}

interface LogsFileEntry {
  name: string
  path: string
}

interface PrImportLogsDialogProps {
  onClose: () => void
}

export function PrImportLogsDialog({ onClose }: PrImportLogsDialogProps) {
  const doc = usePrStore(s => s.doc)
  const importEntries = usePrStore(s => s.importEntries)
  const spellLookup = useStore(s => s.spellLookup)

  const [step, setStep] = useState(1)

  // ① 选择日志文件
  const [files, setFiles] = useState<LogsFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [filesError, setFilesError] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [logsDoc, setLogsDoc] = useState<LogsTimelineDoc | null>(null)
  const [loadError, setLoadError] = useState('')

  // ② 锚点对齐（人工钉选 anchorGuid → eventId；留空集合强制该锚点不参与匹配）
  const [pins, setPins] = useState<ReadonlyMap<string, string>>(new Map())
  const [skips, setSkips] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const dir = await window.electronAPI.getLogsDirectory()
        const result = await window.electronAPI.listDir(dir)
        if (cancelled) return
        if (!result.success || !result.entries) {
          setFilesError(result.error ?? '无法读取日志目录')
        } else {
          const base = dir.replace(/[\\/]+$/, '')
          setFiles(
            result.entries
              .filter(e => !e.isDirectory && e.name.endsWith('.json'))
              .map(e => ({ name: e.name, path: `${base}/${e.name}` }))
          )
        }
      } catch (err) {
        if (!cancelled) setFilesError(String(err))
      } finally {
        if (!cancelled) setFilesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const openLogsFile = useCallback(async (file: LogsFileEntry) => {
    setSelectedPath(file.path)
    setLoadError('')
    const result = await window.electronAPI.readFile(file.path)
    if (!result.success || !result.content) {
      setLogsDoc(null)
      setLoadError(result.error ?? '读取文件失败')
      return
    }
    try {
      const json = JSON.parse(result.content)
      if (!isLogsTimelineDoc(json)) {
        setLogsDoc(null)
        setLoadError('该文件不是战斗日志时间轴格式')
        return
      }
      setLogsDoc(json)
    } catch (err) {
      setLogsDoc(null)
      setLoadError(`JSON 解析失败: ${err}`)
    }
  }, [])

  // 功能锚点：End 锚点只做段边界，不参与匹配
  const anchors = useMemo(() => {
    if (!doc) return []
    return functionalAnchors(doc).filter(a => !a.IsEndAnchor)
  }, [doc])
  const endPrTime = useMemo(() => {
    if (!doc) return null
    const end = functionalAnchors(doc).find(a => a.IsEndAnchor)
    return end ? end.Time : null
  }, [doc])
  const anchorNameOf = useMemo(() => new Map(anchors.map(a => [a.Guid, a.Name || '(未命名)'])), [anchors])

  const events = useMemo(() => logsDoc?.events ?? [], [logsDoc])
  const uses = useMemo(() => (logsDoc ? collectSkillUses(logsDoc) : []), [logsDoc])

  const matches = useMemo(
    () => (logsDoc ? matchAnchorsToLog(anchors, events, pins, skips) : []),
    [logsDoc, anchors, events, pins, skips]
  )

  const placements = useMemo(
    () => (logsDoc ? placeSkills(matches, uses, endPrTime) : []),
    [logsDoc, matches, uses, endPrTime]
  )
  const validCount = placements.filter(p => !p.warning).length
  const clampedCount = placements.filter(p => !p.warning && p.clamped).length
  const skippedCount = placements.filter(p => !!p.warning).length
  const lowConfidence = matches.filter(m => m.method === 'interpolated' || m.method === 'extrapolated').length

  const confirmImport = useCallback(() => {
    const entries = buildSkillEntries(placements, matches, spellLookup)
    if (entries.length === 0) {
      askAlert({ title: '导入', message: '没有可导入的技能（全部缺少技能 ID 或超出范围）', danger: true })
      return
    }
    importEntries(entries)
    askAlert({
      title: '导入完成',
      message: `已导入 ${entries.length} 个行为组（加入技能队列 / 目标按技能射程自动）` +
        (clampedCount > 0 ? `\n${clampedCount} 个技能因越界被钳制/改挂` : '') +
        (skippedCount > 0 ? `\n${skippedCount} 个技能被跳过` : '') +
        '\n保存前可用撤销一次性回退。'
    })
    onClose()
  }, [placements, matches, spellLookup, importEntries, clampedCount, skippedCount, onClose])

  const canNext = step === 1 ? logsDoc !== null : step === 2 ? matches.length > 0 : false

  return (
    <ModalShell
      title="从战斗日志导入技能"
      description={`${STEPS.map((s, i) => `${i + 1 === step ? '●' : '○'} ${s}`).join('  ')} — 按锚点同步规则分段对齐，生成「加入技能队列」行为组（目标按技能射程自动：自身/当前目标）`}
      onClose={onClose}
      widthClass="max-w-4xl"
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors disabled:opacity-40"
          >
            上一步
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
            >
              取消
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 rounded text-white transition-colors disabled:opacity-40"
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmImport}
                disabled={validCount === 0}
                className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 rounded text-white transition-colors disabled:opacity-40"
              >
                确认导入 {validCount} 个技能
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="p-5">
        {step === 1 && (
          <div>
            {filesLoading && <div className="text-sm text-gray-400">正在读取日志目录…</div>}
            {filesError && <div className="text-sm text-red-400">{filesError}</div>}
            {!filesLoading && !filesError && files.length === 0 && (
              <div className="text-sm text-gray-400">LogsTimelines 目录中没有日志文档，请先在「战斗日志」模式导入 FFLogs 数据。</div>
            )}
            <div className="flex flex-col gap-1">
              {files.map(f => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => void openLogsFile(f)}
                  className={`text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedPath === f.path
                      ? 'bg-blue-900/50 text-blue-200 outline outline-1 outline-blue-600'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
            {loadError && <div className="mt-2 text-sm text-red-400">{loadError}</div>}
            {logsDoc && (
              <div className="mt-3 text-xs text-gray-400">
                {logsDoc.name} — 时长 {formatTimeMs(logsDoc.lengthMs)}，BOSS 事件 {events.length} 个，技能使用 {uses.length} 次
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            {lowConfidence > 0 && (
              <div className="mb-3 px-3 py-2 rounded bg-yellow-900/30 text-yellow-300 text-xs">
                {lowConfidence} 个锚点无法从日志精确匹配，已用插值/外推估算（标黄/红）。可在下方下拉框中人工改选对应事件；日志中没有对应事件时可选「留空」跳过匹配。
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="py-1.5 pr-2 font-normal">锚点</th>
                  <th className="py-1.5 pr-2 font-normal w-20">PR 时间</th>
                  <th className="py-1.5 pr-2 font-normal w-16">匹配</th>
                  <th className="py-1.5 font-normal">日志事件</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(m => {
                  const anchor = anchors.find(a => a.Guid === m.anchorGuid)
                  const badge = METHOD_BADGE[m.method]
                  const castStart = anchor ? anchorCastStart(anchor) : false
                  const candidates = anchor ? candidateEventsForAnchor(anchor, events) : []
                  const pinned = pins.has(m.anchorGuid)
                  const skipped = skips.has(m.anchorGuid)
                  return (
                    <tr key={m.anchorGuid} className="border-b border-gray-800">
                      <td className="py-1.5 pr-2 text-gray-200">
                        {anchorNameOf.get(m.anchorGuid)}
                        {anchor?.Sync && anchor.Sync.Type !== 'None' && (
                          <span className={`ml-1.5 px-1 py-px rounded text-[10px] ${
                            castStart ? 'bg-cyan-900/60 text-cyan-300' : 'bg-purple-900/60 text-purple-300'
                          }`}>
                            {castStart ? '读条' : anchor.Sync.Type === 'ActionEffect' ? '判定' : anchor.Sync.Type}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-gray-400">{formatPrTime(m.prTime)}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${badge.cls}`}>{badge.text}</span>
                      </td>
                      <td className="py-1.5 text-gray-300">
                        {m.method === 'start' ? (
                          <span className="text-gray-500">战斗开始</span>
                        ) : candidates.length > 0 ? (
                          <select
                            value={skipped ? SKIP_VALUE : (m.eventId ?? '')}
                            onChange={e => {
                              const v = e.target.value
                              if (v === SKIP_VALUE) {
                                setPins(prev => {
                                  if (!prev.has(m.anchorGuid)) return prev
                                  const next = new Map(prev)
                                  next.delete(m.anchorGuid)
                                  return next
                                })
                                setSkips(prev => new Set(prev).add(m.anchorGuid))
                              } else {
                                setSkips(prev => {
                                  if (!prev.has(m.anchorGuid)) return prev
                                  const next = new Set(prev)
                                  next.delete(m.anchorGuid)
                                  return next
                                })
                                setPins(prev => {
                                  const next = new Map(prev)
                                  if (v) next.set(m.anchorGuid, v)
                                  else next.delete(m.anchorGuid)
                                  return next
                                })
                              }
                            }}
                            className="field-input !w-full text-xs"
                          >
                            <option value={SKIP_VALUE}>
                              {skipped ? `（留空 — 插值估算 ${formatTimeMs(m.logMs)}）` : '（留空 — 不匹配任何事件）'}
                            </option>
                            {(pinned || skipped) && <option value="">（自动匹配）</option>}
                            {!pinned && !skipped && !m.eventId && (
                              <option value="">（未匹配 — 插值估算 {formatTimeMs(m.logMs)}）</option>
                            )}
                            {candidates.map(ev => (
                              <option key={ev.id} value={ev.id}>
                                {formatTimeMs(alignedEventMs(ev, castStart))} {ev.skillName || ev.text}
                                {castStart && ev.durationMs ? `（读条 ${formatTimeMs(ev.durationMs)}）` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-500">无候选事件（估算 {formatTimeMs(m.logMs)}）</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-3 text-xs text-gray-400">
              共 {validCount} 个技能将导入
              {clampedCount > 0 && <span className="text-yellow-300">，{clampedCount} 个越界被钳制/改挂</span>}
              {skippedCount > 0 && <span className="text-red-300">，{skippedCount} 个跳过（缺技能 ID 或超出范围）</span>}
            </div>
            <div className="flex flex-col gap-2">
              {matches.map((m, i) => {
                const rows = placements.filter(p => !p.warning && p.anchorGuid === m.anchorGuid)
                const skipped = placements.filter(p => !!p.warning && i === matches.length - 1)
                if (rows.length === 0 && skipped.length === 0) return null
                return (
                  <div key={m.anchorGuid} className="rounded border border-gray-800">
                    <div className="px-3 py-1.5 bg-gray-800/60 text-sm text-gray-200">
                      {anchorNameOf.get(m.anchorGuid)}
                      <span className="ml-2 text-xs text-gray-500">{formatPrTime(m.prTime)}</span>
                      <span className="ml-2 text-xs text-gray-500">{rows.length} 个技能</span>
                    </div>
                    <div className="px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                      {rows.map((p, j) => (
                        <span key={j} className={p.clamped ? 'text-yellow-300' : 'text-gray-300'}>
                          +{formatPrTime(p.offset)} {p.use.name}
                        </span>
                      ))}
                      {skipped.map((p, j) => (
                        <span key={`s${j}`} className="text-red-400 line-through" title={p.warning}>
                          {formatTimeMs(p.use.timeMs)} {p.use.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
