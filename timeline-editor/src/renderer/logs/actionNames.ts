// 国服 Action 中文名库（data/action-names-cn.json，经 IPC 读取）模块级缓存
// FFLogs 对部分新技能/BOSS 技能缺少中文翻译（返回英文名），按 guid 本地翻译；
// 加载失败时整体降级为 FFLogs 原名，不影响导入流程

import type { ActionNameDatabase } from '@shared/actionNameTypes'

let cache: ActionNameDatabase | null = null
let pending: Promise<ActionNameDatabase | null> | null = null

/** 加载中文名库（只会请求一次；失败返回 null 并降级） */
export function loadActionNames(): Promise<ActionNameDatabase | null> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = (async () => {
      try {
        const result = await window.electronAPI.loadActionNames()
        if (result.success && result.data) cache = result.data
        else console.warn('Action 中文名库加载失败，将使用 FFLogs 原始名称:', result.error)
      } catch (err) {
        console.warn('Action 中文名库加载失败，将使用 FFLogs 原始名称:', err)
      }
      return cache
    })()
  }
  return pending
}

/** 已缓存则同步返回（供非 async 路径使用；未加载返回 null） */
export function peekActionNames(): ActionNameDatabase | null {
  return cache
}

let reverseIndex: Map<string, number> | null = null

/** 按中文名反查技能 ID（同名取首个 guid；库未加载或查无返回 undefined，仅展示用） */
export function findActionIdByName(name: string): number | undefined {
  if (!cache) return undefined
  if (!reverseIndex) {
    reverseIndex = new Map()
    for (const [id, entry] of Object.entries(cache.actions)) {
      if (entry[0] && !reverseIndex.has(entry[0])) reverseIndex.set(entry[0], Number(id))
    }
  }
  return reverseIndex.get(name)
}
