// ============================================================
// PromeRotation PureTimeline (PTL) Type Definitions
// Schema source: PromeRotation source repo (authoritative, not decompile)
//   PureTimeline/Serialization/PtlDto.cs, PureTimeline/Model/*.cs
//   Timeline/Core/TimelineDtos.cs, Timeline/Core/Nodes.cs
// All interfaces carry a [key: string]: unknown catch-all for round-trip safety.
// ============================================================

export interface PtlMeta {
  Name?: string | null
  TerritoryId: number
  JobId: number
  Author?: string | null
  AcrAuthor?: string | null
  CreatedAt?: string
  Opener?: string | null
  Remark?: string | null
  [key: string]: unknown
}

/** SyncType enum serialized as string (JsonStringEnumConverter) */
export interface PtlSyncRule {
  Type: string
  Params: Record<string, string>
  MatchTime?: number | null
  JumpTargetTime?: number | null
  IsForceJump: boolean
  WindowBefore: number
  WindowAfter: number
  [key: string]: unknown
}

export interface PtlAnchor {
  Guid: string
  Name?: string | null
  Time: number
  IsPhaseAnchor: boolean
  IsEndAnchor: boolean
  IsCommentAnchor: boolean
  IsTechnicalAnchor: boolean
  Enabled: boolean
  Remark?: string | null
  Sync?: PtlSyncRule | null
  [key: string]: unknown
}

export interface PtlQtState {
  Name?: string | null
  Enabled: boolean
  [key: string]: unknown
}

export interface PtlCondition {
  Type?: string | null
  ActionId?: number | null
  Immediate?: boolean
  Target?: string | null
  BuffId?: number | null
  Mode?: string | null
  Regex?: string | null
  Value?: number | null
  Negate?: boolean
  Script?: string | null
  Params?: Record<string, string> | null
  [key: string]: unknown
}

export interface PtlAction {
  Type?: string | null
  Qt?: string | null
  QtStates?: PtlQtState[] | null
  Enabled?: boolean
  Message?: string | null
  ActionId?: number | null
  SkillType?: string | null
  Target?: string | null
  HighPriority?: boolean
  TargetMode?: string | null
  TargetDataId?: number | null
  TargetName?: string | null
  TargetNearest?: boolean
  Mode?: string | null
  PositionX?: number | null
  PositionY?: number | null
  PositionZ?: number | null
  Script?: string | null
  Params?: Record<string, string> | null
  Duration?: number | null
  [key: string]: unknown
}

/** Type: serial | parallel | condition | action | branch | delay | csharprunningaction */
export interface PtlNode {
  Id: number
  Name?: string | null
  Type: string
  Enabled: boolean
  Remark?: string | null
  DelayMs?: number | null
  Mode?: string | null
  UseAndLogic?: boolean | null
  Condition?: PtlCondition | null
  Conditions?: PtlCondition[] | null
  Action?: PtlAction | null
  Actions?: PtlAction[] | null
  Children?: PtlNode[] | null
  Script?: string | null
  Duration?: number | null
  [key: string]: unknown
}

export interface PtlEntry {
  Guid: string
  Name?: string | null
  StartAnchorGuid: string
  Offset: number
  Enabled: boolean
  Remark?: string | null
  EntryGroup: PtlNode
  [key: string]: unknown
}

export interface PtlVariableOption {
  Label?: string | null
  Value?: number
  [key: string]: unknown
}

export interface PtlVariable {
  Name: string
  DefaultValue: number
  Remark?: string | null
  Options?: PtlVariableOption[]
  [key: string]: unknown
}

export interface PtlDocument {
  Version: number
  Meta: PtlMeta
  Variables: PtlVariable[]
  Anchors: PtlAnchor[]
  Entries: PtlEntry[]
  [key: string]: unknown
}

/** Heuristic: distinguish a PTL file from an AE Triggerline file */
export function isPtlDocument(json: unknown): json is PtlDocument {
  const o = json as Record<string, unknown> | null
  return !!o && typeof o === 'object' && Array.isArray(o.Anchors) && !!o.Meta && !('TreeRoot' in o)
}

// ============================================================
// Enums (from source)
// ============================================================

/** PureTimeline/Model/SyncRule.cs — SyncType */
export const PR_SYNC_TYPES = [
  'None', 'InCombat', 'CastStart', 'ActionEffect', 'Weather',
  'ChatLog', 'Countdown', 'ActorControl', 'AddedCombatant', 'NpcYell', 'Lua', 'Manual'
] as const

export const PR_SYNC_TYPE_LABELS: Record<string, string> = {
  None: '无同步',
  InCombat: '进入战斗',
  CastStart: '读条开始',
  ActionEffect: '技能判定',
  Weather: '天气变化',
  ChatLog: '聊天日志',
  Countdown: '倒计时',
  ActorControl: 'ActorControl',
  AddedCombatant: '添加战斗成员',
  NpcYell: 'NPC 喊话',
  Lua: 'Lua 事件',
  Manual: '手动触发'
}

/** Sync types whose Params carry ActionId / Regex */
export const PR_SYNC_ACTION_TYPES = new Set(['CastStart', 'ActionEffect'])

/** Node types accepted by TimelineLoader (lowercase-invariant match) */
export const PR_NODE_TYPES = [
  'serial', 'parallel', 'condition', 'action', 'branch', 'delay', 'csharprunningaction'
] as const

export const PR_NODE_TYPE_LABELS: Record<string, string> = {
  serial: '串行',
  parallel: '并行',
  condition: '条件',
  action: '行为',
  branch: '分支',
  delay: '延迟',
  csharprunningaction: 'C# 持续行为'
}

/** Menu labels used when creating nodes (matches plugin EgNodeTemplates) */
export const PR_NODE_TEMPLATE_LABELS: Record<string, string> = {
  serial: '串行节点',
  parallel: '并行节点',
  condition: '条件节点',
  action: '行为节点',
  delay: '延迟节点',
  branch: '分支节点',
  csharprunningaction: 'C# 持续行为'
}

export const PR_NODE_TYPE_ICONS: Record<string, string> = {
  serial: '📚',
  parallel: '⚡',
  condition: '❓',
  action: '▶️',
  branch: '🔀',
  delay: '⏱️',
  csharprunningaction: '📜'
}

/** Tailwind text color per node type (mirrors plugin GetEgNodeColor hues) */
export const PR_NODE_TYPE_COLORS: Record<string, string> = {
  serial: 'text-sky-300',
  parallel: 'text-purple-300',
  branch: 'text-amber-300',
  condition: 'text-emerald-300',
  action: 'text-orange-200',
  delay: 'text-lime-300',
  csharprunningaction: 'text-green-300'
}

/** Condition node detection modes (Nodes.cs ConditionNode.Mode) */
export const PR_COND_NODE_MODES = ['auto', 'immediate', 'wait'] as const
export const PR_COND_NODE_MODE_LABELS: Record<string, string> = {
  auto: '自动检测',
  immediate: '立即检测',
  wait: '持续检测'
}

/** Data/PAction.cs — ActionType (ActionDto.SkillType) */
export const PR_SKILL_TYPES = ['Gcd', 'OffGcd', 'Always', 'Item', 'LimitBreak'] as const
export const PR_SKILL_TYPE_LABELS: Record<string, string> = {
  Gcd: 'GCD',
  OffGcd: '能力技 (OffGcd)',
  Always: '始终 (Always)',
  Item: '道具',
  LimitBreak: '极限技 (LB)'
}

/** Data/ActionTargetType.cs (ActionDto.Target / ConditionDto.Target) */
export const PR_TARGET_TYPES = [
  'Self', 'Target', 'TargetOfTarget', 'FocusTarget', 'MouseOver', 'LowestHealthPartyMember',
  'PartyMember2', 'PartyMember3', 'PartyMember4', 'PartyMember5',
  'PartyMember6', 'PartyMember7', 'PartyMember8'
] as const
export const PR_TARGET_TYPE_LABELS: Record<string, string> = {
  Self: '自身',
  Target: '当前目标',
  TargetOfTarget: '目标的目标',
  FocusTarget: '焦点目标',
  MouseOver: '鼠标悬停',
  LowestHealthPartyMember: '血量最低队友',
  PartyMember2: '小队成员2',
  PartyMember3: '小队成员3',
  PartyMember4: '小队成员4',
  PartyMember5: '小队成员5',
  PartyMember6: '小队成员6',
  PartyMember7: '小队成员7',
  PartyMember8: '小队成员8'
}

/** Timeline/Actions/SetTargetAction.cs — TargetSelectionType */
export const PR_TARGET_MODES = ['None', 'Self', 'DataId'] as const
export const PR_TARGET_MODE_LABELS: Record<string, string> = {
  None: '无', Self: '自身', DataId: '按 DataId'
}

/** Timeline/Actions/UsePotionAction.cs — PotionUseMode */
export const PR_POTION_MODES = ['Enqueue', 'HighPriority', 'ForceUse'] as const
export const PR_POTION_MODE_LABELS: Record<string, string> = {
  Enqueue: '排队', HighPriority: '高优先级', ForceUse: '强制使用'
}

/** TargetSelector/SelectorModeType (SetTargetSelectorMode Params.mode) */
export const PR_SELECTOR_MODES = [
  'None', 'Closest', 'Farthest', 'LowestHp', 'HighestHp',
  'LowestHpIn3R', 'HighestHpIn3R', 'LowestHpIn6R', 'HighestHpIn6R'
] as const
export const PR_SELECTOR_MODE_LABELS: Record<string, string> = {
  None: '无', Closest: '最近', Farthest: '最远',
  LowestHp: '血量最低', HighestHp: '血量最高',
  LowestHpIn3R: '3米内血量最低', HighestHpIn3R: '3米内血量最高',
  LowestHpIn6R: '6米内血量最低', HighestHpIn6R: '6米内血量最高'
}

/** Timeline/Actions/HeadingControlAction.cs — HeadingControlMode */
export const PR_HEADING_MODES = [
  'SetAngle', 'ClearAll', 'FaceCurrentTarget', 'FaceSpecifiedTarget', 'FacePosition'
] as const
export const PR_HEADING_MODE_LABELS: Record<string, string> = {
  SetAngle: '设定角度', ClearAll: '清除全部', FaceCurrentTarget: '面向当前目标',
  FaceSpecifiedTarget: '面向指定目标', FacePosition: '面向坐标'
}

/** Timeline/Actions/SetTimelineVariableAction.cs — TimelineVariableActionMode */
export const PR_VAR_ACTION_MODES = ['Set', 'Add', 'Subtract'] as const
export const PR_VAR_ACTION_MODE_LABELS: Record<string, string> = {
  Set: '赋值', Add: '加', Subtract: '减'
}

/** Timeline/Actions/ToggleAcrAction.cs — ToggleAcrMode */
export const PR_TOGGLE_ACR_MODES = ['Enable', 'Hold'] as const
export const PR_TOGGLE_ACR_MODE_LABELS: Record<string, string> = {
  Enable: '开启', Hold: '暂停 (Hold)'
}

/** Timeline/Conditions/ActionEffectCondition.cs — ActionEffectSourceMode / TargetMode */
export const PR_EFFECT_SOURCE_MODES = ['Any', 'Player', 'Enemy'] as const
export const PR_EFFECT_SOURCE_MODE_LABELS: Record<string, string> = {
  Any: '任意', Player: '玩家', Enemy: '敌方'
}
export const PR_EFFECT_TARGET_MODES = ['Any', 'Self', 'NotSelf'] as const
export const PR_EFFECT_TARGET_MODE_LABELS: Record<string, string> = {
  Any: '任意', Self: '自身', NotSelf: '非自身'
}

/** Timeline/Conditions/PlayerPositionCondition.cs — PlayerPositionCheckMode */
export const PR_POSITION_CHECK_MODES = ['XAxis', 'YAxis', 'ZAxis', 'CoordinateRange'] as const
export const PR_POSITION_CHECK_MODE_LABELS: Record<string, string> = {
  XAxis: 'X 轴', YAxis: 'Y 轴', ZAxis: 'Z 轴', CoordinateRange: '坐标范围'
}

/** Data/PromeSettings.cs — TimelineRole */
export const PR_TIMELINE_ROLES = ['None', 'MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'] as const
/** Roles usable as an XSZBox IPC target (no None) */
export const PR_ROLES = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'] as const

/** Comparison operators (NormalizeCompare accepts these) */
export const PR_COMPARE_MODES = ['==', '!=', '>', '>=', '<', '<='] as const

/** Known presets for xszbox.pr.preset_skill (observed in timelines) */
export const PR_XSZBOX_PRESETS = [
  'RaidMitigation', 'Rampart', 'Reprisal', 'TankFortyMitigation', 'TankInvulnerability'
] as const
export const PR_XSZBOX_PRESET_LABELS: Record<string, string> = {
  RaidMitigation: '团减',
  Rampart: '铁壁',
  Reprisal: '雪仇',
  TankFortyMitigation: '40%减伤',
  TankInvulnerability: '无敌'
}

/** FFXIV ClassJob ids for Meta.JobId */
export const PR_JOBS: { id: number; name: string }[] = [
  { id: 0, name: '通用 (0)' },
  { id: 19, name: '骑士 PLD' },
  { id: 21, name: '战士 WAR' },
  { id: 32, name: '暗黑骑士 DRK' },
  { id: 37, name: '绝枪战士 GNB' },
  { id: 24, name: '白魔法师 WHM' },
  { id: 28, name: '学者 SCH' },
  { id: 33, name: '占星术士 AST' },
  { id: 40, name: '贤者 SGE' },
  { id: 20, name: '武僧 MNK' },
  { id: 22, name: '龙骑士 DRG' },
  { id: 30, name: '忍者 NIN' },
  { id: 34, name: '武士 SAM' },
  { id: 39, name: '钐镰客 RPR' },
  { id: 41, name: '蝰蛇剑士 VPR' },
  { id: 23, name: '吟游诗人 BRD' },
  { id: 31, name: '机工士 MCH' },
  { id: 38, name: '舞者 DNC' },
  { id: 25, name: '黑魔法师 BLM' },
  { id: 27, name: '召唤师 SMN' },
  { id: 35, name: '赤魔法师 RDM' },
  { id: 42, name: '绘灵法师 PCT' },
  { id: 36, name: '青魔法师 BLU' }
]
