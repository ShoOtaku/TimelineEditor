// PR condition types — TypeKey / DisplayName / DTO field usage taken from the
// PromeRotation source (Timeline/Conditions/*.cs). Order matches the plugin's
// menu order in Timeline/Core/BuiltinNodeTypes.Conditions.
import {
  PR_COMPARE_MODES, PR_EFFECT_SOURCE_MODES, PR_EFFECT_SOURCE_MODE_LABELS,
  PR_EFFECT_TARGET_MODES, PR_EFFECT_TARGET_MODE_LABELS,
  PR_POSITION_CHECK_MODES, PR_POSITION_CHECK_MODE_LABELS, PR_TIMELINE_ROLES
} from './prTypes'
import type { PrTypeSpec } from './prSpecTypes'
import { IMMEDIATE, NEGATE, COMPARE, TARGET } from './prSpecTypes'

export const PR_CONDITION_SPECS: PrTypeSpec[] = [
  {
    key: 'caststart', label: '开始咏唱检测',
    fields: [
      { path: 'Regex', label: '技能 ID 或正则', kind: 'text', hint: '纯数字=技能ID，其它=正则匹配技能名' },
      { path: 'ActionId', label: '技能 ID (旧字段)', kind: 'actionId', hint: '留空优先用上方字段' },
      IMMEDIATE
    ]
  },
  {
    key: 'hasbufffriendly', label: '友方 Buff 状态检测',
    fields: [
      { path: 'BuffId', label: 'Buff ID', kind: 'buffId', def: 0 },
      TARGET(),
      NEGATE
    ]
  },
  {
    key: 'BuffTimeFriendly', label: '友方 Buff 剩余时间检测',
    fields: [
      { path: 'BuffId', label: 'Buff ID', kind: 'buffId', def: 0 },
      TARGET(),
      COMPARE(),
      { path: 'Value', label: '剩余秒数', kind: 'float', def: 10 },
      IMMEDIATE
    ]
  },
  { key: 'incombat', label: '战斗状态检测', fields: [] },
  {
    key: 'countdown', label: '倒计时检测', deprecated: true,
    note: '插件已标记废弃，改用锚点同步的 Countdown 类型',
    fields: []
  },
  {
    key: 'actioneffect', label: '技能命中检测',
    fields: [
      { path: 'Regex', label: '技能 ID 或正则', kind: 'text', hint: '纯数字=技能ID，其它=正则匹配技能名' },
      { path: 'ActionId', label: '技能 ID (旧字段)', kind: 'actionId', hint: '留空优先用上方字段' },
      {
        path: 'Params.sourceMode', label: '来源', kind: 'enum',
        options: PR_EFFECT_SOURCE_MODES, optionLabels: PR_EFFECT_SOURCE_MODE_LABELS, def: 'Any'
      },
      {
        path: 'Params.targetMode', label: '命中目标', kind: 'enum',
        options: PR_EFFECT_TARGET_MODES, optionLabels: PR_EFFECT_TARGET_MODE_LABELS, def: 'Any'
      },
      IMMEDIATE
    ]
  },
  {
    key: 'SkillCooldown', label: '技能冷却检测',
    fields: [
      { path: 'ActionId', label: '技能 ID', kind: 'actionId', def: 0 },
      COMPARE(),
      { path: 'Value', label: '剩余冷却 (秒)', kind: 'float', def: 0 },
      IMMEDIATE
    ]
  },
  {
    key: 'weather', label: '天气检测',
    fields: [
      { path: 'ActionId', label: '天气 ID', kind: 'int', def: 0, hint: 'Weather 表 row id' },
      IMMEDIATE
    ]
  },
  {
    key: 'chatlog', label: '聊天日志触发',
    fields: [
      { path: 'Regex', label: '正则', kind: 'text', def: '.*' },
      IMMEDIATE
    ]
  },
  {
    key: 'instancecontenttext', label: '台词ID检测',
    fields: [{ path: 'Params.textId', label: '台词 ID', kind: 'int', def: 45500 }]
  },
  {
    key: 'TargetSelectable', label: '目标可选中检测',
    fields: [
      { path: 'ActionId', label: '目标 DataId', kind: 'dataId', def: 0 },
      { path: 'Value', label: '期望值', kind: 'float', def: 1, hint: '1=可选中，0=不可选中' },
      IMMEDIATE
    ]
  },
  {
    key: 'playerposition', label: '自身位置判断',
    fields: [
      {
        path: 'Params.mode', label: '判断方式', kind: 'enum',
        options: PR_POSITION_CHECK_MODES, optionLabels: PR_POSITION_CHECK_MODE_LABELS, def: 'XAxis'
      },
      {
        path: 'Params.compare', label: '比较符', kind: 'compare', options: PR_COMPARE_MODES, def: '>=',
        showWhen: { path: 'Params.mode', equals: ['XAxis', 'YAxis', 'ZAxis'] }
      },
      {
        path: 'Params.value', label: '比较值', kind: 'float', def: 0,
        showWhen: { path: 'Params.mode', equals: ['XAxis', 'YAxis', 'ZAxis'] }
      },
      { path: 'Params.x', label: 'X', kind: 'float', def: 0, showWhen: { path: 'Params.mode', equals: ['CoordinateRange'] } },
      { path: 'Params.y', label: 'Y', kind: 'float', def: 0, showWhen: { path: 'Params.mode', equals: ['CoordinateRange'] } },
      { path: 'Params.z', label: 'Z', kind: 'float', def: 0, showWhen: { path: 'Params.mode', equals: ['CoordinateRange'] } },
      { path: 'Params.range', label: '半径', kind: 'float', def: 0.2, showWhen: { path: 'Params.mode', equals: ['CoordinateRange'] } },
      { path: 'Params.ignoreY', label: '忽略 Y 轴', kind: 'bool', def: true, showWhen: { path: 'Params.mode', equals: ['CoordinateRange'] } }
    ]
  },
  {
    key: 'timelinerole', label: '职能检测',
    fields: [{ path: 'Params.role', label: '职能', kind: 'enum', options: PR_TIMELINE_ROLES, def: 'MT' }]
  },
  {
    key: 'TimelineVariable', label: '变量条件',
    fields: [
      { path: 'Params.name', label: '变量名', kind: 'text', def: '' },
      { path: 'Params.compare', label: '比较符', kind: 'compare', options: PR_COMPARE_MODES, def: '==' },
      { path: 'Params.value', label: '比较值', kind: 'int', def: 0 }
    ]
  },
  {
    key: 'csharpcondition', label: 'C# 条件',
    fields: [{ path: 'Script', label: 'C# 脚本', kind: 'script', def: '' }]
  }
]
