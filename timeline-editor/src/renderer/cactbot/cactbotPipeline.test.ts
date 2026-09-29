import { describe, expect, it } from 'vitest'
import { parseCactbotTimeline } from './cactbotParser'
import { localizeCactbotLines } from './cactbotLocalizer'
import { mapCactbotToDocument } from './cactbotMapper'

const TIMELINE = `
0.0 "--sync--" InCombat
5.0 label "phase-one"
10.0 "Fire (cast)" StartsUsing { id: "7B9B" } window 2,3
12.0 "Fire" Ability { id: "7B9B" }
14.0 "Fire repeat" Ability { id: "7B9B" }
20.0 "Branch" Ability { id: ["7B9B", "7B9C"] } forcejump "phase-one"
# 22.0 "Commented" Ability { id: "7B9C" }
`

describe('cactbot conversion pipeline', () => {
  it('parses timeline entries, labels, windows, jumps and commented entries', () => {
    const lines = parseCactbotTimeline(TIMELINE)
    const cast = lines.find(line => line.name === 'Fire (cast)')
    const branch = lines.find(line => line.name === 'Branch')

    expect(cast).toMatchObject({ eventType: 'StartsUsing', windowBefore: 2, windowAfter: 3 })
    expect(branch).toMatchObject({ jumpTargetLabel: 'phase-one', isForceJump: true })
    expect(lines.find(line => line.name === 'Commented')?.isCommentedEntry).toBe(true)
  })

  it('applies cn replaceText rules as regexes without replacement token expansion', () => {
    const result = localizeCactbotLines(parseCactbotTimeline(TIMELINE), `
      timelineReplace: [{
        'locale': 'cn',
        'replaceText': {
          'Fire': '烈火',
          '\\\\(cast\\\\)': '（咏唱）',
          'Branch': '$& 分支',
        },
      }]
    `)

    expect(result.localizedLineCount).toBe(4)
    expect(result.lines.find(line => line.lineNumber === 4)?.name).toBe('烈火 （咏唱）')
    expect(result.lines.find(line => line.name.includes('分支'))?.name).toBe('$& 分支')
  })

  it('creates a valid-shaped PR document and deduplicates nearby syncs', () => {
    const localized = localizeCactbotLines(parseCactbotTimeline(TIMELINE), `
      timelineReplace: [{ 'locale': 'cn', 'replaceText': { 'Fire': '烈火' } }]
    `)
    const result = mapCactbotToDocument(localized.lines, 'FRU', {
      deduplicateSync: true,
      markTechnicalAnchors: false
    })

    const anchors = result.document.Anchors
    expect(anchors[0]).toMatchObject({ Time: 0, Sync: { Type: 'InCombat' } })
    expect(anchors.at(-1)).toMatchObject({ IsEndAnchor: true })
    expect(anchors.every((anchor, index) => index === 0 || anchor.Time > anchors[index - 1].Time)).toBe(true)
    expect(anchors.find(anchor => anchor.Name === '烈火 判定')?.Sync?.Params.ActionId).toBe('31643')
    expect(anchors.find(anchor => anchor.Name === '烈火 repeat 判定')?.Sync).toBeNull()
    expect(anchors.find(anchor => anchor.Name === 'Branch 判定')?.Sync?.Params.Regex).toBe('^(?:31643|31644)$')
    expect(result.stats.deduplicatedCount).toBe(1)
    expect(result.stats.resolvedJumpCount).toBe(1)
  })

  it('keeps original times for non-overlapping jump-target sections, stacks only colliding branches', () => {
    const result = mapCactbotToDocument(parseCactbotTimeline(`
0.0 "--sync--" InCombat
6.5 "Plummet" Ability { id: "26A8" } window 6.5,0.5
7.4 label "p1-first-loop"
12.6 "Twister" Ability { id: "26AA" }
15.8 "Fireball" Ability { id: "26AC" }
23.9 "Death Sentence" Ability { id: "26A9" }
27.0 "Plummet loop" Ability { id: "26A8" } forcejump "p1-first-loop"
100.0 "--sync--" Ability { id: "26AD" } window 100,0
103.4 label "p1-second-loop"
108.5 "Liquid Hell x5" Ability { id: "26AD" } window 3,0.7
148.3 "Plummet loop2" Ability { id: "26A8" } forcejump "p1-second-loop"
600.0 label "branch-a"
605.0 "Branch A" Ability { id: "26B0" }
633.0 "Branch A2" Ability { id: "26B1" }
600.0 label "branch-b"
606.0 "Branch B" Ability { id: "26B2" }
700.0 "To A" Ability { id: "26B3" } jump "branch-a"
710.0 "To B" Ability { id: "26B4" } jump "branch-b"
    `), 'UCOB', { deduplicateSync: false, markTechnicalAnchors: false })

    const byName = (name: string) => result.document.Anchors.find(anchor => anchor.Name === name)
    expect(byName('Label: p1-first-loop')?.Time).toBeCloseTo(7.4, 3)
    expect(byName('Twister 判定')?.Time).toBeCloseTo(12.6, 3)
    expect(byName('Fireball 判定')?.Time).toBeCloseTo(15.8, 3)
    expect(byName('Death Sentence 判定')?.Time).toBeCloseTo(23.9, 3)
    expect(byName('Label: p1-second-loop')?.Time).toBeCloseTo(103.4, 3)
    expect(byName('Liquid Hell x5 判定')?.Time).toBeCloseTo(108.5, 3)
    expect(byName('Plummet loop 判定')?.Sync).toMatchObject({ MatchTime: 27.0, JumpTargetTime: 7.4 })
    expect(byName('Label: branch-a')?.Time).toBeCloseTo(600.0, 3)
    expect(byName('Label: branch-b')?.Time).toBeCloseTo(605.0, 3)
    expect(byName('Branch B 判定')?.Time).toBeCloseTo(611.0, 3)
    expect(byName('To A 判定')?.Sync?.JumpTargetTime).toBeCloseTo(600.0, 3)
    expect(byName('To B 判定')?.Sync?.JumpTargetTime).toBeCloseTo(605.0, 3)
  })
})
