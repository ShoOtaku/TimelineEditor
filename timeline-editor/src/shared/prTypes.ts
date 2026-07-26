// ============================================================
// PromeRotation PureTimeline (PTL) Type Definitions
// Schema source: PromeRotation.dll decompile
//   PromeRotation.PureTimeline.Serialization.{PtlDto, PtlMetaDto, AnchorDto, SyncRuleDto, EntryDto}
//   PromeRotation.Timeline.Core.{NodeDto, ConditionDto, ActionDto, QtStateDto}
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

/** Type: serial | parallel | condition | action | branch | delay */
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
// Enums (from DLL)
// ============================================================

/** PromeRotation.PureTimeline.Model.SyncType */
export const PR_SYNC_TYPES = [
  'None', 'InCombat', 'CastStart', 'ActionEffect', 'Countdown', 'Weather',
  'ChatLog', 'ActorControl', 'AddedCombatant', 'NpcYell', 'Lua', 'Manual'
] as const

export const PR_SYNC_TYPE_LABELS: Record<string, string> = {
  None: '无同步',
  InCombat: '进入战斗',
  CastStart: '读条开始',
  ActionEffect: '技能判定',
  Countdown: '倒计时',
  Weather: '天气变化',
  ChatLog: '聊天日志',
  ActorControl: 'ActorControl',
  AddedCombatant: '添加战斗成员',
  NpcYell: 'NPC 喊话',
  Lua: 'Lua 事件',
  Manual: '手动触发'
}

/** Sync types whose Params carry an ActionId / Regex (observed in real timelines) */
export const PR_SYNC_ACTION_TYPES = new Set(['CastStart', 'ActionEffect'])

/** PromeRotation.Timeline.Core node type strings */
export const PR_NODE_TYPES = ['serial', 'parallel', 'condition', 'action', 'branch', 'delay'] as const

export const PR_NODE_TYPE_LABELS: Record<string, string> = {
  serial: '顺序组',
  parallel: '并行组',
  condition: '条件',
  action: '动作',
  branch: '分支',
  delay: '延迟'
}

export const PR_NODE_TYPE_ICONS: Record<string, string> = {
  serial: '📚',
  parallel: '⚡',
  condition: '❓',
  action: '▶️',
  branch: '🔀',
  delay: '⏱️'
}

/** PromeRotation.Timeline.Conditions.* (class name minus "Condition" suffix) */
export const PR_CONDITION_TYPES = [
  'SkillCooldown', 'TargetSelectable', 'HasBuffFriendly', 'BuffTimeFriendly',
  'CastStart', 'ActionEffect', 'InCombat', 'Countdown', 'ChatLog',
  'InstanceContentText', 'PlayerPosition', 'Weather', 'TimelineRole', 'TimelineVariable'
] as const

export const PR_CONDITION_TYPE_LABELS: Record<string, string> = {
  SkillCooldown: '技能冷却',
  TargetSelectable: '目标可选中',
  HasBuffFriendly: '友方拥有Buff',
  BuffTimeFriendly: '友方Buff剩余时间',
  CastStart: '读条开始',
  ActionEffect: '技能判定',
  InCombat: '战斗状态',
  Countdown: '倒计时',
  ChatLog: '聊天日志',
  InstanceContentText: '副本文本',
  PlayerPosition: '玩家位置',
  Weather: '天气',
  TimelineRole: '时间轴职能',
  TimelineVariable: '时间轴变量'
}

/** PromeRotation.Timeline.Actions.* (class name minus "Action" suffix) + XSZBox IPC actions */
export const PR_ACTION_TYPES = [
  'EnqueueSkill', 'ForceUseSkill', 'TriggerQt', 'BatchTriggerQt', 'SetTarget',
  'UsePotion', 'CustomLog', 'ExecuteCommand', 'ClearAllQueues',
  'EnqueueLocation', 'ForceUseLocation', 'GreenMoveToPosition', 'TeleportToPosition',
  'HeadingControl', 'SetTargetSelectorMode', 'SetTimelineVariable', 'ToggleAcr'
] as const

export const PR_XSZBOX_ACTION_TYPES = [
  'xszbox.pr.preset_skill', 'xszbox.pr.role_skill', 'xszbox.pr.role_position'
] as const

export const PR_ACTION_TYPE_LABELS: Record<string, string> = {
  EnqueueSkill: '排队使用技能',
  ForceUseSkill: '强制使用技能',
  TriggerQt: '设置QT',
  BatchTriggerQt: '批量设置QT',
  SetTarget: '设置目标',
  UsePotion: '使用爆发药',
  CustomLog: '自定义日志',
  ExecuteCommand: '执行命令',
  ClearAllQueues: '清空技能队列',
  EnqueueLocation: '排队地面技能',
  ForceUseLocation: '强制地面技能',
  GreenMoveToPosition: '绿玩移动',
  TeleportToPosition: '传送到坐标',
  HeadingControl: '面向控制',
  SetTargetSelectorMode: '设置目标选择器',
  SetTimelineVariable: '设置时间轴变量',
  ToggleAcr: '开关ACR',
  'xszbox.pr.preset_skill': 'XSZBox·预设技能',
  'xszbox.pr.role_skill': 'XSZBox·职能技能',
  'xszbox.pr.role_position': 'XSZBox·职能移动'
}

/** PromeRotation.Data.ActionType (ActionDto.SkillType) */
export const PR_SKILL_TYPES = ['Gcd', 'OffGcd', 'Always', 'Item', 'LimitBreak'] as const

export const PR_SKILL_TYPE_LABELS: Record<string, string> = {
  Gcd: 'GCD',
  OffGcd: '能力技 (OffGcd)',
  Always: '始终 (Always)',
  Item: '道具',
  LimitBreak: '极限技 (LB)'
}

/** PromeRotation.Data.ActionTargetType (ActionDto.Target) */
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

/** PromeRotation.Timeline.Actions.TargetSelectionType (SetTarget.TargetMode) */
export const PR_TARGET_MODES = ['None', 'Self', 'DataId'] as const
export const PR_TARGET_MODE_LABELS: Record<string, string> = {
  None: '无',
  Self: '自身',
  DataId: '按 DataId'
}

/** PromeRotation.Timeline.Actions.PotionUseMode (UsePotion.Mode) */
export const PR_POTION_MODES = ['Enqueue', 'HighPriority', 'ForceUse'] as const
export const PR_POTION_MODE_LABELS: Record<string, string> = {
  Enqueue: '排队',
  HighPriority: '高优先级',
  ForceUse: '强制使用'
}

/** PromeRotation.TargetSelector.SelectorModeType (SetTargetSelectorMode.Mode) */
export const PR_SELECTOR_MODES = [
  'None', 'Closest', 'Farthest', 'LowestHp', 'HighestHp',
  'LowestHpIn3R', 'HighestHpIn3R', 'LowestHpIn6R', 'HighestHpIn6R'
] as const

/** Comparison operators used by SkillCooldown etc. (ConditionDto.Mode) */
export const PR_COMPARE_MODES = ['<=', '<', '==', '!=', '>', '>='] as const

/** Timeline roles used by xszbox.pr.* params */
export const PR_ROLES = ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'] as const

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
