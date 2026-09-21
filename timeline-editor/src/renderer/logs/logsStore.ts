import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import type {
  LogsGcdUse, LogsImportPayload, LogsSkillColumn, LogsTimelineDoc
} from './logsTypes'
import {
  columnMatchName, createEmptyDoc, dedupeByTime, insertByTime, isLogsTimelineDoc, newId
} from './logsTypes'
import { askAlert } from '../store/dialogStore'

export type LogsSelection =
  | { kind: 'event'; id: string }
  | { kind: 'gcd'; id: string }
  | { kind: 'skillUse'; id: string; columnId: string }
  | { kind: 'column'; id: string }

interface LogsUndoEntry {
  doc: LogsTimelineDoc
  /** Coalescing key: consecutive edits with the same tag collapse into one undo step */
  tag?: string
}

export const LOGS_MAX_UNDO = 50
export const LOGS_MIN_ZOOM = 0.5
export const LOGS_MAX_ZOOM = 60
export const LOGS_DEFAULT_ZOOM = 8

export interface LogsStore {
  doc: LogsTimelineDoc | null
  filePath: string | null
  fileName: string | null
  isDirty: boolean
  loadError: string | null
  selection: LogsSelection | null
  /** 光标线位置（毫秒），null = 隐藏 */
  cursorMs: number | null
  /** 纵向缩放：每秒像素 */
  pxPerSec: number
  undoStack: LogsUndoEntry[]
  redoStack: LogsUndoEntry[]

  newDocument: (name: string) => void
  loadFile: (path: string) => Promise<boolean>
  saveFile: (path: string) => Promise<boolean>
  undo: () => void
  redo: () => void

  updateDocMeta: (patch: Partial<Pick<LogsTimelineDoc, 'name' | 'lengthMs' | 'offsetMs' | 'gcdDuration'>>, undoTag?: string) => void

  addEvent: (timeMs: number, text: string) => string
  updateEvent: (id: string, patch: Partial<Omit<LogsTimelineDoc['events'][number], 'id'>>, undoTag?: string) => void
  moveEvent: (id: string, timeMs: number, undoTag?: string) => void
  deleteEvent: (id: string) => void

  addGcdUse: (skill: string, timeMs: number) => string
  moveGcdUse: (id: string, timeMs: number, undoTag?: string) => void
  updateGcdUse: (id: string, patch: Partial<Omit<LogsGcdUse, 'id'>>, undoTag?: string) => void
  deleteGcdUse: (id: string) => void

  addSkillUse: (columnId: string, timeMs: number) => string
  moveSkillUse: (columnId: string, useId: string, timeMs: number, undoTag?: string) => void
  deleteSkillUse: (columnId: string, useId: string) => void

  /** 去重：同 matchName/name 且同 kind 时返回已有列 id */
  addColumn: (def: Partial<Omit<LogsSkillColumn, 'id' | 'kind'>> & { name: string }, kind: 'ability' | 'gcd') => string
  updateColumn: (id: string, patch: Partial<Omit<LogsSkillColumn, 'id' | 'kind'>>, undoTag?: string) => void
  removeColumn: (id: string) => void
  /** ability 列排序（跳过 gcd 列） */
  moveColumn: (id: string, dir: -1 | 1) => void
  addGcdTrack: (name: string, extra?: Partial<Omit<LogsSkillColumn, 'id' | 'kind' | 'name'>>) => string

  select: (sel: LogsSelection | null) => void
  setCursor: (ms: number | null) => void
  setZoom: (pxPerSec: number) => void

  /** replace = 清空对应数组再写入；merge = 合并排序去重；lengthMs 取 max */
  applyImport: (payload: LogsImportPayload, mode: 'replace' | 'merge') => void
}

interface LogsUndoable {
  doc: LogsTimelineDoc | null
  undoStack: LogsUndoEntry[]
  redoStack: LogsUndoEntry[]
}

function pushUndo(s: LogsUndoable, tag?: string): void {
  if (!s.doc) return
  if (tag && s.undoStack.length > 0 && s.undoStack[s.undoStack.length - 1].tag === tag) return
  s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)), tag })
  if (s.undoStack.length > LOGS_MAX_UNDO) s.undoStack.shift()
  s.redoStack = [] as LogsUndoEntry[]
}

function sanitizeSelection(doc: LogsTimelineDoc, sel: LogsSelection | null): LogsSelection | null {
  if (!sel) return null
  switch (sel.kind) {
    case 'event': return doc.events.some(e => e.id === sel.id) ? sel : null
    case 'gcd': return doc.gcds.some(g => g.id === sel.id) ? sel : null
    case 'column': return doc.columns.some(c => c.id === sel.id) ? sel : null
    case 'skillUse': return (doc.skillUses[sel.columnId] ?? []).some(u => u.id === sel.id) ? sel : null
  }
}

const sortByTime = (arr: { timeMs: number }[]) => arr.sort((a, b) => a.timeMs - b.timeMs)

export const useLogsStore = create<LogsStore>()(
  immer((set, get) => ({
    doc: null,
    filePath: null,
    fileName: null,
    isDirty: false,
    loadError: null,
    selection: null,
    cursorMs: null,
    pxPerSec: LOGS_DEFAULT_ZOOM,
    undoStack: [],
    redoStack: [],

    newDocument: (name) => {
      set({
        doc: createEmptyDoc(name),
        filePath: null,
        fileName: `${name}.json`,
        isDirty: true,
        loadError: null,
        selection: null,
        cursorMs: null,
        undoStack: [],
        redoStack: []
      })
    },

    loadFile: async (path) => {
      const result = await window.electronAPI.readFile(path)
      const fileName = path.split(/[/\\]/).pop() || path
      if (!result.success || !result.content) {
        set({ loadError: `读取文件失败: ${result.error ?? '未知错误'}` })
        askAlert({ title: '打开失败', message: `无法读取 ${fileName}\n${result.error ?? ''}`, danger: true })
        return false
      }
      try {
        const json = JSON.parse(result.content)
        if (!isLogsTimelineDoc(json)) {
          set({ loadError: '该文件不是战斗日志时间轴格式（缺少 $type: LogsTimeline）' })
          askAlert({ title: '打开失败', message: `${fileName} 不是战斗日志时间轴格式（缺少 $type: LogsTimeline）`, danger: true })
          return false
        }
        set({
          doc: json,
          filePath: path,
          fileName,
          isDirty: false,
          loadError: null,
          selection: null,
          cursorMs: null,
          undoStack: [],
          redoStack: []
        })
        return true
      } catch (err) {
        set({ loadError: `JSON 解析失败: ${err}` })
        askAlert({ title: '打开失败', message: `${fileName} 不是有效的 JSON 文件\n${err}`, danger: true })
        return false
      }
    },

    saveFile: async (path) => {
      const { doc } = get()
      if (!doc) return false
      const content = JSON.stringify(doc, null, 2)
      const result = await window.electronAPI.writeFile(path, content)
      if (result.success) {
        set({ filePath: path, fileName: path.split(/[/\\]/).pop() || null, isDirty: false })
        return true
      }
      askAlert({ title: '保存失败', message: `无法写入 ${path}\n${result.error ?? '未知错误'}`, danger: true })
      return false
    },

    undo: () => {
      if (get().undoStack.length === 0) return
      set((s) => {
        const entry = s.undoStack.pop()!
        s.redoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)) })
        s.doc = entry.doc
        s.selection = sanitizeSelection(entry.doc, s.selection)
        s.isDirty = true
      })
    },

    redo: () => {
      if (get().redoStack.length === 0) return
      set((s) => {
        const entry = s.redoStack.pop()!
        s.undoStack.push({ doc: JSON.parse(JSON.stringify(s.doc)) })
        s.doc = entry.doc
        s.selection = sanitizeSelection(entry.doc, s.selection)
        s.isDirty = true
      })
    },

    updateDocMeta: (patch, undoTag) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s, undoTag)
        Object.assign(s.doc, patch)
        s.isDirty = true
      })
    },

    addEvent: (timeMs, text) => {
      const id = newId()
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        insertByTime(s.doc.events, { id, timeMs, text })
        s.selection = { kind: 'event', id }
        s.isDirty = true
      })
      return id
    },

    updateEvent: (id, patch, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const event = s.doc.events.find(e => e.id === id)
        if (!event) return
        pushUndo(s, undoTag)
        Object.assign(event, patch)
        if (patch.timeMs !== undefined) sortByTime(s.doc.events)
        s.isDirty = true
      })
    },

    moveEvent: (id, timeMs, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const event = s.doc.events.find(e => e.id === id)
        if (!event) return
        pushUndo(s, undoTag)
        event.timeMs = timeMs
        sortByTime(s.doc.events)
        s.isDirty = true
      })
    },

    deleteEvent: (id) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        s.doc.events = s.doc.events.filter(e => e.id !== id)
        if (s.selection?.kind === 'event' && s.selection.id === id) s.selection = null
        s.isDirty = true
      })
    },

    addGcdUse: (skill, timeMs) => {
      const id = newId()
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const track = s.doc.columns.find(c => c.kind === 'gcd' && columnMatchName(c) === skill)
        insertByTime(s.doc.gcds, { id, timeMs, skill, skillId: track?.skillId })
        s.selection = { kind: 'gcd', id }
        s.isDirty = true
      })
      return id
    },

    moveGcdUse: (id, timeMs, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const gcd = s.doc.gcds.find(g => g.id === id)
        if (!gcd) return
        pushUndo(s, undoTag)
        gcd.timeMs = timeMs
        sortByTime(s.doc.gcds)
        s.isDirty = true
      })
    },

    updateGcdUse: (id, patch, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const gcd = s.doc.gcds.find(g => g.id === id)
        if (!gcd) return
        pushUndo(s, undoTag)
        Object.assign(gcd, patch)
        s.isDirty = true
      })
    },

    deleteGcdUse: (id) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        s.doc.gcds = s.doc.gcds.filter(g => g.id !== id)
        if (s.selection?.kind === 'gcd' && s.selection.id === id) s.selection = null
        s.isDirty = true
      })
    },

    addSkillUse: (columnId, timeMs) => {
      const id = newId()
      set((s) => {
        if (!s.doc) return
        const col = s.doc.columns.find(c => c.id === columnId && c.kind === 'ability')
        if (!col) return
        pushUndo(s)
        const uses = s.doc.skillUses[columnId] ?? (s.doc.skillUses[columnId] = [])
        insertByTime(uses, { id, timeMs })
        s.selection = { kind: 'skillUse', id, columnId }
        s.isDirty = true
      })
      return id
    },

    moveSkillUse: (columnId, useId, timeMs, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const uses = s.doc.skillUses[columnId]
        const use = uses?.find(u => u.id === useId)
        if (!uses || !use) return
        pushUndo(s, undoTag)
        use.timeMs = timeMs
        sortByTime(uses)
        s.isDirty = true
      })
    },

    deleteSkillUse: (columnId, useId) => {
      set((s) => {
        if (!s.doc) return
        const uses = s.doc.skillUses[columnId]
        if (!uses) return
        pushUndo(s)
        s.doc.skillUses[columnId] = uses.filter(u => u.id !== useId)
        if (s.selection?.kind === 'skillUse' && s.selection.id === useId && s.selection.columnId === columnId) {
          s.selection = null
        }
        s.isDirty = true
      })
    },

    addColumn: (def, kind) => {
      const state = get()
      if (!state.doc) return ''
      const name = def.name.trim()
      if (!name) return ''
      const key = def.matchName?.trim() || name
      const existing = state.doc.columns.find(c => c.kind === kind && columnMatchName(c) === key)
      if (existing) return existing.id
      const id = newId()
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        s.doc.columns.push({ ...def, name, id, kind })
        if (kind === 'ability' && !s.doc.skillUses[id]) s.doc.skillUses[id] = []
        s.selection = { kind: 'column', id }
        s.isDirty = true
      })
      return id
    },

    updateColumn: (id, patch, undoTag) => {
      set((s) => {
        if (!s.doc) return
        const col = s.doc.columns.find(c => c.id === id)
        if (!col) return
        pushUndo(s, undoTag)
        Object.assign(col, patch)
        s.isDirty = true
      })
    },

    removeColumn: (id) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        s.doc.columns = s.doc.columns.filter(c => c.id !== id)
        delete s.doc.skillUses[id]
        if (s.selection?.kind === 'column' && s.selection.id === id) s.selection = null
        if (s.selection?.kind === 'skillUse' && s.selection.columnId === id) s.selection = null
        s.isDirty = true
      })
    },

    moveColumn: (id, dir) => {
      set((s) => {
        if (!s.doc) return
        const cols = s.doc.columns
        const idx = cols.findIndex(c => c.id === id)
        if (idx < 0 || cols[idx].kind !== 'ability') return
        let target = idx + dir
        while (target >= 0 && target < cols.length && cols[target].kind !== 'ability') target += dir
        if (target < 0 || target >= cols.length) return
        pushUndo(s)
        const tmp = cols[idx]
        cols[idx] = cols[target]
        cols[target] = tmp
        s.isDirty = true
      })
    },

    addGcdTrack: (name, extra) => {
      return get().addColumn({ ...(extra ?? {}), name }, 'gcd')
    },

    select: (sel) => set({ selection: sel }),

    setCursor: (ms) => set({ cursorMs: ms }),

    setZoom: (pxPerSec) => set({
      pxPerSec: Math.min(LOGS_MAX_ZOOM, Math.max(LOGS_MIN_ZOOM, pxPerSec))
    }),

    applyImport: (payload, mode) => {
      set((s) => {
        if (!s.doc) return
        pushUndo(s)
        const doc = s.doc
        if (payload.events) {
          const incoming = payload.events.map(e => ({
            id: newId(), timeMs: e.timeMs, text: e.text,
            durationMs: e.durationMs, icon: e.icon, skillName: e.skillName, skillId: e.skillId,
            dmg: e.dmg, dmgType: e.dmgType
          }))
          const merged = mode === 'replace' ? incoming : [...doc.events, ...incoming]
          sortByTime(merged)
          doc.events = mode === 'merge' ? dedupeByTime(merged, e => `${e.timeMs}|${e.text}`) : merged
        }
        if (payload.gcds) {
          const incoming = payload.gcds.map(g => ({ id: newId(), timeMs: g.timeMs, skill: g.skill, skillId: g.skillId }))
          const merged = mode === 'replace' ? incoming : [...doc.gcds, ...incoming]
          sortByTime(merged)
          doc.gcds = mode === 'merge' ? dedupeByTime(merged, g => `${g.timeMs}|${g.skill}`) : merged
        }
        if (payload.skillUses) {
          if (mode === 'replace') doc.skillUses = {}
          for (const [columnId, list] of Object.entries(payload.skillUses)) {
            const col = doc.columns.find(c => c.id === columnId && c.kind === 'ability')
            if (!col) continue
            const incoming = list.map(u => ({ id: newId(), timeMs: u.timeMs }))
            const merged = mode === 'replace' ? incoming : [...(doc.skillUses[columnId] ?? []), ...incoming]
            sortByTime(merged)
            doc.skillUses[columnId] = mode === 'merge' ? dedupeByTime(merged) : merged
          }
        }
        if (payload.columnSkillIds) {
          for (const [columnId, skillId] of Object.entries(payload.columnSkillIds)) {
            const col = doc.columns.find(c => c.id === columnId)
            if (col) col.skillId = skillId
          }
        }
        if (payload.lengthMs !== undefined) {
          doc.lengthMs = Math.max(doc.lengthMs, payload.lengthMs)
        }
        s.isDirty = true
      })
    }
  }))
)

export function abilityColumnsOf(doc: LogsTimelineDoc | null): LogsSkillColumn[] {
  return doc ? doc.columns.filter(c => c.kind === 'ability') : []
}

export function gcdTracksOf(doc: LogsTimelineDoc | null): LogsSkillColumn[] {
  return doc ? doc.columns.filter(c => c.kind === 'gcd') : []
}

const EMPTY_COLUMNS: LogsSkillColumn[] = []

export function useAbilityColumns(): LogsSkillColumn[] {
  return useLogsStore(useShallow(s => s.doc ? s.doc.columns.filter(c => c.kind === 'ability') : EMPTY_COLUMNS))
}

export function useGcdTracks(): LogsSkillColumn[] {
  return useLogsStore(useShallow(s => s.doc ? s.doc.columns.filter(c => c.kind === 'gcd') : EMPTY_COLUMNS))
}
