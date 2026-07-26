import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PtlDocument, PtlAnchor, PtlEntry, PtlNode, PtlMeta, PtlSyncRule } from '@shared/prTypes'
import { isPtlDocument } from '@shared/prTypes'
import { createEmptyPtlDocument, findNode } from '../pr/prModel'
import {
  addAnchorToDoc, deleteAnchorFromDoc, duplicateAnchorInDoc,
  addEntryToDoc, duplicateEntryInDoc,
  addNodeToEntry, deleteNodeFromEntry, moveNodeInEntry, duplicateNodeInEntry
} from '../pr/prMutations'

export type PrSelection =
  | { kind: 'meta' }
  | { kind: 'anchor'; guid: string }
  | { kind: 'entry'; guid: string }
  | { kind: 'node'; entryGuid: string; nodeId: number }

interface PrUndoEntry {
  doc: PtlDocument
  selection: PrSelection | null
}

export type EditorMode = 'ae' | 'pr'

export interface PrStore {
  // Global editor mode (AE Triggerline vs PromeRotation timeline)
  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void

  filePath: string | null
  fileName: string | null
  doc: PtlDocument | null
  isDirty: boolean
  loadError: string | null
  selection: PrSelection | null
  expandedEntries: Record<string, boolean>

  undoStack: PrUndoEntry[]
  redoStack: PrUndoEntry[]

  loadFile: (path: string) => Promise<boolean>
  saveFile: (path: string) => Promise<void>
  newDocument: (name: string) => void
  select: (sel: PrSelection | null) => void
  toggleExpanded: (entryGuid: string) => void

  updateMeta: (changes: Partial<PtlMeta>) => void

  addAnchor: () => void
  updateAnchor: (guid: string, changes: Partial<PtlAnchor>) => void
  updateSync: (guid: string, changes: Partial<PtlSyncRule> | null) => void
  deleteAnchor: (guid: string) => void
  duplicateAnchor: (guid: string) => void

  addEntry: (anchorGuid: string) => void
  updateEntry: (guid: string, changes: Partial<PtlEntry>) => void
  deleteEntry: (guid: string) => void
  duplicateEntry: (guid: string) => void

  addEntryNode: (entryGuid: string, parentNodeId: number, type: string) => void
  updateEntryNode: (entryGuid: string, nodeId: number, changes: Partial<PtlNode>) => void
  deleteEntryNode: (entryGuid: string, nodeId: number) => void
  moveEntryNode: (entryGuid: string, nodeId: number, dir: -1 | 1) => void
  duplicateEntryNode: (entryGuid: string, nodeId: number) => void

  undo: () => void
  redo: () => void
}

function pushUndo(s: { doc: PtlDocument | null; undoStack: PrUndoEntry[]; redoStack: PrUndoEntry[]; selection: PrSelection | null }) {
  if (!s.doc) return
  s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), selection: s.selection })
  if (s.undoStack.length > 50) s.undoStack.shift()
  s.redoStack = [] as PrUndoEntry[]
}

function getEntry(doc: PtlDocument, guid: string): PtlEntry | undefined {
  return doc.Entries.find(e => e.Guid === guid)
}

export const usePrStore = create<PrStore>()(
  immer((set, get) => ({
    editorMode: 'ae',
    setEditorMode: (mode) => set({ editorMode: mode }),

    filePath: null,
    fileName: null,
    doc: null,
    isDirty: false,
    loadError: null,
    selection: null,
    expandedEntries: {},
    undoStack: [],
    redoStack: [],

    loadFile: async (path) => {
      const result = await window.electronAPI.readFile(path)
      if (!result.success || !result.content) {
        set({ loadError: `读取文件失败: ${result.error ?? '未知错误'}` })
        return false
      }
      try {
        const json = JSON.parse(result.content)
        if (!isPtlDocument(json)) {
          set({ loadError: '该文件不是 PromeRotation 时间轴格式（缺少 Anchors/Meta）' })
          return false
        }
        set({
          doc: json,
          filePath: path,
          fileName: path.split(/[/\\]/).pop() || null,
          isDirty: false,
          loadError: null,
          selection: { kind: 'meta' },
          expandedEntries: {},
          undoStack: [],
          redoStack: []
        })
        return true
      } catch (err) {
        set({ loadError: `JSON 解析失败: ${err}` })
        return false
      }
    },

    saveFile: async (path) => {
      const { doc } = get()
      if (!doc) return
      const content = JSON.stringify(doc, null, 2)
      const result = await window.electronAPI.writeFile(path, content)
      if (result.success) {
        set({ filePath: path, fileName: path.split(/[/\\]/).pop() || null, isDirty: false })
      } else {
        console.error('Failed to save PTL file:', result.error)
      }
    },

    newDocument: (name) => {
      set({
        doc: createEmptyPtlDocument(name),
        filePath: null,
        fileName: `${name}.json`,
        isDirty: true,
        loadError: null,
        selection: { kind: 'meta' },
        expandedEntries: {},
        undoStack: [],
        redoStack: []
      })
    },

    select: (sel) => set({ selection: sel }),

    toggleExpanded: (entryGuid) => {
      set((s) => {
        s.expandedEntries[entryGuid] = !s.expandedEntries[entryGuid]
      })
    },

    updateMeta: (changes) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        Object.assign(s.doc.Meta, changes)
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

    addEntryNode: (entryGuid, parentNodeId, type) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        const node = addNodeToEntry(entry, parentNodeId, type)
        if (node) {
          s.selection = { kind: 'node', entryGuid, nodeId: node.Id }
          s.expandedEntries[entryGuid] = true
        }
        s.isDirty = true
      })
    },

    updateEntryNode: (entryGuid, nodeId, changes) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        const node = entry ? findNode(entry.EntryGroup, nodeId) : null
        if (!node) return
        pushUndo(s)
        Object.assign(node, changes)
        s.isDirty = true
      })
    },

    deleteEntryNode: (entryGuid, nodeId) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        if (deleteNodeFromEntry(entry, nodeId) &&
            s.selection?.kind === 'node' && s.selection.entryGuid === entryGuid && s.selection.nodeId === nodeId) {
          s.selection = { kind: 'entry', guid: entryGuid }
        }
        s.isDirty = true
      })
    },

    moveEntryNode: (entryGuid, nodeId, dir) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        moveNodeInEntry(entry, nodeId, dir)
        s.isDirty = true
      })
    },

    duplicateEntryNode: (entryGuid, nodeId) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        const clone = duplicateNodeInEntry(entry, nodeId)
        if (clone) s.selection = { kind: 'node', entryGuid, nodeId: clone.Id }
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
