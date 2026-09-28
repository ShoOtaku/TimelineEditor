import type { AppSettings } from '@shared/cactbotTypes'

// Web 端设置持久化 —— 对齐 Electron 的 ae-config.json，改用 localStorage。
// 目录字段存虚拟路径字符串（如 "/AE"），对应的目录句柄存 IndexedDB（见 idb.ts）。

const STORAGE_KEY = 'timeline-editor:settings'

const DEFAULT_SETTINGS: AppSettings = {
  aeDirectory: '',
  prDirectory: '',
  logsDirectory: '',
  actLogsDirectory: '',
  proxy: { enabled: false, protocol: 'http', host: '', port: 0 },
  fontSizePercent: 100
}

export class WebSettings {
  private cache: AppSettings | null = null

  read(): AppSettings {
    if (!this.cache) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.cache = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) as Partial<AppSettings> : {}) }
      } catch {
        this.cache = { ...DEFAULT_SETTINGS }
      }
    }
    return this.cache
  }

  patch(partial: Partial<AppSettings>): AppSettings {
    this.cache = { ...this.read(), ...partial }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache))
    } catch { /* 存储满等异常静默忽略，内存态仍然生效 */ }
    return this.cache
  }
}
