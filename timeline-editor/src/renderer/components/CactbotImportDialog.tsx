import { useDeferredValue, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, FileText, Languages, LoaderCircle,
  RefreshCw, Search
} from 'lucide-react'
import type { CactbotCatalogFile } from '@shared/cactbotTypes'
import {
  useCactbotCatalog, useCactbotImporter, type CactbotImportStatus
} from '../cactbot/useCactbotImport'
import { ModalShell } from './ModalShell'

interface CactbotImportDialogProps {
  onClose: () => void
}

export function CactbotImportDialog({ onClose }: CactbotImportDialogProps) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [version, setVersion] = useState('all')
  const [category, setCategory] = useState('all')
  const [autoLocalize, setAutoLocalize] = useState(true)
  const [deduplicateSync, setDeduplicateSync] = useState(true)
  const catalog = useCactbotCatalog()
  const importer = useCactbotImporter(autoLocalize, deduplicateSync)

  const versions = useMemo(() => buildVersionOptions(catalog.files), [catalog.files])
  const categories = useMemo(() => buildCategoryOptions(catalog.files, version), [catalog.files, version])
  const visibleFiles = useMemo(() => filterFiles(
    catalog.files, version, category, deferredSearch
  ), [catalog.files, version, category, deferredSearch])

  return (
    <ModalShell
      title="导入 cactbot 时间轴"
      description="OverlayPlugin/cactbot 官方仓库"
      onClose={onClose}
      widthClass="max-w-6xl"
      footer={
        <div className="flex items-center justify-between gap-4 text-xs text-gray-500">
          <span>{visibleFiles.length} / {catalog.files.length} 个时间轴</span>
          <button type="button" onClick={onClose} className="command-button">关闭</button>
        </div>
      }
    >
      <CactbotDialogLayout
        files={catalog.files} visibleFiles={visibleFiles} versions={versions}
        version={version} setVersion={setVersion} category={category} setCategory={setCategory}
        categories={categories} search={search} setSearch={setSearch}
        autoLocalize={autoLocalize} setAutoLocalize={setAutoLocalize}
        deduplicateSync={deduplicateSync} setDeduplicateSync={setDeduplicateSync}
        loading={catalog.loading} loadError={catalog.loadError} truncated={catalog.truncated}
        loadCatalog={catalog.loadCatalog} importingPath={importer.importingPath}
        importStatus={importer.importStatus} importFile={importer.importFile}
      />
    </ModalShell>
  )
}

interface DialogLayoutProps {
  files: CactbotCatalogFile[]; visibleFiles: CactbotCatalogFile[]
  versions: ReturnType<typeof buildVersionOptions>; version: string; setVersion: (value: string) => void
  categories: string[]; category: string; setCategory: (value: string) => void
  search: string; setSearch: (value: string) => void
  autoLocalize: boolean; setAutoLocalize: (value: boolean) => void
  deduplicateSync: boolean; setDeduplicateSync: (value: boolean) => void
  loading: boolean; loadError: string; truncated: boolean
  loadCatalog: (refresh: boolean) => Promise<void>
  importingPath: string | null; importStatus: CactbotImportStatus
  importFile: (file: CactbotCatalogFile) => Promise<void>
}

function CactbotDialogLayout(props: DialogLayoutProps) {
  return <div className="flex h-[min(690px,calc(100vh-160px))] min-h-[430px] max-[760px]:flex-col">
    <VersionSidebar {...props} />
    <CatalogPane {...props} />
  </div>
}

function VersionSidebar(props: DialogLayoutProps) {
  const selectVersion = (value: string) => { props.setVersion(value); props.setCategory('all') }
  return <aside className="w-56 shrink-0 overflow-auto border-r border-gray-700 bg-gray-950/50 p-3 max-[760px]:w-full max-[760px]:border-b max-[760px]:border-r-0">
    <div className="mb-2 px-2 text-[11px] font-semibold uppercase text-gray-500">版本</div>
    <VersionButton active={props.version === 'all'} label="全部版本" count={props.files.length} onClick={() => selectVersion('all')} />
    {props.versions.map(option => <VersionButton
      key={option.key} active={props.version === option.key} label={option.label} count={option.count}
      onClick={() => selectVersion(option.key)}
    />)}
  </aside>
}

function CatalogPane(props: DialogLayoutProps) {
  return <main className="flex min-w-0 flex-1 flex-col">
    <CatalogFilters {...props} />
    {props.truncated && <div className="flex items-center gap-2 border-b border-amber-900/60 bg-amber-950/30 px-4 py-2 text-xs text-amber-300">
      <AlertTriangle size={15} /> GitHub 返回的文件树被截断，列表可能不完整。
    </div>}
    {props.importStatus && <ImportStatusLine status={props.importStatus} />}
    <CatalogBody {...props} />
  </main>
}

function CatalogFilters(props: DialogLayoutProps) {
  return <div className="flex flex-wrap items-end gap-3 border-b border-gray-700 px-4 py-3">
    <SearchField value={props.search} onChange={props.setSearch} />
    <CategoryField value={props.category} options={props.categories} onChange={props.setCategory} />
    <ToggleField label="自动中文本地化" checked={props.autoLocalize} onChange={props.setAutoLocalize} />
    <ToggleField label="去重同步" checked={props.deduplicateSync} onChange={props.setDeduplicateSync} />
    <button type="button" onClick={() => props.loadCatalog(true)}
      disabled={props.loading || props.importingPath !== null} className="icon-button" aria-label="刷新列表" title="刷新列表">
      <RefreshCw className={props.loading ? 'animate-spin' : ''} size={16} />
    </button>
  </div>
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="min-w-52 flex-1 text-xs text-gray-400" htmlFor="cactbot-search">搜索
    <span className="relative mt-1.5 block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
      <input id="cactbot-search" type="search" value={value} onChange={event => onChange(event.target.value)}
        className="field-input pl-8" placeholder="名称、版本或副本类型" />
    </span>
  </label>
}

function CategoryField({ value, options, onChange }: {
  value: string; options: string[]; onChange: (value: string) => void
}) {
  return <label className="w-36 text-xs text-gray-400" htmlFor="cactbot-category">类型
    <select id="cactbot-category" value={value} onChange={event => onChange(event.target.value)} className="field-input mt-1.5">
      <option value="all">全部类型</option>
      {options.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
  </label>
}

function ToggleField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (value: boolean) => void
}) {
  return <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-gray-300">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-blue-500" />
    {label}
  </label>
}

function CatalogBody(props: DialogLayoutProps) {
  return <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
    {props.loading ? <CatalogSkeleton /> : props.loadError ? (
      <ErrorState message={props.loadError} onRetry={() => props.loadCatalog(true)} />
    ) : props.visibleFiles.length === 0 ? <EmptyState /> : <div className="divide-y divide-gray-800">
      {props.visibleFiles.map(file => <FileRow key={file.path} file={file}
        busy={props.importingPath === file.path} disabled={props.importingPath !== null}
        onImport={() => props.importFile(file)} />)}
    </div>}
  </div>
}

function VersionButton({ active, label, count, onClick }: {
  active: boolean; label: string; count: number; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        active ? 'bg-blue-950 text-blue-200' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] text-gray-500">{count}</span>
    </button>
  )
}

function FileRow({ file, busy, disabled, onImport }: {
  file: CactbotCatalogFile; busy: boolean; disabled: boolean; onImport: () => void
}) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_110px_72px_38px] items-center gap-3 px-4 py-2 hover:bg-gray-800/60">
      <div className="flex min-w-0 items-center gap-3">
        <FileText size={16} className="shrink-0 text-gray-500" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-gray-200" title={file.fileName}>{file.fileName}</div>
          <div className="mt-0.5 truncate text-[10px] text-gray-500">{file.versionLabel} / {file.categoryLabel}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
        {file.localizationPath && <Languages size={13} className="text-emerald-500" aria-label="包含中文本地化" />}
        {formatSize(file.size)}
      </div>
      <span className="truncate text-[10px] text-gray-500">{file.categoryLabel}</span>
      <button
        type="button"
        onClick={onImport}
        disabled={disabled}
        className="icon-button"
        aria-label={`导入 ${file.fileName}`}
        title="导入"
      >
        {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Download size={16} />}
      </button>
    </div>
  )
}

function ImportStatusLine({ status }: { status: NonNullable<CactbotImportStatus> }) {
  const success = status.kind === 'success'
  const Icon = success ? CheckCircle2 : AlertTriangle
  return (
    <div className={`flex items-start gap-2 border-b px-4 py-2.5 text-xs ${
      success ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300' :
        'border-red-900/60 bg-red-950/30 text-red-300'}`} role="status">
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span className="leading-5">{status.message}</span>
    </div>
  )
}

function CatalogSkeleton() {
  return <div className="space-y-px">{Array.from({ length: 8 }, (_, index) => (
    <div key={index} className="flex h-12 items-center gap-3 px-4">
      <div className="h-4 w-4 animate-pulse rounded bg-gray-700" />
      <div className="h-3 flex-1 animate-pulse rounded bg-gray-800" />
      <div className="h-3 w-24 animate-pulse rounded bg-gray-800" />
    </div>
  ))}</div>
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
    <AlertTriangle size={24} className="text-red-400" />
    <p className="max-w-lg text-xs leading-5 text-red-300">{message}</p>
    <button type="button" onClick={onRetry} className="command-button"><RefreshCw size={14} />重试</button>
  </div>
}

function EmptyState() {
  return <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 text-gray-500">
    <Search size={24} />
    <p className="text-xs">没有匹配的时间轴</p>
  </div>
}

function buildVersionOptions(files: CactbotCatalogFile[]) {
  const options = new Map<string, { key: string; label: string; count: number }>()
  for (const file of files) {
    const current = options.get(file.versionFolder)
    options.set(file.versionFolder, {
      key: file.versionFolder,
      label: file.versionLabel,
      count: (current?.count ?? 0) + 1
    })
  }
  return [...options.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function buildCategoryOptions(files: CactbotCatalogFile[], version: string): string[] {
  return [...new Set(files.filter(file => version === 'all' || file.versionFolder === version)
    .map(file => file.categoryLabel))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function filterFiles(files: CactbotCatalogFile[], version: string, category: string, search: string) {
  const needle = search.trim().toLowerCase()
  return files.filter(file =>
    (version === 'all' || file.versionFolder === version) &&
    (category === 'all' || file.categoryLabel === category) &&
    (!needle || `${file.fileName} ${file.versionLabel} ${file.categoryLabel}`.toLowerCase().includes(needle))
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
