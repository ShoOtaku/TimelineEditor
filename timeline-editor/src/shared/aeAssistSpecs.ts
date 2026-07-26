import rawSpecs from '../../scripts/aeassist_specs.json'

export interface AeEnumValue {
  name: string
  value: number
}

export interface AeFieldSpec {
  name: string
  type: string
  default: string
  member: 'field' | 'property'
  label?: string
}

export interface AeNodeSpec {
  type: string
  shortName: string
  displayName: string
  category?: string
  label?: string
  fields: AeFieldSpec[]
}

export interface AeComplexTypeSpec {
  type: string
  shortName: string
  fields: AeFieldSpec[]
}

interface AeSpecs {
  conditions: AeNodeSpec[]
  actions: AeNodeSpec[]
  enums: Record<string, AeEnumValue[]>
  complexTypes: Record<string, AeComplexTypeSpec>
}

export const AE_ASSIST_SPECS = rawSpecs as AeSpecs
export const AE_CONDITION_SPECS = AE_ASSIST_SPECS.conditions
export const AE_ACTION_SPECS = AE_ASSIST_SPECS.actions
export const AE_ENUMS = AE_ASSIST_SPECS.enums
export const AE_COMPLEX_TYPES = AE_ASSIST_SPECS.complexTypes

const condByType = new Map<string, AeNodeSpec>()
const actionByType = new Map<string, AeNodeSpec>()

for (const spec of AE_CONDITION_SPECS) {
  condByType.set(spec.type, spec)
  condByType.set(spec.shortName, spec)
}
for (const spec of AE_ACTION_SPECS) {
  actionByType.set(spec.type, spec)
  actionByType.set(spec.shortName, spec)
}

export function findAeConditionSpec(type: string | undefined): AeNodeSpec | undefined {
  if (!type) return undefined
  return condByType.get(type) ?? condByType.get(type.split(',')[0].split('.').pop() ?? type)
}

export function findAeActionSpec(type: string | undefined): AeNodeSpec | undefined {
  if (!type) return undefined
  return actionByType.get(type) ?? actionByType.get(type.split(',')[0].split('.').pop() ?? type)
}

/** Convert a C# initializer emitted by the extractor into a JSON value. */
function parseDefault(text: string, fieldType: string): unknown {
  const value = text.trim()
  if (fieldType.startsWith('List<')) return []
  if (fieldType === 'Vector3') return { X: 0, Y: 0, Z: 0 }
  if (AE_COMPLEX_TYPES[fieldType]) return createComplexDefault(fieldType)
  if (fieldType === 'string') return ''
  if (fieldType === 'bool') return value === 'true'
  if (fieldType.startsWith('enum:')) {
    const enumName = fieldType.slice(5)
    const member = value.includes('.') ? value.split('.').pop() : ''
    return AE_ENUMS[enumName]?.find(e => e.name === member)?.value ?? AE_ENUMS[enumName]?.[0]?.value ?? 0
  }
  if (/^(u?int|u?long|u?short|byte|sbyte|float|double|decimal)$/.test(fieldType)) {
    const parsed = Number(value.replace(/[fFdDmMuUlL]+$/, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return null
}

export function createComplexDefault(type: string): Record<string, unknown> {
  const spec = AE_COMPLEX_TYPES[type]
  if (!spec) return {}
  const result: Record<string, unknown> = {}
  for (const field of spec.fields) result[field.name] = parseDefault(field.default, field.type)
  return result
}

function createNodeDefault(spec: AeNodeSpec): Record<string, unknown> {
  const result: Record<string, unknown> = {
    $type: spec.type,
    DisplayName: spec.displayName,
  }
  for (const field of spec.fields) result[field.name] = parseDefault(field.default, field.type)
  return result
}

export function createAeConditionDefault(type: string): Record<string, unknown> {
  const spec = findAeConditionSpec(type)
  return spec ? createNodeDefault(spec) : { $type: type, DisplayName: type, Remark: null }
}

export function createAeActionDefault(type: string): Record<string, unknown> {
  const spec = findAeActionSpec(type)
  return spec ? createNodeDefault(spec) : { $type: type, DisplayName: type, Remark: null }
}

/** Human labels where the source has no [Label] metadata. */
const FIELD_LABELS: Record<string, string> = {
  Remark: '备注',
  SpellId: '技能 ID', ActionId: '技能 ID', DataId: '单位 DataId', Args0: '参数 / ID',
  RegexNameOrId: '技能名称或 ID', RegexValue: '匹配文本 / 正则', NameorId: '名称或 ID',
  CheckTime: '检测时间（秒）', Delay: '延迟（秒）', TargetTime: '目标战斗时间（秒）',
  CoolDown: '冷却时间（秒）', Larger: 'CD ≥ 此值', NeedTargetable: '需要可选中',
  CheckIsMe: '仅检测自身', LimitType: '目标限制', VariableName: '变量名称',
  VariableVaule: '比较值', SetVariableVaule: '设置值', CompareType: '比较方式',
  WeatherId: '天气 ID', PartyRole: '职能', LimitMsgType: '限制消息类型', MsgType: '消息类型',
  Pos: '位置索引 / 坐标', Arg0: '参数 0', Arg1: '参数 1', Target: '目标',
  JobsCategoryType: '职业类别', 麻将号码: '麻将号码', Pull: '自动攻击', Stop: '停手',
  Clear: '插入前清除槽位', DoubleClear: '双重清除', IsLock: '锁定', IdList: '技能 ID 列表',
  CoolDowncheck: '检测冷却', CoolDowncheck_time: '冷却检测时间（秒）',
  MitigationType: '减伤类型', Command: '指令', KeyCode: '按键', Use2: '使用 2D 导航',
  WaitTillTime: '等待时间（毫秒）', TargetNameOrId: '目标名称或 ID', RotationType: '面向类型',
  Rotation: '自定义角度', StopACR: '停止 ACR', SpellConfig: '技能配置', Data: '技能队列',
  TargetSelector: '目标选择器', SimplePointSelector: '点位选择器',
}

export function aeFieldLabel(field: AeFieldSpec): string {
  return field.label || FIELD_LABELS[field.name] || field.name
}
