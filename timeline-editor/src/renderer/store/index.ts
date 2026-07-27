import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AcrTypeDef, TreeNode, TriggerLineDocument } from '@shared/types'
import {
  addNodeToParent,
  createDefaultNode,
  deleteNodeFromDoc,
  findNodeById,
  findParentId,
  getNextId,
  isDescendant,
  reassignSubtreeIds
} from './treeUtils'

interface UndoEntry {
  doc: TriggerLineDocument
  selectedNodeId: number | null
}

export interface EditorStore {
  // Document
  filePath: string | null
  fileName: string | null
  doc: TriggerLineDocument | null
  isDirty: boolean
  selectedNodeId: number | null
  selectedScriptNodeId: number | null

  // Clipboard
  clipboard: TreeNode | null

  // Spell lookup
  /** n=名称 c=ActionCategory t=技能种类 ct=CastType p=1 表示玩家技能 */
  spellLookup: Record<string, { n: string; c?: number; t: number; ct?: number; p?: number }> | null
  loadSpellLookup: () => Promise<void>

  // ACR types
  acrConditionTypes: AcrTypeDef[]
  acrActionTypes: AcrTypeDef[]
  acrDllNames: string[]
  loadAcrTypes: () => Promise<void>

  // Undo/Redo
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  maxUndo: number

  // Actions
  loadFile: (path: string) => Promise<void>
  saveFile: (path: string) => Promise<void>
  setDoc: (doc: TriggerLineDocument) => void
  selectNode: (id: number | null) => void
  selectScriptNode: (id: number | null) => void

  // Tree mutations
  updateNode: (nodeId: number, changes: Partial<TreeNode>) => void
  deleteNode: (nodeId: number) => void
  addChild: (parentId: number, nodeType: string, index?: number) => void
  /** insert a new node directly after siblingId, under the same parent */
  addSibling: (siblingId: number, nodeType: string) => void
  moveNode: (nodeId: number, newParentId: number, index: number) => void
  toggleNodeEnabled: (nodeId: number) => void
  duplicateNode: (nodeId: number) => void
  copyNode: (nodeId: number) => void
  pasteNode: (targetNodeId: number | null) => void

  // Undo/Redo
  undo: () => void
  redo: () => void

  // Utilities
  getNodeById: (id: number) => TreeNode | null
  getParentId: (id: number) => number | null
}

function pushUndo(s: { doc: TriggerLineDocument | null; undoStack: UndoEntry[]; redoStack: UndoEntry[]; selectedNodeId: number | null; maxUndo: number }) {
  if (!s.doc) return
  s.undoStack.push({
    doc: JSON.parse(JSON.stringify(s.doc)),
    selectedNodeId: s.selectedNodeId
  })
  if (s.undoStack.length > s.maxUndo) {
    s.undoStack.shift()
  }
  s.redoStack = [] as any
}

export const useStore = create<EditorStore>()(
  immer((set, get) => ({
    filePath: null,
    fileName: null,
    doc: null,
    isDirty: false,
    selectedNodeId: null,
    selectedScriptNodeId: null,
    clipboard: null,
    undoStack: [],
    redoStack: [],
    maxUndo: 50,
    spellLookup: null,
    acrConditionTypes: [],
    acrActionTypes: [],
    acrDllNames: [],

    loadFile: async (path: string) => {
      const result = await window.electronAPI.readFile(path)
      if (!result.success || !result.content) {
        console.error('Failed to read file:', result.error)
        return
      }
      try {
        const doc = JSON.parse(result.content) as TriggerLineDocument
        const fileName = path.split(/[/\\]/).pop() || null
        set({
          doc,
          filePath: path,
          fileName,
          isDirty: false,
          selectedNodeId: null,
          selectedScriptNodeId: null,
          undoStack: [],
          redoStack: []
        })
      } catch (err) {
        console.error('Failed to parse JSON:', err)
      }
    },

    saveFile: async (path: string) => {
      const { doc } = get()
      if (!doc) return
      const content = JSON.stringify(doc, null, 2)
      const result = await window.electronAPI.writeFile(path, content)
      if (result.success) {
        const fileName = path.split(/[/\\]/).pop() || null
        set({ filePath: path, fileName, isDirty: false })
      } else {
        console.error('Failed to save file:', result.error)
      }
    },

    loadSpellLookup: async () => {
      try {
        const result = await window.electronAPI.loadSpellData()
        if (result.success && result.data) {
          set({ spellLookup: result.data })
          console.log('Spell lookup loaded:', Object.keys(result.data).length, 'actions')
        }
      } catch (err) {
        console.error('Failed to load spell data:', err)
      }
    },

    loadAcrTypes: async () => {
      try {
        const result = await window.electronAPI.discoverAcrTypes()
        if (result.success) {
          set({
            acrConditionTypes: result.conditions as AcrTypeDef[],
            acrActionTypes: result.actions as AcrTypeDef[],
            acrDllNames: result.acrDlls
          })
          console.log('ACR types loaded:', result.conditions.length, 'conditions,', result.actions.length, 'actions,', result.acrDlls.length, 'DLLs')
        }
      } catch (err) {
        console.error('Failed to load ACR types:', err)
      }
    },

    setDoc: (doc) => {
      set((s) => {
        pushUndo(s)
        s.doc = doc
        s.isDirty = true
      })
    },

    selectNode: (id) => set({ selectedNodeId: id }),

    selectScriptNode: (id) => set({ selectedScriptNodeId: id }),

    updateNode: (nodeId, changes) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const node = findNodeById(s.doc, nodeId)
        if (node) {
          Object.assign(node, changes)
        }
        s.isDirty = true
      })
    },

    deleteNode: (nodeId) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        deleteNodeFromDoc(s.doc, nodeId)
        if (s.selectedNodeId === nodeId) s.selectedNodeId = null
        if (s.selectedScriptNodeId === nodeId) s.selectedScriptNodeId = null
        s.isDirty = true
      })
    },

    addChild: (parentId, nodeType, index?) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const newId = getNextId(s.doc)
        const newNode = createDefaultNode(nodeType, newId)
        addNodeToParent(s.doc, parentId, newNode, index)
        s.selectedNodeId = newId
        s.isDirty = true
      })
    },

    addSibling: (siblingId, nodeType) => {
      set((s) => {
        if (!s.doc) return
        const parentId = findParentId(s.doc, siblingId)
        // Root has no parent — fall back to appending inside it
        const targetParent = parentId ?? (s.doc.TreeRoot as any).Id ?? 0
        const parent = findNodeById(s.doc, targetParent)
        if (!parent || !('Childs' in parent) || !Array.isArray(parent.Childs)) return
        const idx = parent.Childs!.findIndex(c => c.Id === siblingId)
        pushUndo(s)
        const newId = getNextId(s.doc)
        const newNode = createDefaultNode(nodeType, newId)
        parent.Childs!.splice(idx >= 0 ? idx + 1 : parent.Childs!.length, 0, newNode)
        s.selectedNodeId = newId
        s.isDirty = true
      })
    },

    moveNode: (nodeId, newParentId, index) => {
      set((s) => {
        if (!s.doc) return
        if (nodeId === newParentId) return
        const node = findNodeById(s.doc, nodeId)
        if (!node) return
        // Dropping a node into its own subtree would delete it: the destination
        // parent disappears along with the removed branch, so the re-insert fails.
        if (isDescendant(node, newParentId)) return
        pushUndo(s)
        const snapshot = JSON.parse(JSON.stringify(node)) as TreeNode
        deleteNodeFromDoc(s.doc, nodeId)
        addNodeToParent(s.doc, newParentId, snapshot, index)
        s.isDirty = true
      })
    },

    toggleNodeEnabled: (nodeId) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const node = findNodeById(s.doc, nodeId)
        if (node) {
          node.Enable = !node.Enable
        }
        s.isDirty = true
      })
    },

    duplicateNode: (nodeId) => {
      const state = get()
      if (!state.doc) return
      const node = findNodeById(state.doc, nodeId)
      if (!node) return
      const parentId = findParentId(state.doc, nodeId)
      if (parentId === null) return
      // Deep-clone the node snapshot outside Immer (read-only is fine)
      const cloneSnapshot = JSON.parse(JSON.stringify(node)) as TreeNode

      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const newId = getNextId(s.doc)
        const clone = JSON.parse(JSON.stringify(cloneSnapshot)) as TreeNode
        reassignSubtreeIds(clone, newId)

        const parentN = findNodeById(s.doc, parentId)
        if (parentN && 'Childs' in parentN && Array.isArray(parentN.Childs)) {
          const idx = parentN.Childs!.findIndex(c => c.Id === nodeId)
          parentN.Childs!.splice(idx + 1, 0, clone)
        }
        s.selectedNodeId = newId
        s.isDirty = true
      })
    },

    copyNode: (nodeId) => {
      const state = get()
      if (!state.doc || nodeId === 0) return
      const node = findNodeById(state.doc, nodeId)
      if (!node) return
      // Deep-clone into clipboard (outside Immer)
      const snapshot = JSON.parse(JSON.stringify(node)) as TreeNode
      set({ clipboard: snapshot })
    },

    pasteNode: (targetNodeId) => {
      const state = get()
      if (!state.doc || !state.clipboard) return

      set((s) => {
        if (!s.doc || !s.clipboard) return
        pushUndo(s)

        // Deep-clone clipboard and assign new IDs
        const clone = JSON.parse(JSON.stringify(s.clipboard)) as TreeNode
        const newId = getNextId(s.doc)
        reassignSubtreeIds(clone, newId)

        if (targetNodeId === null || targetNodeId === 0) {
          // Paste at root level
          s.doc.TreeRoot.Childs.push(clone)
        } else {
          // Paste after target as a sibling
          const parentId = findParentId(s.doc, targetNodeId)
          if (parentId != null) {
            // Non-root parent
            const parentN = findNodeById(s.doc, parentId)
            if (parentN && 'Childs' in parentN && Array.isArray(parentN.Childs)) {
              const idx = parentN.Childs!.findIndex(c => c.Id === targetNodeId)
              if (idx >= 0) {
                parentN.Childs!.splice(idx + 1, 0, clone)
              } else {
                parentN.Childs!.push(clone)
              }
            }
          } else {
            // parentId is null/undefined — target is a direct child of root
            const idx = s.doc.TreeRoot.Childs.findIndex(c => c.Id === targetNodeId)
            if (idx >= 0) {
              s.doc.TreeRoot.Childs.splice(idx + 1, 0, clone)
            } else {
              s.doc.TreeRoot.Childs.push(clone)
            }
          }
        }

        s.selectedNodeId = newId
        s.isDirty = true
      })
    },

    undo: () => {
      const state = get()
      if (state.undoStack.length === 0) return
      set((s) => {
        const entry = s.undoStack.pop()!
        s.redoStack.push({
          doc: JSON.parse(JSON.stringify(s.doc)),
          selectedNodeId: s.selectedNodeId
        })
        s.doc = entry.doc
        s.selectedNodeId = entry.selectedNodeId
        s.isDirty = true
      })
    },

    redo: () => {
      const state = get()
      if (state.redoStack.length === 0) return
      set((s) => {
        const entry = s.redoStack.pop()!
        s.undoStack.push({
          doc: JSON.parse(JSON.stringify(s.doc)),
          selectedNodeId: s.selectedNodeId
        })
        s.doc = entry.doc
        s.selectedNodeId = entry.selectedNodeId
        s.isDirty = true
      })
    },

    getNodeById: (id) => {
      const { doc } = get()
      if (!doc) return null
      return findNodeById(doc, id)
    },

    getParentId: (id) => {
      const { doc } = get()
      if (!doc) return null
      return findParentId(doc, id)
    }
  }))
)
