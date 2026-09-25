// ACT 本地日志（FFXIV ACT 插件 Network_*.log）解析的 IPC 契约
// 主进程流式读文件，只返回解析后的精简事件；渲染进程负责映射/导入
// 行格式（| 分隔）参考 https://ccinos.github.io/act_dps_show/timeline.html 与
// OverlayPlugin 日志行文档：
//   01|时间|区域ID(hex)|区域名|哈希                          ChangeZone
//   03|时间|战斗单位ID(hex)|名字|职业(hex)|等级(hex)|...      AddCombatant
//   20|时间|来源ID|来源名|技能ID(hex)|技能名|目标ID|目标名|读条秒|x|y|z|朝向|哈希  StartsCast
//   21|时间|来源ID|来源名|技能ID(hex)|技能名|目标ID|目标名|效果...  Ability（单体）
//   22|…同 21…                                                AOE Ability（每个目标一行）

/** 一次施法/开始读条事件（已归一化，时间戳为 epoch ms） */
export interface ActLogEvent {
  ts: number
  type: 'cast' | 'begincast'
  /** 来源单位 ID（hex 解析为十进制；玩家 0x10xxxxxx，敌方/NPC 0x40xxxxxx） */
  sourceId: number
  sourceName: string
  /** 技能 ID（hex 解析为十进制，即 FFLogs 的 guid） */
  abilityId: number
  abilityName: string
  /** 目标单位 ID（十进制；用于识别「首个指向敌方的玩家事件」≈ 开怪/进战时刻） */
  targetId?: number
}

/** 日志目录中的一个 .log 文件 */
export interface ActLogFileInfo {
  name: string
  path: string
  size: number
  mtime: number
}

/** 扫描出的一场战斗（按活动时间间隔分段，含敌方单位参与） */
export interface ActEncounter {
  id: number
  /** 首/尾战斗事件时间（epoch ms） */
  start: number
  end: number
  /** 所属区域（取段前最近一次 ChangeZone） */
  zoneName?: string
  /** 段内战斗事件（20/21/22 行）总数 */
  events: number
}

/** AddCombatant 收集到的单位信息（玩家用于职业显示；敌方单位的归属者用于识别宠物） */
export interface ActActorInfo {
  id: number
  name: string
  /** 职业 ID（十进制，FFXIV ClassJob 行号；0 = 无） */
  job: number
  /** 归属者单位 ID（玩家召唤兽/化身指向主人；无主人 = 0） */
  ownerId: number
}

export interface ActScanRequest {
  /** 渲染进程生成的请求标识，用于进度事件分发与取消 */
  requestId: string
  path: string
  /** 战斗分段间隔：相邻战斗事件超过该间隔即切分为两场（ms） */
  gapMs: number
}

export interface ActScanResult {
  path: string
  size: number
  encounters: ActEncounter[]
  actors: ActActorInfo[]
}

export interface ActParseRequest {
  requestId: string
  path: string
  /** 时间窗（epoch ms，闭区间）；文件按时间有序，超过 end 即提前结束读取 */
  start: number
  end: number
}

export type ActResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; cancelled?: boolean }

/** 主进程 -> 渲染进程的扫描/解析进度事件（通道 'act:progress'） */
export interface ActProgress {
  requestId: string
  percent: number
  lines: number
}

/** ACT 单位 ID（hex 字符串）→ 十进制；非法返回 NaN */
export function parseActId(hex: string): number {
  return parseInt(hex, 16)
}

/** 玩家单位（0x10xxxxxx 段；0xE0000000 环境不算） */
export function isActPlayerId(id: number): boolean {
  return (id >>> 28) === 1
}

/** 敌方/NPC 单位（0x40xxxxxx 段） */
export function isActEnemyId(id: number): boolean {
  return (id >>> 28) === 4
}
