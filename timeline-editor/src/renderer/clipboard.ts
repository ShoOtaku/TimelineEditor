/**
 * 跨实例复制粘贴 — 把内部剪贴板内容写成带标记的 JSON 放进系统剪贴板。
 *
 * 复制时写透到系统剪贴板（内存剪贴板保留作回退），粘贴/窗口聚焦时读回：
 * 另一个应用实例（或同一实例重启后）即可粘贴先前复制的内容。
 * 负载同时是合法 JSON 文本，粘贴到文本编辑器里可查看/分享。
 */

export type ClipboardKind = 'ae-node' | 'pr-entry' | 'pr-node'

export interface ClipboardPayload {
  app: 'timeline-editor'
  version: 1
  kind: ClipboardKind
  copiedAt: string
  data: unknown
}

const APP_MARKER = 'timeline-editor'
/** 防止把超大文本塞进 JSON.parse（正常负载远小于此） */
const MAX_PAYLOAD_TEXT = 64 * 1024 * 1024

export async function writeClipboardPayload(kind: ClipboardKind, data: unknown): Promise<void> {
  const payload: ClipboardPayload = {
    app: APP_MARKER,
    version: 1,
    kind,
    copiedAt: new Date().toISOString(),
    data
  }
  await window.electronAPI.clipboardWriteText(JSON.stringify(payload))
}

/** 读取系统剪贴板中的应用负载；不是应用负载（或读取失败）时返回 null */
export async function readClipboardPayload(): Promise<ClipboardPayload | null> {
  try {
    const text = await window.electronAPI.clipboardReadText()
    if (!text || text.length > MAX_PAYLOAD_TEXT) return null
    const parsed = JSON.parse(text) as Partial<ClipboardPayload> | null
    if (!parsed || parsed.app !== APP_MARKER || parsed.version !== 1) return null
    if (parsed.kind !== 'ae-node' && parsed.kind !== 'pr-entry' && parsed.kind !== 'pr-node') return null
    if (typeof parsed.data !== 'object' || parsed.data === null) return null
    return parsed as ClipboardPayload
  } catch {
    return null
  }
}

// ── 形状守卫：只校验关键字段，粘贴时会重排 Id/Guid ──

export function isAeNodeData(data: unknown): boolean {
  const o = data as Record<string, unknown>
  return typeof o.$type === 'string' && typeof o.Id === 'number'
}

export function isPrEntryData(data: unknown): boolean {
  const o = data as Record<string, unknown>
  return typeof o.Guid === 'string' && typeof o.EntryGroup === 'object' && o.EntryGroup !== null
}

export function isPrNodeData(data: unknown): boolean {
  const o = data as Record<string, unknown>
  return typeof o.Type === 'string' && typeof o.Id === 'number'
}
