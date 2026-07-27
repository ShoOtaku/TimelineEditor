import type { ProxySettings } from './cactbotTypes'

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  enabled: false,
  protocol: 'http',
  host: '127.0.0.1',
  port: 7890
}

const LOCAL_PROXY_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function validateProxySettings(input: unknown):
  { success: true; settings: ProxySettings } | { success: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { success: false, error: '代理设置格式无效' }
  }

  const value = input as Partial<ProxySettings>
  const protocol = value.protocol === 'socks5' ? 'socks5' : value.protocol === 'http' ? 'http' : null
  const host = typeof value.host === 'string' ? value.host.trim().toLowerCase() : ''
  const port = Number(value.port)

  if (!protocol) return { success: false, error: '代理协议必须是 HTTP 或 SOCKS5' }
  if (!LOCAL_PROXY_HOSTS.has(host)) return { success: false, error: '代理地址仅支持 localhost、127.0.0.1 或 ::1' }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { success: false, error: '代理端口必须是 1-65535 的整数' }
  }

  return {
    success: true,
    settings: { enabled: value.enabled === true, protocol, host, port }
  }
}

export function toElectronProxyRules(settings: ProxySettings): string {
  const host = settings.host === '::1' ? '[::1]' : settings.host
  return `${settings.protocol}://${host}:${settings.port}`
}
