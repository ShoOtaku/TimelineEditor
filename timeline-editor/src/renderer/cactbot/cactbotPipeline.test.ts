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
})
