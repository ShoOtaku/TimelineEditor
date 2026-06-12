import { useCallback, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { TreeNode, AcrTypeDef } from '@shared/types'
import { isComposite, getDisplayType } from '@shared/types'
import { ConditionEditor } from './ConditionEditor'
import { ActionEditor } from './ActionEditor'

export function PropertyPanel() {
  const doc = useStore(s => s.doc)
  const selectedNodeId = useStore(s => s.selectedNodeId)
  const updateNode = useStore(s => s.updateNode)
  const deleteNode = useStore(s => s.deleteNode)
  const toggleNodeEnabled = useStore(s => s.toggleNodeEnabled)
  const getNodeById = useStore(s => s.getNodeById)
  const selectScriptNode = useStore(s => s.selectScriptNode)
  const acrConditionTypes = useStore(s => s.acrConditionTypes)
  const acrActionTypes = useStore(s => s.acrActionTypes)
  const acrDllNames = useStore(s => s.acrDllNames)

  const node: TreeNode | null = selectedNodeId !== null ? getNodeById(selectedNodeId) : null

  const [newCondType, setNewCondType] = useState('TriggerCondEnemyCastSpell')
  const [newActionType, setNewActionType] = useState('TriggerActionCastSpell')

  // Merge built-in + ACR types with optgroups
  const condTypeOptions = useMemo(() => {
    const builtin = BUILTIN_COND_TYPES.map(c => ({ value: c.value, label: c.label, group: '内置' }))
    const acr = acrConditionTypes.map(c => ({ value: c.$type, label: c.displayName || c.$type, group: c.assemblyName }))
    return { builtin, acr, all: [...builtin, ...acr] }
  }, [acrConditionTypes])

  const actionTypeOptions = useMemo(() => {
    const builtin = BUILTIN_ACTION_TYPES.map(a => ({ value: a.value, label: a.label, group: '内置' }))
    const acr = acrActionTypes.map(a => ({ value: a.$type, label: a.displayName || a.$type, group: a.assemblyName }))
    return { builtin, acr, all: [...builtin, ...acr] }
  }, [acrActionTypes])

  // Build optgroups from options grouped by assembly
  const condOptgroups = useMemo(() => {
    const groups = new Map<string, typeof condTypeOptions.all>()
    for (const opt of condTypeOptions.all) {
      const g = groups.get(opt.group) || []
      g.push(opt)
      groups.set(opt.group, g)
    }
    return groups
  }, [condTypeOptions])

  const actionOptgroups = useMemo(() => {
    const groups = new Map<string, typeof actionTypeOptions.all>()
    for (const opt of actionTypeOptions.all) {
      const g = groups.get(opt.group) || []
      g.push(opt)
      groups.set(opt.group, g)
    }
    return groups
  }, [actionTypeOptions])

  const handleFieldChange = useCallback((field: string, value: any) => {
    if (selectedNodeId === null) return
    updateNode(selectedNodeId, { [field]: value })
  }, [selectedNodeId, updateNode])

  if (!node) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center">
        <div>
          <div className="text-4xl mb-2">📋</div>
          <div>选择节点以编辑属性</div>
          <div className="text-xs mt-1 text-gray-600">点击左侧树中的任意节点</div>
        </div>
      </div>
    )
  }

  const kind = getDisplayType(node)
  const isCond = node.$type.includes('TreeCondNode')
  const isAction = node.$type.includes('TreeActionNode')
  const isScript = node.$type.includes('TreeScriptNode')

  return (
    <div className="h-full flex flex-col bg-gray-800 overflow-hidden">
      {/* 头部 */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-sm font-semibold text-gray-200">{node.DisplayName || kind}</div>
          <div className="text-[10px] text-gray-500">{kind} · ID: {node.Id}</div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => toggleNodeEnabled(selectedNodeId!)}
            className={`px-2 py-1 text-[11px] rounded ${node.Enable ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'}`}
          >
            {node.Enable ? '已启用' : '已禁用'}
          </button>
          {selectedNodeId !== 0 && (
            <button
              onClick={() => deleteNode(selectedNodeId!)}
              className="px-2 py-1 text-[11px] bg-red-900/50 hover:bg-red-800 text-red-300 rounded"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {/* 属性区域 */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* 通用字段 */}
        <FieldRow label="显示名称">
          <input
            type="text"
            value={node.DisplayName || ''}
            onChange={e => handleFieldChange('DisplayName', e.target.value)}
            className="field-input"
          />
        </FieldRow>

        <FieldRow label="备注">
          <input
            type="text"
            value={node.Remark || ''}
            onChange={e => handleFieldChange('Remark', e.target.value)}
            className="field-input"
            placeholder="可选备注..."
          />
        </FieldRow>

        <FieldRow label="标签">
          <input
            type="text"
            value={node.Tag || ''}
            onChange={e => handleFieldChange('Tag', e.target.value)}
            className="field-input"
          />
        </FieldRow>

        <FieldRow label="重要">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={node.Important || false}
              onChange={e => handleFieldChange('Important', e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            <span className="text-sm text-gray-300">标记为重要节点</span>
          </label>
        </FieldRow>

        <FieldRow label="颜色">
          <div className="flex gap-1">
            {(['X', 'Y', 'Z'] as const).map(c => (
              <div key={c} className="flex-1">
                <div className="text-[9px] text-gray-500 mb-0.5">{c === 'X' ? '红' : c === 'Y' ? '绿' : '蓝'}</div>
                <input
                  type="number"
                  min={0} max={1} step={0.1}
                  value={node.Color?.[c] ?? 1}
                  onChange={e => {
                    const newColor = { ...(node.Color || { X: 1, Y: 1, Z: 1, W: 1 }), [c]: parseFloat(e.target.value) || 0 }
                    handleFieldChange('Color', newColor)
                  }}
                  className="field-input"
                />
              </div>
            ))}
            <div
              className="w-6 h-6 rounded ml-1 self-end border border-gray-600"
              style={{
                backgroundColor: `rgb(${Math.round((node.Color?.X ?? 1) * 255)}, ${Math.round((node.Color?.Y ?? 1) * 255)}, ${Math.round((node.Color?.Z ?? 1) * 255)})`
              }}
            />
          </div>
        </FieldRow>

        <hr className="border-gray-700" />

        {/* === 类型专属字段 === */}

        {/* 延迟节点 */}
        {node.$type.includes('TreeDelayNode') && (
          <FieldRow label="延迟（秒）">
            <input
              type="number" min={0} step={0.01}
              value={(node as any).Delay ?? 1}
              onChange={e => handleFieldChange('Delay', parseFloat(e.target.value) || 0)}
              className="field-input"
            />
          </FieldRow>
        )}

        {/* 序列 */}
        {node.$type.includes('TreeSequence') && (
          <>
            <FieldRow label="忽略子节点结果">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(node as any).IgnoreNodeResult || false}
                  onChange={e => handleFieldChange('IgnoreNodeResult', e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-sm text-gray-300">无论成败都继续执行后续子节点</span>
              </label>
            </FieldRow>
            <FieldRow label="死亡时停止">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(node as any).StopWhenDead || false}
                  onChange={e => handleFieldChange('StopWhenDead', e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-sm text-gray-300">玩家死亡时停止执行</span>
              </label>
            </FieldRow>
          </>
        )}

        {/* 并行 */}
        {node.$type.includes('TreeParallel') && (
          <>
            <FieldRow label="任一返回">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(node as any).AnyReturn || false}
                  onChange={e => handleFieldChange('AnyReturn', e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-sm text-gray-300">任意子节点完成即返回</span>
              </label>
            </FieldRow>
            <FieldRow label="死亡时停止">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(node as any).StopWhenDead || false}
                  onChange={e => handleFieldChange('StopWhenDead', e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-sm text-gray-300">玩家死亡时停止执行</span>
              </label>
            </FieldRow>
          </>
        )}

        {/* 循环 */}
        {node.$type.includes('TreeLoop') && (
          <FieldRow label="循环次数">
            <input type="number" min={1} step={1} value={(node as any).LoopCount ?? 1}
              onChange={e => handleFieldChange('LoopCount', parseInt(e.target.value) || 1)}
              className="field-input" />
          </FieldRow>
        )}

        {/* === 条件节点 === */}
        {isCond && (
          <>
            <FieldRow label="逻辑类型">
              <select value={(node as any).CondLogicType ?? 0}
                onChange={e => handleFieldChange('CondLogicType', parseInt(e.target.value))}
                className="field-input">
                <option value={0}>与（AND）— 所有条件必须满足</option>
                <option value={1}>或（OR）— 任一条件满足即可</option>
              </select>
            </FieldRow>
            <div className="flex gap-3">
              <FieldRow label="仅检测一次">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={(node as any).CheckOnce || false}
                    onChange={e => handleFieldChange('CheckOnce', e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600" />
                  <span className="text-[11px] text-gray-400">仅一次</span>
                </label>
              </FieldRow>
              <FieldRow label="取反">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={(node as any).ReverseResult || false}
                    onChange={e => handleFieldChange('ReverseResult', e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600" />
                  <span className="text-[11px] text-gray-400">反转结果</span>
                </label>
              </FieldRow>
            </div>

            <hr className="border-gray-700" />

            {/* 条件列表 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-300 uppercase">
                  条件列表（{(node as any).TriggerConds?.length || 0}）
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={newCondType}
                    onChange={e => setNewCondType(e.target.value)}
                    className="field-input !w-auto !text-[10px] !py-0.5"
                  >
                    {Array.from(condOptgroups.entries()).map(([group, opts]) => (
                      <optgroup key={group} label={group === '内置' ? '内置条件' : `ACR — ${group}`}>
                        {opts.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const newCond = createDefaultCondition(newCondType, acrConditionTypes)
                      const conds = [...((node as any).TriggerConds || []), newCond]
                      handleFieldChange('TriggerConds', conds)
                    }}
                    className="text-[10px] bg-blue-700 hover:bg-blue-600 text-white px-2 py-0.5 rounded flex-shrink-0"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              {(node as any).TriggerConds?.map((cond: any, idx: number) => (
                <ConditionEditor
                  key={idx}
                  condition={cond}
                  onChange={(changes) => {
                    const conds = [...(node as any).TriggerConds]
                    conds[idx] = { ...conds[idx], ...changes }
                    handleFieldChange('TriggerConds', conds)
                  }}
                  onDelete={() => {
                    const conds = (node as any).TriggerConds.filter((_: any, i: number) => i !== idx)
                    handleFieldChange('TriggerConds', conds)
                  }}
                />
              ))}

              {(node as any).TriggerConds?.length === 0 && (
                <div className="text-xs text-gray-500 italic text-center py-2">
                  暂无条件。请选择类型后点击"+ 添加"。
                </div>
              )}
            </div>
          </>
        )}

        {/* === 动作节点 === */}
        {isAction && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-300 uppercase">
                动作列表（{(node as any).TriggerActions?.length || 0}）
              </span>
              <div className="flex items-center gap-1">
                <select
                  value={newActionType}
                  onChange={e => setNewActionType(e.target.value)}
                  className="field-input !w-auto !text-[10px] !py-0.5"
                >
                  {Array.from(actionOptgroups.entries()).map(([group, opts]) => (
                    <optgroup key={group} label={group === '内置' ? '内置动作' : `ACR — ${group}`}>
                      {opts.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const newAction = createDefaultAction(newActionType, acrActionTypes)
                    const actions = [...((node as any).TriggerActions || []), newAction]
                    handleFieldChange('TriggerActions', actions)
                  }}
                  className="text-[10px] bg-blue-700 hover:bg-blue-600 text-white px-2 py-0.5 rounded flex-shrink-0"
                >
                  + 添加
                </button>
              </div>
            </div>

            {(node as any).TriggerActions?.map((action: any, idx: number) => (
              <ActionEditor
                key={idx}
                action={action}
                onChange={(changes) => {
                  const actions = [...(node as any).TriggerActions]
                  actions[idx] = { ...actions[idx], ...changes }
                  handleFieldChange('TriggerActions', actions)
                }}
                onDelete={() => {
                  const actions = (node as any).TriggerActions.filter((_: any, i: number) => i !== idx)
                  handleFieldChange('TriggerActions', actions)
                }}
              />
            ))}

            {(node as any).TriggerActions?.length === 0 && (
              <div className="text-xs text-gray-500 italic text-center py-2">
                暂无动作。请选择类型后点击"+ 添加"。
              </div>
            )}
          </div>
        )}

        {/* 脚本节点 */}
        {isScript && (
          <>
            <FieldRow label="仅检测">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={(node as any).OnlyCheck || false}
                  onChange={e => handleFieldChange('OnlyCheck', e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600" />
                <span className="text-sm text-gray-300">仅检测状态（无副作用）</span>
              </label>
            </FieldRow>
            <button
              onClick={() => {
                selectScriptNode(node.Id)
                document.dispatchEvent(new CustomEvent('editor:toggleScript'))
              }}
              className="w-full px-3 py-2 text-sm bg-purple-800/60 hover:bg-purple-700 text-purple-300 rounded transition-colors"
            >
              {'</>'} 在脚本编辑器中打开
            </button>
          </>
        )}

        {/* 子节点数 */}
        {isComposite(node) && (
          <FieldRow label="子节点">
            <div className="text-sm text-gray-400">
              {(node as any).Childs?.length || 0} 个子节点
            </div>
          </FieldRow>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 条件类型选项 & 工厂函数
// ============================================================

const BUILTIN_COND_TYPES = [
  { value: 'TriggerCondEnemyCastSpell', label: '敌人读条使用技能' },
  { value: 'TriggerCondCheckSpellCd', label: '检测技能CD' },
  { value: 'TriggerCondReceviceAbilityEffect', label: '等待技能效果' },
  { value: 'TriggerCondReceviceNoTargetAbilityEffect', label: '无目标技能效果' },
  { value: 'TriggerCondCheckLastSpell', label: '检测自身技能使用' },
  { value: 'TriggerCondAfterSpell', label: '等待技能释放' },
  { value: 'TriggerCondVariable', label: '变量检测' },
  { value: 'TriggerCondOnWeatherIdChanged', label: '天气变化' },
  { value: 'TriggerCondAfterBattleStart', label: '战斗计时器' },
  { value: 'TriggerCondCheckPartyRole', label: '自身职能检测' },
  { value: 'TriggerCondGameLog', label: '聊天监控' },
  { value: 'TriggerCondAfterUnitIsTargetable', label: '等待目标可选中' },
  { value: 'TriggerCondAfterUnitRemove', label: '等待目标消失' },
  { value: 'TriggerCondActorControlTargetIcon', label: '技能点名图标' },
  { value: 'TriggerCondCheckRecentlyTether', label: '最近连线检测' },
  { value: 'TriggerCondMapEffect', label: '地图效果' },
  { value: 'TriggerCondBeforeBattleTime', label: '战斗时间之前' },
  { value: 'TriggerCondWaitTarget', label: '等待目标' },
]

function createDefaultCondition(type: string, acrTypes?: AcrTypeDef[]): any {
  const base: any = { Remark: null }
  const ns = 'AEAssist.CombatRoutine.Trigger.TriggerCond'

  // Check if this is an ACR type (full $type string)
  if (type.includes(',') && !type.startsWith('AEAssist.')) {
    const acrDef = acrTypes?.find(t => t.$type === type)
    const obj: any = { ...base, $type: type, DisplayName: acrDef?.displayName || type }
    if (acrDef) {
      for (const field of acrDef.fields) {
        if (field.enumValues && field.enumValues.length > 0) {
          obj[field.key] = field.enumValues[0].value
        } else if (field.type === 'boolean') obj[field.key] = false
        else if (field.type === 'number') obj[field.key] = 0
        else if (field.type === 'object') obj[field.key] = {}
        else obj[field.key] = ''
      }
    }
    return obj
  }

  switch (type) {
    case 'TriggerCondEnemyCastSpell':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/敌人读条使用技能', RegexNameOrId: '', NeedTargetable: false }
    case 'TriggerCondCheckSpellCd':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/检测技能CD', SpellId: 0, CoolDown: 0, Larger: false }
    case 'TriggerCondReceviceAbilityEffect':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '副本流程/等待效果触发AbilityEffect', ActionId: 0, CheckIsMe: false, LimitType: 0 }
    case 'TriggerCondReceviceNoTargetAbilityEffect':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '副本流程/无目标AbilityEffect', ActionId: 0 }
    case 'TriggerCondCheckLastSpell':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/检测自身技能使用', SpellId: 0 }
    case 'TriggerCondAfterSpell':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/等待技能释放', SpellId: 0 }
    case 'TriggerCondVariable':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/变量值', VariableName: '', CompareType: 0, VariableVaule: 0 }
    case 'TriggerCondOnWeatherIdChanged':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/天气变化', WeatherId: 0 }
    case 'TriggerCondAfterBattleStart':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/战斗开始后多少秒', Delay: 0 }
    case 'TriggerCondCheckPartyRole':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/自身职能', PartyRole: 'MT' }
    case 'TriggerCondGameLog':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/聊天监控', RegexValue: '', LimitMsgType: false, MsgType: 0 }
    case 'TriggerCondAfterUnitIsTargetable':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/等待敌对目标可选中', DataId: 0 }
    case 'TriggerCondAfterUnitRemove':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/等待目标消失', DataId: 0 }
    case 'TriggerCondActorControlTargetIcon':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '副本流程/等待技能点名TargetIcon', Args0: 0 }
    case 'TriggerCondCheckRecentlyTether':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '副本流程/检测自身最近连线', Args0: 0, CheckTime: 1 }
    case 'TriggerCondMapEffect':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/MapEffect', Pos: 0, Arg0: 0, Arg1: 0 }
    case 'TriggerCondBeforeBattleTime':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/在指定战斗时间之前', TargetTime: 0 }
    case 'TriggerCondWaitTarget':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/目标符合条件', TargetSelector: { Enable: false, Target: 0, FilterDatas: [], NeedTargetable: false, SndFilter: 0, PMIndex: 0 } }
    default:
      return { ...base, $type: type, DisplayName: type }
  }
}

// ============================================================
// 动作类型选项 & 工厂函数
// ============================================================

const BUILTIN_ACTION_TYPES = [
  { value: 'TriggerActionCastSpell', label: '强制使用技能' },
  { value: 'TriggerActionHighPrioritySlot', label: '插入高优先级技能' },
  { value: 'TriggerActionSpellQueue', label: '强制使用技能队列' },
  { value: 'TriggerAction_SendCommand', label: '发送指令' },
  { value: 'TriggerActionSelectenemy', label: '切换目标' },
  { value: 'TriggerActionUsePotion', label: '使用爆发药' },
  { value: 'TriggerActionSwitchStop', label: '切换停手' },
  { value: 'TriggerActionLockSpell', label: '锁定技能' },
  { value: 'TriggerActionAddVariable', label: '设置变量' },
  { value: 'TriggerAction_SimpleTP', label: '初级TP' },
  { value: 'TriggerAction_MoveTo', label: '移动到目标' },
]

function makeSpellConfig() {
  return {
    Remark: '', Category: 0, SpellId: 0, CoolDowncheck: false, CoolDowncheck_time: 0,
    TargetType: 0, IsPartyMember: true, LimitJobType: 0, LimitBuffIds: [],
    LimitMaxHpType: 0, LimitHpType: 0, Location: { X: 0, Y: 0, Z: 0 },
    TargetSelector: { Enable: false, Target: 0, FilterDatas: [], NeedTargetable: false, SndFilter: 0, PMIndex: 0 },
    AutoCheckActionChange: true,
  }
}

function createDefaultAction(type: string, acrTypes?: AcrTypeDef[]): any {
  const base: any = { Remark: null }
  const ns = 'AEAssist.CombatRoutine.Trigger.TriggerAction'

  // Check if this is an ACR type (full $type string)
  if (type.includes(',') && !type.startsWith('AEAssist.')) {
    const acrDef = acrTypes?.find(t => t.$type === type)
    const obj: any = { ...base, $type: type, DisplayName: acrDef?.displayName || type }
    if (acrDef) {
      for (const field of acrDef.fields) {
        if (field.key === 'qtValues' && acrDef.sampleQtKeys && acrDef.sampleQtKeys.length > 0) {
          const qtv: Record<string, boolean> = {}
          for (const k of acrDef.sampleQtKeys) qtv[k] = true
          obj[field.key] = qtv
        } else if (field.key === 'qtValues' && acrDef.allStrings && acrDef.allStrings.length > 0) {
          // Fallback: filter DLL strings for likely QT keys (CJK characters, 2-10 chars)
          const likelyKeys = acrDef.allStrings.filter(s => {
            if (s.length < 2 || s.length > 12) return false
            return /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(s) || /^[A-Z][a-zA-Z]{1,15}$/.test(s)
          })
          if (likelyKeys.length > 0) {
            const qtv: Record<string, boolean> = {}
            for (const k of likelyKeys) qtv[k] = true
            obj[field.key] = qtv
          } else {
            obj[field.key] = {}
          }
        } else if (field.key === 'QTList' && acrDef.sampleQtList && acrDef.sampleQtList.length > 0) {
          obj[field.key] = acrDef.sampleQtList.map(item => ({ Key: item.Key, Value: item.Value }))
        } else if (field.key === 'QtStates' && acrDef.sampleQtStatesKeys && acrDef.sampleQtStatesKeys.length > 0) {
          const qts: Record<string, boolean> = {}
          for (const k of acrDef.sampleQtStatesKeys) qts[k] = false
          obj[field.key] = qts
        } else if (field.enumValues && field.enumValues.length > 0) {
          obj[field.key] = field.enumValues[0].value
        } else if (field.type === 'boolean') {
          obj[field.key] = false
        } else if (field.type === 'number') {
          obj[field.key] = 0
        } else if (field.type === 'object') {
          obj[field.key] = {}
        } else {
          obj[field.key] = ''
        }
      }
    }
    return obj
  }

  switch (type) {
    case 'TriggerActionCastSpell':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '技能使用/强制使用技能', SpellConfig: makeSpellConfig() }
    case 'TriggerActionHighPrioritySlot':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '技能使用/插入高优先级技能', SpellConfig: makeSpellConfig(), Clear: false, DoubleClear: false }
    case 'TriggerActionSpellQueue':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '技能使用/强制使用技能队列', Data: [] }
    case 'TriggerAction_SendCommand':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '指令/发送指令', Command: '' }
    case 'TriggerActionSelectenemy':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/切换目标', NameorId: '', TargetSelector: { Enable: false, Target: 4, FilterDatas: [], NeedTargetable: true, SndFilter: 1, PMIndex: 0 } }
    case 'TriggerActionUsePotion':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/使用爆发药' }
    case 'TriggerActionSwitchStop':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/切换停手', Stop: true }
    case 'TriggerActionLockSpell':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '技能使用/锁定技能', IdList: [], IsLock: true }
    case 'TriggerActionAddVariable':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'General/设置变量', VariableName: '', SetVariableVaule: 0 }
    case 'TriggerAction_SimpleTP':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: 'TP/初级TP', SimplePointSelector: { SelectType: 0, FixedPoint: { X: 100, Y: 0, Z: 100 }, HeadMarker: 0, MapMarker: 0, PartyMember: 0, RelatePos: false, RelatedExDis: 1, RelatedRot: 0, Args0: 0, RecentTime: 1 } }
    case 'TriggerAction_MoveTo':
      return { ...base, $type: `${ns}.${type}, AEAssist`, DisplayName: '移动到目标', Pos: { X: 100, Y: 0, Z: 100 }, Use2: false }
    default:
      return { ...base, $type: type, DisplayName: type }
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  )
}
