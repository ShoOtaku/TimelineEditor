// 战斗日志(FF14 技能时间轴)文档模型 — 参考 ccinos.github.io/act_dps_show/v3

export interface LogsEvent {
  id: string
  timeMs: number
  text: string
  /** 读条时长 ms；无 = 瞬发 */
  durationMs?: number
  /** 技能图标 URL */
  icon?: string
  /** 技能名（事件块标注用） */
  skillName?: string
  /** 技能 ID（FFLogs ability guid，展示用） */
  skillId?: number
  dmg?: number
  dmgType?: 'normal' | 'magic' | 'true'
}

export interface LogsGcdUse {
  id: string
  timeMs: number
  skill: string
  /** 技能 ID（FFLogs ability guid 或本地库反查，展示用） */
  skillId?: number
}

export interface LogsSkillUse {
  id: string
  timeMs: number
}

export interface LogsSkillColumn {
  id: string
  /** ability = 独占一列的能力技；gcd = GCD 轨道上跟踪的技能 */
  kind: 'ability' | 'gcd'
  /** 显示名（可覆盖/别名） */
  name: string
  /** 日志匹配名（默认同 name；如别名「翅膀」匹配「武装戍卫」） */
  matchName?: string
  /** 图标 URL 覆盖 */
  icon?: string
  cd?: number
  duration?: number
  duration2?: number
  cast?: number
  count?: number
  dmgType?: string
  intro?: string
  lv?: number
  /** 技能 ID（FFLogs ability guid 或本地库反查，展示用） */
  skillId?: number
}

export interface LogsTimelineDoc {
  $type: 'LogsTimeline'
  version: 1
  name: string
  /** 时间轴长度，默认 600000 (10 分钟) */
  lengthMs: number
  /** 时间轴提前量：渲染时整体偏移，默认 0 */
  offsetMs: number
  /** GCD 秒，默认 2.5 */
  gcdDuration: number
  events: LogsEvent[]
  gcds: LogsGcdUse[]
  /** ability 列（数组序 = 显示顺序）与 gcd 跟踪技能 */
  columns: LogsSkillColumn[]
  /** key = ability 列 id，按 timeMs 升序 */
  skillUses: Record<string, LogsSkillUse[]>
}

/** applyImport 的入参形状（fflogsImport.buildImportPayload 生成） */
export interface LogsImportPayload {
  events?: {
    timeMs: number
    text: string
    durationMs?: number
    icon?: string
    skillName?: string
    skillId?: number
    dmg?: number
    dmgType?: 'normal' | 'magic' | 'true'
  }[]
  gcds?: { timeMs: number; skill: string; skillId?: number }[]
  skillUses?: Record<string, { timeMs: number }[]>
  /** 列 id → 技能 ID（导入时从日志 guid 解析，展示用） */
  columnSkillIds?: Record<string, number>
  lengthMs?: number
}

export const LOGS_DEFAULT_LENGTH_MS = 600000
export const LOGS_DEFAULT_GCD = 2.5

export function newId(): string {
  return crypto.randomUUID()
}

export function createEmptyDoc(name: string): LogsTimelineDoc {
  return {
    $type: 'LogsTimeline',
    version: 1,
    name,
    lengthMs: LOGS_DEFAULT_LENGTH_MS,
    offsetMs: 0,
    gcdDuration: LOGS_DEFAULT_GCD,
    events: [],
    gcds: [],
    columns: [],
    skillUses: {}
  }
}

export function isLogsTimelineDoc(v: unknown): v is LogsTimelineDoc {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return d.$type === 'LogsTimeline' &&
    typeof d.name === 'string' &&
    typeof d.lengthMs === 'number' &&
    Array.isArray(d.events) &&
    Array.isArray(d.gcds) &&
    Array.isArray(d.columns) &&
    typeof d.skillUses === 'object' && d.skillUses !== null
}

/** 列的日志匹配名（FFLogs cast ability.name 与之比对） */
export function columnMatchName(col: Pick<LogsSkillColumn, 'name' | 'matchName'>): string {
  return col.matchName?.trim() || col.name
}

/** m:ss.s；>= 1h 用 h:mm:ss */
export function formatTimeMs(ms: number): string {
  const neg = ms < 0
  const abs = Math.abs(Math.round(ms))
  const totalSec = Math.floor(abs / 1000)
  const tenth = Math.floor((abs % 1000) / 100)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const sign = neg ? '-' : ''
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${sign}${m}:${String(s).padStart(2, '0')}.${tenth}`
}

/** 解析 m:ss / m:ss.s / h:mm:ss / 秒数（可带小数）→ ms；无法解析返回 null */
export function parseTimeInput(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const colon = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(t)
  if (colon) {
    const ms = colon[3] ? parseInt(colon[3].padEnd(3, '0'), 10) : 0
    return parseInt(colon[1], 10) * 60000 + parseInt(colon[2], 10) * 1000 + ms
  }
  const hour = /^(\d+):([0-5]?\d):([0-5]?\d)$/.exec(t)
  if (hour) {
    return parseInt(hour[1], 10) * 3600000 + parseInt(hour[2], 10) * 60000 + parseInt(hour[3], 10) * 1000
  }
  const sec = /^-?\d+(?:\.\d+)?$/.exec(t)
  if (sec) return Math.round(parseFloat(t) * 1000)
  return null
}

/** 按 timeMs 升序插入（immer draft 内直接调用）；返回插入下标 */
export function insertByTime<T extends { timeMs: number }>(arr: T[], item: T): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].timeMs <= item.timeMs) lo = mid + 1
    else hi = mid
  }
  arr.splice(lo, 0, item)
  return lo
}

/** 同 timeMs 去重（保留先出现的一条），输入需已按 timeMs 升序 */
export function dedupeByTime<T extends { timeMs: number }>(arr: T[], key?: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of arr) {
    const k = key ? key(item) : String(item.timeMs)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}
