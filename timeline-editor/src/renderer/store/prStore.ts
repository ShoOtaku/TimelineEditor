import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { isPtlDocument } from '@shared/prTypes'
import type { PtlEntry, PtlNode } from '@shared/prTypes'
import { createEmptyPtlDocument } from '../pr/prModel'
import {
  addAnchorToDoc, deleteAnchorFromDoc, duplicateAnchorInDoc,
  addEntryToDoc, duplicateEntryInDoc, pasteEntryToDoc, pasteNodeToEntry
} from '../pr/prMutations'
import type { PrStore, PrUndoEntry } from './prStoreTypes'
import { pushUndo, getEntry } from './prStoreTypes'
import { createNodeSlice } from './prNodeSlice'
import { askAlert } from './dialogStore'

export type { PrSelection, EditorMode, PrStore } from './prStoreTypes'

export const usePrStore = create<PrStore>()(
  immer((set, get) => ({
    ...createNodeSlice(set),

    editorMode: 'ae',
    setEditorMode: (mode) => set({ editorMode: mode }),

    filePath: null,
    fileName: null,
    doc: null,
    isDirty: false,
    loadError: null,
    selection: null,
    expandedEntries: {},
    collapsedNodes: {},
    undoStack: [],
    redoStack: [],
    scriptTarget: 'node',

    editPrOpenerScript: () => set({ scriptTarget: 'opener' }),

    loadFile: async (path) => {
      const result = await window.electronAPI.readFile(path)
      const fileName = path.split(/[/\\]/).pop() || path
      if (!result.success || !result.content) {
        set({ loadError: `读取文件失败: ${result.error ?? '未知错误'}` })
        askAlert({ title: '打开失败', message: `无法读取 ${fileName}\n${result.error ?? ''}`, danger: true })
        return false
      }
      try {
        const json = JSON.parse(result.content)
        if (!isPtlDocument(json)) {
          set({ loadError: '该文件不是 PromeRotation 时间轴格式（缺少 Anchors/Meta）' })
          askAlert({ title: '打开失败', message: `${fileName} 不是 PromeRotation 时间轴格式（缺少 Anchors/Meta）`, danger: true })
          return false
        }
        set({
          doc: json,
          filePath: path,
          fileName: path.split(/[/\\]/).pop() || null,
          isDirty: false,
          loadError: null,
          selection: { kind: 'meta' },
          scriptTarget: 'node',
          expandedEntries: {},
          collapsedNodes: {},
          undoStack: [],
          redoStack: []
        })
        return true
      } catch (err) {
        set({ loadError: `JSON 解析失败: ${err}` })
        askAlert({ title: '打开失败', message: `${fileName} 不是有效的 JSON 文件\n${err}`, danger: true })
        return false
      }
    },

    saveFile: async (path) => {
      const { doc } = get()
      if (!doc) return false
      const content = JSON.stringify(doc, null, 2)
      const result = await window.electronAPI.writeFile(path, content)
      if (result.success) {
        set({ filePath: path, fileName: path.split(/[/\\]/).pop() || null, isDirty: false })
        return true
      }
      console.error('Failed to save PTL file:', result.error)
      askAlert({ title: '保存失败', message: `无法写入 ${path}\n${result.error ?? '未知错误'}`, danger: true })
      return false
    },

    newDocument: (name) => {
      set({
        doc: createEmptyPtlDocument(name),
        filePath: null,
        fileName: `${name}.json`,
        isDirty: true,
        loadError: null,
        selection: { kind: 'meta' },
        scriptTarget: 'node',
        expandedEntries: {},
        collapsedNodes: {},
        undoStack: [],
        redoStack: []
      })
    },

    importDocument: (doc, sourceName) => {
      const safeName = sourceName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'CactbotTimeline'
      set({
        doc,
        filePath: null,
        fileName: `${safeName}.json`,
        isDirty: true,
        loadError: null,
        selection: { kind: 'meta' },
        scriptTarget: 'node',
        expandedEntries: {},
        collapsedNodes: {},
        undoStack: [],
        redoStack: []
      })
    },

    // Selecting an entry (or one of its nodes) reveals its node tree —
    // node editing was undiscoverable while the tree stayed collapsed.
    select: (sel) => {
      set((s) => {
        s.selection = sel
        s.scriptTarget = 'node'
        if (sel?.kind === 'entry') s.expandedEntries[sel.guid] = true
        else if (sel?.kind === 'node') s.expandedEntries[sel.entryGuid] = true
      })
    },

    toggleExpanded: (entryGuid) => {
      set((s) => {
        s.expandedEntries[entryGuid] = !s.expandedEntries[entryGuid]
      })
    },

    setExpanded: (entryGuid, expanded) => {
      set((s) => { s.expandedEntries[entryGuid] = expanded })
    },

    toggleNodeCollapsed: (key) => {
      set((s) => { s.collapsedNodes[key] = !s.collapsedNodes[key] })
    },

    updateMeta: (changes, undoTag) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s, undoTag)
        Object.assign(s.doc.Meta, changes)
        s.isDirty = true
      })
    },

    updateVariables: (variables, undoTag) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s, undoTag)
        s.doc.Variables = variables
        s.isDirty = true
      })
    },

    addAnchor: () => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const anchor = addAnchorToDoc(s.doc)
        s.selection = { kind: 'anchor', guid: anchor.Guid }
        s.isDirty = true
      })
    },

    updateAnchor: (guid, changes) => {
      set((s) => {
        const anchor = s.doc?.Anchors.find(a => a.Guid === guid)
        if (!anchor) return
        pushUndo(s)
        Object.assign(anchor, changes)
        s.isDirty = true
      })
    },

    updateSync: (guid, changes) => {
      set((s) => {
        const anchor = s.doc?.Anchors.find(a => a.Guid === guid)
        if (!anchor) return
        pushUndo(s)
        if (changes === null) {
          anchor.Sync = null
        } else {
          if (!anchor.Sync) {
            anchor.Sync = {
              Type: 'None', Params: {}, MatchTime: null, JumpTargetTime: null,
              IsForceJump: false, WindowBefore: 0, WindowAfter: 0
            }
          }
          Object.assign(anchor.Sync, changes)
        }
        s.isDirty = true
      })
    },

    deleteAnchor: (guid) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        deleteAnchorFromDoc(s.doc, guid)
        if (s.selection && (
          (s.selection.kind === 'anchor' && s.selection.guid === guid) ||
          (s.selection.kind === 'entry' && !getEntry(s.doc, s.selection.guid)) ||
          (s.selection.kind === 'node' && !getEntry(s.doc, s.selection.entryGuid))
        )) {
          s.selection = null
        }
        s.isDirty = true
      })
    },

    duplicateAnchor: (guid) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const clone = duplicateAnchorInDoc(s.doc, guid)
        if (clone) s.selection = { kind: 'anchor', guid: clone.Guid }
        s.isDirty = true
      })
    },

    addEntry: (anchorGuid) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const entry = addEntryToDoc(s.doc, anchorGuid)
        s.selection = { kind: 'entry', guid: entry.Guid }
        s.expandedEntries[entry.Guid] = true
        s.isDirty = true
      })
    },

    updateEntry: (guid, changes) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, guid)
        if (!entry) return
        pushUndo(s)
        Object.assign(entry, changes)
        s.isDirty = true
      })
    },

    deleteEntry: (guid) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        s.doc.Entries = s.doc.Entries.filter(e => e.Guid !== guid)
        if (s.selection && (
          (s.selection.kind === 'entry' && s.selection.guid === guid) ||
          (s.selection.kind === 'node' && s.selection.entryGuid === guid)
        )) {
          s.selection = null
        }
        s.isDirty = true
      })
    },

    duplicateEntry: (guid) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const clone = duplicateEntryInDoc(s.doc, guid)
        if (clone) s.selection = { kind: 'entry', guid: clone.Guid }
        s.isDirty = true
      })
    },

    importEntries: (entries) => {
      set((s) => {
        if (!s.doc || entries.length === 0) return
        pushUndo(s)
        s.doc.Entries.push(...entries)
        s.isDirty = true
      })
    },

    clipboard: null,

    copyEntry: (guid) => {
      const entry = get().doc ? getEntry(get().doc!, guid) : undefined
      if (!entry) return
      // Deep-clone out of the Immer-frozen state
      set({ clipboard: { kind: 'entry', data: JSON.parse(JSON.stringify(entry)) } })
    },

    copyNode: (entryGuid, nodeId) => {
      const doc = get().doc
      const entry = doc ? getEntry(doc, entryGuid) : undefined
      if (!entry) return
      let target: PtlNode | null = null
      const walk = (n: PtlNode) => { if (n.Id === nodeId) target = n; (n.Children ?? []).forEach(walk) }
      walk(entry.EntryGroup)
      if (!target) return
      set({ clipboard: { kind: 'node', data: JSON.parse(JSON.stringify(target)) } })
    },

    pasteEntry: (anchorGuid) => {
      set((s) => {
        if (!s.doc || s.clipboard?.kind !== 'entry') return
        pushUndo(s)
        const clone = pasteEntryToDoc(s.doc, anchorGuid, s.clipboard.data as PtlEntry)
        if (!clone) { s.undoStack.pop(); return }
        s.selection = { kind: 'entry', guid: clone.Guid }
        s.expandedEntries[clone.Guid] = true
        s.isDirty = true
      })
    },

    pasteNode: (entryGuid, targetNodeId, position = 'after') => {
      set((s) => {
        if (!s.doc || s.clipboard?.kind !== 'node') return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        const clone = pasteNodeToEntry(entry, s.clipboard.data as PtlNode, targetNodeId, position)
        if (!clone) { s.undoStack.pop(); return }
        s.selection = { kind: 'node', entryGuid, nodeId: clone.Id }
        s.isDirty = true
      })
    },

    undo: () => {
      if (get().undoStack.length === 0) return
      set((s) => {
        const entry = s.undoStack.pop()!
        s.redoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), selection: s.selection })
        s.doc = entry.doc
        s.selection = entry.selection
        s.isDirty = true
      })
    },

    redo: () => {
      if (get().redoStack.length === 0) return
      set((s) => {
        const entry = s.redoStack.pop()!
        s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), selection: s.selection })
        s.doc = entry.doc
        s.selection = entry.selection
        s.isDirty = true
      })
    }
  }))
)
