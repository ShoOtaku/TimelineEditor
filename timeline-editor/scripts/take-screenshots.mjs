// CDP 截图脚本：驱动 dev 实例（remote-debugging-port=9222）截取各模式界面，供 README 使用
// 用法：先启动 npm run dev，再执行 node scripts/take-screenshots.mjs
// 截图输出到 ../docs/images/（mode-ae / mode-pr / mode-logs / pr-import-logs）
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../../docs/images/', import.meta.url))
// 截图演示用文件（按各自目录中实际存在的文件名调整）
const DEMO_FILES = {
  ae: '[零式阿罗阿罗岛]骑士-v06.09.json',
  pr: '[PLD]绝妖星.json',
  logs: '合成测试-轨道与CD.json'
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page' && t.url.includes('5173'))
if (!page) throw new Error('找不到 dev 页面（请确认 npm run dev 已启动）')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let msgId = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++msgId
  pending.set(i, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result))
  ws.send(JSON.stringify({ id: i, method, params }))
})
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result?.value
}

/** 真实鼠标点击可见文本元素的中心点；scope 限定容器 CSS 选择器（如 '[role="dialog"]'） */
async function clickText(text, scope = null) {
  const center = await evalJs(`(() => {
    const root = ${scope ? `document.querySelector(${JSON.stringify(scope)})` : 'document'}
    if (!root) return null
    const els = [...root.querySelectorAll('button, [role="button"], div, span, a')]
      .filter(el => (el.textContent || '').trim().includes(${JSON.stringify(text)}))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)
    // 同长度取 DOM 序最后者：嵌套结构里子元素排在父容器后，避免点到外层容器正中的空白处
    const minLen = (els[0]?.textContent || '').length
    const el = els.filter(e => (e.textContent || '').length === minLen).at(-1)
    if (!el) return null
    el.scrollIntoView({ block: 'nearest' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (!center) throw new Error(`找不到可点击元素: ${text}`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...center })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...center, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...center, button: 'left', clickCount: 1 })
  console.log(`click "${text}" @(${center.x},${center.y})`)
}

/** 轮询直到表达式为真或超时 */
async function waitFor(expr, timeoutMs = 8000, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await evalJs(expr)) { console.log(`waitFor ${label} OK (${Date.now() - t0}ms)`); return true }
    await sleep(300)
  }
  console.log(`waitFor ${label} TIMEOUT`)
  return false
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${OUT_DIR}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log(`✓ ${name}.png`)
}

await mkdir(OUT_DIR, { recursive: true })
await send('Page.enable')
await sleep(2000) // 等首屏渲染

// ① AE 模式
await clickText('AE 时间轴'); await sleep(800)
await clickText(DEMO_FILES.ae); await sleep(2000)
await shot('mode-ae')

// ② PR 模式
await clickText('PR 时间轴'); await sleep(800)
await clickText(DEMO_FILES.pr)
await waitFor(`document.body.textContent.includes('校验通过') || document.body.textContent.includes('个问题')`, 8000, 'PR 加载')
await shot('mode-pr')

// ③ PR 日志导入向导（锚点映射页）
await clickText('日志导入')
await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('.json')`, 8000, '对话框文件列表')
await clickText(DEMO_FILES.logs, '[role="dialog"]')
await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('BOSS 事件')`, 8000, '日志文档解析')
await clickText('下一步', '[role="dialog"]')
await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('插值') || document.querySelector('[role="dialog"]')?.textContent.includes('精确')`, 8000, '锚点映射页')
await shot('pr-import-logs')
await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(500)

// ④ 战斗日志模式
await clickText('战斗日志'); await sleep(800)
await clickText(DEMO_FILES.logs)
await waitFor(`!document.body.textContent.includes('未打开战斗日志时间轴')`, 8000, '日志文档加载')
await sleep(5000) // 等图标从 CDN 加载
await shot('mode-logs')

ws.close()
console.log('完成 →', OUT_DIR)
process.exit(0)
