import { describe, expect, it } from 'vitest'
import { toElectronProxyRules, validateProxySettings } from './networkSettings'

describe('proxy settings', () => {
  it('normalizes a local SOCKS5 proxy', () => {
    const result = validateProxySettings({ enabled: true, protocol: 'socks5', host: 'LOCALHOST', port: '1080' })
    expect(result).toEqual({
      success: true,
      settings: { enabled: true, protocol: 'socks5', host: 'localhost', port: 1080 }
    })
    if (result.success) expect(toElectronProxyRules(result.settings)).toBe('socks5://localhost:1080')
  })

  it('rejects remote hosts and invalid ports', () => {
    expect(validateProxySettings({ enabled: true, protocol: 'http', host: '10.0.0.5', port: 7890 }).success).toBe(false)
    expect(validateProxySettings({ enabled: true, protocol: 'http', host: '127.0.0.1', port: 70000 }).success).toBe(false)
  })
})
