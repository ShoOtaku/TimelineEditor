#!/usr/bin/env node
// 构建 FFXIV 全职业技能数据库 -> data/job-skills.json
// 数据来源：ccinos/act_dps_show 转换的官方职业指南数据
//   https://ccinos.github.io/act_dps_show/v3/shared/data/official/{jobKey}.js
// 输出结构见 src/shared/jobSkillTypes.ts (JobSkillDatabase)
// 用法：node scripts/build-job-skills.mjs

import vm from 'node:vm'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_PATH = path.join(__dirname, '..', 'data', 'job-skills.json')

const JOBS = {
  astrologian: { name: '占星术士', role: '奶妈' },
  bard: { name: '诗人', role: '远敏' },
  blackmage: { name: '黑魔', role: '魔法' },
  dancer: { name: '舞者', role: '远敏' },
  darkknight: { name: '暗黑骑士', role: '坦克' },
  dragoon: { name: '龙骑', role: '近战' },
  gunbreaker: { name: '绝枪战士', role: '坦克' },
  machinist: { name: '机工', role: '远敏' },
  monk: { name: '武僧', role: '近战' },
  ninja: { name: '忍者', role: '近战' },
  paladin: { name: '骑士', role: '坦克' },
  reaper: { name: '钐镰客', role: '近战' },
  redmage: { name: '赤魔', role: '魔法' },
  sage: { name: '贤者', role: '奶妈' },
  samurai: { name: '武士', role: '近战' },
  scholar: { name: '学者', role: '奶妈' },
  summoner: { name: '召唤', role: '魔法' },
  warrior: { name: '战士', role: '坦克' },
  whitemage: { name: '白魔', role: '奶妈' },
  viper: { name: '蝰蛇剑士', role: '近战' },
  pictomancer: { name: '绘灵法师', role: '魔法' },
}

const BASE_URLS = [
  'https://ccinos.github.io/act_dps_show/v3/shared/data/official',
  'https://raw.githubusercontent.com/ccinos/act_dps_show/main/v3/shared/data/official',
]

async function fetchJobSource(jobKey) {
  let lastErr
  for (const base of BASE_URLS) {
    const url = `${base}/${jobKey}.js`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`${jobKey}: 所有数据源均失败 (${lastErr})`)
}

// 在沙箱中执行数据文件（文件形如 (function(){ window.{jobKey} = {...} })();）
function loadJobData(jobKey, source) {
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { timeout: 5000 })
  const data = sandbox.window[jobKey]
  if (!data?.pve?.subArry) throw new Error(`${jobKey}: 数据结构不符合预期`)
  return data.pve.subArry
}

const parseSeconds = (s) => {
  const m = /(\d+(?:\.\d+)?)\s*秒/.exec(s ?? '')
  return m ? Number(m[1]) : undefined
}

function parseSkill(raw) {
  const content = raw.content ?? ''
  const skill = { name: raw.name }

  const lv = /(\d+)/.exec(raw.tnum ?? '')
  if (lv) skill.lv = Number(lv[1])

  const cd = parseSeconds(raw.recast)
  if (cd) skill.cd = cd // 0/缺省 = 无 CD，省略

  // cast：'即时' = 0，省略；其余如 '2.5秒'
  if (raw.cast && raw.cast !== '即时') {
    const cast = parseSeconds(raw.cast)
    if (cast) skill.cast = cast
  }

  const duration = /持续时间：\s*(\d+(?:\.\d+)?)/.exec(content)
  if (duration) skill.duration = Number(duration[1])

  const count = /积蓄次数：\s*(\d+)/.exec(content)
  if (count) skill.count = Number(count[1])

  // 先剔除 DoT 部分再匹配主威力，避免把 DoT 威力当成主威力
  const dotMatch = /持续[\s\S]*?威力：\s*(\d+)/.exec(content)
  if (dotMatch) skill.dot = Number(dotMatch[1])
  const mainContent = dotMatch ? content.replace(dotMatch[0], '') : content
  const dmg = /威力：\s*(\d+)/.exec(mainContent)
  if (dmg) skill.dmg = Number(dmg[1])

  if (content.includes('魔法攻击')) skill.dmgType = '魔法'
  else if (content.includes('物理攻击')) skill.dmgType = '物理'

  if (raw.nicon) skill.icon = raw.nicon

  const intro = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
  if (intro) skill.intro = intro

  if (raw.cost && raw.cost !== '-') skill.cost = raw.cost

  return skill
}

function classifyJob(subArry) {
  const abilities = []
  const roleSkills = []
  const gcds = []
  for (const section of subArry) {
    const list = section.jobArry ?? []
    if (section.subTitle === '职能技能') {
      for (const raw of list) roleSkills.push(parseSkill(raw)) // 职能技能全部保留
      continue
    }
    for (const raw of list) {
      if (!raw.classification) continue // 空 = 特性，跳过
      if (raw.classification === '能力') abilities.push(parseSkill(raw))
      else gcds.push(parseSkill(raw)) // 战技/魔法等
    }
  }
  // 源数据存在同名技能多条（不同习得/升级版本），按名去重保留第一条，
  // 否则渲染 key 冲突且名称匹配会有歧义
  const dedupe = (arr) => {
    const seen = new Set()
    return arr.filter(s => (seen.has(s.name) ? false : (seen.add(s.name), true)))
  }
  return { abilities: dedupe(abilities), roleSkills: dedupe(roleSkills), gcds: dedupe(gcds) }
}

const results = await Promise.all(
  Object.keys(JOBS).map(async (jobKey) => {
    const source = await fetchJobSource(jobKey)
    const subArry = loadJobData(jobKey, source)
    return [jobKey, classifyJob(subArry)]
  })
)

const jobs = {}
for (const [jobKey, group] of results) {
  const meta = JOBS[jobKey]
  jobs[meta.name] = { role: meta.role, ...group }
}

const db = { version: 1, generatedAt: new Date().toISOString(), jobs }
const json = JSON.stringify(db) // 压缩输出，减少体积
writeFileSync(OUT_PATH, json)

console.log(`已写入 ${OUT_PATH} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`)
console.log('职业\t职能\tabilities\troleSkills\tgcds')
for (const [name, g] of Object.entries(jobs)) {
  console.log(`${name}\t${g.role}\t${g.abilities.length}\t\t${g.roleSkills.length}\t\t${g.gcds.length}`)
}
