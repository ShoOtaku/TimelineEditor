import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile, watch, stat, readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { readAllAcrDlls } from './dotnetMeta'

let mainWindow: BrowserWindow | null = null

// --- AE Directory Configuration ---

const DEFAULT_AE_DIR = join(
  app.getPath('appData'),
  'XIVLauncherCN',
  'offlineplugins',
  'AE'
)

const CONFIG_PATH = join(app.getPath('userData'), 'ae-config.json')

let aeDirectory: string = DEFAULT_AE_DIR

function getTriggerlinesDir(): string {
  return join(aeDirectory, 'Triggerlines')
}

function getAcrDir(): string {
  return join(aeDirectory, 'ACR')
}

async function loadAeConfig(): Promise<void> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = await readFile(CONFIG_PATH, 'utf-8')
      const cfg = JSON.parse(raw)
      if (cfg.aeDirectory && typeof cfg.aeDirectory === 'string') {
        aeDirectory = cfg.aeDirectory
        console.log('Loaded AE directory from config:', aeDirectory)
      }
    }
  } catch (err) {
    console.warn('Failed to load AE config, using default:', err)
  }
}

async function saveAeConfig(): Promise<void> {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(CONFIG_PATH, JSON.stringify({ aeDirectory }, null, 2), 'utf-8')
    console.log('Saved AE directory to config:', aeDirectory)
  } catch (err) {
    console.error('Failed to save AE config:', err)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#111827',
    title: 'Timeline Editor',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // In dev mode, vite-plugin-electron sets VITE_DEV_SERVER_URL.
  // But if it's not set (v1 API), fall back to checking app.isPackaged.
  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else if (!app.isPackaged) {
    // Dev fallback: try the default Vite port
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

// --- IPC Handlers ---

// File: read
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// File: write
ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
  try {
    await writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// File: exists
ipcMain.handle('file:exists', async (_event, filePath: string) => {
  return existsSync(filePath)
})

// File: stat
ipcMain.handle('file:stat', async (_event, filePath: string) => {
  try {
    const s = await stat(filePath)
    return {
      success: true,
      size: s.size,
      mtime: s.mtimeMs,
      isDirectory: s.isDirectory()
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// File: list directory
ipcMain.handle('file:listDir', async (_event, dirPath: string) => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return {
      success: true,
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory()
      }))
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Dialog: open file
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return { cancelled: true }
  const triggerlinesDir = getTriggerlinesDir()
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Timeline File',
    defaultPath: triggerlinesDir,
    filters: [
      { name: 'Timeline Files', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  return {
    cancelled: result.canceled,
    filePath: result.filePaths[0] || null
  }
})

// Dialog: save file
ipcMain.handle('dialog:saveFile', async (_event, defaultName?: string) => {
  if (!mainWindow) return { cancelled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Timeline File',
    defaultPath: join(getTriggerlinesDir(), defaultName || 'NewTriggerline.json'),
    filters: [
      { name: 'Timeline Files', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return {
    cancelled: result.canceled,
    filePath: result.filePath || null
  }
})

// App: get default directory (Triggerlines)
ipcMain.handle('app:getDefaultDir', async () => {
  return getTriggerlinesDir()
})

// App: get AE directory
ipcMain.handle('app:getAeDirectory', async () => {
  return aeDirectory
})

// Dialog: select AE directory
ipcMain.handle('dialog:selectAeDirectory', async () => {
  if (!mainWindow) return { cancelled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 AE 目录 (包含 Triggerlines 和 ACR 子目录)',
    defaultPath: aeDirectory,
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) {
    return { cancelled: true }
  }
  aeDirectory = result.filePaths[0]
  await saveAeConfig()
  // Notify all renderer windows
  BrowserWindow.getAllWindows().forEach(w => {
    w.webContents.send('ae:directoryChanged', aeDirectory)
    w.webContents.send('acr:typesChanged')
  })
  return { cancelled: false, directory: aeDirectory }
})

// App: get ACR directory
ipcMain.handle('app:getAcrDir', async () => {
  return getAcrDir()
})

// ACR: list DLLs in ACR directory
ipcMain.handle('acr:listDlls', async () => {
  try {
    const acrDir = getAcrDir()
    if (!existsSync(acrDir)) return { success: true, dlls: [] }
    const entries = await readdir(acrDir, { withFileTypes: true })
    const dlls: string[] = []
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const dllPath = join(acrDir, e.name, `${e.name}.dll`)
      if (existsSync(dllPath)) {
        dlls.push(e.name)
      }
    }
    return { success: true, dlls }
  } catch (err) {
    return { success: false, error: String(err), dlls: [] }
  }
})

// ACR: discover types from timeline files
ipcMain.handle('acr:discoverTypes', async () => {
  try {
    const triggerlinesDir = getTriggerlinesDir()
    const conditions = new Map<string, {
      displayName: string; assemblyName: string; fields: Map<string, Set<string>>
      fieldMeta: Map<string, { typeName?: string; enumValues?: { name: string; value: number }[] }>
      interfaces?: string[]; baseType?: string
      sampleQtKeys: Set<string>; sampleQtList: Map<string, boolean>; sampleQtStatesKeys: Set<string>
      allStrings: string[]
    }>()
    const actions = new Map<string, {
      displayName: string; assemblyName: string; fields: Map<string, Set<string>>
      fieldMeta: Map<string, { typeName?: string; enumValues?: { name: string; value: number }[] }>
      interfaces?: string[]; baseType?: string
      sampleQtKeys: Set<string>; sampleQtList: Map<string, boolean>; sampleQtStatesKeys: Set<string>
      allStrings: string[]
    }>()

    async function scanDir(dir: string) {
      if (!existsSync(dir)) return
      const entries = await readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const fullPath = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name === 'bak') continue
          await scanDir(fullPath)
        } else if (e.name.endsWith('.json')) {
          await scanFile(fullPath)
        }
      }
    }

    async function scanFile(filePath: string) {
      try {
        const raw = await readFile(filePath, 'utf-8')
        const doc = JSON.parse(raw)
        walkNode(doc.TreeRoot)
      } catch { /* skip unreadable files */ }
    }

    function isAcrType($type: string): boolean {
      return !!$type && !$type.startsWith('AEAssist.')
    }

    function registerType($type: string, displayName: string, sample: Record<string, unknown>, isCond: boolean) {
      const parts = $type.split(',').map(s => s.trim())
      const assemblyName = parts[1] || 'Unknown'
      const map = isCond ? conditions : actions
      if (!map.has($type)) {
        map.set($type, {
          displayName, assemblyName, fields: new Map(),
          fieldMeta: new Map(),
          sampleQtKeys: new Set(), sampleQtList: new Map(), sampleQtStatesKeys: new Set(),
          allStrings: []
        })
      }
      const entry = map.get($type)!
      const knownKeys = new Set(['$type', 'DisplayName', 'Remark'])
      for (const key of Object.keys(sample)) {
        if (knownKeys.has(key)) continue
        const val = sample[key]
        // Collect qtValues keys
        if (key === 'qtValues' && typeof val === 'object' && val !== null && !Array.isArray(val)) {
          for (const qk of Object.keys(val as Record<string, unknown>)) {
            entry.sampleQtKeys.add(qk)
          }
          if (!entry.fields.has(key)) entry.fields.set(key, new Set())
          entry.fields.get(key)!.add('object')
          continue
        }
        // Collect QTList items
        if (key === 'QTList' && Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.Key === 'string') {
              entry.sampleQtList.set(item.Key, !!item.Value)
            }
          }
          if (!entry.fields.has(key)) entry.fields.set(key, new Set())
          entry.fields.get(key)!.add('object')
          continue
        }
        // Collect QtStates keys
        if (key === 'QtStates' && typeof val === 'object' && val !== null && !Array.isArray(val)) {
          for (const qk of Object.keys(val as Record<string, unknown>)) {
            entry.sampleQtStatesKeys.add(qk)
          }
          if (!entry.fields.has(key)) entry.fields.set(key, new Set())
          entry.fields.get(key)!.add('object')
          continue
        }
        if (!entry.fields.has(key)) {
          entry.fields.set(key, new Set())
        }
        if (val === null || val === undefined) {
          entry.fields.get(key)!.add('string')
        } else if (typeof val === 'boolean') {
          entry.fields.get(key)!.add('boolean')
        } else if (typeof val === 'number') {
          entry.fields.get(key)!.add('number')
        } else if (typeof val === 'object') {
          entry.fields.get(key)!.add('object')
        } else {
          entry.fields.get(key)!.add('string')
        }
      }
    }

    function walkNode(node: any) {
      if (!node) return
      // Check conditions
      if (Array.isArray(node.TriggerConds)) {
        for (const cond of node.TriggerConds) {
          if (cond.$type && isAcrType(cond.$type)) {
            registerType(cond.$type, cond.DisplayName || cond.$type, cond, true)
          }
        }
      }
      // Check actions
      if (Array.isArray(node.TriggerActions)) {
        for (const action of node.TriggerActions) {
          if (action.$type && isAcrType(action.$type)) {
            registerType(action.$type, action.DisplayName || action.$type, action, false)
          }
        }
      }
      // Recurse
      if (Array.isArray(node.Childs)) {
        for (const child of node.Childs) walkNode(child)
      }
    }

    await scanDir(triggerlinesDir)

    function toTypeDef(map: Map<string, {
      displayName: string; assemblyName: string; fields: Map<string, Set<string>>
      fieldMeta: Map<string, { typeName?: string; enumValues?: { name: string; value: number }[] }>
      interfaces?: string[]; baseType?: string
      sampleQtKeys: Set<string>; sampleQtList: Map<string, boolean>; sampleQtStatesKeys: Set<string>
    }>) {
      const result: Array<{
        $type: string; displayName: string; assemblyName: string
        fields: Array<{ key: string; type: string; typeName?: string; enumValues?: { name: string; value: number }[] }>
        interfaces?: string[]; baseType?: string
        sampleQtKeys?: string[]; sampleQtList?: { Key: string; Value: boolean }[]; sampleQtStatesKeys?: string[]
        allStrings?: string[]
      }> = []
      for (const [$type, entry] of map) {
        const fields = Array.from(entry.fields.entries()).map(([key, types]) => {
          const typeSet = types
          let type = 'string'
          if (typeSet.has('boolean') && !typeSet.has('number') && !typeSet.has('object')) type = 'boolean'
          else if (typeSet.has('number') && !typeSet.has('boolean') && !typeSet.has('object')) type = 'number'
          else if (typeSet.has('object')) type = 'object'
          const meta = entry.fieldMeta.get(key)
          const fieldEntry: any = { key, type }
          if (meta?.typeName) fieldEntry.typeName = meta.typeName
          if (meta?.enumValues) fieldEntry.enumValues = meta.enumValues
          return fieldEntry
        })
        const r: any = { $type, displayName: entry.displayName, assemblyName: entry.assemblyName, fields }
        if (entry.interfaces) r.interfaces = entry.interfaces
        if (entry.baseType) r.baseType = entry.baseType
        if (entry.sampleQtKeys.size > 0) {
          r.sampleQtKeys = Array.from(entry.sampleQtKeys)
        }
        if (entry.sampleQtList.size > 0) {
          r.sampleQtList = Array.from(entry.sampleQtList.entries()).map(([Key, Value]) => ({ Key, Value }))
        }
        if (entry.sampleQtStatesKeys.size > 0) {
          r.sampleQtStatesKeys = Array.from(entry.sampleQtStatesKeys)
        }
        if (entry.allStrings.length > 0) {
          r.allStrings = entry.allStrings
        }
        result.push(r)
      }
      return result
    }

    // List ACR DLLs
    const acrDir = getAcrDir()
    const acrDlls: string[] = []
    if (existsSync(acrDir)) {
      const entries = await readdir(acrDir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (existsSync(join(acrDir, e.name, `${e.name}.dll`))) {
          acrDlls.push(e.name)
        }
      }
    }

    // --- Supplement with DLL metadata reading (pure TS, no external tool) ---
    try {
      const dllTypes = await readAllAcrDlls(getAcrDir())
      for (const dt of dllTypes) {
        const map = dt.kind === 'condition' ? conditions : actions
        if (!map.has(dt.$type)) {
          map.set(dt.$type, {
            displayName: dt.displayName,
            assemblyName: dt.assemblyName,
            fields: new Map(dt.fields.map(f => [f.key, new Set([f.type])])),
            fieldMeta: new Map(dt.fields.filter(f => f.typeName || f.enumValues).map(f => [f.key, { typeName: f.typeName, enumValues: f.enumValues }])),
            interfaces: dt.interfaces,
            baseType: dt.baseType,
            sampleQtKeys: new Set(),
            sampleQtList: new Map(),
            sampleQtStatesKeys: new Set(),
            allStrings: dt.allStrings || []
          })
        } else {
          const existing = map.get(dt.$type)!
          // Merge interfaces if not set
          if (!existing.interfaces && dt.interfaces) existing.interfaces = dt.interfaces
          if (!existing.baseType && dt.baseType) existing.baseType = dt.baseType
          for (const f of dt.fields) {
            if (!existing.fields.has(f.key)) {
              existing.fields.set(f.key, new Set([f.type]))
            }
            // Store metadata even if field was discovered from timeline (DLL has authoritative type info)
            if ((f.typeName || f.enumValues) && !existing.fieldMeta.has(f.key)) {
              existing.fieldMeta.set(f.key, { typeName: f.typeName, enumValues: f.enumValues })
            }
          }
        }
      }
      console.log(`DLL metadata: ${dllTypes.length} ACR types discovered`)
    } catch (err) {
      console.warn('DLL metadata reading failed (non-critical):', err)
    }

    return {
      success: true,
      conditions: toTypeDef(conditions),
      actions: toTypeDef(actions),
      acrDlls
    }
  } catch (err) {
    return { success: false, error: String(err), conditions: [], actions: [], acrDlls: [] }
  }
})

// App: get backup dir
ipcMain.handle('app:getBackupDir', async (_event, filePath: string) => {
  return join(filePath, '..', 'bak')
})

// App ready
app.whenReady().then(async () => {
  await loadAeConfig()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- Spell data (actions.json) ---
ipcMain.handle('app:loadSpellData', async () => {
  try {
    // In dev: __dirname = dist-electron/, data is at ../../data/
    // In prod (asar): __dirname = [asar]/dist-electron/, data is at [asar]/data/
    // Use '../data/' which works for both cases within the asar
    const dataPath = join(__dirname, '../data/actions.json')
    const content = await readFile(dataPath, 'utf-8')
    return { success: true, data: JSON.parse(content) }
  } catch (err) {
    return { success: false, error: String(err), data: {} }
  }
})
