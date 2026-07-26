import type { PtlNode, PtlCondition, PtlAction } from '@shared/prTypes'
import { PR_NODE_TYPE_LABELS, PR_NODE_TYPE_ICONS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { createCondition, createAction } from './prModel'
import { PrField, PrCheckbox } from './prFields'
import { PrConditionEditor } from './PrConditionEditor'
import { PrActionEditor } from './PrActionEditor'

/** Editor for a node inside an entry's EntryGroup tree */
export function PrNodeEditor({ entryGuid, node }: { entryGuid: string; node: PtlNode }) {
  const updateEntryNode = usePrStore(s => s.updateEntryNode)
  const update = (changes: Partial<PtlNode>) => updateEntryNode(entryGuid, node.Id, changes)

  // Normalize single/array representations (NodeDto supports both)
  const conditions: PtlCondition[] = node.Conditions ?? (node.Condition ? [node.Condition] : [])
  const writeConditions = (next: PtlCondition[]) => {
    if (node.Conditions == null && node.Condition != null && next.length <= 1) {
      update({ Condition: next[0] ?? null })
    } else {
      update({
        Conditions: next.length ? next : null,
        ...(node.Condition != null ? { Condition: null } : {})
      })
    }
  }

  const actions: PtlAction[] = node.Actions ?? (node.Action ? [node.Action] : [])
  const writeActions = (next: PtlAction[]) => {
    if (node.Actions == null && node.Action != null && next.length <= 1) {
      update({ Action: next[0] ?? null })
    } else {
      update({
        Actions: next.length ? next : null,
        ...(node.Action != null ? { Action: null } : {})
      })
    }
  }

  const isCondType = node.Type === 'condition' || node.Type === 'branch'

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-gray-500">
        {PR_NODE_TYPE_ICONS[node.Type]} {PR_NODE_TYPE_LABELS[node.Type] ?? node.Type} · ID {node.Id}
      </div>

      <PrField label="节点名称">
        <input type="text" value={node.Name ?? ''} onChange={e => update({ Name: e.target.value })} className="field-input" />
      </PrField>

      <PrCheckbox label="启用" checked={node.Enabled} onChange={v => update({ Enabled: v })} />

      <PrField label="备注">
        <input type="text" value={node.Remark ?? ''} onChange={e => update({ Remark: e.target.value || null })}
          className="field-input" placeholder="可选备注..." />
      </PrField>

      {node.Type === 'delay' && (
        <PrField label="延迟 (毫秒)">
          <input
            type="number" step={100} min={0} value={node.DelayMs ?? 0}
            onChange={e => update({ DelayMs: parseFloat(e.target.value) || 0 })}
            className="field-input"
          />
        </PrField>
      )}

      {node.Type === 'condition' && (
        <div className="grid grid-cols-2 gap-2">
          <PrField label="模式">
            <select
              value={node.Mode ?? ''}
              onChange={e => update({ Mode: e.target.value || null })}
              className="field-input"
            >
              <option value="">检查一次</option>
              <option value="wait">等待满足 (wait)</option>
            </select>
          </PrField>
          <PrField label="多条件逻辑">
            <select
              value={node.UseAndLogic == null ? '' : node.UseAndLogic ? 'and' : 'or'}
              onChange={e => update({ UseAndLogic: e.target.value === '' ? null : e.target.value === 'and' })}
              className="field-input"
            >
              <option value="">默认</option>
              <option value="and">全部满足 (AND)</option>
              <option value="or">任一满足 (OR)</option>
            </select>
          </PrField>
        </div>
      )}

      {isCondType && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-amber-400">条件 ({conditions.length})</div>
            <button
              onClick={() => writeConditions([...conditions, createCondition()])}
              className="text-[11px] text-gray-400 hover:text-emerald-300"
            >
              ＋ 添加条件
            </button>
          </div>
          {conditions.map((c, i) => (
            <PrConditionEditor
              key={i}
              condition={c}
              index={i}
              onChange={updated => writeConditions(conditions.map((x, xi) => (xi === i ? updated : x)))}
              onDelete={() => writeConditions(conditions.filter((_, xi) => xi !== i))}
            />
          ))}
        </div>
      )}

      {node.Type === 'action' && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-emerald-400">动作 ({actions.length})</div>
            <button
              onClick={() => writeActions([...actions, createAction()])}
              className="text-[11px] text-gray-400 hover:text-emerald-300"
            >
              ＋ 添加动作
            </button>
          </div>
          {actions.map((a, i) => (
            <PrActionEditor
              key={i}
              action={a}
              index={i}
              onChange={updated => writeActions(actions.map((x, xi) => (xi === i ? updated : x)))}
              onDelete={() => writeActions(actions.filter((_, xi) => xi !== i))}
            />
          ))}
        </div>
      )}

      {(node.Type === 'serial' || node.Type === 'parallel' || node.Type === 'branch') && (
        <div className="text-[10px] text-gray-600 pt-1 border-t border-gray-700">
          包含 {node.Children?.length ?? 0} 个子节点，在中间时间轴的节点树中通过 ＋ 添加
        </div>
      )}
    </div>
  )
}
