import type { CactbotLine } from '@shared/cactbotTypes'

const TIMELINE_RE = /^\s*(\d+(?:\.\d+)?)\s+"([^"]*)"\s*(.*)$/
const LABEL_RE = /^\s*(\d+(?:\.\d+)?)\s+label\s+"([^"]+)"\s*$/i
const EVENT_RE = /^(#?\w+)\s*(.*)$/
const CONDITION_RE = /\{([^}]*)\}/
const KV_RE = /(\w+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(\[.*?\])|([^,}\s]+))/g
const JUMP_RE = /\b(forcejump|jump)\s+(?:"([^"]+)"|'([^']+)'|(\d+(?:\.\d+)?))/i
const DURATION_RE = /\bduration\s+(\d+(?:\.\d+)?)/i
const WINDOW_RE = /\bwindow\s+(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i
const COMMENTED_EVENT_RE = /^#\s+(Ability|StartsUsing|InCombat|RemovedCombatant|MapEffect|Tether|ActorControl|ActorControlExtra|AddedCombatant|NpcYell)\b/i
const COMPLEX_ID_RE = /[\[\]()|.*+?{}\\^$]/
const ID_OPTIONAL_EVENTS = new Set([
  'INCOMBAT', 'REMOVEDCOMBATANT', 'MAPEFFECT', 'ACTORCONTROL',
  'ACTORCONTROLEXTRA', 'ADDEDCOMBATANT', 'NPCYELL'
])

export function parseCactbotTimeline(text: string): CactbotLine[] {
  if (!text) return []
  return text.split(/\r\n|\n|\r/).map((rawText, index) => parseLine(index + 1, rawText))
}

function parseLine(lineNumber: number, rawText: string): CactbotLine {
  const trimmed = rawText.trim()
  if (!trimmed) return createLine(lineNumber, rawText)
  if (trimmed.startsWith('###')) return createLine(lineNumber, rawText, 'section-header')
  if (/^hideall/i.test(trimmed)) return createLine(lineNumber, rawText, 'control')

  const label = parseLabel(lineNumber, rawText, trimmed)
  if (label) return label

  if (trimmed.startsWith('#')) {
    const entry = parseTimelineEntry(lineNumber, rawText, trimmed.replace(/^#+\s*/, ''))
    if (!entry) return createLine(lineNumber, rawText, 'comment')
    entry.isCommentedEntry = true
    entry.note = '被注释的时间轴行'
    return entry
  }

  return parseTimelineEntry(lineNumber, rawText, trimmed) ?? {
    ...createLine(lineNumber, rawText),
    note: '无法识别的行'
  }
}

function parseLabel(lineNumber: number, rawText: string, text: string): CactbotLine | null {
  const match = LABEL_RE.exec(text)
  if (!match) return null
  return {
    ...createLine(lineNumber, rawText, 'label'),
    time: Number(match[1]),
    name: match[2],
    labelName: match[2]
  }
}

function parseTimelineEntry(lineNumber: number, rawText: string, text: string): CactbotLine | null {
  const match = TIMELINE_RE.exec(text)
  if (!match) return null

  const line = createLine(lineNumber, rawText, 'timeline-entry')
  line.time = Number(match[1])
  line.name = match[2]
  let rest = match[3].trim()

  ;({ rest, value: line.duration } = extractNumber(rest, DURATION_RE))
  ;({ rest, before: line.windowBefore, after: line.windowAfter } = extractWindow(rest))
  rest = normalizeCommentedEvent(rest).replace(/\s+#\s+.*$/, '').trim()
  rest = extractJump(rest, line)
  rest = extractEvent(rest, line)
  extractConditions(rest, line.conditions)
  finalizeEntry(line)
  return line
}

function extractNumber(rest: string, regex: RegExp): { rest: string; value: number | null } {
  const match = regex.exec(rest)
  if (!match) return { rest, value: null }
  return {
    rest: removeMatch(rest, match),
    value: Number(match[1])
  }
}

function extractWindow(rest: string): { rest: string; before: number | null; after: number | null } {
  const match = WINDOW_RE.exec(rest)
  if (!match) return { rest, before: null, after: null }
  return {
    rest: removeMatch(rest, match),
    before: Number(match[1]),
    after: Number(match[2])
  }
}

function extractJump(rest: string, line: CactbotLine): string {
  const match = JUMP_RE.exec(rest)
  if (!match) return rest
  line.isForceJump = match[1].toLowerCase() === 'forcejump'
  line.jumpTargetLabel = match[2] || match[3] || null
  line.jumpTargetTime = match[4] ? Number(match[4]) : null
  return removeMatch(rest, match)
}

function extractEvent(rest: string, line: CactbotLine): string {
  if (!rest) return rest
  const match = EVENT_RE.exec(rest)
  if (!match) return rest
  line.eventType = match[1]
  line.isCommentedSync = match[1].startsWith('#')
  return match[2].trim()
}

function extractConditions(rest: string, conditions: Record<string, string>): void {
  const block = CONDITION_RE.exec(rest)
  if (!block) return
  for (const match of block[1].matchAll(KV_RE)) {
    conditions[match[1]] = match[2] ?? match[3] ?? match[4] ?? match[5]
  }
}

function finalizeEntry(line: CactbotLine): void {
  const event = line.eventType?.replace(/^#/, '').toUpperCase() ?? ''
  line.isFallback = !event || (!line.conditions.id && !ID_OPTIONAL_EVENTS.has(event))
  if (line.conditions.id && COMPLEX_ID_RE.test(line.conditions.id)) {
    line.hasComplexId = true
    line.note = `复杂ID模式: ${line.conditions.id}`
  }
  if (line.isCommentedSync) {
    line.windowBefore = null
    line.windowAfter = null
    line.jumpTargetLabel = null
    line.jumpTargetTime = null
    line.isForceJump = false
  }
}

function normalizeCommentedEvent(rest: string): string {
  const match = COMMENTED_EVENT_RE.exec(rest)
  return match ? `#${match[1]}${rest.slice(match[0].length)}` : rest
}

function removeMatch(text: string, match: RegExpExecArray): string {
  return (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim()
}

function createLine(
  lineNumber: number,
  rawText: string,
  lineType: CactbotLine['lineType'] = 'unknown'
): CactbotLine {
  return {
    lineNumber,
    rawText,
    lineType,
    time: 0,
    name: '',
    eventType: null,
    isCommentedSync: false,
    conditions: {},
    labelName: null,
    jumpTargetLabel: null,
    jumpTargetTime: null,
    isForceJump: false,
    duration: null,
    windowBefore: null,
    windowAfter: null,
    isFallback: false,
    hasComplexId: false,
    isCommentedEntry: false,
    note: null
  }
}
