import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TreeView } from './components/TreeView'
import { PropertyPanel } from './panels/PropertyPanel'

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

export default function App() {
  const fileName = useStore(s => s.fileName)
  const filePath = useStore(s => s.filePath)
  const isDirty = useStore(s => s.isDirty)
  const loadFile = useStore(s => s.loadFile)
  const saveFile = useStore(s => s.saveFile)
  const loadSpellLookup = useStore(s => s.loadSpellLookup)
  const loadAcrTypes = useStore(s => s.loadAcrTypes)
  const [showScript, setShowScript] = useState(false)
  const [showAcrViewer, setShowAcrViewer] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [panelWidth, setPanelWidth] = useState(340)
  const [scriptHeight, setScriptHeight] = useState(300)
  const isResizingSidebar = useRef(false)
  const isResizingPanel = useRef(false)
  const isResizingScript = useRef(false)

  const handleOpen = useCallback(async () => {
    const result = await window.electronAPI.openFileDialog()
    if (!result.cancelled && result.filePath) {
      await loadFile(result.filePath)
      document.title = `Timeline Editor - ${result.filePath.split(/[/\\]/).pop()}`
    }
  }, [loadFile])

  const handleSave = useCallback(async () => {
    if (filePath) {
      await saveFile(filePath)
    } else {
      const result = await window.electronAPI.saveFileDialog(fileName || 'NewTriggerline.json')
      if (!result.cancelled && result.filePath) {
        await saveFile(result.filePath)
      }
    }
  }, [filePath, fileName, saveFile])

  const handleSaveAs = useCallback(async () => {
    const result = await window.electronAPI.saveFileDialog(fileName || 'NewTriggerline.json')
    if (!result.cancelled && result.filePath) {
      await saveFile(result.filePath)
    }
  }, [fileName, saveFile])

  // Listen for custom events from keyboard shortcuts
  useEffect(() => {
    const onSave = () => handleSave()
    const onOpen = () => handleOpen()
    const onSaveAs = () => handleSaveAs()
    const onToggleScript = () => setShowScript(s => !s)
    document.addEventListener('editor:save', onSave)
    document.addEventListener('editor:open', onOpen)
    document.addEventListener('editor:saveAs', onSaveAs)
    document.addEventListener('editor:toggleScript', onToggleScript)
    return () => {
      document.removeEventListener('editor:save', onSave)
      document.removeEventListener('editor:open', onOpen)
      document.removeEventListener('editor:saveAs', onSaveAs)
      document.removeEventListener('editor:toggleScript', onToggleScript)
    }
  }, [handleSave, handleOpen, handleSaveAs])

  // Load spell lookup data and ACR types on startup
  useEffect(() => {
    loadSpellLookup()
    loadAcrTypes()
  }, [loadSpellLookup, loadAcrTypes])

  // Listen for ACR type changes
  useEffect(() => {
    const unsub = window.electronAPI.onAcrTypesChanged(() => {
      loadAcrTypes()
    })
    return unsub
  }, [loadAcrTypes])

  return (
    <ErrorBoundary>
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-900">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onToggleScript={() => setShowScript(s => !s)}
        showScript={showScript}
        onToggleAcrViewer={() => setShowAcrViewer(s => !s)}
        showAcrViewer={showAcrViewer}
        fileName={fileName}
        isDirty={isDirty}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth }} className="flex-shrink-0 border-r border-gray-700 overflow-hidden">
          <Sidebar />
        </div>

        {/* Resizer: sidebar | canvas */}
        <div
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={(e) => {
            isResizingSidebar.current = true
            document.addEventListener('mousemove', (ev) => {
              if (!isResizingSidebar.current) return
              setSidebarWidth(Math.max(160, Math.min(400, ev.clientX)))
            })
            document.addEventListener('mouseup', () => { isResizingSidebar.current = false }, { once: true })
          }}
        />

        {/* Canvas + Script area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <TreeView />
          </div>

          {showScript && (
            <>
              <div
                className="h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
                onMouseDown={(e) => {
                  isResizingScript.current = true
                  document.addEventListener('mousemove', (ev) => {
                    if (!isResizingScript.current) return
                    setScriptHeight(Math.max(150, window.innerHeight - ev.clientY))
                  })
                  document.addEventListener('mouseup', () => { isResizingScript.current = false }, { once: true })
                }}
              />
              <div style={{ height: scriptHeight }} className="flex-shrink-0 overflow-hidden">
                <ScriptPanel />
              </div>
            </>
          )}
        </div>

        {/* Resizer: canvas | property panel */}
        <div
          className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={(e) => {
            isResizingPanel.current = true
            document.addEventListener('mousemove', (ev) => {
              if (!isResizingPanel.current) return
              setPanelWidth(Math.max(260, Math.min(500, window.innerWidth - ev.clientX)))
            })
            document.addEventListener('mouseup', () => { isResizingPanel.current = false }, { once: true })
          }}
        />

        {/* Property Panel / ACR Viewer */}
        <div style={{ width: panelWidth }} className="flex-shrink-0 border-l border-gray-700 overflow-hidden">
          {showAcrViewer ? <AcrViewerPanel /> : <PropertyPanel />}
        </div>
      </div>
      <StatusBar />
      <KeyboardShortcuts />
    </div>
    </ErrorBoundary>
  )
}
