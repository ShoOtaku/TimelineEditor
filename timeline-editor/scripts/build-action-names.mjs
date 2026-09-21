#!/usr/bin/env node
// 构建国服技能（Action）中文名数据库 -> data/action-names-cn.json
// 数据来源：thewakingsands/ffxiv-datamining-cn（国服客户端解包 Action.csv）
// 用途：FFLogs 对部分新技能/BOSS 技能缺少中文翻译（返回英文名），导入时按 guid 本地译为中文名
// 输出结构见 src/shared/actionNameTypes.ts (ActionNameDatabase)
// 用法：node scripts/build-action-names.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_PATH = path.join(__dirname, '..', 'data', 'action-names-cn.json')

const SOURCES = [
  { url: 'https://api.github.com/repos/thewakingsands/ffxiv-datamining-cn/contents/Action.csv', headers: { Accept: 'application/vnd.github.raw' } },
  { url: 'https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/Action.csv', headers: {} },
]

async function fetchCsv() {
  let lastErr
  for (const { url, headers } of SOURCES) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(180000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = (await res.text()).replace(/^﻿/, '')
      if (!/^key,/.test(text)) throw new Error('响应不是预期的 Action.csv')
      return text
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`所有数据源均失败 (${lastErr})`)
}

// 只解析前 4 个字段（key, Name, -, Icon），正确处理引号包裹字段（含 "" 转义与字段内逗号）
function parseRow(line) {
  const fields = []
  let i = 0
  for (let f = 0; f < 4; f++) {
    if (i > line.length) return null
    if (line[i] === '"') {
      let j = i + 1
      let value = ''
      while (j < line.length) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') { value += '"'; j += 2; continue }
          break
        }
        value += line[j++]
      }
      fields.push(value)
      const comma = line.indexOf(',', j + 1)
      i = comma === -1 ? line.length + 1 : comma + 1
    } else {
      const comma = line.indexOf(',', i)
      fields.push(line.slice(i, comma === -1 ? line.length : comma))
      i = comma === -1 ? line.length + 1 : comma + 1
    }
  }
  return fields
}

const PLACEHOLDER_ICONS = new Set([0, 405]) // 405 = 客户端通用占位图标，前端回退首字块更清晰

// _rsv_ 解密覆盖表（用户从客户端解析工具导出的 `_rsv_...|名字` 文本，逐副本追加即可）
const RSV_OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'rsv-overrides.txt')

const csv = await fetchCsv()
const lines = csv.split(/\r?\n/)
const actions = {}
const rsvByPlaceholder = new Map() // 完整占位串 -> { id, icon }
let count = 0
// 行 0=列序号, 1=列名, 2=类型, 3 起为数据
for (let li = 3; li < lines.length; li++) {
  const line = lines[li]
  if (!line) continue
  const fields = parseRow(line)
  if (!fields) continue
  const id = Number(fields[0])
  if (!Number.isInteger(id) || id <= 0) continue
  const name = (fields[1] ?? '').trim()
  const icon = Number(fields[3])
  const validIcon = Number.isInteger(icon) && !PLACEHOLDER_ICONS.has(icon) ? icon : undefined
  if (!name) continue
  if (name.startsWith('_rsv_')) {
    rsvByPlaceholder.set(name, { id, icon: validIcon })
    continue
  }
  actions[id] = validIcon !== undefined ? [name, validIcon] : [name]
  count++
}

// 应用 RSV 解密覆盖（整串精确匹配，避免与状态/台词等其他表的 id 冲突）
let rsvResolved = 0
if (existsSync(RSV_OVERRIDES_PATH)) {
  const text = readFileSync(RSV_OVERRIDES_PATH, 'utf-8').replace(/^﻿/, '')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const sep = line.indexOf('|')
    if (sep <= 0) continue
    const hit = rsvByPlaceholder.get(line.slice(0, sep))
    const name = line.slice(sep + 1).trim()
    if (!hit || !name) continue
    actions[hit.id] = hit.icon !== undefined ? [name, hit.icon] : [name]
    rsvResolved++
  }
}
console.log(`RSV 解密覆盖: ${rsvResolved} 条（库内占位共 ${rsvByPlaceholder.size} 条）`)

mkdirSync(path.dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'thewakingsands/ffxiv-datamining-cn Action.csv + rsv-overrides.txt',
  actions,
}))
console.log(`已写入 ${count} 条技能中文名（另含 ${rsvResolved} 条 RSV 解密名） -> ${OUT_PATH}`)
