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

const DEFAULT_LOGS_DIR = join(
  app.getPath('documents'),
  'TimelineEditor',
  'LogsTimelines'
)

// ACT 日志目录默认候选：呆萌整合版默认安装路径 → ACT 官方默认（%APPDATA%），取第一个存在的
function resolveDefaultActLogsDir(): string {
  const candidates = [
    join('C:\\', 'Tools', 'ACT.DieMoe', 'FFXIVLogs'),
    join(app.getPath('appData'), 'Advanced Combat Tracker', 'FFXIVLogs')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

const DEFAULT_ACT_LOGS_DIR = resolveDefaultActLogsDir()

const CONFIG_PATH = join(app.getPath('userData'), 'ae-config.json')

const MIN_FONT_SIZE_PERCENT = 50
const MAX_FONT_SIZE_PERCENT = 200

export function clampFontSizePercent(value: number): number {
  return Math.min(MAX_FONT_SIZE_PERCENT, Math.max(MIN_FONT_SIZE_PERCENT, Math.round(value)))
}

let settings: AppSettings = {
  aeDirectory: DEFAULT_AE_DIR,
  prDirectory: DEFAULT_PR_DIR,
  logsDirectory: DEFAULT_LOGS_DIR,
  actLogsDirectory: DEFAULT_ACT_LOGS_DIR,
  proxy: { ...DEFAULT_PROXY_SETTINGS },
  fontSizePercent: 100
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
    if (typeof raw.logsDirectory === 'string' && raw.logsDirectory.trim()) {
      settings.logsDirectory = raw.logsDirectory
    }
    if (typeof raw.actLogsDirectory === 'string' && raw.actLogsDirectory.trim()) {
      settings.actLogsDirectory = raw.actLogsDirectory
    }
    const proxy = validateProxySettings(raw.proxy)
    if (proxy.success) settings.proxy = proxy.settings
    else if (raw.proxy !== undefined) console.warn('Ignored invalid proxy settings:', proxy.error)
    if (typeof raw.fontSizePercent === 'number' && Number.isFinite(raw.fontSizePercent)) {
      settings.fontSizePercent = clampFontSizePercent(raw.fontSizePercent)
    }
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
    logsDirectory: settings.logsDirectory,
    actLogsDirectory: settings.actLogsDirectory,
    proxy: { ...settings.proxy },
    fontSizePercent: settings.fontSizePercent
  }
}

export function getAeDirectory(): string { return settings.aeDirectory }
export function getPrDirectory(): string { return settings.prDirectory }
export function getLogsDirectory(): string { return settings.logsDirectory }
export function getActLogsDirectory(): string { return settings.actLogsDirectory }
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

export async function setLogsDirectory(directory: string): Promise<void> {
  settings.logsDirectory = directory
  await persistAppConfig()
}

export async function setActLogsDirectory(directory: string): Promise<void> {
  settings.actLogsDirectory = directory
  await persistAppConfig()
}

export async function updateFontSizePercent(input: unknown): Promise<
  { success: true; fontSizePercent: number } | { success: false; error: string }
> {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return { success: false, error: '无效的字体大小' }
  }
  settings.fontSizePercent = clampFontSizePercent(input)
  try {
    await persistAppConfig()
    return { success: true, fontSizePercent: settings.fontSizePercent }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
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
  ipcMain.handle('settings:setFontSize', (_event, input: unknown) => updateFontSizePercent(input))
}

async function persistAppConfig(): Promise<void> {
  const directory = app.getPath('userData')
  if (!existsSync(directory)) await mkdir(directory, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
