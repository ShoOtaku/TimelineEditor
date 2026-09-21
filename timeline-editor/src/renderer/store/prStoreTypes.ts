import type { PtlDocument, PtlAnchor, PtlEntry, PtlNode, PtlMeta, PtlSyncRule, PtlVariable } from '@shared/prTypes'
import type { DropPosition } from '../pr/prMutations'

/** What the PR editor currently has selected — drives the property panel */
export type PrSelection =
  | { kind: 'meta' }
  | { kind: 'anchor'; guid: string }
  | { kind: 'entry'; guid: string }
  | { kind: 'node'; entryGuid: string; nodeId: number }

export interface PrUndoEntry {
  doc: PtlDocument
  selection: PrSelection | null
  /** Coalescing key: consecutive edits with the same tag collapse into one undo step */
  tag?: string
}

export type EditorMode = 'ae' | 'pr' | 'logs'

/** Internal clipboard for cross-anchor / cross-entry copy & paste */
export type PrClipboard =
  | { kind: 'entry'; data: PtlEntry }
  | { kind: 'node'; data: PtlNode }

/** Minimal shape the undo helper needs — keeps it usable from every slice */
export interface PrUndoable {
  doc: PtlDocument | null
  undoStack: PrUndoEntry[]
  redoStack: PrUndoEntry[]
  selection: PrSelection | null
}

export const PR_MAX_UNDO = 50

export function pushUndo(s: PrUndoable, tag?: string): void {
  if (!s.doc) return
  // Consecutive same-tag edits (e.g. typing in a meta field) share one undo step
  if (tag && s.undoStack.length > 0 && s.undoStack[s.undoStack.length - 1].tag === tag) return
  s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), selection: s.selection, tag })
  if (s.undoStack.length > PR_MAX_UNDO) s.undoStack.shift()
  s.redoStack = [] as PrUndoEntry[]
}

export function getEntry(doc: PtlDocument, guid: string): PtlEntry | undefined {
  return doc.Entries.find(e => e.Guid === guid)
}

export interface PrStore {
  /** Global editor mode (AE Triggerline vs PromeRotation timeline) */
  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void

  filePath: string | null
  fileName: string | null
  doc: PtlDocument | null
  isDirty: boolean
  loadError: string | null
  selection: PrSelection | null
  expandedEntries: Record<string, boolean>
  /** collapsed composite nodes, keyed `${entryGuid}:${nodeId}` */
  collapsedNodes: Record<string, boolean>

  undoStack: PrUndoEntry[]
  redoStack: PrUndoEntry[]

  /** What the bottom script panel edits: a csharprunningaction node's Script or Meta.CustomOpener */
  scriptTarget: 'node' | 'opener'
  /** Switch the script panel to edit Meta.CustomOpener.Script */
  editPrOpenerScript: () => void

  loadFile: (path: string) => Promise<boolean>
  saveFile: (path: string) => Promise<boolean>
  newDocument: (name: string) => void
  importDocument: (doc: PtlDocument, sourceName: string) => void
  select: (sel: PrSelection | null) => void
  toggleExpanded: (entryGuid: string) => void
  setExpanded: (entryGuid: string, expanded: boolean) => void
  toggleNodeCollapsed: (key: string) => void

  updateMeta: (changes: Partial<PtlMeta>, undoTag?: string) => void
  /** Replace the whole Variables list (add/remove/reorder are done by the caller) */
  updateVariables: (variables: PtlVariable[], undoTag?: string) => void

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
  addSiblingNode: (entryGuid: string, siblingId: number, type: string) => void
  updateEntryNode: (entryGuid: string, nodeId: number, changes: Partial<PtlNode>, undoTag?: string) => void
  deleteEntryNode: (entryGuid: string, nodeId: number) => void
  moveEntryNode: (entryGuid: string, nodeId: number, dir: -1 | 1) => void
  /** drag & drop: place nodeId before/after targetId, or inside it as a child */
  moveEntryNodeTo: (entryGuid: string, nodeId: number, targetId: number, position: DropPosition) => void
  duplicateEntryNode: (entryGuid: string, nodeId: number) => void

  /** Internal clipboard — survives file switches so entries/nodes can be copied across timelines */
  clipboard: PrClipboard | null
  copyEntry: (guid: string) => void
  copyNode: (entryGuid: string, nodeId: number) => void
  /** Paste a copied entry onto another anchor (Offset clamped into the anchor's segment) */
  pasteEntry: (anchorGuid: string) => void
  /** Paste a copied node into an entry: inside a composite target (or root when null), else after it */
  pasteNode: (entryGuid: string, targetNodeId: number | null, position?: 'inside' | 'after') => void

  undo: () => void
  redo: () => void
}
