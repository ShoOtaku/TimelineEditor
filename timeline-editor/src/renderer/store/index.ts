import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  TriggerLineDocument,
  TreeNode,
  TreeCompositeNode,
  TreeConditionNode,
  TreeActionNode,
  TreeScriptNode,
  TreeDelayNode,
  AcrTypeDef
} from '@shared/types'

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

function findParentId(doc: TriggerLineDocument, targetId: number): number | null {
  function search(node: TreeNode): number | null {
    if ('Childs' in node && Array.isArray(node.Childs)) {
      for (const child of node.Childs) {
        if (child.Id === targetId) return node.Id
        const found = search(child)
        if (found !== null) return found
      }
    }
    return null
  }
  if ((doc.TreeRoot as any).Id === targetId) return null
  return search(doc.TreeRoot as unknown as TreeNode)
}

function findNodeById(doc: TriggerLineDocument, id: number): TreeNode | null {
  if ((doc.TreeRoot as any).Id === id) return doc.TreeRoot as unknown as TreeNode
  function search(node: TreeNode): TreeNode | null {
    if ('Childs' in node && Array.isArray(node.Childs)) {
      for (const child of node.Childs) {
        if (child.Id === id) return child
        const found = search(child)
        if (found) return found
      }
    }
    return null
  }
  return search(doc.TreeRoot as unknown as TreeNode)
}

/** True when `candidateId` is `node` itself or anywhere inside its subtree */
function isDescendant(node: TreeNode, candidateId: number): boolean {
  if (node.Id === candidateId) return true
  if ('Childs' in node && Array.isArray(node.Childs)) {
    for (const child of node.Childs) {
      if (isDescendant(child, candidateId)) return true
    }
  }
  return false
}

function getNextId(doc: TriggerLineDocument): number {
  let maxId = 0
  function walk(node: TreeNode) {
    if (node.Id > maxId) maxId = node.Id
    if ('Childs' in node && Array.isArray(node.Childs)) {
      for (const child of node.Childs) walk(child)
    }
  }
  walk(doc.TreeRoot as unknown as TreeNode)
  return maxId + 1
}

function createDefaultNode(type: string, id: number): TreeNode {
  const baseColor = { X: 1.0, Y: 1.0, Z: 0.4, W: 1.0 }
  const base = {
    Id: id,
    Enable: true,
    Important: false,
    Color: baseColor,
    Remark: '',
    Tag: ''
  }

  switch (type) {
    case 'TreeSequence':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeSequence, AEAssist',
        DisplayName: '序列',
        IgnoreNodeResult: false,
        StopWhenDead: false,
        Childs: []
      } as TreeCompositeNode
    case 'TreeParallel':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeParallel, AEAssist',
        DisplayName: '并行',
        AnyReturn: false,
        StopWhenDead: false,
        Childs: []
      } as TreeCompositeNode
    case 'TreeSelect':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeSelect, AEAssist',
        DisplayName: '选择',
        Childs: []
      } as TreeCompositeNode
    case 'TreeLoop':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeLoop, AEAssist',
        DisplayName: '循环',
        LoopCount: 1,
        Childs: []
      } as TreeCompositeNode
    case 'TreeCondNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeCondNode, AEAssist',
        DisplayName: '等待条件',
        CondLogicType: 0,
        CheckOnce: false,
        ReverseResult: false,
        TriggerConds: []
      } as TreeConditionNode
    case 'TreeActionNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeActionNode, AEAssist',
        DisplayName: '行为',
        TriggerActions: []
      } as TreeActionNode
    case 'TreeScriptNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeScriptNode, AEAssist',
        DisplayName: '脚本节点',
        OnlyCheck: false,
        Script: ''
      } as TreeScriptNode
    case 'TreeDelayNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeDelayNode, AEAssist',
        DisplayName: '延迟[1.00]秒',
        Delay: 1.0
      } as TreeDelayNode
    case 'TreeDebugNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeDebugNode, AEAssist',
        DisplayName: '调试'
      } as TreeNode
    case 'TreeClearWaitNode':
      return {
        ...base,
        $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeClearWaitNode, AEAssist',
        DisplayName: '清除等待'
      } as TreeNode
    default:
      return {
        ...base,
        $type: type,
        DisplayName: '未知节点'
      } as TreeNode
  }
}

function addNodeToParent(
  doc: TriggerLineDocument,
  parentId: number,
  newNode: TreeNode,
  index?: number
): boolean {
  const root = doc.TreeRoot as unknown as TreeNode
  if ((root as any).Id === parentId) {
    if (!doc.TreeRoot.Childs) doc.TreeRoot.Childs = []
    const children = doc.TreeRoot.Childs!
    if (index !== undefined && index >= 0 && index <= children.length) {
      children.splice(index, 0, newNode)
    } else {
      children.push(newNode)
    }
    return true
  }

  function search(node: TreeNode): boolean {
    if ('Childs' in node && Array.isArray(node.Childs)) {
      if (node.Id === parentId) {
        const children = node.Childs!
        if (index !== undefined && index >= 0 && index <= children.length) {
          children.splice(index, 0, newNode)
        } else {
          children.push(newNode)
        }
        return true
      }
      for (const child of node.Childs) {
        if (search(child)) return true
      }
    }
    return false
  }
  return search(doc.TreeRoot as unknown as TreeNode)
}

function deleteNodeFromDoc(doc: TriggerLineDocument, nodeId: number): boolean {
  if ((doc.TreeRoot as any).Id === nodeId) return false // can't delete root

  function search(node: TreeNode): boolean {
    if ('Childs' in node && Array.isArray(node.Childs)) {
      const idx = node.Childs!.findIndex(c => c.Id === nodeId)
      if (idx >= 0) {
        node.Childs!.splice(idx, 1)
        return true
      }
      for (const child of node.Childs) {
        if (search(child)) return true
      }
    }
    return false
  }
  return search(doc.TreeRoot as unknown as TreeNode)
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
        function reId(n: TreeNode, idMap: Map<number, number>) {
          const oldId = n.Id
          n.Id = idMap.get(oldId)!
          if ('Childs' in n && Array.isArray(n.Childs)) {
            for (const child of n.Childs) {
              const cid = getNextId(s.doc!)
              idMap.set(child.Id, cid)
              reId(child, idMap)
            }
          }
        }
        const idMap = new Map<number, number>()
        idMap.set(clone.Id, newId)
        reId(clone, idMap)

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
        const idMap = new Map<number, number>()
        idMap.set(clone.Id, newId)
        function reId(n: TreeNode, idMap: Map<number, number>) {
          const oldId = n.Id
          n.Id = idMap.get(oldId)!
          if ('Childs' in n && Array.isArray(n.Childs)) {
            for (const child of n.Childs) {
              const cid = getNextId(s.doc!)
              idMap.set(child.Id, cid)
              reId(child, idMap)
            }
          }
        }
        reId(clone, idMap)

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
