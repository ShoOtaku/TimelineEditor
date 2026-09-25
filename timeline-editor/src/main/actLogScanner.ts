// ACT 日志文件流式扫描/窗口解析（Node fs，不依赖 electron，可独立验证）
// 大文件（全天日志可达 100MB+）整读进内存代价高，这里按行流式处理并上报进度

import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { createInterface } from 'readline'
import type { ActActorInfo, ActLogEvent, ActScanResult } from '../shared/actTypes'
import {
  ActEncounterTracker,
  parseAddCombatantLine,
  parseChangeZoneLine,
  parseCombatLine
} from './actLogParser'

/** 窗口解析提前结束的余量：容忍日志行轻微乱序，超过 end+余量 才停止读取 */
const WINDOW_OVERSHOOT_MS = 30_000
const CANCEL_CHECK_MASK = 4095
const PROGRESS_STEP_BYTES = 8 * 1024 * 1024

export class ActCancelledError extends Error {
  constructor() { super('已取消') }
}

/** ClassJob 合法范围（1-41，含基础职业与特职；超出视为读出垃圾数据） */
function isValidJobId(job: number): boolean {
  return job >= 1 && job <= 41
}

class WindowEndSignal extends Error {
  constructor() { super('window end') }
}

export interface StreamOptions {
  isCancelled?: () => boolean
  onProgress?: (percent: number, lines: number) => void
}

async function forEachLine(
  path: string,
  fileSize: number,
  opts: StreamOptions,
  onLine: (line: string) => void
): Promise<number> {
  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  let lines = 0
  let lastReported = 0
  try {
    for await (const line of rl) {
      lines += 1
      if (opts.isCancelled && (lines & CANCEL_CHECK_MASK) === 0 && opts.isCancelled()) {
        throw new ActCancelledError()
      }
      onLine(line)
      if (opts.onProgress && stream.bytesRead - lastReported >= PROGRESS_STEP_BYTES) {
        lastReported = stream.bytesRead
        opts.onProgress(Math.min(100, (stream.bytesRead / fileSize) * 100), lines)
      }
    }
  } catch (error) {
    if (error instanceof WindowEndSignal) return lines
    throw error
  } finally {
    rl.close()
    stream.destroy()
  }
  return lines
}

/** 整文件扫描：战斗分段（按间隔）+ 玩家单位表（03 AddCombatant） */
export async function scanActLogFile(
  path: string,
  gapMs: number,
  opts: StreamOptions = {}
): Promise<ActScanResult> {
  const fileSize = (await stat(path)).size
  const tracker = new ActEncounterTracker(gapMs)
  const actors = new Map<number, ActActorInfo>()

  await forEachLine(path, fileSize, opts, line => {
    const c0 = line.charCodeAt(0)
    if (c0 === 0x32 /* '2' */) {
      const combat = parseCombatLine(line)
      if (combat) tracker.feedCombat(combat)
    } else if (c0 === 0x30 /* '0' */) {
      const c1 = line.charCodeAt(1)
      if (c1 === 0x31 /* '1' */) {
        const zone = parseChangeZoneLine(line)
        if (zone) tracker.changeZone(zone.zoneName)
      } else if (c1 === 0x33 /* '3' */) {
        const actor = parseAddCombatantLine(line)
        if (actor) {
          // 非队员的单位数据常读出非法职业（0 或越界）；优先保留职业合法的记录
          const existing = actors.get(actor.id)
          if (!existing || isValidJobId(actor.job) || !isValidJobId(existing.job)) {
            actors.set(actor.id, actor)
          }
        }
      }
    }
  })

  return {
    path,
    size: fileSize,
    encounters: tracker.finish(),
    actors: [...actors.values()]
  }
}

/** 时间窗解析：提取 [start, end] 内的 20/21/22 事件（文件按时间有序，越过窗口提前结束） */
export async function parseActLogWindow(
  path: string,
  start: number,
  end: number,
  opts: StreamOptions = {}
): Promise<ActLogEvent[]> {
  const fileSize = (await stat(path)).size
  const events: ActLogEvent[] = []

  await forEachLine(path, fileSize, opts, line => {
    if (line.charCodeAt(0) !== 0x32 /* '2' */) return
    const combat = parseCombatLine(line)
    if (!combat) return
    if (combat.ts > end + WINDOW_OVERSHOOT_MS) throw new WindowEndSignal()
    if (combat.ts < start || combat.ts > end) return
    events.push(combat)
  })

  return events
}
