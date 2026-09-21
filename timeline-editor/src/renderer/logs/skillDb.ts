// 职业技能库（data/job-skills.json，经 IPC 读取）模块级缓存单例

import { useSyncExternalStore } from 'react'
import type { JobSkillDatabase, JobSkillDef } from '@shared/jobSkillTypes'

let cache: JobSkillDatabase | null = null
let loadStarted = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

async function load(): Promise<void> {
  try {
    const result = await window.electronAPI.loadJobSkills()
    if (result.success && result.data) {
      cache = result.data
      notify()
    }
  } catch (err) {
    console.error('Failed to load job skills:', err)
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot(): JobSkillDatabase | null {
  if (!cache && !loadStarted) {
    loadStarted = true
    void load()
  }
  return cache
}

export function useJobSkillDb(): JobSkillDatabase | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export interface SkillLookupResult {
  def: JobSkillDef
  job: string
  group: 'abilities' | 'roleSkills' | 'gcds'
}

/** 全库按技能名查找（图标回退用）；能力技 > 职能 > GCD 优先 */
export function lookupSkill(db: JobSkillDatabase | null, name: string): SkillLookupResult | null {
  if (!db) return null
  for (const group of ['abilities', 'roleSkills', 'gcds'] as const) {
    for (const [job, def] of Object.entries(db.jobs)) {
      const hit = def[group].find(sk => sk.name === name)
      if (hit) return { def: hit, job, group }
    }
  }
  return null
}
