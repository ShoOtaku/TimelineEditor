import { useState } from 'react'
import type { PtlNode, PtlCondition, PtlAction } from '@shared/prTypes'
import {
  PR_NODE_TYPES, PR_NODE_TEMPLATE_LABELS, PR_NODE_TYPE_LABELS, PR_NODE_TYPE_ICONS,
  PR_COND_NODE_MODES, PR_COND_NODE_MODE_LABELS
} from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { createCondition, createAction, findNodeParent } from './prModel'
import { PrField, PrCheckbox, PrNumberInput } from './prFields'
import { PrConditionEditor } from './PrConditionEditor'
import { PrActionEditor } from './PrActionEditor'

/** Persistent toolbar so node editing never depends on hovering a tree row */
function NodeToolbar({ entryGuid, node, isRoot, canUp, canDown }: {
  entryGuid: string; node: PtlNode; isRoot: boolean; canUp: boolean; canDown: boolean
}) {
  const addEntryNode = usePrStore(s => s.addEntryNode)
  const addSiblingNode = usePrStore(s => s.addSiblingNode)
  const moveEntryNode = usePrStore(s => s.moveEntryNode)
  const duplicateEntryNode = usePrStore(s => s.duplicateEntryNode)
  const deleteEntryNode = usePrStore(s => s.deleteEntryNode)
  const [picker, setPicker] = useState<'child' | 'sibling' | null>(null)

  const composite = node.Type === 'serial' || node.Type === 'parallel' || node.Type === 'branch'

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {composite && (
          <button
            onClick={() => setPicker(p => p === 'child' ? null : 'child')}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${
              picker === 'child' ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
          >
            ＋ 子节点
          </button>
        )}
        {!isRoot && (
          <button
            onClick={() => setPicker(p => p === 'sibling' ? null : 'sibling')}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${
              picker === 'sibling' ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
          >
            ＋ 同级
          </button>
        )}
        {!isRoot && (
          <>
            <button onClick={() => moveEntryNode(entryGuid, node.Id, -1)} disabled={!canUp}
              className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded disabled:opacity-30" title="上移">↑</button>
            <button onClick={() => moveEntryNode(entryGuid, node.Id, 1)} disabled={!canDown}
              className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded disabled:opacity-30" title="下移">↓</button>
            <button onClick={() => duplicateEntryNode(entryGuid, node.Id)}
              className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded" title="复制">⧉ 复制</button>
            <button onClick={() => deleteEntryNode(entryGuid, node.Id)}
              className="px-2 py-1 text-[11px] bg-red-900/50 hover:bg-red-800 text-red-300 rounded" title="删除">🗑 删除</button>
          </>
        )}
      </div>

      {picker && (
        <div className="grid grid-cols-2 gap-1 p-1.5 bg-gray-900/60 border border-gray-700 rounded">
          {PR_NODE_TYPES.map(t => (
            <button
              key={t}
              onClick={() => {
                if (picker === 'child') addEntryNode(entryGuid, node.Id, t)
                else addSiblingNode(entryGuid, node.Id, t)
                setPicker(null)
              }}
              className="px-2 py-1 text-[11px] text-left bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded flex items-center gap-1.5"
            >
              <span>{PR_NODE_TYPE_ICONS[t]}</span>
              <span className="truncate">{PR_NODE_TEMPLATE_LABELS[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Editor for a node inside an entry's EntryGroup tree */
export function PrNodeEditor({ entryGuid, node }: { entryGuid: string; node: PtlNode }) {
  const updateEntryNode = usePrStore(s => s.updateEntryNode)
  const doc = usePrStore(s => s.doc)
  const update = (changes: Partial<PtlNode>) => updateEntryNode(entryGuid, node.Id, changes)

  const entry = doc?.Entries.find(e => e.Guid === entryGuid)
  const isRoot = entry?.EntryGroup.Id === node.Id
  const parent = entry && !isRoot ? findNodeParent(entry.EntryGroup, node.Id) : null
  const siblings = parent?.Children ?? []
  const idx = siblings.findIndex(c => c.Id === node.Id)

  // NodeDto supports both singular and array shapes; keep whichever the file uses
  const conditions: PtlCondition[] = node.Conditions ?? (node.Condition ? [node.Condition] : [])
  const writeConditions = (next: PtlCondition[]) => {
    if (node.Conditions == null && node.Condition != null && next.length <= 1) {
      update({ Condition: next[0] ?? null })
    } else {
      update({ Conditions: next.length ? next : null, ...(node.Condition != null ? { Condition: null } : {}) })
    }
  }

  const actions: PtlAction[] = node.Actions ?? (node.Action ? [node.Action] : [])
  const writeActions = (next: PtlAction[]) => {
    if (node.Actions == null && node.Action != null && next.length <= 1) {
      update({ Action: next[0] ?? null })
    } else {
      update({ Actions: next.length ? next : null, ...(node.Action != null ? { Action: null } : {}) })
    }
  }

  const moveInList = <T,>(list: T[], from: number, dir: -1 | 1): T[] => {
    const to = from + dir
    if (to < 0 || to >= list.length) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

  const isCondHolder = node.Type === 'condition' || node.Type === 'branch'

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
        <span>{PR_NODE_TYPE_ICONS[node.Type]}</span>
        <span>{PR_NODE_TYPE_LABELS[node.Type] ?? node.Type} 节点</span>
        <span className="text-gray-600">· ID {node.Id}</span>
        {isRoot && <span className="text-emerald-500/80">· 行为组根节点</span>}
      </div>

      <NodeToolbar
        entryGuid={entryGuid} node={node} isRoot={!!isRoot}
        canUp={idx > 0} canDown={idx >= 0 && idx < siblings.length - 1}
      />

      <div className="border-t border-gray-700 pt-3 space-y-3">
        <PrField label="节点名称">
          <input type="text" value={node.Name ?? ''} onChange={e => update({ Name: e.target.value })} className="field-input" />
        </PrField>

        <PrCheckbox label="启用" checked={node.Enabled} onChange={v => update({ Enabled: v })} />

        <PrField label="备注">
          <input type="text" value={node.Remark ?? ''} onChange={e => update({ Remark: e.target.value || null })}
            className="field-input" placeholder="可选备注..." />
        </PrField>

        {node.Type === 'delay' && (
          <PrField label="延迟 (毫秒)" hint={`= ${((node.DelayMs ?? 0) / 1000).toFixed(2)} 秒，基于现实时间`}>
            <PrNumberInput integer value={node.DelayMs ?? null} onChange={v => update({ DelayMs: v ?? 0 })} />
          </PrField>
        )}

        {node.Type === 'csharprunningaction' && (
          <>
            <PrField label="持续时间 (秒)" hint="0 = 由脚本自行结束">
              <PrNumberInput value={node.Duration ?? null} onChange={v => update({ Duration: v })} />
            </PrField>
            <PrField label="C# 脚本">
              <textarea
                value={node.Script ?? ''}
                onChange={e => update({ Script: e.target.value })}
                className="field-input font-mono !text-[11px]" rows={8} spellCheck={false}
              />
            </PrField>
          </>
        )}

        {node.Type === 'condition' && (
          <div className="grid grid-cols-2 gap-2">
            <PrField label="检测模式">
              <select
                value={(node.Mode ?? 'wait').toLowerCase()}
                onChange={e => update({ Mode: e.target.value })}
                className="field-input"
              >
                {PR_COND_NODE_MODES.map(m => (
                  <option key={m} value={m}>{PR_COND_NODE_MODE_LABELS[m]}</option>
                ))}
              </select>
            </PrField>
            <PrField label="多条件逻辑">
              <select
                value={node.UseAndLogic === false ? 'or' : 'and'}
                onChange={e => update({ UseAndLogic: e.target.value === 'and' })}
                className="field-input"
              >
                <option value="and">全部满足 (AND)</option>
                <option value="or">任一满足 (OR)</option>
              </select>
            </PrField>
          </div>
        )}

        {node.Type === 'branch' && (
          <>
            <div className="text-[10px] text-amber-400/80 bg-amber-950/20 border border-amber-900/40 rounded p-1.5">
              首帧立即求值条件（快照）：为真执行子节点[0]，为假执行子节点[1]
            </div>
            <PrField label="多条件逻辑">
              <select
                value={node.UseAndLogic === false ? 'or' : 'and'}
                onChange={e => update({ UseAndLogic: e.target.value === 'and' })}
                className="field-input"
              >
                <option value="and">全部满足 (AND)</option>
                <option value="or">任一满足 (OR)</option>
              </select>
            </PrField>
          </>
        )}

        {isCondHolder && (
          <div className="pt-2 border-t border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-amber-400">
                条件列表 ({conditions.length})
              </div>
              <button
                onClick={() => writeConditions([...conditions, createCondition()])}
                className="px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
              >
                ＋ 添加条件
              </button>
            </div>
            {conditions.length === 0 && (
              <div className="text-[10px] text-gray-600 italic">
                {node.Type === 'branch' ? '无条件时分支快照恒为真' : '无条件时该节点将永久挂起'}
              </div>
            )}
            {conditions.map((c, i) => (
              <PrConditionEditor
                key={i}
                condition={c}
                index={i}
                onChange={updated => writeConditions(conditions.map((x, xi) => (xi === i ? updated : x)))}
                onDelete={() => writeConditions(conditions.filter((_, xi) => xi !== i))}
                onMove={dir => writeConditions(moveInList(conditions, i, dir))}
              />
            ))}
          </div>
        )}

        {node.Type === 'action' && (
          <div className="pt-2 border-t border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-emerald-400">动作列表 ({actions.length})</div>
              <button
                onClick={() => writeActions([...actions, createAction()])}
                className="px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
              >
                ＋ 添加动作
              </button>
            </div>
            {actions.length === 0 && (
              <div className="text-[10px] text-gray-600 italic">无动作时该节点直接跳过</div>
            )}
            {actions.map((a, i) => (
              <PrActionEditor
                key={i}
                action={a}
                index={i}
                onChange={updated => writeActions(actions.map((x, xi) => (xi === i ? updated : x)))}
                onDelete={() => writeActions(actions.filter((_, xi) => xi !== i))}
                onMove={dir => writeActions(moveInList(actions, i, dir))}
              />
            ))}
          </div>
        )}

        {(node.Type === 'serial' || node.Type === 'parallel') && (
          <div className="text-[10px] text-gray-500">
            {node.Type === 'serial'
              ? '串行节点：按顺序执行所有子节点'
              : '并行节点：同时执行所有子节点，全部完成后结束'}
            （当前 {node.Children?.length ?? 0} 个）
          </div>
        )}
      </div>
    </div>
  )
}
