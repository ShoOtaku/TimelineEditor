import type { CactbotLine } from '@shared/cactbotTypes'

const LARGE_PHASE_GAP = 300
const PHASE_ISLAND_GAP = 5

export class CactbotTimeMap {
  private readonly times = new Map<CactbotLine, number>()
  private readonly labels = new Map<string, number>()
  private readonly bases: Array<{ original: number; friendly: number }> = []

  constructor(lines: readonly CactbotLine[]) {
    const jumpLabels = new Set(lines.filter(line => !isResetCactbotJump(line) && line.jumpTargetLabel)
      .map(line => line.jumpTargetLabel!.toLowerCase()))
    const ordered = lines.filter(isMappableLine).sort((a, b) => a.time - b.time || a.lineNumber - b.lineNumber)
    this.build(ordered, jumpLabels)
  }

  get(line: CactbotLine): number {
    return this.times.get(line) ?? line.time
  }

  getLabel(label: string): number | null {
    return this.labels.get(label.toLowerCase()) ?? null
  }

  convert(original: number): number {
    const base = this.bases.filter(candidate => candidate.original <= original).at(-1)
    return base ? base.friendly + original - base.original : original
  }

  private build(lines: CactbotLine[], jumpLabels: Set<string>): void {
    let originalBase = 0
    let friendlyBase = 0
    let previous = 0
    let maxFriendly = 0

    for (const line of lines) {
      const label = (line.labelName ?? line.name).toLowerCase()
      const island = this.isPhaseIsland(line, label, previous, jumpLabels)
      let friendly = friendlyBase + line.time - originalBase
      if (line.lineType === 'label' && this.labels.has(label)) friendly = this.labels.get(label)!
      else if (island) friendly = maxFriendly + PHASE_ISLAND_GAP

      this.times.set(line, friendly)
      if (line.lineType === 'label') this.labels.set(label, friendly)
      if (line.lineType === 'label' || island) {
        this.bases.push({ original: line.time, friendly })
        originalBase = line.time
        friendlyBase = friendly
      }
      previous = line.time
      maxFriendly = Math.max(maxFriendly, friendly)
    }
  }

  private isPhaseIsland(
    line: CactbotLine,
    label: string,
    previous: number,
    jumpLabels: Set<string>
  ): boolean {
    return this.times.size > 0 && (
      line.time - previous > LARGE_PHASE_GAP ||
      (line.lineType === 'label' && jumpLabels.has(label))
    )
  }
}

export function isResetCactbotJump(line: CactbotLine): boolean {
  return line.jumpTargetTime !== null
    ? Math.abs(line.jumpTargetTime) <= 0.001
    : line.jumpTargetLabel === '0'
}

function isMappableLine(line: CactbotLine): boolean {
  return line.lineType === 'label' || (line.lineType === 'timeline-entry' && !line.isCommentedEntry)
}
