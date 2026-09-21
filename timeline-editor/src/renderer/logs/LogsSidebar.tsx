import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, Check, FileJson, FolderCog, Plus, RefreshCw, Search, X
} from 'lucide-react'
import type { JobSkillDef, JobSkillGroup } from '@shared/jobSkillTypes'
import type { LogsSkillColumn } from './logsTypes'
import { columnMatchName } from './logsTypes'
import { useAbilityColumns, useGcdTracks, useLogsStore } from './logsStore'
import { useJobSkillDb } from './skillDb'
import { findActionIdByName, loadActionNames } from './actionNames'
import { SkillIconImg } from './logsIcon'
import { askConfirm } from '../store/dialogStore'

interface LogFileEntry {
  name: string
  path: string
}

function FilesPane() {
  const [files, setFiles] = useState<LogFileEntry[]>([])
  const [dir, setDir] = useState('')
  const filePath = useLogsStore(s => s.filePath)
  const isDirty = useLogsStore(s => s.isDirty)
  const loadFile = useLogsStore(s => s.loadFile)

  const refresh = useCallback(async (targetDir: string) => {
    const result = await window.electronAPI.listDir(targetDir)
    if (result.success && result.entries) {
      setFiles(result.entries
        .filter(e => !e.isDirectory && e.name.endsWith('.json'))
        .map(e => ({ name: e.name, path: `${targetDir}/${e.name}`.replace(/\\/g, '/') }))
        .sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      setFiles([])
    }
  }, [])

  useEffect(() => {
    // 主进程 IPC 并行开发中，方法可能尚不存在
    void Promise.resolve()
      .then(() => window.electronAPI.getLogsDirectory())
      .then(d => {
        const normalized = d.replace(/\\/g, '/')
        setDir(normalized)
        void refresh(normalized)
      })
      .catch(() => setDir(''))
  }, [refresh])

  useEffect(() => {
    try {
      return window.electronAPI.onLogsDirectoryChanged(newDir => {
        const normalized = newDir.replace(/\\/g, '/')
        setDir(normalized)
        void refresh(normalized)
      })
    } catch {
      return undefined
    }
  }, [refresh])

  const changeDir = useCallback(async () => {
    const result = await window.electronAPI.selectLogsDirectory()
    if (!result.cancelled && result.directory) {
      const normalized = result.directory.replace(/\\/g, '/')
      setDir(normalized)
      void refresh(normalized)
    }
  }, [refresh])

  const openFile = useCallback(async (entry: LogFileEntry) => {
    if (entry.path === filePath) return
    if (isDirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        message: `当前时间轴有未保存的修改，打开「${entry.name}」将丢失这些修改。`,
        confirmLabel: '放弃并打开',
        danger: true
      })
      if (!ok) return
    }
    const ok = await loadFile(entry.path)
    if (ok) document.title = `Timeline Editor - ${entry.name}`
  }, [filePath, isDirty, loadFile])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] text-gray-500 truncate flex-1" title={dir}>{dir || '…'}</div>
          <button onClick={changeDir} className="icon-button !h-6 !w-6" title="更改 logs 目录">
            <FolderCog size={13} />
          </button>
          <button onClick={() => dir && refresh(dir)} className="icon-button !h-6 !w-6" title="刷新文件列表">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {files.map(entry => {
          const current = entry.path === filePath
          return (
            <div key={entry.path} onClick={() => openFile(entry)}
              className={`px-3 py-1.5 text-sm cursor-pointer truncate transition-colors border-l-2 flex items-center
                ${current ? 'bg-amber-900/30 border-amber-500 text-amber-200'
                  : 'border-transparent hover:bg-gray-700 text-gray-300 hover:text-gray-100'}`}
              title={entry.path}>
              <FileJson size={13} className="mr-2 flex-shrink-0 opacity-60" />
              <span className="truncate">{entry.name}</span>
              {current && isDirty && <span className="ml-1 text-amber-400">*</span>}
            </div>
          )
        })}
        {files.length === 0 && (
          <div className="p-3 text-sm text-gray-500 italic">
            目录为空或不存在
            <div className="text-[11px] mt-1 text-gray-600">点击右上角图标选择 logs 文件夹</div>
          </div>
        )}
      </div>
    </div>
  )
}

function defToColumn(def: JobSkillDef): Partial<Omit<LogsSkillColumn, 'id' | 'kind'>> & { name: string } {
  return {
    name: def.name,
    icon: def.icon,
    cd: def.cd || undefined,
    duration: def.duration || undefined,
    cast: def.cast || undefined,
    count: def.count ?? undefined,
    dmgType: def.dmgType,
    intro: def.intro,
    lv: def.lv,
    skillId: findActionIdByName(def.name)
  }
}

type SkillSegment = 'abilities' | 'roleSkills' | 'gcds'

const SEGMENT_LABELS: { key: SkillSegment; label: string }[] = [
  { key: 'abilities', label: '能力' },
  { key: 'roleSkills', label: '职能' },
  { key: 'gcds', label: 'GCD' }
]

function SkillsPane() {
  const abilityCols = useAbilityColumns()
  const gcdTracks = useGcdTracks()
  const selection = useLogsStore(s => s.selection)
  const select = useLogsStore(s => s.select)
  const addColumn = useLogsStore(s => s.addColumn)
  const addGcdTrack = useLogsStore(s => s.addGcdTrack)
  const removeColumn = useLogsStore(s => s.removeColumn)
  const moveColumn = useLogsStore(s => s.moveColumn)
  const db = useJobSkillDb()
  const hasDoc = useLogsStore(s => s.doc !== null)

  const [job, setJob] = useState('')
  const [segment, setSegment] = useState<SkillSegment>('abilities')
  const [search, setSearch] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  // 预载中文名库（技能 ID 反查用；完成后触发重渲染让 title 带上 ID）
  const [, setNamesReady] = useState(false)
  useEffect(() => {
    void loadActionNames().then(db => { if (db) setNamesReady(true) })
  }, [])

  const jobs = useMemo(() => Object.keys(db?.jobs ?? {}), [db])
  const effectiveJob = job || jobs[0] || ''

  const skills = useMemo(() => {
    if (!db) return [] as { def: JobSkillDef; jobName: string }[]
    const needle = search.trim().toLowerCase()
    const out: { def: JobSkillDef; jobName: string }[] = []
    const groups: [string, JobSkillGroup][] = effectiveJob === '全部'
      ? Object.entries(db.jobs)
      : [[effectiveJob, db.jobs[effectiveJob]]] as [string, JobSkillGroup][]
    for (const [jobName, group] of groups) {
      if (!group) continue
      for (const def of group[segment]) {
        if (needle && !def.name.toLowerCase().includes(needle)) continue
        out.push({ def, jobName })
      }
    }
    return out.slice(0, 200)
  }, [db, effectiveJob, segment, search])

  const existingKeys = useMemo(() => {
    const kind = segment === 'gcds' ? 'gcd' : 'ability'
    return new Set([...abilityCols, ...gcdTracks]
      .filter(c => c.kind === kind)
      .map(c => columnMatchName(c)))
  }, [abilityCols, gcdTracks, segment])

  const pickSkill = useCallback((def: JobSkillDef) => {
    if (segment === 'gcds') addGcdTrack(def.name, defToColumn(def))
    else addColumn(defToColumn(def), 'ability')
  }, [segment, addColumn, addGcdTrack])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      {!hasDoc && (
        <div className="mx-2 mt-2 rounded border border-amber-800/60 bg-amber-950/30 px-2.5 py-2 text-[11px] leading-4 text-amber-200/90">
          尚未打开文件——请先在中央面板 <b>① 新建文件</b>，再回来 <b>② 选择技能</b>，最后 <b>③ 导入 FFLogs</b>
        </div>
      )}
      {/* 能力技列 */}
      <div className="px-2 pt-2">
        <div className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider mb-1">能力技列</div>
        {abilityCols.length === 0 && <div className="text-[11px] text-gray-600 italic px-1 pb-1">尚未添加，从下方技能库挑选</div>}
        {abilityCols.map((col, i) => {
          const selected = selection?.kind === 'column' && selection.id === col.id
          return (
            <div key={col.id} onClick={() => select({ kind: 'column', id: col.id })}
              className={`group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[12px] transition-colors
                ${selected ? 'bg-amber-900/40 text-amber-200' : 'text-gray-300 hover:bg-gray-700'}`}>
              <SkillIconImg src={col.icon} name={col.name} size={20} />
              <span className="truncate flex-1" title={columnMatchName(col)}>{col.name}</span>
              {col.cd ? <span className="text-[10px] text-gray-500 flex-shrink-0">{col.cd}s</span> : null}
              <span className="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); moveColumn(col.id, -1) }} disabled={i === 0}
                  className="p-0.5 text-gray-500 hover:text-gray-200 disabled:opacity-30" title="上移">
                  <ArrowUp size={12} />
                </button>
                <button onClick={e => { e.stopPropagation(); moveColumn(col.id, 1) }} disabled={i === abilityCols.length - 1}
                  className="p-0.5 text-gray-500 hover:text-gray-200 disabled:opacity-30" title="下移">
                  <ArrowDown size={12} />
                </button>
                <button onClick={e => { e.stopPropagation(); removeColumn(col.id) }}
                  className="p-0.5 text-gray-500 hover:text-red-400" title="删除列（连带该列使用记录，可撤销）">
                  <X size={12} />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {/* GCD 跟踪 */}
      <div className="px-2 pt-2">
        <div className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider mb-1">GCD 跟踪</div>
        <div className="flex flex-wrap gap-1">
          {gcdTracks.length === 0 && <div className="text-[11px] text-gray-600 italic px-1">未跟踪 GCD 技能</div>}
          {gcdTracks.map(col => (
            <span key={col.id}
              className="inline-flex items-center gap-1 pl-1 pr-0.5 py-0.5 rounded bg-gray-700/70 text-[11px] text-gray-300">
              <SkillIconImg src={col.icon} name={col.name} size={16} />
              {col.name}
              <button onClick={() => removeColumn(col.id)} className="p-0.5 text-gray-500 hover:text-red-400" title="取消跟踪">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 添加技能 */}
      <div className="px-2 pt-3 pb-2 border-t border-gray-700/60 mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">添加技能</div>
          <button onClick={() => setShowCustom(v => !v)}
            className={`text-[11px] ${showCustom ? 'text-amber-300' : 'text-gray-500 hover:text-gray-300'}`}>
            自定义技能
          </button>
        </div>
        {showCustom ? <CustomSkillForm onDone={() => setShowCustom(false)} /> : (
          <>
            {!db && <div className="text-[11px] text-gray-600 italic px-1 pb-1">技能库加载中…</div>}
            <div className="flex gap-1 mb-1.5">
              <select value={effectiveJob} onChange={e => setJob(e.target.value)} className="field-input !py-0.5 flex-1 min-w-0">
                {jobs.map(j => <option key={j} value={j}>{j}</option>)}
                <option value="全部">全部职业</option>
              </select>
              <div className="grid grid-cols-3 h-7 overflow-hidden rounded border border-gray-600 bg-gray-950 p-0.5 flex-shrink-0">
                {SEGMENT_LABELS.map(seg => (
                  <button key={seg.key} onClick={() => setSegment(seg.key)}
                    className={`rounded-sm px-1.5 text-[11px] font-semibold transition-colors
                      ${segment === seg.key ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative mb-1.5">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索技能名…"
                className="field-input !py-0.5 pl-7" />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {skills.map(({ def, jobName }) => {
                const added = existingKeys.has(def.name)
                const disabled = added || !hasDoc
                const sid = findActionIdByName(def.name)
                return (
                  <button key={`${jobName}:${def.name}`} onClick={() => !disabled && pickSkill(def)} disabled={disabled}
                    title={`${def.name}${sid !== undefined ? ` · ID ${sid}` : ''}${def.cd ? ` · CD ${def.cd}s` : ''}${effectiveJob === '全部' ? ` · ${jobName}` : ''}${!hasDoc ? '（先新建文件）' : ''}`}
                    className={`flex flex-col items-center gap-0.5 p-1 rounded transition-colors relative
                      ${disabled ? 'opacity-40 cursor-default' : 'hover:bg-gray-700'}`}>
                    <SkillIconImg src={def.icon} name={def.name} size={32} />
                    <span className="text-[10px] text-gray-300 leading-3 text-center break-all">{def.name}</span>
                    {added && <Check size={14} className="absolute top-0.5 right-0.5 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
            {skills.length === 0 && db && <div className="text-[11px] text-gray-600 italic px-1">没有匹配的技能</div>}
          </>
        )}
      </div>
    </div>
  )
}

function CustomSkillForm({ onDone }: { onDone: () => void }) {
  const addColumn = useLogsStore(s => s.addColumn)
  const addGcdTrack = useLogsStore(s => s.addGcdTrack)
  const hasDoc = useLogsStore(s => s.doc !== null)
  const [name, setName] = useState('')
  const [matchName, setMatchName] = useState('')
  const [kind, setKind] = useState<'ability' | 'gcd'>('ability')
  const [cd, setCd] = useState('')
  const [duration, setDuration] = useState('')
  const [icon, setIcon] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const def = {
      name: trimmed,
      matchName: matchName.trim() || undefined,
      cd: cd ? parseFloat(cd) : undefined,
      duration: duration ? parseFloat(duration) : undefined,
      icon: icon.trim() || undefined
    }
    if (kind === 'gcd') addGcdTrack(trimmed, def)
    else addColumn(def, 'ability')
    setName(''); setMatchName(''); setCd(''); setDuration(''); setIcon('')
    onDone()
  }

  return (
    <div className="space-y-1.5 border border-gray-700 rounded p-2 bg-gray-900/50">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="显示名（必填）" className="field-input !py-0.5" />
      <input value={matchName} onChange={e => setMatchName(e.target.value)} placeholder="日志匹配名（默认同显示名）" className="field-input !py-0.5" />
      <div className="flex gap-1.5">
        <select value={kind} onChange={e => setKind(e.target.value as 'ability' | 'gcd')} className="field-input !py-0.5 flex-1">
          <option value="ability">能力技</option>
          <option value="gcd">GCD</option>
        </select>
        <input value={cd} onChange={e => setCd(e.target.value)} placeholder="CD 秒" inputMode="decimal"
          className="field-input !py-0.5 w-16" />
        <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="持续 秒" inputMode="decimal"
          className="field-input !py-0.5 w-16" />
      </div>
      <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="图标 URL（可选）" className="field-input !py-0.5" />
      <button onClick={submit} disabled={!name.trim() || !hasDoc}
        title={hasDoc ? undefined : '先新建文件'}
        className="command-button-primary w-full !h-7">
        <Plus size={13} />添加
      </button>
    </div>
  )
}

/** 左侧栏：文件 / 技能 双 Tab */
export function LogsSidebar() {
  const [tab, setTab] = useState<'files' | 'skills'>('files')
  // 空文档引导：新建文件后自动切到「技能」Tab
  useEffect(() => {
    const handler = () => setTab('skills')
    document.addEventListener('logs:showSkills', handler)
    return () => document.removeEventListener('logs:showSkills', handler)
  }, [])
  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="flex border-b border-gray-700 flex-shrink-0">
        {([['files', '文件'], ['skills', '技能']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-1.5 text-[12px] font-semibold transition-colors border-b-2
              ${tab === key ? 'text-amber-300 border-amber-500 bg-gray-900/40'
                : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'files' ? <FilesPane /> : <SkillsPane />}
    </div>
  )
}
