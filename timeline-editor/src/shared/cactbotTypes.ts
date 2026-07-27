import type { PtlDocument } from './prTypes'

export type ProxyProtocol = 'http' | 'socks5'

export interface ProxySettings {
  enabled: boolean
  protocol: ProxyProtocol
  host: string
  port: number
}

export interface AppSettings {
  aeDirectory: string
  prDirectory: string
  proxy: ProxySettings
}

export interface CactbotCatalogFile {
  path: string
  localizationPath: string | null
  fileName: string
  versionFolder: string
  versionLabel: string
  subFolder: string
  categoryLabel: string
  categorySort: number
  size: number
}

export interface GitHubTreeEntry {
  path: string
  type: string
  size?: number
}

export interface GitHubTreeResponse {
  truncated?: boolean
  tree?: GitHubTreeEntry[]
}

export type CactbotLineType =
  | 'timeline-entry'
  | 'label'
  | 'comment'
  | 'section-header'
  | 'control'
  | 'unknown'

export interface CactbotLine {
  lineNumber: number
  rawText: string
  lineType: CactbotLineType
  time: number
  name: string
  eventType: string | null
  isCommentedSync: boolean
  conditions: Record<string, string>
  labelName: string | null
  jumpTargetLabel: string | null
  jumpTargetTime: number | null
  isForceJump: boolean
  duration: number | null
  windowBefore: number | null
  windowAfter: number | null
  isFallback: boolean
  hasComplexId: boolean
  isCommentedEntry: boolean
  note: string | null
}

export interface CactbotLocalizationResult {
  lines: CactbotLine[]
  replacementRuleCount: number
  localizedLineCount: number
  warning: string | null
}

export interface CactbotImportOptions {
  deduplicateSync: boolean
  markTechnicalAnchors: boolean
}

export interface CactbotImportStats {
  totalLines: number
  importedCount: number
  fallbackCount: number
  skippedCount: number
  commentedEntryCount: number
  complexIdCount: number
  deduplicatedCount: number
  labelCount: number
  jumpCount: number
  resolvedJumpCount: number
  unresolvedJumpCount: number
  warnings: string[]
}

export interface CactbotImportResult {
  document: PtlDocument
  stats: CactbotImportStats
}

export interface CactbotCatalogResult {
  success: boolean
  files?: CactbotCatalogFile[]
  truncated?: boolean
  error?: string
}

export interface CactbotDownloadResult {
  success: boolean
  timelineText?: string
  localizationText?: string | null
  localizationWarning?: string
  error?: string
}

export interface ProxyTestResult {
  success: boolean
  latencyMs?: number
  resolvedProxy?: string
  status?: number
  error?: string
}
