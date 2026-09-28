// FFLogs v1 API 浏览器直连 —— cn.fflogs.com 对简单 GET 返回 Access-Control-Allow-Origin: *，
// 无需主进程代理。逻辑对齐 src/main/fflogsIpc.ts（分页/进度/取消语义一致）。

import { DEFAULT_FFLOGS_API_KEY, FFLOGS_API_BASE } from '@shared/fflogsTypes'
import type {
  FflogsCastEvent, FflogsFetchCastsRequest, FflogsFetchProgress,
  FflogsReportInfo, FflogsResult
} from '@shared/fflogsTypes'
import { extractApiError, mergeCastPages, parseReportInfo } from '@shared/fflogsMapper'
import { Emitter } from './emitter'

const REQUEST_TIMEOUT_MS = 30_000
const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{6,32}$/

export class WebFflogs {
  private progress = new Emitter<FflogsFetchProgress>()
  private castRequests = new Map<string, { cancelled: boolean }>()

  onProgress = (callback: (p: FflogsFetchProgress) => void): (() => void) =>
    this.progress.on(callback)

  async cancelCasts(requestId: string): Promise<void> {
    const state = this.castRequests.get(requestId)
    if (state) state.cancelled = true
  }

  async fetchReport(code: string, apiKey?: string): Promise<FflogsResult<FflogsReportInfo>> {
    if (typeof code !== 'string' || !REPORT_CODE_PATTERN.test(code)) {
      return { success: false, error: '报告代码格式无效' }
    }
    try {
      const response = await fetchWithTimeout(buildUrl(`/report/fights/${code}`, { api_key: resolveApiKey(apiKey) }))
      const payload = await readJsonWithApiError(response, 'FFLogs 报告请求')
      return { success: true, data: parseReportInfo(payload, code) }
    } catch (error) {
      return { success: false, error: formatNetworkError(error) }
    }
  }

  async fetchCasts(req: FflogsFetchCastsRequest): Promise<FflogsResult<FflogsCastEvent[]>> {
    const validationError = validateCastsRequest(req)
    if (validationError) return { success: false, error: validationError }

    const state = { cancelled: false }
    this.castRequests.set(req.requestId, state)
    try {
      const pages: unknown[] = []
      let pageStart = req.start
      let page = 0
      let eventCount = 0

      while (true) {
        if (state.cancelled) return { success: false, error: '已取消' }
        const response = await fetchWithTimeout(buildUrl(`/report/events/casts/${req.code}`, {
          hostility: String(req.hostility),
          start: String(pageStart),
          end: String(req.end),
          api_key: resolveApiKey(req.apiKey),
          ...(req.translate ? { translate: 'true' } : {})
        }))
        const payload = await readJsonWithApiError(response, 'FFLogs 事件请求')

        pages.push(payload)
        page += 1
        if (isRecord(payload) && Array.isArray(payload.events)) eventCount += payload.events.length

        const nextPageTimestamp = isRecord(payload) && typeof payload.nextPageTimestamp === 'number'
          ? payload.nextPageTimestamp
          : null
        this.progress.emit({
          requestId: req.requestId,
          percent: clampPercent(Math.round(((nextPageTimestamp ?? req.end) - req.start) / (req.end - req.start) * 100)),
          page,
          events: eventCount
        })

        if (nextPageTimestamp === null || nextPageTimestamp <= pageStart) break
        pageStart = nextPageTimestamp
      }

      return { success: true, data: mergeCastPages(pages) }
    } catch (error) {
      return { success: false, error: formatNetworkError(error) }
    } finally {
      this.castRequests.delete(req.requestId)
    }
  }
}

function validateCastsRequest(req: FflogsFetchCastsRequest): string | null {
  if (!req || typeof req !== 'object') return '请求参数无效'
  if (typeof req.requestId !== 'string' || !req.requestId) return '缺少 requestId'
  if (typeof req.code !== 'string' || !REPORT_CODE_PATTERN.test(req.code)) return '报告代码格式无效'
  if (typeof req.start !== 'number' || typeof req.end !== 'number' || !(req.start < req.end)) {
    return '时间范围无效（start 必须小于 end）'
  }
  if (req.hostility !== 0 && req.hostility !== 1) return 'hostility 必须是 0 或 1'
  return null
}

function resolveApiKey(apiKey?: string): string {
  return typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : DEFAULT_FFLOGS_API_KEY
}

function buildUrl(path: string, params: Record<string, string>): string {
  const url = new URL(FFLOGS_API_BASE + path)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

// FFLogs v1 的错误也走 JSON（{status, error}），即使是 4xx/5xx；优先取 API 错误文本
async function readJsonWithApiError(response: Response, label: string): Promise<unknown> {
  let payload: unknown = null
  try { payload = await response.json() } catch { payload = null }
  const apiError = extractApiError(payload)
  if (apiError) throw new Error(apiError)
  if (!response.ok) throw new Error(`${label}失败: HTTP ${response.status}`)
  return payload
}

function formatNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return '请求超时（30 秒）'
  return error instanceof Error ? error.message : String(error)
}
