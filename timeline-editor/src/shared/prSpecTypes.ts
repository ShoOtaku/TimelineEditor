// Shapes for the PR condition/action spec tables that drive the property editors,
// plus the field specs reused across several types.
import { PR_COMPARE_MODES, PR_TARGET_TYPES, PR_TARGET_TYPE_LABELS } from './prTypes'

export type PrFieldKind =
  | 'actionId'    // number + spell-name hint
  | 'buffId'
  | 'dataId'
  | 'int'
  | 'float'
  | 'text'
  | 'bool'
  | 'enum'
  | 'compare'
  | 'skillType'
  | 'target'
  | 'script'
  | 'qtStates'
  | 'position'    // renders PositionX/Y/Z as one row

export interface PrFieldSpec {
  /** DTO field name, or `Params.<key>` for a Params dictionary entry */
  path: string
  label: string
  kind: PrFieldKind
  options?: readonly string[]
  optionLabels?: Record<string, string>
  hint?: string
  /** value written when the type is first created */
  def?: string | number | boolean | null
  /** only render when the referenced field currently holds one of these values */
  showWhen?: { path: string; equals: string[] }
}

export interface PrTypeSpec {
  /** canonical TypeKey as the plugin writes it */
  key: string
  /** official DisplayName from the plugin descriptor */
  label: string
  fields: PrFieldSpec[]
  deprecated?: boolean
  note?: string
  /** grouping in the type dropdown (unset = built-in) */
  group?: string
}

// --- shared field specs ---

export const IMMEDIATE: PrFieldSpec = {
  path: 'Immediate', label: '立即检测 (Immediate)', kind: 'bool',
  hint: '只判定一次，不等待事件'
}

export const NEGATE: PrFieldSpec = { path: 'Negate', label: '取反 (Negate)', kind: 'bool' }

export const COMPARE = (path = 'Mode', label = '比较符'): PrFieldSpec =>
  ({ path, label, kind: 'compare', options: PR_COMPARE_MODES, def: '<=' })

export const TARGET = (path = 'Target', label = '目标'): PrFieldSpec =>
  ({ path, label, kind: 'target', options: PR_TARGET_TYPES, optionLabels: PR_TARGET_TYPE_LABELS, def: 'Self' })
