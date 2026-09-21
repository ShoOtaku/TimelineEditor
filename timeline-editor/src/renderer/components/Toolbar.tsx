import {
  Activity, Clock3, Code2, Download, FolderOpen, Import, Plus, Redo2, RefreshCw,
  Save, SaveAll, ScanSearch, Settings, Undo2, Workflow
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EditorMode } from '../store/prStore'
import { useStore } from '../store'
import { usePrStore } from '../store/prStore'
import { useLogsStore } from '../logs/logsStore'

interface ToolbarProps {
  mode: EditorMode
  onSwitchMode: (mode: EditorMode) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onToggleScript: () => void
  showScript: boolean
  onToggleAcrViewer: () => void
  showAcrViewer: boolean
  onNewPr: () => void
  onNewLogs: () => void
  onOpenCactbot: () => void
  onOpenFflogs: () => void
  onOpenSettings: () => void
  fileName: string | null
  isDirty: boolean
  updateAvailable?: boolean
  onCheckUpdate?: () => void
}

const MODE_META: Record<EditorMode, { icon: LucideIcon; label: string; cls: string }> = {
  ae: {
    icon: Workflow, label: 'AE 时间轴',
    cls: 'border-indigo-700 bg-indigo-900/70 text-indigo-100'
  },
  pr: {
    icon: Clock3, label: 'PR 时间轴',
    cls: 'border-emerald-700 bg-emerald-900/70 text-emerald-100'
  },
  logs: {
    icon: Activity, label: '战斗日志',
    cls: 'border-amber-700 bg-amber-900/70 text-amber-100'
  }
}

const MODE_ORDER: EditorMode[] = ['ae', 'pr', 'logs']

export function Toolbar(props: ToolbarProps) {
  const mode = props.mode
  return <div className="flex h-11 shrink-0 select-none items-center gap-1 border-b border-gray-700 bg-gray-800 px-3">
      <ModeSwitcher mode={mode} onSwitch={props.onSwitchMode} />
      <Divider />
      <DocumentCommands mode={mode} props={props} />
      <Divider />
      <HistoryCommands mode={mode} />
      {mode !== 'logs' && (
        <>
          <Divider />
          <ToolbarCommand icon={Code2} label="脚本" title="切换脚本编辑器"
            active={props.showScript} onClick={props.onToggleScript} />
        </>
      )}
      {mode === 'ae' && (
        <ToolbarCommand icon={ScanSearch} label="ACR" title="切换 ACR 类型浏览器"
          active={props.showAcrViewer} onClick={props.onToggleAcrViewer} />
      )}
      <div className="min-w-3 flex-1" />
      <UpdateCommand available={props.updateAvailable} onClick={props.onCheckUpdate} />
      <ToolbarIcon icon={Settings} label="设置" title="设置" onClick={props.onOpenSettings} />
      <span className="ml-2 max-w-80 truncate text-xs text-gray-400" title={props.fileName ?? '未命名'}>
        {props.fileName || '未命名'}
        {props.isDirty && <span className="ml-1 text-amber-400" aria-label="有未保存修改">*</span>}
      </span>
    </div>
}

function ModeSwitcher({ mode, onSwitch }: { mode: EditorMode; onSwitch: (mode: EditorMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-gray-700 bg-gray-900/60 p-0.5"
      role="tablist" aria-label="编辑模式">
      {MODE_ORDER.map(m => {
        const meta = MODE_META[m]
        const Icon = meta.icon
        const active = m === mode
        return (
          <button key={m} type="button" role="tab" aria-selected={active}
            onClick={() => onSwitch(m)}
            title={active ? meta.label : `切换到 ${meta.label}`}
            className={`flex h-7 items-center gap-1.5 rounded border px-2 text-xs font-semibold transition-colors
              ${active ? meta.cls : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
            <Icon size={15} />{meta.label}
          </button>
        )
      })}
    </div>
  )
}

function DocumentCommands({ mode, props }: { mode: EditorMode; props: ToolbarProps }) {
  return <>
    {mode === 'pr' && <>
      <ToolbarCommand icon={Plus} label="新建" title="新建 PR 时间轴" onClick={props.onNewPr} />
      <ToolbarCommand icon={Import} label="Cactbot" title="导入 cactbot 官方时间轴" onClick={props.onOpenCactbot} />
    </>}
    {mode === 'logs' && <>
      <ToolbarCommand icon={Plus} label="新建" title="新建战斗日志时间轴" onClick={props.onNewLogs} />
      <ToolbarCommand icon={Download} label="FFLogs" title="从 FFLogs 导入战斗记录" onClick={props.onOpenFflogs} />
    </>}
    <ToolbarIcon icon={FolderOpen} label="打开" title="打开（Ctrl+O）" onClick={props.onOpen} />
    <ToolbarIcon icon={Save} label="保存" title="保存（Ctrl+S）" onClick={props.onSave} />
    <ToolbarIcon icon={SaveAll} label="另存为" title="另存为" onClick={props.onSaveAs} />
  </>
}

function HistoryCommands({ mode }: { mode: EditorMode }) {
  // 直接调 store —— 之前用合成 KeyboardEvent 转发，但事件不冒泡，按钮静默失效
  const aeUndo = useStore(s => s.undo)
  const aeRedo = useStore(s => s.redo)
  const aeCanUndo = useStore(s => s.undoStack.length > 0)
  const aeCanRedo = useStore(s => s.redoStack.length > 0)
  const prUndo = usePrStore(s => s.undo)
  const prRedo = usePrStore(s => s.redo)
  const prCanUndo = usePrStore(s => s.undoStack.length > 0)
  const prCanRedo = usePrStore(s => s.redoStack.length > 0)
  const logsUndo = useLogsStore(s => s.undo)
  const logsRedo = useLogsStore(s => s.redo)
  const logsCanUndo = useLogsStore(s => s.undoStack.length > 0)
  const logsCanRedo = useLogsStore(s => s.redoStack.length > 0)

  const undo = mode === 'pr' ? prUndo : mode === 'logs' ? logsUndo : aeUndo
  const redo = mode === 'pr' ? prRedo : mode === 'logs' ? logsRedo : aeRedo
  const canUndo = mode === 'pr' ? prCanUndo : mode === 'logs' ? logsCanUndo : aeCanUndo
  const canRedo = mode === 'pr' ? prCanRedo : mode === 'logs' ? logsCanRedo : aeCanRedo

  return <>
    <ToolbarIcon icon={Undo2} label="撤销" title="撤销（Ctrl+Z）" onClick={undo} disabled={!canUndo} />
    <ToolbarIcon icon={Redo2} label="重做" title="重做（Ctrl+Y）" onClick={redo} disabled={!canRedo} />
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

function ToolbarIcon({ icon: Icon, label, title, onClick, disabled }: {
  icon: LucideIcon; label: string; title: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="icon-button" aria-label={label} title={title}>
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
