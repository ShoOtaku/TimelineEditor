// FFLogs v1 (classic) API 类型与 IPC 契约
// 主进程代理访问 https://cn.fflogs.com/v1/*（避免 CORS，走系统/用户代理）

/** 参考页面使用的公开 API key，用户可在导入向导中替换为自己的 key */
export const DEFAULT_FFLOGS_API_KEY = '184a0cc2cd961346f91397dae0f38630'

export const FFLOGS_API_BASE = 'https://cn.fflogs.com/v1'

export interface FflogsFight {
  id: number
  start_time: number
  end_time: number
  name?: string
  zoneName?: string
  kill?: boolean
  boss?: number
}

export interface FflogsActor {
  id: number
  name: string
  type: string // 'Boss' | 'NPC' | 'Paladin' ... | 'LimitBreak'
  subType?: string
  icon?: string
}

/** /report/fights/{code} 的精简结果 */
export interface FflogsReportInfo {
  code: string
  title: string
  start: number
  end: number
  lang?: string
  fights: FflogsFight[]
  friendlies: FflogsActor[]
  enemies: FflogsActor[]
}

export interface FflogsCastEvent {
  timestamp: number
  type: string // 'cast' | 'begincast' | ...
  sourceID: number
  sourceIsFriendly: boolean
  ability: { name: string; guid?: number; type?: number }
}

export interface FflogsFetchCastsRequest {
  /** 渲染进程生成的请求标识，用于区分并发下载的进度事件与取消 */
  requestId: string
  code: string
  apiKey?: string
  start: number
  end: number
  /** 0 = 友方（玩家技能），1 = 敌方（BOSS 事件） */
  hostility: 0 | 1
  /** 请求中文技能名 */
  translate: boolean
}

export type FflogsResult<T> = { success: true; data: T } | { success: false; error: string }

/** 主进程 -> 渲染进程的下载进度事件（通道 'fflogs:progress'） */
export interface FflogsFetchProgress {
  /** 同一次 fetchCasts 调用标识 */
  requestId: string
  percent: number
  page: number
  events: number
}

/** 从 URL 或裸 code 提取报告 code（支持 fflogs.com / ffxivlogs.cn） */
export function extractFflogsReportCode(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const m = /reports\/([A-Za-z0-9]+)/.exec(trimmed)
  if (m) return m[1]
  return /^[A-Za-z0-9]{6,32}$/.test(trimmed) ? trimmed : null
}
