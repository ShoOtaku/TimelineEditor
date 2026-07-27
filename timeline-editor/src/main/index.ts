import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { registerAcrIpc } from './acrIpc'
import {
  applyCurrentProxy,
  getAcrDir,
  getAeDirectory,
  getPrDirectory,
  getTriggerlinesDir,
  loadAppConfig,
  registerSettingsIpc,
  setAeDirectory,
  setPrDirectory
} from './appConfig'
import { registerCactbotIpc } from './cactbotIpc'
import { installUpdate, cleanupLeftoverFiles } from './installer'
import { checkForUpdates, downloadUpdate, getVersion } from './updater'

let mainWindow: BrowserWindow | null = null

if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '9222')

function createWindow(): void {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) mainWindow.loadURL(devServerUrl)
  else if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

function registerFileIpc(): void {
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try { return { success: true, content: await readFile(filePath, 'utf-8') } }
    catch (error) { return { success: false, error: String(error) } }
  })
  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) { return { success: false, error: String(error) } }
  })
  ipcMain.handle('file:exists', (_event, filePath: string) => existsSync(filePath))
  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    try {
      const result = await stat(filePath)
      return { success: true, size: result.size, mtime: result.mtimeMs, isDirectory: result.isDirectory() }
    } catch (error) { return { success: false, error: String(error) } }
  })
  ipcMain.handle('file:listDir', async (_event, directory: string) => {
    try {
      const entries = await readdir(directory, { withFileTypes: true })
      return { success: true, entries: entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() })) }
    } catch (error) { return { success: false, error: String(error) } }
  })
}

function registerAeDirectoryIpc(): void {
  ipcMain.handle('app:getDefaultDir', () => getTriggerlinesDir())
  ipcMain.handle('app:getAeDirectory', () => getAeDirectory())
  ipcMain.handle('app:getAcrDir', () => getAcrDir())
  ipcMain.handle('dialog:selectAeDirectory', async () => {
    if (!mainWindow) return { cancelled: true }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 AE 目录（包含 Triggerlines 和 ACR 子目录）',
      defaultPath: getAeDirectory(),
      properties: ['openDirectory']
    })
    const directory = result.filePaths[0]
    if (result.canceled || !directory) return { cancelled: true }
    await setAeDirectory(directory)
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('ae:directoryChanged', directory)
      window.webContents.send('acr:typesChanged')
    })
    return { cancelled: false, directory }
  })
}

function registerPrDirectoryIpc(): void {
  ipcMain.handle('app:getPrDir', () => getPrDirectory())
  ipcMain.handle('dialog:selectPrDirectory', async () => {
    if (!mainWindow) return { cancelled: true }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 PromeRotation 时间轴目录（PureTimelines）',
      defaultPath: getPrDirectory(),
      properties: ['openDirectory']
    })
    const directory = result.filePaths[0]
    if (result.canceled || !directory) return { cancelled: true }
    await setPrDirectory(directory)
    BrowserWindow.getAllWindows().forEach(window => window.webContents.send('pr:directoryChanged', directory))
    return { cancelled: false, directory }
  })
}

function registerOpenSaveDialogs(): void {
  ipcMain.handle('dialog:openFile', () => showOpenDialog('Open Timeline File', getTriggerlinesDir(), ['json', 'txt']))
  ipcMain.handle('dialog:saveFile', (_event, name?: string) =>
    showSaveDialog('Save Timeline File', join(getTriggerlinesDir(), name || 'NewTriggerline.json'), ['json', 'txt']))
  ipcMain.handle('dialog:openPrFile', () =>
    showOpenDialog('打开 PromeRotation 时间轴', getPrDirectory(), ['json']))
  ipcMain.handle('dialog:savePrFile', (_event, name?: string) =>
    showSaveDialog('保存 PromeRotation 时间轴', join(getPrDirectory(), name || 'NewTimeline.json'), ['json']))
}

async function showOpenDialog(title: string, defaultPath: string, extensions: string[]) {
  if (!mainWindow) return { cancelled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    defaultPath,
    filters: [{ name: 'Timeline Files', extensions }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  })
  return { cancelled: result.canceled, filePath: result.filePaths[0] || null }
}

async function showSaveDialog(title: string, defaultPath: string, extensions: string[]) {
  if (!mainWindow) return { cancelled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath,
    filters: [{ name: 'Timeline Files', extensions }, { name: 'All Files', extensions: ['*'] }]
  })
  return { cancelled: result.canceled, filePath: result.filePath || null }
}

function registerUpdaterIpc(): void {
  ipcMain.handle('updater:getVersion', () => getVersion())
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', async (_event, zipUrl: string) => {
    try {
      const zipPath = await downloadUpdate(zipUrl, progress => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:progress', progress)
      })
      return { success: true, zipPath }
    } catch (error) { return { success: false, error: String(error) } }
  })
  ipcMain.handle('updater:install', async (_event, zipPath: string) => {
    try {
      await installUpdate(zipPath)
      setTimeout(() => app.quit(), 500)
      return { success: true }
    } catch (error) { return { success: false, error: String(error) } }
  })
}

function registerMiscIpc(): void {
  ipcMain.handle('app:getBackupDir', (_event, filePath: string) => join(filePath, '..', 'bak'))
  ipcMain.handle('app:loadSpellData', async () => {
    try {
      const content = await readFile(join(__dirname, '../data/actions.json'), 'utf-8')
      return { success: true, data: JSON.parse(content) }
    } catch (error) { return { success: false, error: String(error), data: {} } }
  })
}

function registerAllIpc(): void {
  registerFileIpc()
  registerAeDirectoryIpc()
  registerPrDirectoryIpc()
  registerOpenSaveDialogs()
  registerUpdaterIpc()
  registerMiscIpc()
  registerSettingsIpc()
  registerAcrIpc(getTriggerlinesDir, getAcrDir)
  registerCactbotIpc()
}

registerAllIpc()

app.whenReady().then(async () => {
  await loadAppConfig()
  try { await applyCurrentProxy() }
  catch (error) { console.warn('Failed to apply proxy settings:', error) }
  createWindow()
  if (app.isPackaged) cleanupLeftoverFiles()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  try {
    const release = await checkForUpdates()
    if (release.hasUpdate && release.latestVersion && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:available', {
        latestVersion: release.latestVersion,
        releaseNotes: release.releaseNotes
      })
    }
  } catch {
    // Startup update checks are intentionally non-blocking.
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
