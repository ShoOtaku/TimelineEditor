// Pure document-mutation helpers for the PR store (operate on Immer drafts).
import type { PtlDocument, PtlAnchor, PtlEntry, PtlNode } from '@shared/prTypes'
import {
  createAnchor, createEntry, createNode, newGuid,
  sortedAnchors, findNode, findNodeParent, nextNodeId, reassignNodeIds, isCompositeNode
} from './prModel'

/** Append a new anchor 5s after the last non-end anchor (clamped before the end anchor) */
export function addAnchorToDoc(doc: PtlDocument): PtlAnchor {
  const ordered = sortedAnchors(doc)
  const end = ordered.find(a => a.IsEndAnchor)
  const lastNonEnd = [...ordered].reverse().find(a => !a.IsEndAnchor)
  let time = lastNonEnd ? lastNonEnd.Time + 5 : 0
  if (end && time >= end.Time) time = Math.max(0, end.Time - 1)
  const anchor = createAnchor(Math.round(time * 10) / 10)
  doc.Anchors.push(anchor)
  return anchor
}

/** Remove an anchor and every entry bound to it */
export function deleteAnchorFromDoc(doc: PtlDocument, guid: string): void {
  doc.Anchors = doc.Anchors.filter(a => a.Guid !== guid)
  doc.Entries = doc.Entries.filter(e => e.StartAnchorGuid !== guid)
}

export function duplicateAnchorInDoc(doc: PtlDocument, guid: string): PtlAnchor | null {
  const anchor = doc.Anchors.find(a => a.Guid === guid)
  if (!anchor) return null
  const clone = JSON.parse(JSON.stringify(anchor)) as PtlAnchor
  clone.Guid = newGuid()
  clone.Time = anchor.Time + 0.1
  clone.IsEndAnchor = false
  doc.Anchors.push(clone)
  return clone
}

export function addEntryToDoc(doc: PtlDocument, anchorGuid: string): PtlEntry {
  const entry = createEntry(anchorGuid)
  doc.Entries.push(entry)
  return entry
}

export function duplicateEntryInDoc(doc: PtlDocument, guid: string): PtlEntry | null {
  const entry = doc.Entries.find(e => e.Guid === guid)
  if (!entry) return null
  const clone = JSON.parse(JSON.stringify(entry)) as PtlEntry
  clone.Guid = newGuid()
  clone.Name = `${clone.Name ?? '行为组'} (副本)`
  doc.Entries.push(clone)
  return clone
}

export function addNodeToEntry(entry: PtlEntry, parentNodeId: number, type: string): PtlNode | null {
  const parent = findNode(entry.EntryGroup, parentNodeId)
  if (!parent) return null
  const node = createNode(type, nextNodeId(entry.EntryGroup))
  if (!parent.Children) parent.Children = []
  parent.Children.push(node)
  return node
}

/** Insert a new node directly after `siblingId` under the same parent */
export function addSiblingToEntry(entry: PtlEntry, siblingId: number, type: string): PtlNode | null {
  const parent = findNodeParent(entry.EntryGroup, siblingId)
  if (!parent?.Children) return null
  const idx = parent.Children.findIndex(c => c.Id === siblingId)
  if (idx < 0) return null
  const node = createNode(type, nextNodeId(entry.EntryGroup))
  parent.Children.splice(idx + 1, 0, node)
  return node
}

export function deleteNodeFromEntry(entry: PtlEntry, nodeId: number): boolean {
  const parent = findNodeParent(entry.EntryGroup, nodeId)
  if (!parent?.Children) return false
  parent.Children = parent.Children.filter(c => c.Id !== nodeId)
  return true
}

export function moveNodeInEntry(entry: PtlEntry, nodeId: number, dir: -1 | 1): boolean {
  const parent = findNodeParent(entry.EntryGroup, nodeId)
  if (!parent?.Children) return false
  const idx = parent.Children.findIndex(c => c.Id === nodeId)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= parent.Children.length) return false
  const [node] = parent.Children.splice(idx, 1)
  parent.Children.splice(target, 0, node)
  return true
}

/** Where a dragged node should land relative to the drop target */
export type DropPosition = 'before' | 'after' | 'inside'

/** True when `ancestorId` is `nodeId` or one of its ancestors — blocks dropping a node into itself */
export function isDescendantOf(root: PtlNode, nodeId: number, ancestorId: number): boolean {
  if (nodeId === ancestorId) return true
  const ancestor = findNode(root, ancestorId)
  if (!ancestor) return false
  let found = false
  const walk = (n: PtlNode) => {
    if (n.Id === nodeId) found = true
    for (const c of n.Children ?? []) walk(c)
  }
  for (const c of ancestor.Children ?? []) walk(c)
  return found
}

/**
 * Whether a drag/drop is legal. Rejects dropping the root, dropping onto
 * itself or into its own subtree, dropping beside the root (it has no parent),
 * and dropping *into* a leaf node.
 */
export function canMoveNodeTo(
  entry: PtlEntry,
  nodeId: number,
  targetId: number,
  position: DropPosition
): boolean {
  const root = entry.EntryGroup
  if (nodeId === root.Id) return false
  if (isDescendantOf(root, targetId, nodeId)) return false

  const sourceParent = findNodeParent(root, nodeId)
  if (!sourceParent?.Children) return false

  const target = findNode(root, targetId)
  if (!target) return false

  if (position === 'inside') return isCompositeNode(target)
  if (targetId === root.Id) return false
  return !!findNodeParent(root, targetId)?.Children
}

/**
 * Move `nodeId` next to (or into) `targetId`. Call canMoveNodeTo first —
 * this returns false without touching the tree when the move is illegal.
 */
export function moveNodeTo(
  entry: PtlEntry,
  nodeId: number,
  targetId: number,
  position: DropPosition
): boolean {
  if (!canMoveNodeTo(entry, nodeId, targetId, position)) return false

  const root = entry.EntryGroup
  const sourceParent = findNodeParent(root, nodeId)!
  let destParent: PtlNode
  let destIndex: number

  if (position === 'inside') {
    destParent = findNode(root, targetId)!
    if (!destParent.Children) destParent.Children = []
    destIndex = destParent.Children.length
  } else {
    destParent = findNodeParent(root, targetId)!
    destIndex = destParent.Children!.findIndex(c => c.Id === targetId)
    if (position === 'after') destIndex += 1
  }

  const sourceIndex = sourceParent.Children!.findIndex(c => c.Id === nodeId)
  if (sourceIndex < 0) return false

  // Removing first shifts later indices within the same parent
  const [node] = sourceParent.Children!.splice(sourceIndex, 1)
  if (destParent === sourceParent && sourceIndex < destIndex) destIndex -= 1

  destParent.Children!.splice(destIndex, 0, node)
  return true
}

export function duplicateNodeInEntry(entry: PtlEntry, nodeId: number): PtlNode | null {
  const parent = findNodeParent(entry.EntryGroup, nodeId)
  if (!parent?.Children) return null
  const idx = parent.Children.findIndex(c => c.Id === nodeId)
  if (idx < 0) return null
  const clone = JSON.parse(JSON.stringify(parent.Children[idx])) as PtlNode
  reassignNodeIds(clone, nextNodeId(entry.EntryGroup))
  parent.Children.splice(idx + 1, 0, clone)
  return clone
}
