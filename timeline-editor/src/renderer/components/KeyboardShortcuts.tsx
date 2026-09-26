import { useEffect } from 'react'
import { useStore } from '../store'
import { usePrStore, resolvePrClipboard } from '../store/prStore'
import { useLogsStore } from '../logs/logsStore'
import { askConfirm, isDialogOpen } from '../store/dialogStore'
import { countEntryNodes, isCompositeNode } from '../pr/prModel'

export function KeyboardShortcuts() {
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const deleteNode = useStore(s => s.deleteNode)
  const getNodeById = useStore(s => s.getNodeById)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const duplicateNode = useStore(s => s.duplicateNode)
  const copyNode = useStore(s => s.copyNode)
  const pasteNode = useStore(s => s.pasteNode)

  const editorMode = usePrStore(s => s.editorMode)
  const prSelection = usePrStore(s => s.selection)
  const prDoc = usePrStore(s => s.doc)
  const prUndo = usePrStore(s => s.undo)
  const prRedo = usePrStore(s => s.redo)
  const prDeleteAnchor = usePrStore(s => s.deleteAnchor)
  const prDeleteEntry = usePrStore(s => s.deleteEntry)
  const prDeleteEntryNode = usePrStore(s => s.deleteEntryNode)
  const prDuplicateAnchor = usePrStore(s => s.duplicateAnchor)
  const prDuplicateEntry = usePrStore(s => s.duplicateEntry)
  const prDuplicateEntryNode = usePrStore(s => s.duplicateEntryNode)
  const prCopyEntry = usePrStore(s => s.copyEntry)
  const prCopyNode = usePrStore(s => s.copyNode)
  const prPasteEntry = usePrStore(s => s.pasteEntry)
  const prPasteNode = usePrStore(s => s.pasteNode)

  const logsSelection = useLogsStore(s => s.selection)
  const logsDoc = useLogsStore(s => s.doc)
  const logsUndo = useLogsStore(s => s.undo)
  const logsRedo = useLogsStore(s => s.redo)
  const logsDeleteEvent = useLogsStore(s => s.deleteEvent)
  const logsDeleteGcdUse = useLogsStore(s => s.deleteGcdUse)
  const logsDeleteSkillUse = useLogsStore(s => s.deleteSkillUse)
  const logsRemoveColumn = useLogsStore(s => s.removeColumn)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 模态框打开时不响应全局快捷键（否则会隔着确认框重复触发删除等操作）
      if (isDialogOpen()) return

      const target = e.target as HTMLElement
      // target can be window/document when focus is outside the page body
      if (!target || typeof target.closest !== 'function') return
      // Don't intercept when typing in inputs or Monaco
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
          target.closest('.monaco-editor') || target.closest('[contenteditable]')) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey
      const isPr = editorMode === 'pr'
      const isLogs = editorMode === 'logs'

      // Ctrl+S: Save
      if (ctrl && e.key === 's') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('editor:save'))
        return
      }

      // Ctrl+O: Open
      if (ctrl && e.key === 'o') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('editor:open'))
        return
      }

      // Ctrl+Shift+S: Save As
      if (ctrl && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('editor:saveAs'))
        return
      }

      // Ctrl+Z: Undo
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        if (isPr) prUndo(); else if (isLogs) logsUndo(); else undo()
        return
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((ctrl && !e.shiftKey && e.key === 'y') || (ctrl && e.shiftKey && e.key === 'Z')) {
        e.preventDefault()
        if (isPr) prRedo(); else if (isLogs) logsRedo(); else redo()
        return
      }

      // Delete: delete selected item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isLogs) {
          if (!logsSelection || !logsDoc) return
          e.preventDefault()
          if (logsSelection.kind === 'event') {
            const id = logsSelection.id
            const ev = logsDoc.events.find(x => x.id === id)
            if (ev && ev.text.trim()) {
              askConfirm({
                title: '删除事件',
                message: `删除事件「${ev.text}」？删除后可通过 Ctrl+Z 撤销。`,
                confirmLabel: '删除',
                danger: true
              }).then(ok => { if (ok) logsDeleteEvent(id) })
              return
            }
            logsDeleteEvent(id)
          } else if (logsSelection.kind === 'gcd') {
            logsDeleteGcdUse(logsSelection.id)
          } else if (logsSelection.kind === 'skillUse') {
            logsDeleteSkillUse(logsSelection.columnId, logsSelection.id)
          } else if (logsSelection.kind === 'column') {
            logsRemoveColumn(logsSelection.id)
          }
          return
        }
        if (isPr) {
          if (!prSelection || !prDoc) return
          e.preventDefault()
          if (prSelection.kind === 'anchor') {
            const guid = prSelection.guid
            const anchor = prDoc.Anchors.find(a => a.Guid === guid)
            const n = prDoc.Entries.filter(en => en.StartAnchorGuid === guid).length
            if (n > 0) {
              askConfirm({
                title: '删除锚点',
                message: `锚点「${anchor?.Name || '未命名'}」下挂有 ${n} 个行为组，删除锚点会连带删除它们。`,
                confirmLabel: '一并删除',
                danger: true
              }).then(ok => { if (ok) prDeleteAnchor(guid) })
              return
            }
            prDeleteAnchor(guid)
          } else if (prSelection.kind === 'entry') {
            const guid = prSelection.guid
            const entry = prDoc.Entries.find(en => en.Guid === guid)
            const n = entry ? countEntryNodes(entry) : 0
            if (n > 1) {
              askConfirm({
                title: '删除行为组',
                message: `行为组「${entry?.Name || '未命名'}」包含 ${n} 个节点，删除后可通过 Ctrl+Z 撤销。`,
                confirmLabel: '删除',
                danger: true
              }).then(ok => { if (ok) prDeleteEntry(guid) })
              return
            }
            prDeleteEntry(guid)
          } else if (prSelection.kind === 'node') {
            prDeleteEntryNode(prSelection.entryGuid, prSelection.nodeId)
          }
        } else if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          const node = getNodeById(selectedNodeId)
          const childCount = (node as any)?.Childs?.length ?? 0
          if (childCount > 0) {
            askConfirm({
              title: '删除节点',
              message: `节点「${node?.DisplayName || selectedNodeId}」包含 ${childCount} 个子节点，将一并删除。`,
              confirmLabel: '一并删除',
              danger: true
            }).then(ok => { if (ok) deleteNode(selectedNodeId) })
            return
          }
          deleteNode(selectedNodeId)
        }
        return
      }

      // Space: Toggle enabled (AE only — PR uses property panel checkboxes)
      if (e.key === ' ' && !isPr && !isLogs && selectedNodeId !== null) {
        e.preventDefault()
        toggleNodeEnabled(selectedNodeId)
        return
      }

      // Ctrl+D: Duplicate (AE/PR)
      if (ctrl && e.key === 'd') {
        if (isPr) {
          if (!prSelection) return
          e.preventDefault()
          if (prSelection.kind === 'anchor') prDuplicateAnchor(prSelection.guid)
          else if (prSelection.kind === 'entry') prDuplicateEntry(prSelection.guid)
          else if (prSelection.kind === 'node') prDuplicateEntryNode(prSelection.entryGuid, prSelection.nodeId)
        } else if (!isLogs && selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          duplicateNode(selectedNodeId)
        }
        return
      }

      // Ctrl+C / Ctrl+V (PR): copy & paste entries / nodes across anchors
      if (isPr && ctrl && e.key === 'c') {
        if (!prSelection) return
        e.preventDefault()
        if (prSelection.kind === 'entry') prCopyEntry(prSelection.guid)
        else if (prSelection.kind === 'node') prCopyNode(prSelection.entryGuid, prSelection.nodeId)
        return
      }
      if (isPr && ctrl && e.key === 'v') {
        if (!prDoc) return
        e.preventDefault()
        // 先解析系统剪贴板（跨实例粘贴），按负载类型决定粘贴行为组还是节点
        void (async () => {
          const clip = await resolvePrClipboard()
          if (!clip) return
          if (clip.kind === 'entry') {
            // Paste onto the selected anchor, or onto the anchor of the selected entry/node
            const anchorGuid = prSelection?.kind === 'anchor' ? prSelection.guid
              : prSelection?.kind === 'entry'
                ? prDoc.Entries.find(en => en.Guid === prSelection.guid)?.StartAnchorGuid
                : prSelection?.kind === 'node'
                  ? prDoc.Entries.find(en => en.Guid === prSelection.entryGuid)?.StartAnchorGuid
                  : null
            if (anchorGuid) void prPasteEntry(anchorGuid)
          } else {
            // Node: paste into the composite / after the selected node, or into the entry root
            if (prSelection?.kind === 'node') {
              const entry = prDoc.Entries.find(en => en.Guid === prSelection.entryGuid)
              let target: import('@shared/prTypes').PtlNode | null = null
              const walk = (n: import('@shared/prTypes').PtlNode) => { if (n.Id === prSelection.nodeId) target = n; (n.Children ?? []).forEach(walk) }
              if (entry) walk(entry.EntryGroup)
              const inside = target && isCompositeNode(target)
              void prPasteNode(prSelection.entryGuid, prSelection.nodeId, inside ? 'inside' : 'after')
            } else if (prSelection?.kind === 'entry') {
              void prPasteNode(prSelection.guid, null)
            }
          }
        })()
        return
      }

      if (isPr || isLogs) return

      // Ctrl+C: Copy selected node (AE)
      if (ctrl && e.key === 'c') {
        if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          copyNode(selectedNodeId)
        }
        return
      }

      // Ctrl+V: Paste after selected node, or at root (AE)
      // 剪贴板内容可能来自其他实例（系统剪贴板），始终尝试异步解析
      if (ctrl && e.key === 'v') {
        e.preventDefault()
        void pasteNode(selectedNodeId)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedNodeId, undo, redo, deleteNode, getNodeById, toggleNodeEnabled, duplicateNode, copyNode, pasteNode,
    editorMode, prSelection, prDoc, prUndo, prRedo,
    prDeleteAnchor, prDeleteEntry, prDeleteEntryNode, prDuplicateAnchor, prDuplicateEntry, prDuplicateEntryNode,
    prCopyEntry, prCopyNode, prPasteEntry, prPasteNode,
    logsSelection, logsDoc, logsUndo, logsRedo, logsDeleteEvent, logsDeleteGcdUse, logsDeleteSkillUse, logsRemoveColumn
  ])

  return null
}
