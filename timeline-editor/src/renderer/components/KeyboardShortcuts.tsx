import { useEffect } from 'react'
import { useStore } from '../store'
import { usePrStore } from '../store/prStore'

export function KeyboardShortcuts() {
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const deleteNode = useStore(s => s.deleteNode)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const duplicateNode = useStore(s => s.duplicateNode)
  const copyNode = useStore(s => s.copyNode)
  const pasteNode = useStore(s => s.pasteNode)
  const clipboard = useStore(s => s.clipboard)

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs or Monaco
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
          target.closest('.monaco-editor') || target.closest('[contenteditable]')) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey
      const isPr = editorMode === 'pr'

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
        if (isPr) prUndo(); else undo()
        return
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((ctrl && !e.shiftKey && e.key === 'y') || (ctrl && e.shiftKey && e.key === 'Z')) {
        e.preventDefault()
        if (isPr) prRedo(); else redo()
        return
      }

      // Delete: delete selected item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isPr) {
          if (!prSelection || !prDoc) return
          e.preventDefault()
          if (prSelection.kind === 'anchor') {
            const n = prDoc.Entries.filter(en => en.StartAnchorGuid === prSelection.guid).length
            if (n > 0 && !window.confirm(`删除锚点将同时删除其 ${n} 个行为组，确定？`)) return
            prDeleteAnchor(prSelection.guid)
          } else if (prSelection.kind === 'entry') {
            prDeleteEntry(prSelection.guid)
          } else if (prSelection.kind === 'node') {
            prDeleteEntryNode(prSelection.entryGuid, prSelection.nodeId)
          }
        } else if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          deleteNode(selectedNodeId)
        }
        return
      }

      // Space: Toggle enabled (AE only — PR uses property panel checkboxes)
      if (e.key === ' ' && !isPr && selectedNodeId !== null) {
        e.preventDefault()
        toggleNodeEnabled(selectedNodeId)
        return
      }

      // Ctrl+D: Duplicate
      if (ctrl && e.key === 'd') {
        if (isPr) {
          if (!prSelection) return
          e.preventDefault()
          if (prSelection.kind === 'anchor') prDuplicateAnchor(prSelection.guid)
          else if (prSelection.kind === 'entry') prDuplicateEntry(prSelection.guid)
          else if (prSelection.kind === 'node') prDuplicateEntryNode(prSelection.entryGuid, prSelection.nodeId)
        } else if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          duplicateNode(selectedNodeId)
        }
        return
      }

      if (isPr) return

      // Ctrl+C: Copy selected node (AE)
      if (ctrl && e.key === 'c') {
        if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          copyNode(selectedNodeId)
        }
        return
      }

      // Ctrl+V: Paste after selected node, or at root (AE)
      if (ctrl && e.key === 'v') {
        if (clipboard) {
          e.preventDefault()
          pasteNode(selectedNodeId)
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedNodeId, undo, redo, deleteNode, toggleNodeEnabled, duplicateNode, copyNode, pasteNode, clipboard,
    editorMode, prSelection, prDoc, prUndo, prRedo,
    prDeleteAnchor, prDeleteEntry, prDeleteEntryNode, prDuplicateAnchor, prDuplicateEntry, prDuplicateEntryNode
  ])

  return null
}
