// ACT 窗口事件 → FFLogs 解析管线入参 的转换（纯函数，不依赖 store/IPC，可单测）
// 转换后直接复用 parseFflogsFight / autoAssignPlayers / buildImportPayload：
// 21/22 → cast、20 → begincast（读条时长仍由配对得出），玩家/敌方按单位 ID 段分流

import type { ActActorInfo, ActLogEvent } from '@shared/actTypes'
import { isActEnemyId, isActPlayerId } from '@shared/actTypes'
import type { ActionNameDatabase } from '@shared/actionNameTypes'
import type { FflogsActor, FflogsCastEvent, FflogsReportInfo } from '@shared/fflogsTypes'
import type { LogsSkillColumn } from './logsTypes'
import type { ParsedFflogsData } from './fflogsImport'
import { parseFflogsFight } from './fflogsImport'

/** ClassJob 行号 → 中文职业名（AddCombatant 的 job 字段，仅展示用） */
export const ACT_JOB_NAMES: Record<number, string> = {
  1: '剑术师', 2: '格斗家', 3: '斧术师', 4: '枪术师', 5: '弓箭手', 6: '幻术师', 7: '咒术师',
  8: '刻木匠', 9: '锻铁匠', 10: '铸甲匠', 11: '雕金匠', 12: '制革匠', 13: '裁衣匠', 14: '炼金术士',
  15: '烹调师', 16: '采矿工', 17: '园艺工', 18: '捕鱼人',
  19: '骑士', 20: '武僧', 21: '战士', 22: '龙骑士', 23: '吟游诗人', 24: '白魔法师', 25: '黑魔法师',
  26: '秘术师', 27: '召唤师', 28: '学者', 29: '忍者', 30: '机工士', 31: '暗黑骑士', 32: '占星术士',
  33: '武士', 34: '赤魔法师', 35: '青魔法师', 36: '绝枪战士', 37: '舞者', 38: '钐镰客', 39: '贤者',
  40: '蝰蛇剑士', 41: '绘灵法师'
}

const FALLBACK_JOB_NAME = '冒险者'

/** 玩家召唤兽/化身（朝日小仙女/宝石兽/烈日巴哈姆特…）的归类标签 */
export const ACT_PET_TAG = '宠物'

export interface ActParseOptions {
  /** parseActLogWindow 返回的时间窗内事件 */
  events: ActLogEvent[]
  /** scanActLogFile 收集的玩家单位表（职业显示用，可空） */
  actors: ActActorInfo[]
  fightStart: number
  fightEnd: number
  columns: LogsSkillColumn[]
  includeBegincast: boolean
  eventFilterRegex: string
  actionNames?: ActionNameDatabase
}

function toCastEvent(e: ActLogEvent, friendly: boolean): FflogsCastEvent {
  return {
    timestamp: e.ts,
    type: e.type,
    sourceID: e.sourceId,
    sourceIsFriendly: friendly,
    ability: e.abilityId > 0
      ? { name: e.abilityName, guid: e.abilityId }
      : { name: e.abilityName }
  }
}

/**
 * 把 ACT 时间窗事件整理成 parseFflogsFight 的入参形状并解析。
 * 玩家（0x10 段）进 casts、敌方（0x40 段）进 enemyCasts，其余来源（环境等）忽略；
 * 玩家召唤兽/化身按 AddCombatant 的归属者识别（ownerId 非 0 的敌方单位），与真正的
 * 敌方单位分开标记，避免 BOSS 启发式被宠物施法次数带偏；
 * BOSS/NPC 标签是启发式的：施法次数最多的非宠物敌方标 BOSS（映射页默认勾选），其余标 NPC。
 */
export function parseActLogEvents(opts: ActParseOptions): ParsedFflogsData {
  const casts: FflogsCastEvent[] = []
  const enemyCasts: FflogsCastEvent[] = []
  const friendlyNames = new Map<number, string>()
  const enemyStats = new Map<number, { name: string; count: number; pet: boolean }>()
  const petIds = new Set(opts.actors.filter(a => a.ownerId !== 0).map(a => a.id))

  for (const e of opts.events) {
    if (isActPlayerId(e.sourceId)) {
      casts.push(toCastEvent(e, true))
      friendlyNames.set(e.sourceId, e.sourceName)
    } else if (isActEnemyId(e.sourceId)) {
      enemyCasts.push(toCastEvent(e, false))
      const stat = enemyStats.get(e.sourceId)
        ?? { name: e.sourceName, count: 0, pet: petIds.has(e.sourceId) }
      stat.name = e.sourceName
      stat.count += 1
      enemyStats.set(e.sourceId, stat)
    }
  }

  const jobByActor = new Map(opts.actors.map(a => [a.id, a.job]))
  const friendlies: FflogsActor[] = [...friendlyNames].map(([id, name]) => ({
    id,
    name,
    type: ACT_JOB_NAMES[jobByActor.get(id) ?? 0] ?? FALLBACK_JOB_NAME
  }))
  const enemies: FflogsActor[] = [...enemyStats]
    .sort((a, b) => Number(a[1].pet) - Number(b[1].pet) || b[1].count - a[1].count)
    .map(([id, stat], i) => ({
      id,
      name: stat.name,
      type: stat.pet ? ACT_PET_TAG : i === 0 ? 'Boss' : 'NPC'
    }))

  const report: FflogsReportInfo = {
    code: '',
    title: '',
    start: opts.fightStart,
    end: opts.fightEnd,
    fights: [],
    friendlies,
    enemies
  }

  return parseFflogsFight({
    report,
    casts,
    enemyCasts,
    fightStart: opts.fightStart,
    fightEnd: opts.fightEnd,
    columns: opts.columns,
    includeBegincast: opts.includeBegincast,
    eventFilterRegex: opts.eventFilterRegex,
    actionNames: opts.actionNames
  })
}
