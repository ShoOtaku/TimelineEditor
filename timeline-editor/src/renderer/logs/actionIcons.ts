// XIVAPI 技能图标解析：技能 guid → 完整图标 URL
// 优先查本地国服 Action 库（data/action-names-cn.json）的图标 id → xivapi 静态 CDN
// （静态图标不随 API 数据冻结，7.x 新技能图标也可用）；本地没有再走 xivapi/cafemaker API
// 模块级缓存（含失败 null 不重试）、并发上限、单请求超时、全部 settle 不抛错

import { actionIconUrl } from '@shared/actionNameTypes'
import { loadActionNames } from './actionNames'

const BASES = ['https://xivapi.com', 'https://cafemaker.wakingsands.com']
const CONCURRENCY = 6
const TIMEOUT_MS = 10000

const cache = new Map<number, string | null>()

async function fetchIcon(guid: number): Promise<string | null> {
  for (const base of BASES) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${base}/action/${guid}?columns=Icon`, { signal: ctrl.signal })
      if (!res.ok) continue
      const data = await res.json() as { Icon?: string }
      if (data.Icon) return base + data.Icon
    } catch {
      // 网络失败/超时 → 尝试下一个源
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/** 批量解析技能图标；返回 guid → 完整 URL（解析失败的 guid 缺席）。永不抛错 */
export async function resolveActionIcons(guids: number[]): Promise<Record<number, string>> {
  const unique = [...new Set(guids)]
  // 本地中文名库附带的图标 id 直接拼静态 URL（失败过的缓存也用它覆盖）
  const names = await loadActionNames()
  if (names) {
    for (const guid of unique) {
      const iconId = names.actions[guid]?.[1]
      if (iconId && !cache.get(guid)) cache.set(guid, actionIconUrl(iconId))
    }
  }
  const pending = unique.filter(g => !cache.has(g))
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const guid = pending[cursor++]
      cache.set(guid, await fetchIcon(guid))
    }
  })
  await Promise.all(workers)
  const out: Record<number, string> = {}
  for (const guid of unique) {
    const url = cache.get(guid)
    if (url) out[guid] = url
  }
  return out
}
