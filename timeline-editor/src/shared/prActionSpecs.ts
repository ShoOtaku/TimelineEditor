// PR action types — TypeKey / DisplayName / DTO field usage taken from the
// PromeRotation source (Timeline/Actions/*.cs). Order matches the plugin's menu
// order in Timeline/Core/BuiltinNodeTypes.Actions; XSZBox entries are IPC-registered
// actions observed in real timelines.
import {
  PR_SKILL_TYPES, PR_SKILL_TYPE_LABELS, PR_TARGET_MODES, PR_TARGET_MODE_LABELS,
  PR_POTION_MODES, PR_POTION_MODE_LABELS, PR_SELECTOR_MODES, PR_SELECTOR_MODE_LABELS,
  PR_HEADING_MODES, PR_HEADING_MODE_LABELS, PR_VAR_ACTION_MODES, PR_VAR_ACTION_MODE_LABELS,
  PR_TOGGLE_ACR_MODES, PR_TOGGLE_ACR_MODE_LABELS, PR_ROLES,
  PR_XSZBOX_PRESETS, PR_XSZBOX_PRESET_LABELS
} from './prTypes'
import type { PrFieldSpec, PrTypeSpec } from './prSpecTypes'
import { TARGET } from './prSpecTypes'

const SKILL_FIELDS: PrFieldSpec[] = [
  { path: 'ActionId', label: '技能 ID', kind: 'actionId', def: 0 },
  {
    path: 'SkillType', label: '技能类型', kind: 'skillType',
    options: PR_SKILL_TYPES, optionLabels: PR_SKILL_TYPE_LABELS, def: 'OffGcd'
  },
  TARGET()
]

const NPC_TARGET_FIELDS: PrFieldSpec[] = [
  { path: 'TargetDataId', label: '目标 DataId', kind: 'dataId', hint: '可选：指定 NPC' },
  { path: 'TargetName', label: '目标名称', kind: 'text', hint: '可选' },
  { path: 'TargetNearest', label: '取最近的匹配目标', kind: 'bool' }
]

export const PR_ACTION_SPECS: PrTypeSpec[] = [
  {
    key: 'triggerqt', label: 'QT 操作',
    fields: [
      { path: 'Qt', label: 'QT 名称', kind: 'text', def: '' },
      { path: 'Enabled', label: '设为开启', kind: 'bool', hint: '不勾选=设为关闭' }
    ]
  },
  {
    key: 'BatchTriggerQt', label: 'QT批量操作',
    fields: [{ path: 'QtStates', label: 'QT 状态列表', kind: 'qtStates' }]
  },
  {
    key: 'enqueueskill', label: '加入技能队列',
    fields: [
      ...SKILL_FIELDS,
      { path: 'HighPriority', label: '高优先级', kind: 'bool' },
      ...NPC_TARGET_FIELDS
    ]
  },
  {
    key: 'forceuseskill', label: '强制使用技能',
    fields: [...SKILL_FIELDS, ...NPC_TARGET_FIELDS]
  },
  {
    key: 'enqueuelocation', label: '加入位置技能队列',
    fields: [
      ...SKILL_FIELDS,
      { path: 'HighPriority', label: '高优先级', kind: 'bool' },
      { path: 'Position', label: '目标坐标', kind: 'position' }
    ]
  },
  {
    key: 'forceuselocation', label: '强制使用位置技能',
    fields: [...SKILL_FIELDS, { path: 'Position', label: '目标坐标', kind: 'position' }]
  },
  {
    key: 'teleporttoposition', label: 'TP到指定位置',
    fields: [{ path: 'Position', label: '目标坐标', kind: 'position' }]
  },
  {
    key: 'greenmovetoposition', label: '绿玩移动到指定位置',
    fields: [
      { path: 'Position', label: '目标坐标', kind: 'position' },
      { path: 'Params.replacePath', label: '替换现有路径', kind: 'bool', def: true, hint: '不勾选=追加路径' },
      { path: 'Params.ignoreY', label: '忽略 Y 轴', kind: 'bool', def: true }
    ]
  },
  {
    key: 'usepotion', label: '使用爆发药',
    fields: [{
      path: 'Mode', label: '使用方式', kind: 'enum',
      options: PR_POTION_MODES, optionLabels: PR_POTION_MODE_LABELS, def: 'Enqueue'
    }]
  },
  { key: 'clearallqueues', label: '清空所有技能队列', fields: [] },
  {
    key: 'settarget', label: '设置目标',
    fields: [
      {
        path: 'TargetMode', label: '目标模式', kind: 'enum',
        options: PR_TARGET_MODES, optionLabels: PR_TARGET_MODE_LABELS, def: 'DataId'
      },
      {
        path: 'TargetDataId', label: '目标 DataId', kind: 'dataId', def: 0,
        showWhen: { path: 'TargetMode', equals: ['DataId'] }
      }
    ]
  },
  {
    key: 'executecommand', label: '执行指令',
    fields: [{ path: 'Params.command', label: '游戏指令', kind: 'text', def: '', hint: '如 /echo hello' }]
  },
  {
    key: 'headingcontrol', label: '设置面向',
    fields: [
      {
        path: 'Params.mode', label: '面向模式', kind: 'enum',
        options: PR_HEADING_MODES, optionLabels: PR_HEADING_MODE_LABELS, def: 'SetAngle'
      },
      {
        path: 'Params.angleDegrees', label: '角度 (度)', kind: 'float', def: 0,
        showWhen: { path: 'Params.mode', equals: ['SetAngle'] }
      },
      { path: 'Params.durationMs', label: '持续时间 (毫秒)', kind: 'int', def: 0, hint: '0=瞬时' },
      {
        path: 'Position', label: '面向坐标', kind: 'position',
        showWhen: { path: 'Params.mode', equals: ['FacePosition'] }
      },
      {
        path: 'TargetDataId', label: '目标 DataId', kind: 'dataId',
        showWhen: { path: 'Params.mode', equals: ['FaceSpecifiedTarget'] }
      },
      {
        path: 'TargetName', label: '目标名称', kind: 'text',
        showWhen: { path: 'Params.mode', equals: ['FaceSpecifiedTarget'] }
      },
      {
        path: 'TargetNearest', label: '取最近的匹配目标', kind: 'bool',
        showWhen: { path: 'Params.mode', equals: ['FaceSpecifiedTarget'] }
      }
    ]
  },
  {
    key: 'settargetselectormode', label: '设置目标选择模式',
    fields: [{
      path: 'Params.mode', label: '选择模式', kind: 'enum',
      options: PR_SELECTOR_MODES, optionLabels: PR_SELECTOR_MODE_LABELS, def: 'None'
    }]
  },
  {
    key: 'toggleacr', label: '设置ACR状态',
    fields: [{
      path: 'Message', label: 'ACR 状态', kind: 'enum',
      options: PR_TOGGLE_ACR_MODES, optionLabels: PR_TOGGLE_ACR_MODE_LABELS, def: 'Enable'
    }]
  },
  {
    key: 'SetTimelineVariable', label: '设置变量',
    fields: [
      { path: 'Params.name', label: '变量名', kind: 'text', def: '' },
      {
        path: 'Params.mode', label: '操作', kind: 'enum',
        options: PR_VAR_ACTION_MODES, optionLabels: PR_VAR_ACTION_MODE_LABELS, def: 'Set'
      },
      { path: 'Params.value', label: '数值', kind: 'int', def: 0 }
    ]
  },
  {
    key: 'customlog', label: '输出日志',
    fields: [{ path: 'Message', label: '日志内容', kind: 'text', def: '' }]
  },
  {
    key: 'csharpaction', label: 'C# 行为',
    fields: [{ path: 'Script', label: 'C# 脚本', kind: 'script', def: '' }]
  },
  // --- XSZBox plugin IPC actions ---
  {
    key: 'xszbox.pr.preset_skill', label: '预设减伤技能', group: 'XSZBox',
    fields: [
      { path: 'Params.role', label: '职能', kind: 'enum', options: PR_ROLES, def: 'MT' },
      {
        path: 'Params.preset', label: '预设', kind: 'enum',
        options: PR_XSZBOX_PRESETS, optionLabels: PR_XSZBOX_PRESET_LABELS, def: 'RaidMitigation'
      },
      { path: 'Params.skillId', label: '指定技能 ID', kind: 'actionId', def: '0', hint: '0=按预设自动选择' }
    ]
  },
  {
    key: 'xszbox.pr.role_skill', label: '职能技能', group: 'XSZBox',
    fields: [
      { path: 'Params.role', label: '职能', kind: 'enum', options: PR_ROLES, def: 'MT' },
      { path: 'Params.skillId', label: '技能 ID', kind: 'actionId', def: '0' },
      { path: 'Params.useTarget', label: '对当前目标使用', kind: 'bool', def: true }
    ]
  },
  {
    key: 'xszbox.pr.role_position', label: '职能移动', group: 'XSZBox',
    fields: [
      { path: 'Params.role', label: '职能', kind: 'enum', options: ['', ...PR_ROLES], optionLabels: { '': '全体' }, def: '' },
      { path: 'Params.mode', label: '模式', kind: 'text', def: 'SetPos' },
      { path: 'Params.x', label: 'X', kind: 'float', def: 0 },
      { path: 'Params.y', label: 'Y', kind: 'float', def: 0 },
      { path: 'Params.z', label: 'Z', kind: 'float', def: 0 },
      { path: 'Params.durationMs', label: '时长 (毫秒)', kind: 'int', def: 5000 }
    ]
  }
]
