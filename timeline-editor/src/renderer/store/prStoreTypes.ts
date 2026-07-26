import type { PtlDocument, PtlAnchor, PtlEntry, PtlNode, PtlMeta, PtlSyncRule } from '@shared/prTypes'

/** What the PR editor currently has selected — drives the property panel */
export type PrSelection =
  | { kind: 'meta' }
  | { kind: 'anchor'; guid: string }
  | { kind: 'entry'; guid: string }
  | { kind: 'node'; entryGuid: string; nodeId: number }

export interface PrUndoEntry {
  doc: PtlDocument
  selection: PrSelection | null
}

export type EditorMode = 'ae' | 'pr'

/** Minimal shape the undo helper needs — keeps it usable from every slice */
export interface PrUndoable {
  doc: PtlDocument | null
  undoStack: PrUndoEntry[]
  redoStack: PrUndoEntry[]
  selection: PrSelection | null
}

export const PR_MAX_UNDO = 50

export function pushUndo(s: PrUndoable): void {
  if (!s.doc) return
  s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), selection: s.selection })
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

  loadFile: (path: string) => Promise<boolean>
  saveFile: (path: string) => Promise<void>
  newDocument: (name: string) => void
  select: (sel: PrSelection | null) => void
  toggleExpanded: (entryGuid: string) => void
  setExpanded: (entryGuid: string, expanded: boolean) => void
  toggleNodeCollapsed: (key: string) => void

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
  addSiblingNode: (entryGuid: string, siblingId: number, type: string) => void
  updateEntryNode: (entryGuid: string, nodeId: number, changes: Partial<PtlNode>) => void
  deleteEntryNode: (entryGuid: string, nodeId: number) => void
  moveEntryNode: (entryGuid: string, nodeId: number, dir: -1 | 1) => void
  duplicateEntryNode: (entryGuid: string, nodeId: number) => void

  undo: () => void
  redo: () => void
}
