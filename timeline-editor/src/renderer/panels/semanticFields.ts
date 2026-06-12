// ============================================================
// Semantic field interpretation — maps raw field names/types
// to UI-friendly dropdowns based on naming conventions.
// ============================================================

export interface SemanticOption {
  value: string | number
  label: string
}

export interface SemanticField {
  key: string
  label: string
  /** If set, render a dropdown with these options instead of raw input */
  options?: SemanticOption[]
  /** Override the raw type: e.g. a field named 'Larger' with type 'number' is really a boolean */
  overrideType?: 'boolean' | 'number' | 'string' | 'select'
}

export interface AcrFieldDefLike {
  key: string
  type: string
  typeName?: string
  enumValues?: { name: string; value: number }[]
}

const COMPARE_OPTIONS: SemanticOption[] = [
  { value: 0, label: '== （等于）' },
  { value: 1, label: '!= （不等于）' },
  { value: 2, label: '> （大于）' },
  { value: 3, label: '< （小于）' },
  { value: 4, label: '≥ （大于等于）' },
  { value: 5, label: '≤ （小于等于）' },
]

const PARTY_ROLE_OPTIONS: SemanticOption[] = [
  { value: 'MT', label: 'MT' },
  { value: 'ST', label: 'ST' },
  { value: 'H1', label: 'H1' },
  { value: 'H2', label: 'H2' },
  { value: 'D1', label: 'D1' },
  { value: 'D2', label: 'D2' },
  { value: 'D3', label: 'D3' },
  { value: 'D4', label: 'D4' },
]

// Field names that are likely boolean even if their declared type is number
const BOOLEAN_LIKE_NAMES = new Set([
  'larger', 'needtargetable', 'enable', 'stop', 'islock',
  'clear', 'doubleclear', 'onlycheck', 'reverseresult',
  'checkonce', 'coolDowncheck', 'ispartymember', 'autocheckactionchange'
])

/**
 * Returns semantic interpretation for a field, or null if no special handling.
 * Pass the full field object (with optional enumValues) for enum auto-detection.
 */
export function getSemanticField(key: string, rawType: string, field?: AcrFieldDefLike): SemanticField | null {
  const k = key.toLowerCase()

  // Enums from DLL metadata — render as dropdown
  if (field?.enumValues && field.enumValues.length > 0) {
    return {
      key,
      label: key,
      options: field.enumValues.map(ev => ({ value: ev.value, label: `${ev.name} (${ev.value})` })),
      overrideType: 'select'
    }
  }

  // Comparison operator
  if (k === 'operatorindex' || k === 'comparetype') {
    return { key, label: key, options: COMPARE_OPTIONS, overrideType: 'select' }
  }

  // Party role
  if (k === 'partyrole') {
    return { key, label: '职能', options: PARTY_ROLE_OPTIONS, overrideType: 'select' }
  }

  // Boolean-like names detected as number/string
  if (BOOLEAN_LIKE_NAMES.has(k) && (rawType === 'number' || rawType === 'string')) {
    return { key, label: key, overrideType: 'boolean' }
  }

  return null
}
