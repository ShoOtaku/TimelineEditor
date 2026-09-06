import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { usePrStore } from '../store/prStore'
import { findNode } from './prModel'

/**
 * PR 底部 Monaco 脚本面板：
 * - scriptTarget 'opener' → 编辑 Meta.CustomOpener.Script（自定义起手脚本）
 * - scriptTarget 'node'   → 编辑选中 csharprunningaction 节点的 Script
 * 500ms 防抖自动应用；同目标连续输入合并为一步撤销。
 */
export function PrScriptPanel() {
  const doc = usePrStore(s => s.doc)
  const selection = usePrStore(s => s.selection)
  const scriptTarget = usePrStore(s => s.scriptTarget)
  const updateMeta = usePrStore(s => s.updateMeta)
  const updateEntryNode = usePrStore(s => s.updateEntryNode)

  const isOpener = scriptTarget === 'opener'
  const entry = doc && selection?.kind === 'node'
    ? doc.Entries.find(e => e.Guid === selection.entryGuid)
    : null
  const node = entry && selection?.kind === 'node'
    ? findNode(entry.EntryGroup, selection.nodeId)
    : null
  const nodeIsScript = !!node && node.Type === 'csharprunningaction'
  const hasScript = isOpener || nodeIsScript

  const [localScript, setLocalScript] = useState('')
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  // Last value known to match the store — the debounced apply skips no-op writes,
  // otherwise merely opening the panel would push an undo entry and mark the doc dirty.
  const syncedRef = useRef('')

  useEffect(() => {
    const next = isOpener
      ? (doc?.Meta.CustomOpener?.Script ?? '')
      : nodeIsScript && node ? (node.Script ?? '') : ''
    syncedRef.current = next
    setLocalScript(next)
  }, [isOpener, nodeIsScript, node, doc?.Meta.CustomOpener?.Script])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const applyScript = useCallback((value: string) => {
    if (value === syncedRef.current) return
    if (isOpener) {
      // 与插件 CustomOpenerDefinition.FromScript 对齐：空白脚本 → null（序列化时省略）
      updateMeta({ CustomOpener: value.trim() ? { Script: value } : null }, 'script:pr-opener')
    } else if (entry && node && nodeIsScript && selection?.kind === 'node') {
      updateEntryNode(entry.Guid, node.Id, { Script: value }, `script:pr-node:${node.Id}`)
    }
    syncedRef.current = value
  }, [isOpener, entry, node, nodeIsScript, selection, updateMeta, updateEntryNode])

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
          <div>选中一个「C# 动作」节点即可编辑其脚本</div>
          <div className="text-xs mt-1 text-gray-600">或在「ℹ 信息」面板中编辑自定义起手脚本</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="h-8 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[11px] text-gray-400 font-medium">
          {'</>'} 脚本编辑 — {isOpener ? '自定义起手脚本 (CustomOpener)' : node?.Name || `节点 #${node?.Id}`}
        </span>
        <div className="flex-1" />
        {isOpener && (
          <span className="text-[10px] text-gray-600">留空 = 不覆盖起手 · </span>
        )}
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
