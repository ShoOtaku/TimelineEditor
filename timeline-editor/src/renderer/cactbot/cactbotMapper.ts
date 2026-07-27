import type { PtlAnchor, PtlDocument, PtlSyncRule } from '@shared/prTypes'
import type {
  CactbotImportOptions, CactbotImportResult, CactbotImportStats, CactbotLine
} from '@shared/cactbotTypes'
import { CactbotTimeMap, isResetCactbotJump } from './cactbotTimeMap'

const TIME_EPSILON = 0.0001
const TIME_STEP = 0.001
const CAST_MARKER_RE = /\s*[（(](?:cast|castbar|咏唱|詠唱)[)）]\??/i
const REGEX_KEYS = new Set([
  'id', 'sourceId', 'targetId', 'source', 'target', 'name', 'command',
  'data0', 'data1', 'data2', 'data3', 'npcYellId', 'npcNameId', 'npcBaseId'
])

export function mapCactbotToDocument(
  lines: readonly CactbotLine[],
  name: string,
  options: CactbotImportOptions
): CactbotImportResult {
  const stats = createStats(lines.length)
  const timeMap = new CactbotTimeMap(lines)
  const usedTimes: number[] = []
  const anchors: PtlAnchor[] = []

  for (const line of lines) {
    const anchor = mapLine(line, timeMap, usedTimes, options, stats)
    if (anchor) anchors.push(anchor)
  }

  anchors.sort((a, b) => a.Time - b.Time || a.Guid.localeCompare(b.Guid))
  normalizeAnchorTimes(anchors)
  stats.importedCount = anchors.length
  if (options.deduplicateSync) deduplicateSyncs(anchors, stats)

  return { document: buildDocument(anchors, name), stats }
}

function mapLine(
  line: CactbotLine,
  timeMap: CactbotTimeMap,
  usedTimes: number[],
  options: CactbotImportOptions,
  stats: CactbotImportStats
): PtlAnchor | null {
  if (line.lineType === 'label') {
    stats.labelCount++
    return createAnchor(`Label: ${line.labelName ?? line.name}`, reserveTime(timeMap.get(line), usedTimes), {
      isPhase: true,
      isTechnical: options.markTechnicalAnchors,
      remark: 'cactbot label'
    })
  }
  if (line.lineType !== 'timeline-entry' || line.isCommentedEntry || isResetCactbotJump(line)) {
    if (line.isCommentedEntry) stats.commentedEntryCount++
    stats.skippedCount++
    return null
  }

  if (line.hasComplexId) stats.complexIdCount++
  if (line.isFallback) stats.fallbackCount++
  const friendlyTime = timeMap.get(line)
  const sync = buildSyncRule(line, friendlyTime, timeMap, stats)
  const event = eventKind(line)
  const actorControl = event === 'ACTORCONTROL' || event === 'ACTORCONTROLEXTRA'
  return createAnchor(buildAnchorName(line), reserveTime(friendlyTime, usedTimes), {
    enabled: true,
    isTechnical: options.markTechnicalAnchors && isTechnicalAnchor(line, sync),
    remark: actorControl ? `ActorControl 暂按纯延迟锚点导入。原始行: ${line.rawText}` : null,
    sync: actorControl ? null : sync
  })
}

function buildSyncRule(
  line: CactbotLine,
  friendlyTime: number,
  timeMap: CactbotTimeMap,
  stats: CactbotImportStats
): PtlSyncRule | null {
  if (line.isCommentedSync || line.isFallback || !line.eventType) {
    warnUnsupportedJump(line, stats)
    return null
  }

  const type = ({
    ABILITY: 'ActionEffect',
    STARTSUSING: 'CastStart',
    INCOMBAT: 'InCombat',
    ADDEDCOMBATANT: 'AddedCombatant',
    NPCYELL: 'NpcYell'
  } as Record<string, string>)[eventKind(line)]
  if (!type) {
    warnUnsupportedJump(line, stats)
    return null
  }

  const rule = createSync(type)
  applyJump(rule, line, friendlyTime, timeMap, stats)
  if (type === 'ActionEffect' || type === 'CastStart') applyActionId(rule, line)
  applyEventParams(rule, line)
  if (line.windowBefore !== null) rule.WindowBefore = line.windowBefore
  if (line.windowAfter !== null) rule.WindowAfter = line.windowAfter
  return rule
}

function applyJump(
  rule: PtlSyncRule,
  line: CactbotLine,
  friendlyTime: number,
  timeMap: CactbotTimeMap,
  stats: CactbotImportStats
): void {
  if (line.jumpTargetTime !== null) {
    stats.jumpCount++
    stats.resolvedJumpCount++
    rule.MatchTime = friendlyTime
    rule.JumpTargetTime = timeMap.convert(line.jumpTargetTime)
    rule.IsForceJump = line.isForceJump
    return
  }
  if (!line.jumpTargetLabel) return
  stats.jumpCount++
  rule.MatchTime = friendlyTime
  rule.IsForceJump = line.isForceJump
  const target = timeMap.getLabel(line.jumpTargetLabel)
  if (target !== null) {
    stats.resolvedJumpCount++
    rule.JumpTargetTime = target
  } else {
    stats.unresolvedJumpCount++
    stats.warnings.push(`第 ${line.lineNumber} 行未找到跳转标签 ${line.jumpTargetLabel}`)
  }
}

function applyActionId(rule: PtlSyncRule, line: CactbotLine): void {
  const id = getCondition(line, 'id')
  if (!id) return
  const array = expandArray(id, true)
  const expanded = array ?? (line.hasComplexId && looksLikeHexPattern(id) ? expandHexPattern(id) : null)
  if (expanded) {
    addActionPattern(rule, expanded)
  } else if (line.hasComplexId) {
    rule.Params.Regex = anchorRegex(id)
  } else {
    rule.Params.ActionId = containsHexLetter(id) ? hexToDecimal(id) ?? id : id
  }
}

function applyEventParams(rule: PtlSyncRule, line: CactbotLine): void {
  const event = eventKind(line)
  if (event === 'ADDEDCOMBATANT') {
    const hasNpc = addMappedParam(rule, line, 'npcNameId', 'NpcNameId', false) ||
      addMappedParam(rule, line, 'npcBaseId', 'NpcBaseId', false)
    addMappedParam(rule, line, 'id', 'SourceId', true)
    if (!hasNpc) addMappedParam(rule, line, 'name', 'Name', false)
  }
  if (event === 'NPCYELL') {
    addMappedParam(rule, line, 'id', 'SourceId', true)
    addMappedParam(rule, line, 'npcNameId', 'NpcNameId', true)
    addMappedParam(rule, line, 'npcYellId', 'NpcYellId', true)
  }
}

function addMappedParam(
  rule: PtlSyncRule,
  line: CactbotLine,
  conditionKey: string,
  paramKey: string,
  forceHex: boolean
): boolean {
  const raw = getCondition(line, conditionKey)
  if (!raw) return false
  const normalized = normalizeCondition(raw, forceHex)
  if (!normalized) return false
  if (REGEX_KEYS.has(conditionKey) && isRegexLike(raw) && !normalized.includes('|')) {
    rule.Params[`Regex:${paramKey}`] = anchorRegex(normalized)
  } else {
    rule.Params[paramKey] = normalized
  }
  return true
}

function normalizeCondition(raw: string, forceHex: boolean): string {
  const array = expandArray(raw, forceHex)
  if (array) return array
  const expanded = expandHexPattern(raw)
  if (expanded && (forceHex || containsHexLetter(raw))) return expanded
  if (isRegexLike(raw)) return raw.trim()
  return forceHex || containsHexLetter(raw) ? hexToDecimal(raw.trim()) ?? raw.trim() : raw.trim()
}

function deduplicateSyncs(anchors: PtlAnchor[], stats: CactbotImportStats): void {
  for (let index = 0; index < anchors.length; index++) {
    const current = anchors[index]
    const identity = syncIdentity(current.Sync)
    if (!current.Sync || !identity) continue
    for (let nextIndex = index + 1; nextIndex < anchors.length; nextIndex++) {
      const next = anchors[nextIndex]
      if (next.Time - current.Time >= 5) break
      if (!next.Sync || next.Sync.Type !== current.Sync.Type) continue
      if (syncIdentity(next.Sync) !== identity || hasMeaningfulJump(next)) continue
      next.Sync = null
      stats.deduplicatedCount++
    }
  }
}

function buildDocument(source: PtlAnchor[], name: string): PtlDocument {
  const anchors = source.filter(anchor => !anchor.IsEndAnchor)
    .filter(anchor => anchor.Time > 0.01 || anchor.Sync?.Type === 'InCombat')
  if (anchors[0]?.Sync?.Type === 'InCombat' && Math.abs(anchors[0].Time) <= 0.01) {
    anchors[0].Time = 0
  } else {
    anchors.unshift(createAnchor('开始', 0, { sync: createSync('InCombat') }))
  }
  const maxTime = Math.max(...anchors.map(anchor => anchor.Time))
  anchors.push(createAnchor('结束', maxTime + 30, { isEnd: true }))
  normalizeAnchorTimes(anchors)
  return {
    Version: 1,
    Meta: {
      Name: name,
      TerritoryId: 0,
      JobId: 0,
      Author: 'Cactbot import',
      CreatedAt: new Date().toISOString(),
      Remark: '由 Timeline Editor 从 OverlayPlugin/cactbot 导入'
    },
    Variables: [],
    Anchors: anchors,
    Entries: []
  }
}

function createAnchor(
  name: string,
  time: number,
  options: {
    enabled?: boolean; isPhase?: boolean; isEnd?: boolean; isTechnical?: boolean
    remark?: string | null; sync?: PtlSyncRule | null
  } = {}
): PtlAnchor {
  return {
    Guid: crypto.randomUUID(),
    Name: name,
    Time: time,
    IsPhaseAnchor: options.isPhase ?? false,
    IsEndAnchor: options.isEnd ?? false,
    IsCommentAnchor: false,
    IsTechnicalAnchor: options.isTechnical ?? false,
    Enabled: options.enabled ?? true,
    Remark: options.remark ?? null,
    Sync: options.sync ?? null
  }
}

function createSync(type: string): PtlSyncRule {
  return {
    Type: type,
    Params: {},
    MatchTime: null,
    JumpTargetTime: null,
    IsForceJump: false,
    WindowBefore: 0,
    WindowAfter: 0
  }
}

function createStats(totalLines: number): CactbotImportStats {
  return {
    totalLines, importedCount: 0, fallbackCount: 0, skippedCount: 0,
    commentedEntryCount: 0, complexIdCount: 0, deduplicatedCount: 0,
    labelCount: 0, jumpCount: 0, resolvedJumpCount: 0, unresolvedJumpCount: 0,
    warnings: []
  }
}

function reserveTime(requested: number, used: number[]): number {
  let time = requested
  while (used.some(value => Math.abs(value - time) <= TIME_EPSILON)) time += TIME_STEP
  used.push(time)
  return time
}

function normalizeAnchorTimes(anchors: PtlAnchor[]): void {
  let previous = Number.NEGATIVE_INFINITY
  for (const anchor of anchors) {
    if (anchor.Time <= previous + TIME_EPSILON) anchor.Time = previous + TIME_STEP
    previous = anchor.Time
  }
}

function buildAnchorName(line: CactbotLine): string {
  const event = eventKind(line)
  const stripped = line.name.replace(CAST_MARKER_RE, '').trim()
  const hadCastMarker = stripped.length !== line.name.trim().length && stripped.length > 0
  if (event === 'ABILITY') return `${hadCastMarker ? stripped : line.name} ${hadCastMarker ? '读条' : '判定'}`
  if (event === 'STARTSUSING') return `${hadCastMarker ? stripped : line.name} 读条`
  return line.name
}

function isTechnicalAnchor(line: CactbotLine, sync: PtlSyncRule | null): boolean {
  return sync?.Type !== 'InCombat' && line.name.trim().startsWith('--') && line.name.trim().endsWith('--')
}

function eventKind(line: CactbotLine): string {
  return (line.eventType ?? '').replace(/^#/, '').toUpperCase()
}

function getCondition(line: CactbotLine, key: string): string | null {
  const actual = Object.keys(line.conditions).find(candidate => candidate.toLowerCase() === key.toLowerCase())
  return actual ? line.conditions[actual] : null
}

function addActionPattern(rule: PtlSyncRule, value: string): void {
  if (value.includes('|')) rule.Params.Regex = anchorRegex(value)
  else rule.Params.ActionId = value
}

function expandArray(value: string, forceHex: boolean): string | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  const items = [...trimmed.matchAll(/"([^"]+)"|'([^']+)'/g)]
  if (items.length === 0) return null
  return items.map(match => {
    const item = (match[1] ?? match[2]).trim()
    return forceHex || containsHexLetter(item) ? hexToDecimal(item) ?? item : item
  }).join('|')
}

function expandHexPattern(value: string): string | null {
  const match = /^([0-9A-Fa-f]*)\[([0-9A-Fa-f]+)]([0-9A-Fa-f]*)$/.exec(value)
  if (!match) return null
  const values = [...match[2]].map(character => hexToDecimal(match[1] + character + match[3]))
  return values.every(Boolean) ? values.join('|') : null
}

function containsHexLetter(value: string): boolean { return /[A-F]/i.test(value) }
function looksLikeHexPattern(value: string): boolean { return value.includes('[') && containsHexLetter(value) }
function hexToDecimal(value: string): string | null {
  return /^[0-9A-F]+$/i.test(value) ? Number.parseInt(value, 16).toString(10) : null
}
function isRegexLike(value: string): boolean {
  const trimmed = value.trim()
  return !(trimmed.startsWith('[') && trimmed.endsWith(']')) && /[\[\]()|.*+?{}\\^$]/.test(trimmed)
}
function anchorRegex(value: string): string {
  return value.startsWith('^') || value.endsWith('$') ? value : `^(?:${value})$`
}
function syncIdentity(sync: PtlSyncRule | null | undefined): string | null {
  return sync?.Params.ActionId ? `ActionId:${sync.Params.ActionId}` :
    sync?.Params.Regex ? `Regex:${sync.Params.Regex}` : null
}
function hasMeaningfulJump(anchor: PtlAnchor): boolean {
  if (anchor.Sync?.JumpTargetTime === null || anchor.Sync?.JumpTargetTime === undefined) return false
  return Math.abs(anchor.Sync.JumpTargetTime - (anchor.Sync.MatchTime ?? anchor.Time)) > TIME_EPSILON
}
function warnUnsupportedJump(line: CactbotLine, stats: CactbotImportStats): void {
  if (line.jumpTargetTime === null && !line.jumpTargetLabel) return
  stats.jumpCount++
  stats.unresolvedJumpCount++
  stats.warnings.push(`第 ${line.lineNumber} 行的 ${line.eventType ?? '未知事件'} 不支持跳转`)
}
