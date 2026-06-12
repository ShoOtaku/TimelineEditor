import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

export function ScriptPanel() {
  const doc = useStore(s => s.doc)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const selectedScriptNodeId = useStore(s => s.selectedScriptNodeId)
  const selectScriptNode = useStore(s => s.selectScriptNode)
  const updateNode = useStore(s => s.updateNode)
  const getNodeById = useStore(s => s.getNodeById)

  // Find the nearest script node to edit
  const scriptNodeId = selectedScriptNodeId || selectedNodeId
  const scriptNode = scriptNodeId !== null ? getNodeById(scriptNodeId) : null
  const hasScript = scriptNode && '$type' in scriptNode &&
    typeof (scriptNode as any).$type === 'string' &&
    (scriptNode as any).$type.includes('TreeScriptNode')

  const [localScript, setLocalScript] = useState('')
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (hasScript) {
      setLocalScript((scriptNode as any).Script || '')
    } else {
      setLocalScript('')
    }
  }, [scriptNodeId, hasScript, scriptNode])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const handleSave = useCallback(() => {
    if (scriptNodeId === null || !hasScript) return
    updateNode(scriptNodeId, { Script: localScript })
  }, [scriptNodeId, hasScript, localScript, updateNode])

  // Auto-save with debounce
  useEffect(() => {
    if (!hasScript || scriptNodeId === null) return
    const timer = setTimeout(() => {
      updateNode(scriptNodeId, { Script: localScript })
    }, 500)
    return () => clearTimeout(timer)
  }, [localScript, hasScript, scriptNodeId, updateNode])

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        No file loaded
      </div>
    )
  }

  if (!hasScript) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        <div className="text-center">
          <div className="text-2xl mb-1">{'</>'}</div>
          <div>Select a script node to edit its C# code</div>
          <div className="text-xs mt-1 text-gray-600">or click a script node then toggle the Script panel</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="h-8 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[11px] text-gray-400 font-medium">
          {'</>'} Script Editor — {scriptNode?.DisplayName || `Node #${scriptNodeId}`}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className="px-2 py-0.5 text-[11px] bg-blue-700 hover:bg-blue-600 text-white rounded"
        >
          Apply
        </button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="csharp"
          theme="vs-dark"
          value={localScript}
          onChange={(value) => setLocalScript(value || '')}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
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
