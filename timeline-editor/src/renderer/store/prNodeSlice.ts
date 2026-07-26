// Node-tree operations of the PR store (the EntryGroup editing surface).
// Split out of prStore so document/anchor/entry state stays readable.
import type { PtlNode } from '@shared/prTypes'
import type { PrStore } from './prStoreTypes'
import { pushUndo, getEntry } from './prStoreTypes'
import { findNode } from '../pr/prModel'
import {
  addNodeToEntry, addSiblingToEntry, deleteNodeFromEntry, moveNodeInEntry, duplicateNodeInEntry
} from '../pr/prMutations'

type SetFn = (updater: (state: PrStore) => void) => void

type NodeSlice = Pick<
  PrStore,
  'addEntryNode' | 'addSiblingNode' | 'updateEntryNode'
  | 'deleteEntryNode' | 'moveEntryNode' | 'duplicateEntryNode'
>

export function createNodeSlice(set: SetFn): NodeSlice {
  return {
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
          // reveal the parent so the new child is visible
          delete s.collapsedNodes[`${entryGuid}:${parentNodeId}`]
        }
        s.isDirty = true
      })
    },

    addSiblingNode: (entryGuid, siblingId, type) => {
      set((s) => {
        if (!s.doc) return
        const entry = getEntry(s.doc, entryGuid)
        if (!entry) return
        pushUndo(s)
        const node = addSiblingToEntry(entry, siblingId, type)
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
        const node: PtlNode | null = entry ? findNode(entry.EntryGroup, nodeId) : null
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
        const removed = deleteNodeFromEntry(entry, nodeId)
        if (removed && s.selection?.kind === 'node'
            && s.selection.entryGuid === entryGuid && s.selection.nodeId === nodeId) {
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
    }
  }
}
