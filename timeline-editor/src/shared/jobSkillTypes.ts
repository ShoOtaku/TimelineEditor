// 职业技能数据库类型 — 由 scripts/build-job-skills.mjs 生成 data/job-skills.json
// 数据来源：官方职业指南数据（经 ccinos/act_dps_show 转换格式）

export interface JobSkillDef {
  /** 技能名（日志中匹配用名） */
  name: string
  lv?: number
  /** 冷却秒（0/缺省 = 无 CD 或即时 GCD） */
  cd?: number
  /** 咏唱秒（0 = 即时） */
  cast?: number
  /** 持续时间秒 */
  duration?: number
  /** 积蓄层数 */
  count?: number
  /** 威力 */
  dmg?: number
  /** DOT 威力 */
  dot?: number
  /** '物理' | '魔法' */
  dmgType?: string
  /** 图标 URL（官方 CDN），前端加载失败时回退占位图 */
  icon?: string
  /** 技能说明（纯文本） */
  intro?: string
  /** 消耗描述，如 "800MP" */
  cost?: string
}

export interface JobSkillGroup {
  /** 职能：'坦克' | '奶妈' | '近战' | '远敏' | '魔法' */
  role: string
  /** 职业能力技 */
  abilities: JobSkillDef[]
  /** 职能技能 */
  roleSkills: JobSkillDef[]
  /** GCD 技能（战技/魔法） */
  gcds: JobSkillDef[]
}

export interface JobSkillDatabase {
  version: number
  generatedAt: string
  /** key = 中文职业名，如 '骑士' */
  jobs: Record<string, JobSkillGroup>
}
