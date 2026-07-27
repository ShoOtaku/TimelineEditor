import { useCallback, useEffect, useState } from 'react'
import type { CactbotCatalogFile, CactbotImportStats } from '@shared/cactbotTypes'
import { askConfirm } from '../store/dialogStore'
import { usePrStore } from '../store/prStore'
import { localizeCactbotLines } from './cactbotLocalizer'
import { mapCactbotToDocument } from './cactbotMapper'
import { parseCactbotTimeline } from './cactbotParser'

export type CactbotImportStatus = {
  kind: 'success' | 'error'
  message: string
  stats?: CactbotImportStats
} | null

export function useCactbotCatalog() {
  const [files, setFiles] = useState<CactbotCatalogFile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [truncated, setTruncated] = useState(false)

  const loadCatalog = useCallback(async (refresh: boolean) => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await window.electronAPI.listCactbotFiles(refresh)
      if (!result.success) {
        setLoadError(result.error || '无法获取 cactbot 时间轴列表')
        return
      }
      setFiles(result.files ?? [])
      setTruncated(result.truncated === true)
    } catch (error) {
      setLoadError(String(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCatalog(false) }, [loadCatalog])
  return { files, loading, loadError, truncated, loadCatalog }
}

export function useCactbotImporter(autoLocalize: boolean, deduplicateSync: boolean) {
  const [importingPath, setImportingPath] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<CactbotImportStatus>(null)
  const isDirty = usePrStore(state => state.isDirty)
  const importDocument = usePrStore(state => state.importDocument)

  const importFile = useCallback((file: CactbotCatalogFile) => runImport(file, {
    autoLocalize,
    deduplicateSync,
    isDirty,
    importDocument,
    setImportingPath,
    setImportStatus
  }), [autoLocalize, deduplicateSync, importDocument, isDirty])

  return { importingPath, importStatus, importFile }
}

interface ImportContext {
  autoLocalize: boolean
  deduplicateSync: boolean
  isDirty: boolean
  importDocument: ReturnType<typeof usePrStore.getState>['importDocument']
  setImportingPath: (path: string | null) => void
  setImportStatus: (status: CactbotImportStatus) => void
}

async function runImport(file: CactbotCatalogFile, context: ImportContext): Promise<void> {
  if (context.isDirty && !await confirmReplacement()) return
  context.setImportingPath(file.path)
  context.setImportStatus(null)
  try {
    const download = await window.electronAPI.downloadCactbotFile(
      file.path,
      context.autoLocalize && file.localizationPath !== null
    )
    if (!download.success || !download.timelineText) {
      context.setImportStatus({ kind: 'error', message: download.error || '时间轴下载失败' })
      return
    }
    const parsed = parseCactbotTimeline(download.timelineText)
    const localization = context.autoLocalize && download.localizationText
      ? localizeCactbotLines(parsed, download.localizationText, 'cn')
      : null
    const mapped = mapCactbotToDocument(localization?.lines ?? parsed, file.fileName, {
      deduplicateSync: context.deduplicateSync,
      markTechnicalAnchors: false
    })
    context.importDocument(mapped.document, file.fileName)
    context.setImportStatus({
      kind: 'success',
      message: buildImportMessage(
        file,
        mapped.stats,
        localization?.localizedLineCount ?? 0,
        localizationWarning(file, context.autoLocalize, download.localizationWarning, localization?.warning)
      ),
      stats: mapped.stats
    })
  } catch (error) {
    context.setImportStatus({ kind: 'error', message: `导入失败: ${String(error)}` })
  } finally {
    context.setImportingPath(null)
  }
}

function localizationWarning(
  file: CactbotCatalogFile,
  autoLocalize: boolean,
  downloadWarning?: string,
  parseWarning?: string | null
): string | undefined {
  if (downloadWarning) return downloadWarning
  if (parseWarning) return parseWarning
  if (autoLocalize && file.localizationPath === null) return '未找到配套本地化文件，已保留原文'
  return undefined
}

function confirmReplacement(): Promise<boolean> {
  return askConfirm({
    title: '替换当前未保存的时间轴？',
    message: '导入会用新的 cactbot 时间轴替换当前编辑内容，磁盘文件不会被修改。',
    confirmLabel: '替换并导入',
    danger: true
  })
}

function buildImportMessage(
  file: CactbotCatalogFile,
  stats: CactbotImportStats,
  localized: number,
  localizationWarning?: string
): string {
  const parts = [`已导入 ${file.fileName}`, `${stats.importedCount} 个基础锚点`]
  if (localized) parts.push(`汉化 ${localized} 行`)
  if (stats.deduplicatedCount) parts.push(`去重 ${stats.deduplicatedCount} 条同步`)
  if (stats.fallbackCount) parts.push(`${stats.fallbackCount} 条降级为延迟锚点`)
  if (localizationWarning) parts.push(localizationWarning)
  if (stats.warnings.length) parts.push(`${stats.warnings.length} 条映射警告`)
  return parts.join('，')
}
