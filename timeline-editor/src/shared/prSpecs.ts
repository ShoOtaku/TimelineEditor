// Entry point for the PR condition/action type registry.
// The plugin's own factories look types up case-insensitively
// (ConditionFactory/ActionFactory use StringComparer.OrdinalIgnoreCase), so
// timelines in the wild mix "ForceUseSkill" and "forceuseskill" — match the same way.
import type { PrTypeSpec } from './prSpecTypes'
import { PR_CONDITION_SPECS } from './prConditionSpecs'
import { PR_ACTION_SPECS } from './prActionSpecs'

export type { PrFieldKind, PrFieldSpec, PrTypeSpec } from './prSpecTypes'
export { PR_CONDITION_SPECS } from './prConditionSpecs'
export { PR_ACTION_SPECS } from './prActionSpecs'

const condByKey = new Map(PR_CONDITION_SPECS.map(s => [s.key.toLowerCase(), s]))
const actByKey = new Map(PR_ACTION_SPECS.map(s => [s.key.toLowerCase(), s]))

export function findConditionSpec(type: string | null | undefined): PrTypeSpec | undefined {
  return type ? condByKey.get(type.toLowerCase()) : undefined
}

export function findActionSpec(type: string | null | undefined): PrTypeSpec | undefined {
  return type ? actByKey.get(type.toLowerCase()) : undefined
}

export function conditionLabel(type: string | null | undefined): string {
  return findConditionSpec(type)?.label ?? type ?? '未知条件'
}

export function actionLabel(type: string | null | undefined): string {
  return findActionSpec(type)?.label ?? type ?? '未知动作'
}

/** Full DTO field lists — used by the "raw fields" fallback views */
export const PR_DTO_ACTION_FIELDS = [
  'Type', 'Qt', 'QtStates', 'Enabled', 'Message', 'ActionId', 'SkillType', 'Target',
  'HighPriority', 'TargetMode', 'TargetDataId', 'TargetName', 'TargetNearest', 'Mode',
  'PositionX', 'PositionY', 'PositionZ', 'Script', 'Params', 'Duration'
] as const

export const PR_DTO_CONDITION_FIELDS = [
  'Type', 'ActionId', 'Immediate', 'Target', 'BuffId', 'Mode', 'Regex', 'Value', 'Negate', 'Script', 'Params'
] as const
