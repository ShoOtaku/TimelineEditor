// ============================================================
// Triggerline Document Type Definitions
// Covers both JSON v6 (ConfigVersion: 6) and TXT v1000 (ConfigVersion: 1000)
// ============================================================

export interface Vector3 {
  X: number
  Y: number
  Z: number
}

export interface Color {
  X: number
  Y: number
  Z: number
  W: number
}

// --- Base Node ---

export interface TreeNodeBase {
  $type: string
  DisplayName: string
  Id: number
  Enable: boolean
  Important: boolean
  Color: Color
  Remark: string
  Tag: string
  /** Preserve unknown fields for round-trip safety */
  [key: string]: unknown
}

// --- Composite Nodes ---

export interface TreeSequenceNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeSequence, AEAssist'
  IgnoreNodeResult: boolean
  StopWhenDead: boolean
  Childs: TreeNode[]
}

export interface TreeParallelNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeParallel, AEAssist'
  AnyReturn: boolean
  StopWhenDead: boolean
  Childs: TreeNode[]
}

export interface TreeSelectNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeSelect, AEAssist'
  Childs: TreeNode[]
}

export interface TreeLoopNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeLoop, AEAssist'
  LoopCount: number
  Childs: TreeNode[]
}

// --- Leaf Nodes ---

export interface TriggerCondBase {
  $type: string
  DisplayName: string
  Remark?: string | null
  [key: string]: unknown
}

export interface TreeConditionNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeCondNode, AEAssist'
  CondLogicType: number // 0 = AND, 1 = OR
  CheckOnce: boolean
  ReverseResult: boolean
  TriggerConds: TriggerCondBase[]
}

export interface TriggerActionBase {
  $type: string
  DisplayName: string
  Remark?: string | null
  [key: string]: unknown
}

export interface TreeActionNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeActionNode, AEAssist'
  TriggerActions: TriggerActionBase[]
}

export interface TreeScriptNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeScriptNode, AEAssist'
  OnlyCheck: boolean
  Script: string
}

export interface TreeDelayNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeDelayNode, AEAssist'
  Delay: number
}

export interface TreeDebugNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeDebugNode, AEAssist'
}

export interface TreeClearWaitNode extends TreeNodeBase {
  $type: 'AEAssist.CombatRoutine.Trigger.Node.TreeClearWaitNode, AEAssist'
}

// --- Union Types ---

export type TreeCompositeNode =
  | TreeSequenceNode
  | TreeParallelNode
  | TreeSelectNode
  | TreeLoopNode

export type TreeLeafNode =
  | TreeConditionNode
  | TreeActionNode
  | TreeScriptNode
  | TreeDelayNode
  | TreeDebugNode
  | TreeClearWaitNode

export type TreeNode = TreeCompositeNode | TreeLeafNode | TreeNodeBase

// --- Known $type discriminator map ---

export const COMPOSITE_TYPES = [
  'AEAssist.CombatRoutine.Trigger.Node.TreeSequence, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeParallel, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeSelect, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeLoop, AEAssist'
] as const

export const LEAF_TYPES = [
  'AEAssist.CombatRoutine.Trigger.Node.TreeCondNode, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeActionNode, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeScriptNode, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeDelayNode, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeDebugNode, AEAssist',
  'AEAssist.CombatRoutine.Trigger.Node.TreeClearWaitNode, AEAssist'
] as const

export function isComposite(node: TreeNode): node is TreeCompositeNode {
  return 'Childs' in node && Array.isArray((node as any).Childs)
}

export function isLeaf(node: TreeNode): boolean {
  return !isComposite(node)
}

export function getNodeKind(type: string): string {
  const short = type.split(',')[0].split('.').pop() || type
  return short.replace('Tree', '')
}

export function getDisplayType(node: TreeNode): string {
  if (node.$type.includes('TreeSequence')) return '序列'
  if (node.$type.includes('TreeParallel')) return '并行'
  if (node.$type.includes('TreeSelect')) return '选择'
  if (node.$type.includes('TreeLoop')) return '循环'
  if (node.$type.includes('TreeCondNode')) return '条件'
  if (node.$type.includes('TreeActionNode')) return '动作'
  if (node.$type.includes('TreeScriptNode')) return '脚本'
  if (node.$type.includes('TreeDelayNode')) return '延迟'
  if (node.$type.includes('TreeDebugNode')) return '调试'
  if (node.$type.includes('TreeClearWaitNode')) return '清除等待'
  return '未知'
}

// --- Document ---

export interface TreeRoot {
  $type?: string
  DisplayName: string
  Childs: TreeNode[]
  Important?: boolean
  Color?: Color
  Id?: number
  Enable?: boolean
  Remark?: string
  Tag?: string
}

export interface TriggerLineDocument {
  // JSON v6 fields
  GUID?: string
  ConfigVersion: number
  TargetJob?: number
  Author?: string
  Name?: string
  // TXT v1000 fields
  Id?: string
  OpenerScript?: string
  // Shared
  TreeRoot: TreeRoot
  // Catch-all
  [key: string]: unknown
}

// ============================================================
// ACR Type Discovery
// ============================================================

export interface AcrFieldDef {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object'
  /** Non-primitive type name (enum/class reference), e.g. "XSZYYS.PLD.Triggers.TriggerAction_小功能设置+功能类型" */
  typeName?: string
  /** Enum member names & values (only when typeName points to an enum) */
  enumValues?: { name: string; value: number }[]
}

export interface AcrTypeDef {
  $type: string
  displayName: string
  assemblyName: string
  fields: AcrFieldDef[]
  /** Interfaces this type implements (e.g. ["AEAssist.CombatRoutine.Trigger.ITriggerAction", "HiAuRo.ACR.ITriggerBase"]) */
  interfaces?: string[]
  /** Base class name (from Extends in TypeDef) */
  baseType?: string
  /** Pre-populated qtValues keys discovered from timeline scanning */
  sampleQtKeys?: string[]
  /** Pre-populated QTList items discovered from timeline scanning */
  sampleQtList?: { Key: string; Value: boolean }[]
  /** Pre-populated QtStates keys discovered from timeline scanning */
  sampleQtStatesKeys?: string[]
  /** All string literals from DLL #US heap (for QT key fallback) */
  allStrings?: string[]
}
