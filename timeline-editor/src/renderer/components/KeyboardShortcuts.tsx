import { useEffect } from 'react'
import { useStore } from '../store'

export function KeyboardShortcuts() {
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const deleteNode = useStore(s => s.deleteNode)
  const getNodeById = useStore(s => s.getNodeById)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const duplicateNode = useStore(s => s.duplicateNode)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs or Monaco
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
          target.closest('.monaco-editor') || target.closest('[contenteditable]')) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

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
        undo()
        return
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((ctrl && !e.shiftKey && e.key === 'y') || (ctrl && e.shiftKey && e.key === 'Z')) {
        e.preventDefault()
        redo()
        return
      }

      // Delete: Delete selected node
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          deleteNode(selectedNodeId)
        }
        return
      }

      // Space: Toggle enabled
      if (e.key === ' ' && selectedNodeId !== null) {
        e.preventDefault()
        toggleNodeEnabled(selectedNodeId)
        return
      }

      // Ctrl+D: Duplicate
      if (ctrl && e.key === 'd') {
        if (selectedNodeId !== null && selectedNodeId !== 0) {
          e.preventDefault()
          duplicateNode(selectedNodeId)
        }
        return
      }

      // Ctrl+F: Focus search (future)
      if (ctrl && e.key === 'f') {
        e.preventDefault()
        // Future: focus search input
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, undo, redo, deleteNode, toggleNodeEnabled, duplicateNode])

  return null
}
