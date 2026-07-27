import type { CactbotLine, CactbotLocalizationResult } from '@shared/cactbotTypes'

const OBJECT_PAIR_RE = /['"]((?:\\.|[^'"])*)['"]\s*:\s*['"]((?:\\.|[^'"])*)['"]/g

export function localizeCactbotLines(
  sourceLines: readonly CactbotLine[],
  triggerTs: string,
  locale = 'cn'
): CactbotLocalizationResult {
  const lines = sourceLines.map(cloneLine)
  const replacements = extractReplaceText(triggerTs, locale)
  if (replacements.length === 0) {
    return {
      lines,
      replacementRuleCount: 0,
      localizedLineCount: 0,
      warning: `未找到 ${locale} 的 replaceText`
    }
  }

  let localizedLineCount = 0
  for (const line of lines) {
    if (line.lineType !== 'timeline-entry') continue
    const original = line.name
    line.name = replacements.reduce(
      (name, [pattern, replacement]) => replaceName(name, pattern, replacement),
      line.name
    )
    if (line.name !== original) localizedLineCount++
  }

  return {
    lines,
    replacementRuleCount: replacements.length,
    localizedLineCount,
    warning: null
  }
}

export function extractReplaceText(triggerTs: string, locale: string): Array<[string, string]> {
  const localePattern = new RegExp(`['"]locale['"]\\s*:\\s*['"]${escapeRegExp(locale)}['"]`)
  const localeMatch = localePattern.exec(triggerTs)
  if (!localeMatch) return []

  const localeObjectStart = findObjectStartBefore(triggerTs, localeMatch.index)
  if (localeObjectStart < 0) return []
  const localeObjectEnd = findMatchingBrace(triggerTs, localeObjectStart)
  if (localeObjectEnd < 0) return []

  const localeObject = triggerTs.slice(localeObjectStart, localeObjectEnd + 1)
  const replaceMatch = /['"]replaceText['"]\s*:/.exec(localeObject)
  if (!replaceMatch) return []
  const objectStart = localeObject.indexOf('{', replaceMatch.index + replaceMatch[0].length)
  if (objectStart < 0) return []
  const objectEnd = findMatchingBrace(localeObject, objectStart)
  if (objectEnd < 0) return []

  const replacements: Array<[string, string]> = []
  const objectText = localeObject.slice(objectStart, objectEnd + 1)
  for (const match of objectText.matchAll(OBJECT_PAIR_RE)) {
    const pattern = unescapeTsString(match[1])
    if (pattern) replacements.push([pattern, unescapeTsString(match[2])])
  }
  return replacements
}

function replaceName(name: string, pattern: string, replacement: string): string {
  try {
    return name.replace(new RegExp(pattern, 'g'), () => replacement)
  } catch {
    return name.split(pattern).join(replacement)
  }
}

function findObjectStartBefore(text: string, index: number): number {
  for (let cursor = index; cursor >= 0; cursor--) {
    if (text[cursor] === '{') return cursor
  }
  return -1
}

function findMatchingBrace(text: string, start: number): number {
  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`') quote = character
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) return index
  }
  return -1
}

function unescapeTsString(text: string): string {
  return text.replace(/\\(u[0-9A-Fa-f]{4}|.)/g, (_match, token: string) => {
    if (/^u[0-9a-f]{4}$/i.test(token)) return String.fromCharCode(Number.parseInt(token.slice(1), 16))
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[token] ?? token
  })
}

function cloneLine(line: CactbotLine): CactbotLine {
  return { ...line, conditions: { ...line.conditions } }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
