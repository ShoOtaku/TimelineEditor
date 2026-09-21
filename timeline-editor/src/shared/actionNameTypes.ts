// 国服 Action 中文名数据库类型 — 由 scripts/build-action-names.mjs 生成 data/action-names-cn.json
// 数据来源：thewakingsands/ffxiv-datamining-cn（国服客户端解包）
// 用途：FFLogs 对部分新技能/BOSS 技能缺少中文翻译（返回英文名），导入时按 guid 本地译为中文名

/** [中文名, 图标 id?]；图标 id 缺省表示无有效图标（前端回退占位块） */
export type ActionNameEntry = [name: string, icon?: number]

export interface ActionNameDatabase {
  version: number
  generatedAt: string
  source: string
  /** key = 技能 guid（Action 行 id） */
  actions: Record<number, ActionNameEntry>
}

/** 图标 id → xivapi 静态图标 URL（静态资源不随 API 数据冻结，新图标也可用） */
export function actionIconUrl(iconId: number): string {
  const folder = String(Math.floor(iconId / 1000) * 1000).padStart(6, '0')
  const file = String(iconId).padStart(6, '0')
  return `https://xivapi.com/i/${folder}/${file}.png`
}
