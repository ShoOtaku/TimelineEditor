// simEngine 单测：用合成事件流验证与 PromeRotation 运行时一致的关键语义
import { describe, expect, it } from 'vitest'
import type { PtlAnchor, PtlDocument, PtlEntry, PtlSyncRule } from '@shared/prTypes'
import { matchesSyncParams, runSimulation, summarizeSim } from './simEngine'
import type { SimInputEvent } from './simEngine'

let guidSeq = 0

function mkAnchor(
  time: number,
  sync?: Partial<PtlSyncRule> | null,
  flags?: Partial<PtlAnchor>
): PtlAnchor {
  const guid = `a${++guidSeq}`
  const baseSync: PtlSyncRule = {
    Type: 'ActionEffect', Params: {}, MatchTime: null, JumpTargetTime: null,
    IsForceJump: false, WindowBefore: 0, WindowAfter: 0
  }
  return {
    Guid: guid,
    Name: `A${guidSeq}@${time}`,
    Time: time,
    IsPhaseAnchor: false,
    IsEndAnchor: false,
    IsCommentAnchor: false,
    IsTechnicalAnchor: false,
    Enabled: true,
    Remark: null,
    Sync: sync == null ? (sync === null ? null : { ...baseSync }) : { ...baseSync, ...sync },
    ...flags
  }
}

function mkDoc(anchors: PtlAnchor[], entries: PtlEntry[] = []): PtlDocument {
  return {
    Version: 1,
    Meta: { TerritoryId: 0, JobId: 0 },
    Variables: [],
    Anchors: anchors,
    Entries: entries
  }
}

function mkEntry(anchorGuid: string, offset: number, enabled = true): PtlEntry {
  const guid = `e${++guidSeq}`
  return {
    Guid: guid,
    Name: `E${guidSeq}`,
    StartAnchorGuid: anchorGuid,
    Offset: offset,
    Enabled: enabled,
    Remark: null,
    EntryGroup: { Id: 1, Type: 'serial', Enabled: true, Children: [] }
  }
}

const IN_COMBAT: SimInputEvent = { tsMs: 0, type: 'InCombat', params: {}, label: '进入战斗' }

function cast(sec: number, actionId: string, type: 'CastStart' | 'ActionEffect' = 'ActionEffect'): SimInputEvent {
  return { tsMs: sec * 1000, type, params: { ActionId: actionId }, label: `技能(${actionId})` }
}

function end(sec: number): SimInputEvent {
  return { tsMs: sec * 1000, type: 'CombatEnd', params: {}, label: '战斗结束' }
}

/** 常用骨架：InCombat@0 + 中间锚点 + End@endTime */
function mkSkeleton(mids: PtlAnchor[], endTime = 600): PtlAnchor[] {
  return [mkAnchor(0, { Type: 'InCombat' }), ...mids, mkAnchor(endTime, null, { IsEndAnchor: true })]
}

describe('matchesSyncParams', () => {
  it('空 Params 匹配任意事件', () => {
    expect(matchesSyncParams({}, { ActionId: '123' })).toBe(true)
  })
  it('ActionId 相等（大小写不敏感键）', () => {
    expect(matchesSyncParams({ ActionId: '123' }, { ActionId: '123' })).toBe(true)
    expect(matchesSyncParams({ actionid: '123' }, { ActionId: '123' })).toBe(true)
    expect(matchesSyncParams({ ActionId: '123' }, { ActionId: '124' })).toBe(false)
  })
  it('管道多选一 a|b|c', () => {
    expect(matchesSyncParams({ ActionId: '100| 200 |300' }, { ActionId: '200' })).toBe(true)
    expect(matchesSyncParams({ ActionId: '100|200' }, { ActionId: '300' })).toBe(false)
  })
  it('Regex 键对任意事件参数值匹配（ActionId 数字串）', () => {
    expect(matchesSyncParams({ Regex: '^12' }, { ActionId: '12345' })).toBe(true)
    expect(matchesSyncParams({ Regex: '^12' }, { ActionId: '23456' })).toBe(false)
  })
  it('Regex:ActionId 只匹配指定参数', () => {
    expect(matchesSyncParams({ 'Regex:ActionId': '4$' }, { ActionId: '1234' })).toBe(true)
    expect(matchesSyncParams({ 'Regex:ActionId': '4$' }, { ActionId: '1240' })).toBe(false)
  })
  it('无效正则不匹配而不是抛错', () => {
    expect(matchesSyncParams({ Regex: '[' }, { ActionId: '123' })).toBe(false)
  })
})

describe('runSimulation 启动与停止', () => {
  it('没有 InCombat 事件时不启动', () => {
    const doc = mkDoc(mkSkeleton([mkAnchor(10, { Params: { ActionId: '100' } })]))
    const r = runSimulation(doc, [cast(5, '100'), end(50)])
    expect(r.started).toBe(false)
    expect(r.stopped).toBe(false)
    expect(r.anchors[1].status).toBe('pending')
  })

  it('首锚点非 InCombat 时不启动（插件永远等待）', () => {
    const anchors = [mkAnchor(0, { Type: 'ActionEffect', Params: { ActionId: '100' } }), mkAnchor(600, null, { IsEndAnchor: true })]
    const r = runSimulation(mkDoc(anchors), [IN_COMBAT, cast(5, '100'), end(50)])
    expect(r.started).toBe(false)
    expect(r.startDetail).toContain('InCombat')
  })

  it('到达 End 锚点自动停止，之后的事件不再处理', () => {
    const mid = mkAnchor(50, { Params: { ActionId: '100' }, WindowBefore: 5, WindowAfter: 5 })
    const doc = mkDoc(mkSkeleton([mid], 100))
    // 没有匹配事件：时钟流逝到 100 停止（CombatEnd 在 500）
    const r = runSimulation(doc, [IN_COMBAT, end(500)])
    expect(r.started).toBe(true)
    expect(r.stopped).toBe(true)
    expect(r.stopReason).toContain('EndAnchor')
    expect(r.finalTimelineTime).toBeCloseTo(100, 3)
  })

  it('战斗结束时窗口未耗尽的锚点保持 pending', () => {
    const mid = mkAnchor(500, { Params: { ActionId: '100' } }) // 默认窗口 [497.5, 502.5]
    const doc = mkDoc(mkSkeleton([mid], 1000))
    const r = runSimulation(doc, [IN_COMBAT, end(100)])
    expect(r.stopped).toBe(true)
    expect(r.stopReason).toBe('战斗结束')
    expect(r.anchors[1].status).toBe('pending')
  })
})

describe('runSimulation 锚点匹配', () => {
  it('窗口内命中 → 时钟硬拉到 JumpTargetTime（缺省=锚点时间）', () => {
    const mid = mkAnchor(10, { Params: { ActionId: '100' }, WindowBefore: 5, WindowAfter: 5 })
    const doc = mkDoc(mkSkeleton([mid], 100))
    const r = runSimulation(doc, [IN_COMBAT, cast(12, '100'), end(50)])
    const a = r.anchors[1]
    expect(a.status).toBe('matched')
    expect(a.delta).toBeCloseTo(-2, 3) // targetTime(10) - 命中时刻(12)
    expect(a.eventTsMs).toBe(12000)
    // 命中后时钟=10，战斗 50 秒结束时时间轴时间 = 10 + (50-12) = 48
    expect(r.finalTimelineTime).toBeCloseTo(48, 3)
  })

  it('默认窗口：普通锚点 ±2.5s + 0.5s 事件宽限', () => {
    const mk = () => mkAnchor(10, { Params: { ActionId: '100' } })
    // 12.9 ≤ 12.5+0.5 → 命中
    const r1 = runSimulation(mkDoc(mkSkeleton([mk()], 100)), [IN_COMBAT, cast(12.9, '100'), end(50)])
    expect(r1.anchors[1].status).toBe('matched')
    // 13.1 > 13.0 → 过期
    const r2 = runSimulation(mkDoc(mkSkeleton([mk()], 100)), [IN_COMBAT, cast(13.1, '100'), end(50)])
    expect(r2.anchors[1].status).toBe('expired')
  })

  it('阶段锚点默认窗口 ±10s', () => {
    const mid = mkAnchor(10, { Params: { ActionId: '100' } }, { IsPhaseAnchor: true })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, cast(20.4, '100'), end(60)])
    expect(r.anchors[1].status).toBe('matched')
  })

  it('一次事件只消费一个 PendingSync（按 |MatchTime-当前| 最近优先）', () => {
    const a10 = mkAnchor(10, { Params: { ActionId: '100' }, WindowBefore: 5, WindowAfter: 5 })
    const a105 = mkAnchor(10.5, { Params: { ActionId: '100' }, WindowBefore: 5, WindowAfter: 5 })
    const doc = mkDoc(mkSkeleton([a10, a105], 100))
    const r = runSimulation(doc, [IN_COMBAT, cast(12, '100'), cast(12.2, '100'), end(50)])
    // 12s 事件：|10.5-12|=1.5 < |10-12|=2 → 先中 a105，时钟拉到 10.5
    // 12.2s 事件（真实时间）：时钟=10.5+(12.2-12)=10.7 → |10-10.7|=0.7 → 中 a10
    expect(r.anchors[1].status).toBe('matched')
    expect(r.anchors[2].status).toBe('matched')
    expect(r.anchors[2].delta).toBeCloseTo(-1.5, 3)
    expect(r.anchors[1].delta).toBeCloseTo(-0.7, 3)
  })

  it('窗口未打开前的事件不匹配', () => {
    const mid = mkAnchor(10, { Params: { ActionId: '100' }, WindowBefore: 2, WindowAfter: 2 })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, cast(7, '100'), end(50)])
    expect(r.anchors[1].status).toBe('expired')
  })

  it('CastStart 与 ActionEffect 是不同事件类型，互不匹配', () => {
    const mid = mkAnchor(10, { Type: 'CastStart', Params: { ActionId: '100' }, WindowBefore: 5, WindowAfter: 5 })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, cast(10, '100', 'ActionEffect'), end(50)])
    expect(r.anchors[1].status).toBe('expired')
    const r2 = runSimulation(mkDoc(mkSkeleton([mkAnchor(10, { Type: 'CastStart', Params: { ActionId: '100' } })], 100)),
      [IN_COMBAT, cast(10, '100', 'CastStart'), end(50)])
    expect(r2.anchors[1].status).toBe('matched')
  })

  it('阶段锚点命中后清理更早的 Pending', () => {
    const a20 = mkAnchor(20, { Params: { ActionId: '200' }, WindowBefore: 5, WindowAfter: 60 }) // 大窗口保持 pending
    const p30 = mkAnchor(30, { Params: { ActionId: '100' }, WindowBefore: 25, WindowAfter: 5 }, { IsPhaseAnchor: true })
    const doc = mkDoc(mkSkeleton([a20, p30], 100))
    const r = runSimulation(doc, [IN_COMBAT, cast(15, '100'), end(60)])
    // p30 在 15s 命中（窗口 [5,35]），阶段锚点清理 MatchTime<30 的 a20
    expect(r.anchors[2].status).toBe('matched')
    expect(r.anchors[1].status).toBe('expired')
    expect(r.anchors[1].detail).toContain('阶段锚点')
  })
})

describe('runSimulation ForceJump', () => {
  it('时钟到达 MatchTime 即跳 TargetTime（无需事件），并清理更早 Pending', () => {
    const fj = mkAnchor(20, {
      Params: { ActionId: '100' }, MatchTime: 20, JumpTargetTime: 30, IsForceJump: true,
      WindowBefore: 5, WindowAfter: 5
    })
    const other = mkAnchor(25, { Params: { ActionId: '200' }, WindowBefore: 5, WindowAfter: 60 })
    const doc = mkDoc(mkSkeleton([fj, other], 100))
    const r = runSimulation(doc, [IN_COMBAT, end(80)])
    expect(r.anchors[1].status).toBe('matched')
    expect(r.anchors[1].forceJump).toBe(true)
    // other.MatchTime=25 < 跳到的新时间 30 → 过期
    expect(r.anchors[2].status).toBe('expired')
    expect(r.logs.some(l => l.text.startsWith('Forcejump:'))).toBe(true)
    // 80s 战斗结束时钟 = 30 + (80-20) = 90
    expect(r.finalTimelineTime).toBeCloseTo(90, 3)
  })

  it('TargetTime ≤ MatchTime 的 ForceJump 永不触发', () => {
    const fj = mkAnchor(20, {
      Params: { ActionId: '100' }, MatchTime: 20, JumpTargetTime: 10, IsForceJump: true,
      WindowBefore: 5, WindowAfter: 5
    })
    const r = runSimulation(mkDoc(mkSkeleton([fj], 100)), [IN_COMBAT, end(80)])
    expect(r.anchors[1].status).toBe('expired')
  })
})

describe('runSimulation 特殊锚点类型', () => {
  it('ActorControl/Lua/Manual 标为永不触发', () => {
    const anchors = mkSkeleton([
      mkAnchor(10, { Type: 'ActorControl' }),
      mkAnchor(20, { Type: 'Lua' }),
      mkAnchor(30, { Type: 'Manual' })
    ], 100)
    const r = runSimulation(mkDoc(anchors), [IN_COMBAT, end(50)])
    expect(r.anchors[1].status).toBe('unsupported')
    expect(r.anchors[2].status).toBe('unsupported')
    expect(r.anchors[3].status).toBe('unsupported')
  })

  it('无 ACT 事件源的类型带 noActSource 标记并自然过期', () => {
    const mid = mkAnchor(10, { Type: 'ChatLog', Params: { Message: 'x' } })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, end(50)])
    expect(r.anchors[1].status).toBe('expired')
    expect(r.anchors[1].noActSource).toBe(true)
  })

  it('注释锚点的 sync 仍参与匹配（插件全量加载）', () => {
    const mid = mkAnchor(10, { Params: { ActionId: '100' } }, { IsCommentAnchor: true })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, cast(10, '100'), end(50)])
    expect(r.anchors[1].status).toBe('matched')
    expect(r.anchors[1].kind).toBe('comment')
  })

  it('禁用锚点不参与匹配', () => {
    const mid = mkAnchor(10, { Params: { ActionId: '100' } }, { Enabled: false })
    const r = runSimulation(mkDoc(mkSkeleton([mid], 100)), [IN_COMBAT, cast(10, '100'), end(50)])
    expect(r.anchors[1].status).toBe('nosync')
    expect(r.anchors[1].detail).toContain('禁用')
  })
})

describe('runSimulation 行为组激活', () => {
  it('Offset 到点激活，激活时刻可映射回日志时间', () => {
    const anchors = mkSkeleton([mkAnchor(50, { Params: { ActionId: '100' } })], 100)
    const entry = mkEntry(anchors[0].Guid, 5)
    const doc = mkDoc(anchors, [entry])
    const r = runSimulation(doc, [IN_COMBAT, end(80)])
    const e = r.entries[0]
    expect(e.status).toBe('activated')
    expect(e.activatedTimeline).toBeCloseTo(5, 3)
    expect(e.activatedTsMs).toBe(5000)
  })

  it('时钟前跳跨过整段 → 段内 Entry 不补触发（segmentSkipped）', () => {
    const a50 = mkAnchor(50, { Params: { ActionId: '100' }, WindowBefore: 30, WindowAfter: 5 })
    const anchors = mkSkeleton([a50], 100)
    // 段 [0,50) 内的 Entry offset=40；事件在 t=25 命中 a50 → 时钟跳到 50，Entry 未到达 Offset
    const entry = mkEntry(anchors[0].Guid, 40)
    const r = runSimulation(mkDoc(anchors, [entry]), [IN_COMBAT, cast(25, '100'), end(80)])
    expect(r.anchors[1].status).toBe('matched')
    expect(r.entries[0].status).toBe('notReached') // 段进入过（t<50 时），但时钟跳走了
  })

  it('整段从未进入 → segmentSkipped', () => {
    const a50 = mkAnchor(50, { Params: { ActionId: '100' }, WindowBefore: 30, WindowAfter: 60 })
    const anchors = mkSkeleton([a50, mkAnchor(100, { Params: { ActionId: '200' }, WindowBefore: 90, WindowAfter: 5 })], 200)
    // Entry 挂在 a50 的段 [50,100)；a100 在 t=10 被命中（窗口 [10,105]）→ 跳到 100，段 [50,100) 从未进入
    const entry = mkEntry(a50.Guid, 10)
    const r = runSimulation(mkDoc(anchors, [entry]), [IN_COMBAT, cast(10, '200'), end(150)])
    expect(r.entries[0].status).toBe('segmentSkipped')
  })

  it('Offset 越界 → outOfRange（加载期告警）', () => {
    const anchors = mkSkeleton([mkAnchor(50, { Params: { ActionId: '100' } })], 100)
    const entry = mkEntry(anchors[0].Guid, 60) // 段长 50
    const r = runSimulation(mkDoc(anchors, [entry]), [IN_COMBAT, end(80)])
    expect(r.entries[0].status).toBe('outOfRange')
    expect(r.logs.some(l => l.text.includes('越界 Entry 已跳过'))).toBe(true)
  })

  it('禁用 Entry 不激活；绑定注释锚点 → invalidBinding', () => {
    const comment = mkAnchor(30, null, { IsCommentAnchor: true })
    const anchors = mkSkeleton([comment], 100)
    const disabled = mkEntry(anchors[0].Guid, 5, false)
    const wrong = mkEntry(comment.Guid, 5)
    const r = runSimulation(mkDoc(anchors, [disabled, wrong]), [IN_COMBAT, end(80)])
    expect(r.entries[0].status).toBe('disabled')
    expect(r.entries[1].status).toBe('invalidBinding')
  })

  it('时钟回跳不重放已激活的 Entry', () => {
    const a50 = mkAnchor(50, { Params: { ActionId: '100' }, JumpTargetTime: 10, WindowBefore: 30, WindowAfter: 60 })
    const anchors = mkSkeleton([a50], 200)
    const entry = mkEntry(anchors[0].Guid, 5)
    // t=6：Entry 已激活；t=60 命中 a50，delta=10-60=-50 → 时钟回跳到 10；Entry 不得二次激活
    const r = runSimulation(mkDoc(anchors, [entry]), [IN_COMBAT, cast(60, '100'), end(150)])
    expect(r.entries[0].status).toBe('activated')
    expect(r.logs.filter(l => l.text.startsWith('EntryInstance 创建')).length).toBe(1)
    expect(r.anchors[1].delta).toBeCloseTo(-50, 3)
  })
})

describe('summarizeSim', () => {
  it('统计锚点与行为组', () => {
    const a1 = mkAnchor(10, { Params: { ActionId: '100' } })
    const a2 = mkAnchor(20, { Params: { ActionId: '200' } })
    const anchors = mkSkeleton([a1, a2], 100)
    const ok = mkEntry(anchors[0].Guid, 5)
    const bad = mkEntry(anchors[0].Guid, 999)
    const r = runSimulation(mkDoc(anchors, [ok, bad]), [IN_COMBAT, cast(10, '100'), end(50)])
    const s = summarizeSim(r)
    expect(s.anchorSynced).toBe(3) // InCombat 首锚点 + 2 个 ActionEffect
    expect(s.anchorMatched).toBe(2)
    expect(s.anchorExpired).toBe(1)
    expect(s.entryActivated).toBe(1)
    expect(s.entryOutOfRange).toBe(1)
  })
})
