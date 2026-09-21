import type {
  FflogsActor, FflogsCastEvent, FflogsFight, FflogsReportInfo
} from '../shared/fflogsTypes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function parseFight(raw: unknown): FflogsFight | null {
  if (!isRecord(raw)) return null
  const id = asNumber(raw.id)
  const startTime = asNumber(raw.start_time)
  const endTime = asNumber(raw.end_time)
  if (id === undefined || startTime === undefined || endTime === undefined) return null
  return {
    id,
    start_time: startTime,
    end_time: endTime,
    name: asString(raw.name),
    zoneName: asString(raw.zoneName),
    kill: asBoolean(raw.kill),
    boss: asNumber(raw.boss)
  }
}

function parseActor(raw: unknown): FflogsActor | null {
  if (!isRecord(raw)) return null
  const id = asNumber(raw.id)
  const name = asString(raw.name)
  const type = asString(raw.type)
  if (id === undefined || name === undefined || type === undefined) return null
  return {
    id,
    name,
    type,
    subType: asString(raw.subType),
    icon: asString(raw.icon)
  }
}

function parseActorList(raw: unknown): FflogsActor[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseActor).filter((actor): actor is FflogsActor => actor !== null)
}

/** 解析 /report/fights/{code} 原始响应，只保留契约需要的字段 */
export function parseReportInfo(raw: unknown, code: string): FflogsReportInfo {
  if (!isRecord(raw)) throw new Error('FFLogs 返回的报告数据格式无效')
  const apiError = extractApiError(raw)
  if (apiError) throw new Error(apiError)
  if (!Array.isArray(raw.fights)) throw new Error('FFLogs 返回的报告缺少 fights 列表')
  return {
    code,
    title: asString(raw.title) ?? code,
    start: asNumber(raw.start) ?? 0,
    end: asNumber(raw.end) ?? 0,
    lang: asString(raw.lang),
    fights: raw.fights.map(parseFight).filter((fight): fight is FflogsFight => fight !== null),
    friendlies: parseActorList(raw.friendlies),
    enemies: parseActorList(raw.enemies)
  }
}

function parseCastEvent(raw: unknown): FflogsCastEvent | null {
  if (!isRecord(raw)) return null
  const timestamp = asNumber(raw.timestamp)
  const type = asString(raw.type)
  const sourceID = asNumber(raw.sourceID)
  const ability = isRecord(raw.ability) ? raw.ability : null
  const abilityName = ability ? asString(ability.name) : undefined
  if (timestamp === undefined || type === undefined || sourceID === undefined || !abilityName) {
    return null
  }
  return {
    timestamp,
    type,
    sourceID,
    sourceIsFriendly: raw.sourceIsFriendly === true,
    ability: { name: abilityName, guid: ability ? asNumber(ability.guid) : undefined }
  }
}

/** 合并 /report/events/casts 分页响应，过滤无 ability.name 的事件 */
export function mergeCastPages(pages: unknown[]): FflogsCastEvent[] {
  const events: FflogsCastEvent[] = []
  for (const page of pages) {
    if (!isRecord(page) || !Array.isArray(page.events)) continue
    for (const rawEvent of page.events) {
      const event = parseCastEvent(rawEvent)
      if (event) events.push(event)
    }
  }
  return events
}

/** FFLogs 错误响应形如 { status: 400, error: '...' }，HTTP 200 也可能携带 error */
export function extractApiError(raw: unknown): string | null {
  if (!isRecord(raw)) return null
  return typeof raw.error === 'string' && raw.error ? raw.error : null
}
