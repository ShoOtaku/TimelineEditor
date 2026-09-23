import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useUiSettings } from '../store/uiSettingsStore'

export function ScriptPanel() {
  const doc = useStore(s => s.doc)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const selectedScriptNodeId = useStore(s => s.selectedScriptNodeId)
  const scriptTarget = useStore(s => s.scriptTarget)
  const updateNode = useStore(s => s.updateNode)
  const updateDocMeta = useStore(s => s.updateDocMeta)
  const getNodeById = useStore(s => s.getNodeById)

  // Find the nearest script node to edit
  const isOpener = scriptTarget === 'opener'
  const scriptNodeId = selectedScriptNodeId || selectedNodeId
  const scriptNode = scriptNodeId !== null ? getNodeById(scriptNodeId) : null
  const nodeIsScript = !!scriptNode && '$type' in scriptNode &&
    typeof (scriptNode as any).$type === 'string' &&
    (scriptNode as any).$type.includes('TreeScriptNode')
  const hasScript = isOpener || nodeIsScript

  const [localScript, setLocalScript] = useState('')
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  // Last value known to match the store — the debounced apply skips no-op writes,
  // otherwise merely opening the panel would push an undo entry and mark the doc dirty.
  const syncedRef = useRef('')

  // 跟随设置中的界面字体缩放（Monaco 不用 CSS zoom，避免鼠标定位偏移）
  const fontSizePercent = useUiSettings(s => s.fontSizePercent)
  const editorFontSize = Math.max(8, Math.round(12 * fontSizePercent / 100))
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize: editorFontSize })
  }, [editorFontSize])

  useEffect(() => {
    const next = isOpener
      ? (typeof doc?.OpenerScript === 'string' ? doc.OpenerScript : '')
      : nodeIsScript ? ((scriptNode as any).Script || '') : ''
    syncedRef.current = next
    setLocalScript(next)
  }, [isOpener, scriptNodeId, nodeIsScript, scriptNode, doc?.OpenerScript])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const applyScript = useCallback((value: string) => {
    if (value === syncedRef.current) return
    if (isOpener) {
      updateDocMeta({ OpenerScript: value }, 'script:opener')
    } else if (scriptNodeId !== null && nodeIsScript) {
      updateNode(scriptNodeId, { Script: value }, `script:${scriptNodeId}`)
    }
    syncedRef.current = value
  }, [isOpener, scriptNodeId, nodeIsScript, updateNode, updateDocMeta])

  // Auto-save with debounce
  useEffect(() => {
    if (!hasScript) return
    const timer = setTimeout(() => {
      applyScript(localScript)
    }, 500)
    return () => clearTimeout(timer)
  }, [localScript, hasScript, applyScript])

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        未打开文件
      </div>
    )
  }

  if (!hasScript) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        <div className="text-center">
          <div className="text-2xl mb-1">{'</>'}</div>
          <div>选中一个脚本节点即可编辑 C# 代码</div>
          <div className="text-xs mt-1 text-gray-600">或在「时间轴信息」中编辑起手脚本 (OpenerScript)</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="h-8 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[11px] text-gray-400 font-medium">
          {'</>'} 脚本编辑 — {isOpener ? '起手脚本 (OpenerScript)' : scriptNode?.DisplayName || `节点 #${scriptNodeId}`}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-600">编辑后自动应用</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="csharp"
          theme="vs-dark"
          value={localScript}
          onChange={(value) => setLocalScript(value || '')}
          onMount={handleEditorMount}
          loading={
            <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
              编辑器加载中…
            </div>
          }
          options={{
            minimap: { enabled: false },
            fontSize: editorFontSize,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 4,
            insertSpaces: true,
            automaticLayout: true,
            folding: true,
            renderLineHighlight: 'line',
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  )
}
