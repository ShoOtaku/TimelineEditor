// cactbot 时间轴下载 浏览器直连 —— api.github.com / raw.githubusercontent.com 均返回
// Access-Control-Allow-Origin: *。逻辑对齐 src/main/cactbotIpc.ts（缓存/校验语义一致）。

import { buildCactbotCatalog, isAllowedCactbotPath } from '@shared/cactbotCatalog'
import type {
  CactbotCatalogFile, CactbotCatalogResult, CactbotDownloadResult,
  GitHubTreeResponse, ProxyTestResult
} from '@shared/cactbotTypes'

const API_URL = 'https://api.github.com/repos/OverlayPlugin/cactbot/git/trees/main?recursive=1'
const TEST_URL = 'https://api.github.com/repos/OverlayPlugin/cactbot'
const RAW_BASE = 'https://raw.githubusercontent.com/OverlayPlugin/cactbot/main/'
const REQUEST_TIMEOUT_MS = 15_000

export class WebCactbot {
  private catalogCache: CactbotCatalogFile[] | null = null
  private catalogTruncated = false
  private connectionProbeSequence = 0

  async listFiles(refresh = false): Promise<CactbotCatalogResult> {
    if (this.catalogCache && !refresh) {
      return { success: true, files: this.catalogCache, truncated: this.catalogTruncated }
    }
    try {
      const response = await fetchWithTimeout(API_URL, refresh)
      ensureSuccess(response, 'GitHub API')
      const payload = await response.json() as GitHubTreeResponse
      if (!Array.isArray(payload.tree)) throw new Error('GitHub API 返回的文件树为空')
      this.catalogCache = buildCactbotCatalog(payload)
      this.catalogTruncated = payload.truncated === true
      return { success: true, files: this.catalogCache, truncated: this.catalogTruncated }
    } catch (error) {
      return { success: false, error: formatNetworkError(error) }
    }
  }

  async downloadFile(path: string, hasLocalization: boolean): Promise<CactbotDownloadResult> {
    if (typeof path !== 'string' || !isAllowedCactbotPath(path, '.txt')) {
      return { success: false, error: '时间轴路径不在允许的 cactbot 数据目录中' }
    }
    try {
      const timelineResponse = await fetchWithTimeout(RAW_BASE + path)
      ensureSuccess(timelineResponse, '时间轴下载')
      const timelineText = await timelineResponse.text()
      const localization = hasLocalization
        ? await this.tryDownloadLocalization(path.slice(0, -4) + '.ts')
        : { text: null, warning: undefined }
      return {
        success: true,
        timelineText,
        localizationText: localization.text,
        localizationWarning: localization.warning
      }
    } catch (error) {
      return { success: false, error: formatNetworkError(error) }
    }
  }

  private async tryDownloadLocalization(path: string): Promise<{ text: string | null; warning?: string }> {
    if (!isAllowedCactbotPath(path, '.ts')) {
      return { text: null, warning: '本地化路径无效，已跳过中文本地化' }
    }
    try {
      const response = await fetchWithTimeout(RAW_BASE + path)
      if (!response.ok) return { text: null, warning: `本地化文件下载失败: HTTP ${response.status}` }
      return { text: await response.text() }
    } catch (error) {
      return { text: null, warning: `本地化文件下载失败: ${formatNetworkError(error)}` }
    }
  }

  async testConnection(): Promise<ProxyTestResult> {
    const startedAt = performance.now()
    try {
      const url = new URL(TEST_URL)
      url.searchParams.set('_timeline_editor_probe', `${Date.now()}-${this.connectionProbeSequence++}`)
      const response = await fetchWithTimeout(url.toString(), true)
      ensureSuccess(response, 'GitHub 连接测试')
      return {
        success: true,
        latencyMs: Math.round(performance.now() - startedAt),
        // 浏览器无法感知系统代理
        resolvedProxy: 'DIRECT',
        status: response.status
      }
    } catch (error) {
      return { success: false, error: formatNetworkError(error) }
    }
  }
}

async function fetchWithTimeout(url: string, bypassCache = false): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      cache: bypassCache ? 'no-store' : 'default',
      headers: { Accept: 'application/vnd.github+json, text/plain;q=0.9, */*;q=0.8' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

function ensureSuccess(response: Response, label: string): void {
  if (!response.ok) throw new Error(`${label}失败: HTTP ${response.status}`)
}

function formatNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return '请求超时（15 秒）'
  return error instanceof Error ? error.message : String(error)
}
