import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { readAllAcrDlls, type AcrMetaType } from './dotnetMeta'

type FieldKind = 'boolean' | 'number' | 'string' | 'object'

interface TypeAccumulator {
  displayName: string
  assemblyName: string
  fields: Map<string, Set<FieldKind>>
  fieldMeta: Map<string, { typeName?: string; enumValues?: { name: string; value: number }[] }>
  interfaces?: string[]
  baseType?: string
  sampleQtKeys: Set<string>
  sampleQtList: Map<string, boolean>
  sampleQtStatesKeys: Set<string>
  allStrings: string[]
}

type TypeMap = Map<string, TypeAccumulator>

export function registerAcrIpc(getTriggerlinesDir: () => string, getAcrDir: () => string): void {
  ipcMain.handle('acr:listDlls', async () => {
    try {
      return { success: true, dlls: await listAcrDlls(getAcrDir()) }
    } catch (error) {
      return { success: false, error: String(error), dlls: [] }
    }
  })

  ipcMain.handle('acr:discoverTypes', async () => {
    try {
      const conditions: TypeMap = new Map()
      const actions: TypeMap = new Map()
      await scanDirectory(getTriggerlinesDir(), conditions, actions)
      await mergeDllMetadata(getAcrDir(), conditions, actions)
      return {
        success: true,
        conditions: serializeTypes(conditions),
        actions: serializeTypes(actions),
        acrDlls: await listAcrDlls(getAcrDir())
      }
    } catch (error) {
      return { success: false, error: String(error), conditions: [], actions: [], acrDlls: [] }
    }
  })
}

async function scanDirectory(directory: string, conditions: TypeMap, actions: TypeMap): Promise<void> {
  if (!existsSync(directory)) return
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && entry.name !== 'bak') {
      await scanDirectory(path, conditions, actions)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      await scanTimeline(path, conditions, actions)
    }
  }
}

async function scanTimeline(path: string, conditions: TypeMap, actions: TypeMap): Promise<void> {
  try {
    const document = JSON.parse(await readFile(path, 'utf-8'))
    walkNode(document.TreeRoot, conditions, actions)
  } catch {
    // A malformed timeline must not prevent discovery from the remaining files.
  }
}

function walkNode(node: Record<string, unknown> | null, conditions: TypeMap, actions: TypeMap): void {
  if (!node) return
  for (const condition of arrayOfRecords(node.TriggerConds)) {
    if (isAcrType(condition.$type)) registerSample(conditions, condition)
  }
  for (const action of arrayOfRecords(node.TriggerActions)) {
    if (isAcrType(action.$type)) registerSample(actions, action)
  }
  for (const child of arrayOfRecords(node.Childs)) walkNode(child, conditions, actions)
}

function registerSample(map: TypeMap, sample: Record<string, unknown>): void {
  const type = String(sample.$type)
  const parts = type.split(',').map(value => value.trim())
  const entry = map.get(type) ?? createAccumulator(
    String(sample.DisplayName || type),
    parts[1] || 'Unknown'
  )
  map.set(type, entry)

  for (const [key, value] of Object.entries(sample)) {
    if (key === '$type' || key === 'DisplayName' || key === 'Remark') continue
    if (collectQtSamples(entry, key, value)) continue
    const kinds = entry.fields.get(key) ?? new Set<FieldKind>()
    kinds.add(inferFieldKind(value))
    entry.fields.set(key, kinds)
  }
}

function collectQtSamples(entry: TypeAccumulator, key: string, value: unknown): boolean {
  if (key === 'qtValues' && isRecord(value)) {
    Object.keys(value).forEach(name => entry.sampleQtKeys.add(name))
  } else if (key === 'QTList' && Array.isArray(value)) {
    value.filter(isRecord).forEach(item => {
      if (typeof item.Key === 'string') entry.sampleQtList.set(item.Key, Boolean(item.Value))
    })
  } else if (key === 'QtStates' && isRecord(value)) {
    Object.keys(value).forEach(name => entry.sampleQtStatesKeys.add(name))
  } else {
    return false
  }
  entry.fields.set(key, new Set(['object']))
  return true
}

async function mergeDllMetadata(directory: string, conditions: TypeMap, actions: TypeMap): Promise<void> {
  try {
    const dllTypes = await readAllAcrDlls(directory)
    for (const metadata of dllTypes) mergeDllType(metadata, metadata.kind === 'condition' ? conditions : actions)
    console.log(`DLL metadata: ${dllTypes.length} ACR types discovered`)
  } catch (error) {
    console.warn('DLL metadata reading failed (non-critical):', error)
  }
}

function mergeDllType(metadata: AcrMetaType, map: TypeMap): void {
  const entry = map.get(metadata.$type) ?? createAccumulator(metadata.displayName, metadata.assemblyName)
  map.set(metadata.$type, entry)
  entry.interfaces ??= metadata.interfaces
  entry.baseType ??= metadata.baseType
  if (metadata.allStrings?.length) entry.allStrings = metadata.allStrings
  for (const field of metadata.fields) {
    const kinds = entry.fields.get(field.key) ?? new Set<FieldKind>()
    kinds.add(field.type)
    entry.fields.set(field.key, kinds)
    if ((field.typeName || field.enumValues) && !entry.fieldMeta.has(field.key)) {
      entry.fieldMeta.set(field.key, { typeName: field.typeName, enumValues: field.enumValues })
    }
  }
}

function serializeTypes(map: TypeMap): unknown[] {
  return [...map.entries()].map(([type, entry]) => ({
    $type: type,
    displayName: entry.displayName,
    assemblyName: entry.assemblyName,
    fields: [...entry.fields.entries()].map(([key, kinds]) => ({
      key,
      type: chooseFieldKind(kinds),
      ...entry.fieldMeta.get(key)
    })),
    ...(entry.interfaces ? { interfaces: entry.interfaces } : {}),
    ...(entry.baseType ? { baseType: entry.baseType } : {}),
    ...(entry.sampleQtKeys.size ? { sampleQtKeys: [...entry.sampleQtKeys] } : {}),
    ...(entry.sampleQtList.size ? {
      sampleQtList: [...entry.sampleQtList].map(([Key, Value]) => ({ Key, Value }))
    } : {}),
    ...(entry.sampleQtStatesKeys.size ? { sampleQtStatesKeys: [...entry.sampleQtStatesKeys] } : {}),
    ...(entry.allStrings.length ? { allStrings: entry.allStrings } : {})
  }))
}

async function listAcrDlls(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return []
  const dlls: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(directory, entry.name, `${entry.name}.dll`))) {
      dlls.push(entry.name)
    }
  }
  return dlls
}

function createAccumulator(displayName: string, assemblyName: string): TypeAccumulator {
  return {
    displayName,
    assemblyName,
    fields: new Map(),
    fieldMeta: new Map(),
    sampleQtKeys: new Set(),
    sampleQtList: new Map(),
    sampleQtStatesKeys: new Set(),
    allStrings: []
  }
}

function chooseFieldKind(kinds: Set<FieldKind>): FieldKind {
  if (kinds.has('object')) return 'object'
  if (kinds.size === 1) return [...kinds][0]
  return 'string'
}

function inferFieldKind(value: unknown): FieldKind {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (value !== null && typeof value === 'object') return 'object'
  return 'string'
}

function isAcrType(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('AEAssist.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}
