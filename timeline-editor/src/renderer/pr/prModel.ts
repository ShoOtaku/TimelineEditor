// PromeRotation PureTimeline — factories, validation, formatting helpers.
// Validation rules ported from PromeRotation.PureTimeline.Model.PtlDefinition.
import type {
  PtlDocument, PtlAnchor, PtlEntry, PtlNode, PtlCondition, PtlAction, PtlSyncRule
} from '@shared/prTypes'
import { PR_NODE_TEMPLATE_LABELS } from '@shared/prTypes'
import { findConditionSpec, findActionSpec } from '@shared/prSpecs'
import { applySpecDefaults } from './prSpecEditor'

export function newGuid(): string {
  return crypto.randomUUID()
}

/** mm:ss.s display for a time in seconds */
export function formatPrTime(sec: number): string {
  if (!isFinite(sec)) return '--:--'
  const sign = sec < 0 ? '-' : ''
  const abs = Math.abs(sec)
  const m = Math.floor(abs / 60)
  const s = abs - m * 60
  const sStr = s.toFixed(1).padStart(4, '0')
  return `${sign}${String(m).padStart(2, '0')}:${sStr}`
}

export function createSyncRule(type: string): PtlSyncRule {
  return {
    Type: type,
    Params: {},
    MatchTime: null,
    JumpTargetTime: null,
    IsForceJump: false,
    WindowBefore: 0,
    WindowAfter: 0
  }
}

export function createAnchor(time: number, name = '新锚点'): PtlAnchor {
  return {
    Guid: newGuid(),
    Name: name,
    Time: time,
    IsPhaseAnchor: false,
    IsEndAnchor: false,
    IsCommentAnchor: false,
    IsTechnicalAnchor: false,
    Enabled: true,
    Remark: null,
    Sync: createSyncRule('ActionEffect')
  }
}

/**
 * Node factory mirroring the plugin's EgNodeTemplates
 * (PtlEditorWindow.EntryGroupEditor.cs) — a branch node ships with its
 * true/false child slots because BranchNode picks Children[0] / Children[1].
 */
export function createNode(type: string, id: number): PtlNode {
  const base: PtlNode = {
    Id: id,
    Name: PR_NODE_TEMPLATE_LABELS[type] ? `新${PR_NODE_TEMPLATE_LABELS[type]}` : type,
    Type: type,
    Enabled: true,
    Remark: null,
    DelayMs: null,
    Mode: null,
    UseAndLogic: null,
    Condition: null,
    Conditions: null,
    Action: null,
    Actions: null,
    Children: null
  }
  switch (type) {
    case 'serial':
    case 'parallel':
      base.Children = []
      break
    case 'condition':
      base.Mode = 'wait'
      base.UseAndLogic = true
      base.Conditions = []
      break
    case 'action':
      base.Actions = []
      break
    case 'branch':
      base.UseAndLogic = true
      base.Conditions = []
      base.Children = [
        { ...base, Id: id + 1, Name: '真分支', Type: 'serial', UseAndLogic: null, Conditions: null, Children: [] },
        { ...base, Id: id + 2, Name: '假分支', Type: 'serial', UseAndLogic: null, Conditions: null, Children: [] }
      ]
      break
    case 'delay':
      base.Name = '延迟'
      base.DelayMs = 1000
      break
    case 'csharprunningaction':
      base.Duration = 0
      base.Script = ''
      break
  }
  return base
}

export function createEntry(anchorGuid: string, name = '新行为组'): PtlEntry {
  const root = createNode('serial', 1)
  root.Name = '行为组'
  return {
    Guid: newGuid(),
    Name: name,
    StartAnchorGuid: anchorGuid,
    Offset: 0,
    Enabled: true,
    Remark: null,
    EntryGroup: root
  }
}

/** Blank ConditionDto with the spec's declared defaults applied */
export function createCondition(type = 'SkillCooldown'): PtlCondition {
  const base: PtlCondition = {
    Type: type,
    ActionId: null,
    Immediate: false,
    Target: null,
    BuffId: null,
    Mode: null,
    Regex: null,
    Value: null,
    Negate: false
  }
  const spec = findConditionSpec(type)
  return spec ? applySpecDefaults(base, spec) : base
}

/** Blank ActionDto with the spec's declared defaults applied */
export function createAction(type = 'enqueueskill'): PtlAction {
  const base: PtlAction = {
    Type: type,
    Qt: null,
    Enabled: false,
    Message: null,
    ActionId: null,
    SkillType: null,
    Target: null,
    HighPriority: false,
    TargetMode: null,
    Mode: null
  }
  const spec = findActionSpec(type)
  return spec ? applySpecDefaults(base, spec) : base
}

/** New minimal valid document: InCombat anchor at 0 + end anchor */
export function createEmptyPtlDocument(name: string): PtlDocument {
  const start = createAnchor(0, '--sync--')
  start.Sync = { ...createSyncRule('InCombat'), WindowBefore: 0, WindowAfter: 1 }
  const end = createAnchor(600, '结束')
  end.IsEndAnchor = true
  end.Sync = null
  return {
    Version: 1,
    Meta: {
      Name: name,
      TerritoryId: 0,
      JobId: 0,
      Author: 'PureTimeline',
      AcrAuthor: null,
      CreatedAt: new Date().toISOString(),
      Opener: null,
      Remark: null
    },
    Variables: [],
    Anchors: [start, end],
    Entries: []
  }
}

// ---------- Tree helpers ----------

export function walkNodes(root: PtlNode, cb: (node: PtlNode, parent: PtlNode | null, depth: number) => void) {
  function rec(node: PtlNode, parent: PtlNode | null, depth: number) {
    cb(node, parent, depth)
    for (const c of node.Children ?? []) rec(c, node, depth + 1)
  }
  rec(root, null, 0)
}

export function findNode(root: PtlNode, id: number): PtlNode | null {
  let found: PtlNode | null = null
  walkNodes(root, n => { if (n.Id === id && !found) found = n })
  return found
}

export function findNodeParent(root: PtlNode, id: number): PtlNode | null {
  let found: PtlNode | null = null
  walkNodes(root, (n, parent) => { if (n.Id === id && !found) found = parent })
  return found
}

export function nextNodeId(root: PtlNode): number {
  let max = 0
  walkNodes(root, n => { if (n.Id > max) max = n.Id })
  return max + 1
}

/** Reassign fresh sequential ids to a cloned subtree, continuing after maxId */
export function reassignNodeIds(node: PtlNode, startId: number): number {
  let id = startId
  walkNodes(node, n => { n.Id = id++ })
  return id
}

export function isCompositeNode(node: PtlNode): boolean {
  return node.Type === 'serial' || node.Type === 'parallel' || node.Type === 'branch'
}

// ---------- Anchor / entry ordering ----------

/** Anchors sorted by Time then Guid (mirrors plugin ordering) */
export function sortedAnchors(doc: PtlDocument): PtlAnchor[] {
  return [...doc.Anchors].sort((a, b) => a.Time - b.Time || a.Guid.localeCompare(b.Guid))
}

/** Functional anchors = not comment && not technical (segments are built from these) */
export function functionalAnchors(doc: PtlDocument): PtlAnchor[] {
  return sortedAnchors(doc).filter(a => !a.IsCommentAnchor && !a.IsTechnicalAnchor)
}

export function entriesOfAnchor(doc: PtlDocument, anchorGuid: string): PtlEntry[] {
  return doc.Entries
    .filter(e => e.StartAnchorGuid === anchorGuid)
    .sort((a, b) => a.Offset - b.Offset || a.Guid.localeCompare(b.Guid))
}

/** Segment duration from a functional anchor to the next one; null if not applicable */
export function segmentDuration(doc: PtlDocument, anchorGuid: string): number | null {
  const fn = functionalAnchors(doc)
  const idx = fn.findIndex(a => a.Guid === anchorGuid)
  if (idx < 0 || idx >= fn.length - 1) return null
  return fn[idx + 1].Time - fn[idx].Time
}

// ---------- Validation (ported from PtlDefinition.BuildSegments) ----------

export interface PtlIssue {
  level: 'error' | 'warning'
  message: string
  anchorGuid?: string
  entryGuid?: string
}

const TIME_EPSILON = 0.0001

export function validatePtlDocument(doc: PtlDocument): PtlIssue[] {
  const issues: PtlIssue[] = []
  const fn = functionalAnchors(doc)

  if (fn.length < 2) {
    issues.push({ level: 'error', message: '功能锚点（非注释/技术锚点）至少需要 2 个' })
    return issues
  }

  const first = fn[0]
  if (Math.abs(first.Time) > TIME_EPSILON) {
    issues.push({ level: 'error', message: '第一个功能锚点的时间必须为 0', anchorGuid: first.Guid })
  }
  if (!first.Sync || first.Sync.Type !== 'InCombat') {
    issues.push({ level: 'error', message: '第一个功能锚点的同步类型必须为 InCombat（进入战斗）', anchorGuid: first.Guid })
  }

  for (let i = 0; i < fn.length; i++) {
    const a = fn[i]
    if (a.Time < 0) {
      issues.push({ level: 'error', message: `锚点「${a.Name ?? ''}」时间为负数`, anchorGuid: a.Guid })
    }
    if (a.IsEndAnchor && a.IsPhaseAnchor) {
      issues.push({ level: 'error', message: `锚点「${a.Name ?? ''}」不能同时是结束锚点和阶段锚点`, anchorGuid: a.Guid })
    }
    if (i > 0 && a.Time <= fn[i - 1].Time + TIME_EPSILON) {
      issues.push({ level: 'error', message: `锚点「${a.Name ?? ''}」与上一锚点时间重复或未递增`, anchorGuid: a.Guid })
    }
  }

  const last = fn[fn.length - 1]
  if (!last.IsEndAnchor) {
    issues.push({ level: 'error', message: '最后一个功能锚点必须是结束锚点', anchorGuid: last.Guid })
  }
  for (const a of fn.slice(0, -1)) {
    if (a.IsEndAnchor) {
      issues.push({ level: 'error', message: `结束锚点「${a.Name ?? ''}」之后仍有其他锚点`, anchorGuid: a.Guid })
    }
  }

  const idxByGuid = new Map(fn.map((a, i) => [a.Guid, i]))
  for (const e of doc.Entries) {
    const idx = idxByGuid.get(e.StartAnchorGuid)
    if (idx === undefined) {
      issues.push({ level: 'error', message: `行为组「${e.Name ?? ''}」绑定的锚点不存在（或为注释/技术锚点）`, entryGuid: e.Guid })
      continue
    }
    const anchor = fn[idx]
    if (anchor.IsEndAnchor || idx >= fn.length - 1) {
      issues.push({ level: 'error', message: `行为组「${e.Name ?? ''}」不能绑定到结束锚点`, entryGuid: e.Guid })
      continue
    }
    const seg = fn[idx + 1].Time - anchor.Time
    if (e.Offset < 0 || e.Offset >= seg) {
      issues.push({
        level: 'error',
        message: `行为组「${e.Name ?? ''}」偏移 ${e.Offset}s 超出锚点区间 [0, ${seg.toFixed(1)})`,
        entryGuid: e.Guid
      })
    }
  }

  return issues
}
