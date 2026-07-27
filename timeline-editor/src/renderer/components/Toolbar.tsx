import {
  Clock3, Code2, Download, FolderOpen, Import, Plus, Redo2, RefreshCw,
  Save, SaveAll, ScanSearch, Settings, Undo2, Workflow
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EditorMode } from '../store/prStore'

interface ToolbarProps {
  mode: EditorMode
  onToggleMode: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleScript: () => void
  showScript: boolean
  onToggleAcrViewer: () => void
  showAcrViewer: boolean
  onNewPr: () => void
  onOpenCactbot: () => void
  onOpenSettings: () => void
  fileName: string | null
  isDirty: boolean
  updateAvailable?: boolean
  onCheckUpdate?: () => void
}

export function Toolbar(props: ToolbarProps) {
  const isPr = props.mode === 'pr'
  return <div className="flex h-11 shrink-0 select-none items-center gap-1 border-b border-gray-700 bg-gray-800 px-3">
      <ModeButton isPr={isPr} onClick={props.onToggleMode} />
      <Divider />
      <DocumentCommands isPr={isPr} props={props} />
      <Divider />
      <HistoryCommands />
      {!isPr && <AeCommands props={props} />}
      <div className="min-w-3 flex-1" />
      <UpdateCommand available={props.updateAvailable} onClick={props.onCheckUpdate} />
      <ToolbarIcon icon={Settings} label="设置" title="设置" onClick={props.onOpenSettings} />
      <span className="ml-2 max-w-80 truncate text-xs text-gray-400" title={props.fileName ?? '未命名'}>
        {props.fileName || '未命名'}
        {props.isDirty && <span className="ml-1 text-amber-400" aria-label="有未保存修改">*</span>}
      </span>
    </div>
}

function ModeButton({ isPr, onClick }: { isPr: boolean; onClick: () => void }) {
  const Icon = isPr ? Clock3 : Workflow
  return <button type="button" onClick={onClick}
    className={`command-button font-semibold ${isPr
      ? 'border-emerald-700 bg-emerald-900/70 text-emerald-100 hover:bg-emerald-800'
      : 'border-indigo-700 bg-indigo-900/70 text-indigo-100 hover:bg-indigo-800'}`}
    title={isPr ? '切换到 AE 时间轴' : '切换到 PromeRotation 时间轴'}>
    <Icon size={16} />{isPr ? 'PR 时间轴' : 'AE 时间轴'}
  </button>
}

function DocumentCommands({ isPr, props }: { isPr: boolean; props: ToolbarProps }) {
  return <>
    {isPr && <>
      <ToolbarCommand icon={Plus} label="新建" title="新建 PR 时间轴" onClick={props.onNewPr} />
      <ToolbarCommand icon={Import} label="Cactbot" title="导入 cactbot 官方时间轴" onClick={props.onOpenCactbot} />
    </>}
    <ToolbarIcon icon={FolderOpen} label="打开" title="打开（Ctrl+O）" onClick={props.onOpen} />
    <ToolbarIcon icon={Save} label="保存" title="保存（Ctrl+S）" onClick={props.onSave} />
    <ToolbarIcon icon={SaveAll} label="另存为" title="另存为" onClick={props.onSaveAs} />
  </>
}

function HistoryCommands() {
  const dispatch = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }))
  return <>
    <ToolbarIcon icon={Undo2} label="撤销" title="撤销（Ctrl+Z）" onClick={() => dispatch('z')} />
    <ToolbarIcon icon={Redo2} label="重做" title="重做（Ctrl+Y）" onClick={() => dispatch('y')} />
  </>
}

function AeCommands({ props }: { props: ToolbarProps }) {
  return <>
    <Divider />
    <ToolbarCommand icon={Code2} label="脚本" title="切换脚本编辑器"
      active={props.showScript} onClick={props.onToggleScript} />
    <ToolbarCommand icon={ScanSearch} label="ACR" title="切换 ACR 类型浏览器"
      active={props.showAcrViewer} onClick={props.onToggleAcrViewer} />
  </>
}

function UpdateCommand({ available, onClick }: { available?: boolean; onClick?: () => void }) {
  if (!onClick) return null
  return <button type="button" onClick={onClick} className="icon-button relative" aria-label="检查更新" title="检查更新">
    <RefreshCw size={16} />
    {available && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full border border-gray-800 bg-emerald-400" />}
  </button>
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-gray-700" aria-hidden="true" />
}

function ToolbarIcon({ icon: Icon, label, title, onClick }: {
  icon: LucideIcon; label: string; title: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="icon-button" aria-label={label} title={title}>
      <Icon size={16} />
    </button>
  )
}

function ToolbarCommand({ icon: Icon, label, title, active, onClick }: {
  icon: LucideIcon; label: string; title: string; active?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`command-button ${active ? 'border-blue-600 bg-blue-900/70 text-blue-100' : ''}`}
      title={title}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}
