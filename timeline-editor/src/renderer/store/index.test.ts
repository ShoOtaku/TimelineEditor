import { beforeEach, describe, expect, it } from 'vitest'
import type { TreeNode, TriggerLineDocument } from '@shared/types'
import { useStore } from './index'

const sequenceType = 'AEAssist.CombatRoutine.Trigger.Node.TreeSequence, AEAssist'
const actionType = 'AEAssist.CombatRoutine.Trigger.Node.TreeActionNode, AEAssist'
const delayType = 'AEAssist.CombatRoutine.Trigger.Node.TreeDelayNode, AEAssist'
const color = { X: 1, Y: 1, Z: 1, W: 1 }

function baseNode(id: number, type: string, displayName: string) {
  return {
    Id: id,
    $type: type,
    DisplayName: displayName,
    Enable: true,
    Important: false,
    Color: color,
    Remark: '',
    Tag: ''
  }
}

function createDocument(): TriggerLineDocument {
  return {
    ConfigVersion: 6,
    TreeRoot: {
      Id: 0,
      DisplayName: 'Root',
      Childs: [
        {
          ...baseNode(1, sequenceType, 'Sequence'),
          IgnoreNodeResult: false,
          StopWhenDead: false,
          Childs: [
            {
              ...baseNode(2, actionType, 'Action'),
              TriggerActions: []
            },
            {
              ...baseNode(3, sequenceType, 'Nested sequence'),
              IgnoreNodeResult: false,
              StopWhenDead: false,
              Childs: [
                {
                  ...baseNode(4, delayType, 'Delay'),
                  Delay: 1
                }
              ]
            }
          ]
        }
      ]
    }
  } as TriggerLineDocument
}

function collectIds(node: TreeNode): number[] {
  const ids = [node.Id]
  if ('Childs' in node && Array.isArray(node.Childs)) {
    for (const child of node.Childs) ids.push(...collectIds(child))
  }
  return ids
}

beforeEach(() => {
  useStore.setState({
    doc: createDocument(),
    clipboard: null,
    selectedNodeId: null,
    selectedScriptNodeId: null,
    undoStack: [],
    redoStack: [],
    isDirty: false
  })
})

describe('AE tree copy operations', () => {
  it('assigns unique IDs to every pasted descendant so leaves remain editable', () => {
    const store = useStore.getState()
    store.copyNode(1)
    useStore.getState().pasteNode(1)

    const pasted = useStore.getState().doc!.TreeRoot.Childs[1]
    const ids = collectIds(pasted)
    expect(ids).toEqual([5, 6, 7, 8])
    expect(new Set(ids).size).toBe(ids.length)

    useStore.getState().selectNode(6)
    useStore.getState().updateNode(6, { Remark: 'edited leaf' })

    expect(useStore.getState().selectedNodeId).toBe(6)
    expect(useStore.getState().getNodeById(6)?.DisplayName).toBe('Action')
    expect(useStore.getState().getNodeById(6)?.Remark).toBe('edited leaf')
    expect(useStore.getState().getNodeById(5)?.Remark).toBe('')
  })

  it('assigns unique IDs when duplicating a composite node', () => {
    useStore.getState().duplicateNode(1)

    const duplicate = useStore.getState().doc!.TreeRoot.Childs[1]
    expect(collectIds(duplicate)).toEqual([5, 6, 7, 8])
  })
})
