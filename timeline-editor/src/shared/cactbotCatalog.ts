import type { CactbotCatalogFile, GitHubTreeResponse } from './cactbotTypes'

export const CACTBOT_DATA_PREFIX = 'ui/raidboss/data/'

const VERSION_NAMES: Record<string, string> = {
  '02-arr': '2.0 重生之境',
  '03-hw': '3.0 苍穹之禁城',
  '04-sb': '4.0 红莲之狂潮',
  '05-shb': '5.0 暗影之逆焰',
  '05-ew': '6.0 晓月之终途',
  '06-ew': '6.0 晓月之终途',
  '07-dt': '7.0 金曦之遗辉'
}

const CATEGORY_MAP: Record<string, { label: string; sort: number }> = {
  raid: { label: '零式', sort: 0 },
  ultimate: { label: '绝本', sort: 1 },
  trial: { label: '极神', sort: 2 },
  dungeon: { label: '副本', sort: 3 },
  alliance: { label: '24人', sort: 4 },
  'deep-dungeon': { label: '深宫', sort: 5 },
  variant: { label: '多变', sort: 6 },
  field: { label: '特殊', sort: 7 }
}

export function isAllowedCactbotPath(path: string, extension: '.txt' | '.ts'): boolean {
  return path.startsWith(CACTBOT_DATA_PREFIX) &&
    path.endsWith(extension) &&
    !path.includes('..') &&
    /^[A-Za-z0-9_./-]+$/.test(path)
}

export function buildCactbotCatalog(response: GitHubTreeResponse): CactbotCatalogFile[] {
  const entries = Array.isArray(response.tree) ? response.tree : []
  const localizationPaths = new Set(
    entries.filter(entry => entry.type === 'blob' && isAllowedCactbotPath(entry.path, '.ts'))
      .map(entry => entry.path.toLowerCase())
  )

  return entries
    .filter(entry => entry.type === 'blob' &&
      isAllowedCactbotPath(entry.path, '.txt') &&
      isTimelineCatalogPath(entry.path))
    .map(toCatalogFile)
    .map(file => ({
      ...file,
      localizationPath: localizationPaths.has(file.path.slice(0, -4).toLowerCase() + '.ts')
        ? file.path.slice(0, -4) + '.ts'
        : null
    }))
    .sort(compareCatalogFiles)
}

function isTimelineCatalogPath(path: string): boolean {
  return path.slice(CACTBOT_DATA_PREFIX.length).split('/').length >= 3
}

function toCatalogFile(entry: { path: string; size?: number }): CactbotCatalogFile {
  const relative = entry.path.slice(CACTBOT_DATA_PREFIX.length)
  const parts = relative.split('/')
  const rawVersion = parts[0] || 'unknown'
  const knownVersion = VERSION_NAMES[rawVersion]
  const subFolder = parts.length >= 3 ? parts[1] : ''
  const category = CATEGORY_MAP[subFolder] ?? { label: subFolder || '其他', sort: 99 }

  return {
    path: entry.path,
    localizationPath: null,
    fileName: (parts.at(-1) || '').replace(/\.txt$/i, ''),
    versionFolder: knownVersion ? rawVersion : '99-other',
    versionLabel: knownVersion ?? '其他',
    subFolder,
    categoryLabel: category.label,
    categorySort: category.sort,
    size: entry.size ?? 0
  }
}

function compareCatalogFiles(a: CactbotCatalogFile, b: CactbotCatalogFile): number {
  return a.versionFolder.localeCompare(b.versionFolder) ||
    a.categorySort - b.categorySort ||
    a.fileName.localeCompare(b.fileName, 'zh-CN')
}
