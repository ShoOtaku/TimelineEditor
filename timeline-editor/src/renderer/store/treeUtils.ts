import type {
  TreeActionNode,
  TreeCompositeNode,
  TreeConditionNode,
  TreeDelayNode,
  TreeNode,
  TreeScriptNode,
  TriggerLineDocument
} from '@shared/types'

export function findParentId(doc: TriggerLineDocument, targetId: number): number | null {
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

export function findNodeById(doc: TriggerLineDocument, id: number): TreeNode | null {
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

/** True when `candidateId` is `node` itself or anywhere inside its subtree. */
export function isDescendant(node: TreeNode, candidateId: number): boolean {
  if (node.Id === candidateId) return true
  if ('Childs' in node && Array.isArray(node.Childs)) {
    for (const child of node.Childs) {
      if (isDescendant(child, candidateId)) return true
    }
  }
  return false
}

export function getNextId(doc: TriggerLineDocument): number {
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

export function reassignSubtreeIds(node: TreeNode, firstId: number): void {
  let nextId = firstId

  function walk(current: TreeNode): void {
    current.Id = nextId
    nextId += 1
    if ('Childs' in current && Array.isArray(current.Childs)) {
      for (const child of current.Childs) walk(child)
    }
  }

  walk(node)
}

export function createDefaultNode(type: string, id: number): TreeNode {
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

export function addNodeToParent(
  doc: TriggerLineDocument,
  parentId: number,
  newNode: TreeNode,
  index?: number
): boolean {
  const root = doc.TreeRoot as unknown as TreeNode
  if ((root as any).Id === parentId) {
    if (!doc.TreeRoot.Childs) doc.TreeRoot.Childs = []
    const children = doc.TreeRoot.Childs
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
        const children = node.Childs
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

export function deleteNodeFromDoc(doc: TriggerLineDocument, nodeId: number): boolean {
  if ((doc.TreeRoot as any).Id === nodeId) return false

  function search(node: TreeNode): boolean {
    if ('Childs' in node && Array.isArray(node.Childs)) {
      const index = node.Childs.findIndex(child => child.Id === nodeId)
      if (index >= 0) {
        node.Childs.splice(index, 1)
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
