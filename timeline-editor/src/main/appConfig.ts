import { app, ipcMain, session } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AppSettings, ProxySettings } from '../shared/cactbotTypes'
import {
  DEFAULT_PROXY_SETTINGS, toElectronProxyRules, validateProxySettings
} from '../shared/networkSettings'

const DEFAULT_AE_DIR = join(
  app.getPath('appData'),
  'XIVLauncherCN',
  'offlineplugins',
  'AE'
)

const DEFAULT_PR_DIR = join(
  app.getPath('appData'),
  'XIVLauncherCN',
  'pluginConfigs',
  'PromeRotation',
  'PureTimelines'
)

const CONFIG_PATH = join(app.getPath('userData'), 'ae-config.json')

let settings: AppSettings = {
  aeDirectory: DEFAULT_AE_DIR,
  prDirectory: DEFAULT_PR_DIR,
  proxy: { ...DEFAULT_PROXY_SETTINGS }
}

export async function loadAppConfig(): Promise<void> {
  if (!existsSync(CONFIG_PATH)) return
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as Record<string, unknown>
    if (typeof raw.aeDirectory === 'string' && raw.aeDirectory.trim()) {
      settings.aeDirectory = raw.aeDirectory
    }
    if (typeof raw.prDirectory === 'string' && raw.prDirectory.trim()) {
      settings.prDirectory = raw.prDirectory
    }
    const proxy = validateProxySettings(raw.proxy)
    if (proxy.success) settings.proxy = proxy.settings
    else if (raw.proxy !== undefined) console.warn('Ignored invalid proxy settings:', proxy.error)
  } catch (error) {
    console.warn('Failed to load app config, using defaults:', error)
  }
}

export async function applyCurrentProxy(): Promise<void> {
  const proxy = settings.proxy
  await session.defaultSession.setProxy(proxy.enabled
    ? { mode: 'fixed_servers', proxyRules: toElectronProxyRules(proxy) }
    : { mode: 'system' })
  await session.defaultSession.closeAllConnections()
}

export function getAppSettings(): AppSettings {
  return {
    aeDirectory: settings.aeDirectory,
    prDirectory: settings.prDirectory,
    proxy: { ...settings.proxy }
  }
}

export function getAeDirectory(): string { return settings.aeDirectory }
export function getPrDirectory(): string { return settings.prDirectory }
export function getTriggerlinesDir(): string { return join(settings.aeDirectory, 'Triggerlines') }
export function getAcrDir(): string { return join(settings.aeDirectory, 'ACR') }

export async function setAeDirectory(directory: string): Promise<void> {
  settings.aeDirectory = directory
  await persistAppConfig()
}

export async function setPrDirectory(directory: string): Promise<void> {
  settings.prDirectory = directory
  await persistAppConfig()
}

export async function updateProxySettings(input: unknown): Promise<
  { success: true; settings: ProxySettings } | { success: false; error: string }
> {
  const result = validateProxySettings(input)
  if (!result.success) return result
  const previous = settings.proxy
  settings.proxy = result.settings
  try {
    await persistAppConfig()
    await applyCurrentProxy()
    return { success: true, settings: { ...settings.proxy } }
  } catch (error) {
    settings.proxy = previous
    try {
      await persistAppConfig()
      await applyCurrentProxy()
    } catch (rollbackError) {
      return {
        success: false,
        error: `${formatError(error)}；恢复原代理设置失败: ${formatError(rollbackError)}`
      }
    }
    return { success: false, error: formatError(error) }
  }
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => getAppSettings())
  ipcMain.handle('settings:setProxy', (_event, input: unknown) => updateProxySettings(input))
}

async function persistAppConfig(): Promise<void> {
  const directory = app.getPath('userData')
  if (!existsSync(directory)) await mkdir(directory, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
