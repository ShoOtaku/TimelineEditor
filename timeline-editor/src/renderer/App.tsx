import { Component, useCallback, useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TreeView } from './components/TreeView'
import { PropertyPanel } from './panels/PropertyPanel'
import { UpdateDialog } from './components/UpdateDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { CactbotImportDialog } from './components/CactbotImportDialog'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-900 text-gray-300">
          <div className="text-center max-w-lg p-8">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-lg font-semibold mb-2">程序出错了</div>
            <div className="text-sm text-red-400 mb-4 font-mono">{this.state.error.message}</div>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded"
            >
              重新加载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
import { ScriptPanel } from './panels/ScriptPanel'
import { AcrViewerPanel } from './panels/AcrViewerPanel'
import { StatusBar } from './components/StatusBar'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { useStore } from './store'
import { usePrStore } from './store/prStore'
import { useUiSettings } from './store/uiSettingsStore'
import { askConfirm, askPrompt } from './store/dialogStore'
import { DialogHost } from './components/DialogHost'
import { PrSidebar } from './pr/PrSidebar'
import { PrTimelineView } from './pr/PrTimelineView'
import { PrPropertyPanel } from './pr/PrPropertyPanel'
import { PrScriptPanel } from './pr/PrScriptPanel'
import { LogsSidebar } from './logs/LogsSidebar'
import { LogsTimelineView } from './logs/LogsTimelineView'
import { LogsPropertyPanel } from './logs/LogsPropertyPanel'
import { FflogsImportDialog } from './logs/FflogsImportDialog'
import { useLogsStore } from './logs/logsStore'

export default function App() {
  const fileName = useStore(s => s.fileName)
  const filePath = useStore(s => s.filePath)
  const isDirty = useStore(s => s.isDirty)
  const loadFile = useStore(s => s.loadFile)
  const saveFile = useStore(s => s.saveFile)
  const loadSpellLookup = useStore(s => s.loadSpellLookup)
  const loadAcrTypes = useStore(s => s.loadAcrTypes)
  const editorMode = usePrStore(s => s.editorMode)
  const setEditorMode = usePrStore(s => s.setEditorMode)
  const prFileName = usePrStore(s => s.fileName)
  const prFilePath = usePrStore(s => s.filePath)
  const prIsDirty = usePrStore(s => s.isDirty)
  const prLoadFile = usePrStore(s => s.loadFile)
  const prSaveFile = usePrStore(s => s.saveFile)
  const prNewDocument = usePrStore(s => s.newDocument)
  const logsFileName = useLogsStore(s => s.fileName)
  const logsFilePath = useLogsStore(s => s.filePath)
  const logsIsDirty = useLogsStore(s => s.isDirty)
  const logsLoadFile = useLogsStore(s => s.loadFile)
  const logsSaveFile = useLogsStore(s => s.saveFile)
  const logsNewDocument = useLogsStore(s => s.newDocument)
  const [showScript, setShowScript] = useState(false)
  const [showAcrViewer, setShowAcrViewer] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [panelWidth, setPanelWidth] = useState(340)
  const [scriptHeight, setScriptHeight] = useState(300)
  const [showUpdate, setShowUpdate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCactbotImport, setShowCactbotImport] = useState(false)
  const [showFflogsImport, setShowFflogsImport] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const fontSizePercent = useUiSettings(s => s.fontSizePercent)
  const setFontSizePercent = useUiSettings(s => s.setFontSizePercent)

  const isPr = editorMode === 'pr'
  const isLogs = editorMode === 'logs'
  const uiZoom = fontSizePercent / 100
  const activeFileName = isPr ? prFileName : isLogs ? logsFileName : fileName

  // Drag-to-resize helper: listeners are removed on mouseup (the old inline
  // version leaked a new mousemove listener on every drag)
  const startResize = useCallback((onMove: (ev: MouseEvent) => void) => {
    const move = (ev: MouseEvent) => onMove(ev)
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [])

  const handleOpen = useCallback(async () => {
    if (isLogs) {
      if (logsIsDirty) {
        const ok = await askConfirm({
          title: '放弃未保存的修改？',
          message: '当前战斗日志时间轴有未保存的修改，打开其他文件将丢失这些修改。',
          confirmLabel: '放弃并打开',
          danger: true
        })
        if (!ok) return
      }
      const result = await window.electronAPI.openLogsFileDialog()
      if (!result.cancelled && result.filePath) {
        const ok = await logsLoadFile(result.filePath)
        if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
      }
      return
    }
    if (isPr) {
      if (prIsDirty) {
        const ok = await askConfirm({
          title: '放弃未保存的修改？',
          message: '当前 PR 时间轴有未保存的修改，打开其他文件将丢失这些修改。',
          confirmLabel: '放弃并打开',
          danger: true
        })
        if (!ok) return
      }
      const result = await window.electronAPI.openPrFileDialog()
      if (!result.cancelled && result.filePath) {
        const ok = await prLoadFile(result.filePath)
        if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
      }
      return
    }
    if (isDirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        message: '当前时间轴有未保存的修改，打开其他文件将丢失这些修改。',
        confirmLabel: '放弃并打开',
        danger: true
      })
      if (!ok) return
    }
    const result = await window.electronAPI.openFileDialog()
    if (!result.cancelled && result.filePath) {
      const ok = await loadFile(result.filePath)
      if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
    }
  }, [isLogs, isPr, isDirty, prIsDirty, logsIsDirty, loadFile, prLoadFile, logsLoadFile])

  const handleSave = useCallback(async () => {
    if (isLogs) {
      if (logsFilePath) {
        await logsSaveFile(logsFilePath)
      } else {
        const result = await window.electronAPI.saveLogsFileDialog(logsFileName || 'NewLogsTimeline.json')
        if (!result.cancelled && result.filePath) {
          const ok = await logsSaveFile(result.filePath)
          if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
        }
      }
      return
    }
    if (isPr) {
      if (prFilePath) {
        await prSaveFile(prFilePath)
      } else {
        const result = await window.electronAPI.savePrFileDialog(prFileName || 'NewTimeline.json')
        if (!result.cancelled && result.filePath) {
          const ok = await prSaveFile(result.filePath)
          if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
        }
      }
      return
    }
    if (filePath) {
      await saveFile(filePath)
    } else {
      const result = await window.electronAPI.saveFileDialog(fileName || 'NewTriggerline.json')
      if (!result.cancelled && result.filePath) {
        const ok = await saveFile(result.filePath)
        if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
      }
    }
  }, [isLogs, isPr, filePath, fileName, saveFile, prFilePath, prFileName, prSaveFile, logsFilePath, logsFileName, logsSaveFile])

  const handleSaveAs = useCallback(async () => {
    if (isLogs) {
      const result = await window.electronAPI.saveLogsFileDialog(logsFileName || 'NewLogsTimeline.json')
      if (!result.cancelled && result.filePath) {
        const ok = await logsSaveFile(result.filePath)
        if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
      }
      return
    }
    if (isPr) {
      const result = await window.electronAPI.savePrFileDialog(prFileName || 'NewTimeline.json')
      if (!result.cancelled && result.filePath) {
        const ok = await prSaveFile(result.filePath)
        if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
      }
      return
    }
    const result = await window.electronAPI.saveFileDialog(fileName || 'NewTriggerline.json')
    if (!result.cancelled && result.filePath) {
      const ok = await saveFile(result.filePath)
      if (ok) document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
    }
  }, [isLogs, isPr, fileName, saveFile, prFileName, prSaveFile, logsFileName, logsSaveFile])

  const handleNewPr = useCallback(async () => {
    if (prIsDirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        message: '当前 PR 时间轴有未保存的修改，新建将丢失这些修改。',
        confirmLabel: '放弃并新建',
        danger: true
      })
      if (!ok) return
    }
    const name = await askPrompt({
      title: '新建 PR 时间轴',
      message: '时间轴名称（写入 Meta.Name）',
      defaultValue: '新时间轴',
      placeholder: '如：绝伊甸 P1'
    })
    if (name === null) return
    prNewDocument(name)
  }, [prIsDirty, prNewDocument])

  const handleNewLogs = useCallback(async () => {
    if (logsIsDirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        message: '当前战斗日志时间轴有未保存的修改，新建将丢失这些修改。',
        confirmLabel: '放弃并新建',
        danger: true
      })
      if (!ok) return
    }
    const name = await askPrompt({
      title: '新建战斗日志时间轴',
      message: '时间轴名称',
      defaultValue: '新战斗日志',
      placeholder: '如：绝伊甸 P1 减伤轴'
    })
    if (name === null) return
    logsNewDocument(name || '新战斗日志')
  }, [logsIsDirty, logsNewDocument])

  // Listen for custom events from keyboard shortcuts
  useEffect(() => {
    const onSave = () => handleSave()
    const onOpen = () => handleOpen()
    const onSaveAs = () => handleSaveAs()
    const onToggleScript = () => setShowScript(s => !s)
    const onOpenScript = () => setShowScript(true)
    const onOpenFflogs = () => setShowFflogsImport(true)
    document.addEventListener('editor:save', onSave)
    document.addEventListener('editor:open', onOpen)
    document.addEventListener('editor:saveAs', onSaveAs)
    document.addEventListener('editor:toggleScript', onToggleScript)
    document.addEventListener('editor:openScript', onOpenScript)
    document.addEventListener('logs:openFflogs', onOpenFflogs)
    return () => {
      document.removeEventListener('editor:save', onSave)
      document.removeEventListener('editor:open', onOpen)
      document.removeEventListener('editor:saveAs', onSaveAs)
      document.removeEventListener('editor:toggleScript', onToggleScript)
      document.removeEventListener('editor:openScript', onOpenScript)
      document.removeEventListener('logs:openFflogs', onOpenFflogs)
    }
  }, [handleSave, handleOpen, handleSaveAs])

  // Load spell lookup data and ACR types on startup
  useEffect(() => {
    loadSpellLookup()
    loadAcrTypes()
  }, [loadSpellLookup, loadAcrTypes])

  // Load persisted UI settings (font size) on startup
  useEffect(() => {
    window.electronAPI.getSettings()
      .then(s => {
        if (typeof s.fontSizePercent === 'number' && Number.isFinite(s.fontSizePercent)) {
          setFontSizePercent(s.fontSizePercent)
        }
      })
      .catch(() => { /* 读取失败则保持默认大小 */ })
  }, [setFontSizePercent])

  // 切换模式/文件时同步窗口标题，让标题始终指向当前正在编辑的文档
  useEffect(() => {
    document.title = activeFileName ? `Timeline Editor - ${activeFileName}` : 'Timeline Editor'
  }, [activeFileName])

  // Listen for auto-check update available notification
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateAvailable(() => {
      setUpdateAvailable(true)
    })
    return unsub
  }, [])

  const handleCheckUpdate = useCallback(() => {
    setShowUpdate(true)
  }, [])
  useEffect(() => {
    const unsub = window.electronAPI.onAcrTypesChanged(() => {
      loadAcrTypes()
    })
    return unsub
  }, [loadAcrTypes])

  return (
    <ErrorBoundary>
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-900">
      <div style={{ zoom: uiZoom }} className="flex-shrink-0">
        <Toolbar
          mode={editorMode}
          onSwitchMode={setEditorMode}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onToggleScript={() => setShowScript(s => !s)}
          showScript={showScript}
          onToggleAcrViewer={() => setShowAcrViewer(s => !s)}
          showAcrViewer={showAcrViewer}
          onNewPr={handleNewPr}
          onNewLogs={handleNewLogs}
          onOpenCactbot={() => setShowCactbotImport(true)}
          onOpenFflogs={() => setShowFflogsImport(true)}
          onOpenSettings={() => setShowSettings(true)}
          fileName={activeFileName}
          isDirty={isPr ? prIsDirty : isLogs ? logsIsDirty : isDirty}
          updateAvailable={updateAvailable}
          onCheckUpdate={handleCheckUpdate}
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — 三模式面板保持挂载（display:none 隐藏），切换回来时滚动/展开状态原样保留 */}
        <div style={{ width: sidebarWidth, zoom: uiZoom }} className="flex-shrink-0 border-r border-gray-700 overflow-hidden">
          <div className={!isPr && !isLogs ? 'h-full' : 'hidden'}><Sidebar /></div>
          <div className={isPr ? 'h-full' : 'hidden'}><PrSidebar /></div>
          <div className={isLogs ? 'h-full' : 'hidden'}><LogsSidebar /></div>
        </div>

        {/* Resizer: sidebar | canvas */}
        <div
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={() => startResize((ev) => {
            setSidebarWidth(Math.max(160, Math.min(400, ev.clientX / uiZoom)))
          })}
        />

        {/* Canvas + Script area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden" style={{ zoom: uiZoom }}>
            <div className={!isPr && !isLogs ? 'h-full' : 'hidden'}><TreeView /></div>
            <div className={isPr ? 'h-full' : 'hidden'}><PrTimelineView /></div>
            <div className={isLogs ? 'h-full' : 'hidden'}><LogsTimelineView /></div>
          </div>

          {showScript && !isLogs && (
            <>
              <div
                className="h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
                onMouseDown={() => startResize((ev) => {
                  setScriptHeight(Math.max(150, Math.min(window.innerHeight - 200, (window.innerHeight - ev.clientY) / uiZoom)))
                })}
              />
              {/* Monaco 不随界面 zoom（避免鼠标定位偏移），字体大小通过 editor fontSize 选项缩放 */}
              <div style={{ height: scriptHeight }} className="flex-shrink-0 overflow-hidden">
                <div className={isPr ? 'hidden' : 'h-full'}><ScriptPanel /></div>
                <div className={isPr ? 'h-full' : 'hidden'}><PrScriptPanel /></div>
              </div>
            </>
          )}
        </div>

        {/* Resizer: canvas | property panel */}
        <div
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={() => startResize((ev) => {
            setPanelWidth(Math.max(260, Math.min(500, (window.innerWidth - ev.clientX) / uiZoom)))
          })}
        />

        {/* Property Panel / ACR Viewer */}
        <div style={{ width: panelWidth, zoom: uiZoom }} className="flex-shrink-0 border-l border-gray-700 overflow-hidden">
          <div className={!isPr && !isLogs && !showAcrViewer ? 'h-full' : 'hidden'}><PropertyPanel /></div>
          <div className={!isPr && !isLogs && showAcrViewer ? 'h-full' : 'hidden'}><AcrViewerPanel /></div>
          <div className={isPr ? 'h-full' : 'hidden'}><PrPropertyPanel /></div>
          <div className={isLogs ? 'h-full' : 'hidden'}><LogsPropertyPanel /></div>
        </div>
      </div>
      <div style={{ zoom: uiZoom }} className="flex-shrink-0">
        <StatusBar />
      </div>
      <KeyboardShortcuts />
      <DialogHost />
      {showUpdate && <UpdateDialog onClose={() => { setShowUpdate(false); setUpdateAvailable(false) }} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showCactbotImport && <CactbotImportDialog onClose={() => setShowCactbotImport(false)} />}
      {showFflogsImport && <FflogsImportDialog onClose={() => setShowFflogsImport(false)} />}
    </div>
    </ErrorBoundary>
  )
}
