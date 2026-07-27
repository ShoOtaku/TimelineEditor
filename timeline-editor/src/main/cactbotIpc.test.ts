import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveProxy, sessionFetch } = vi.hoisted(() => ({
  resolveProxy: vi.fn(),
  sessionFetch: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  session: {
    defaultSession: {
      resolveProxy,
      fetch: sessionFetch
    }
  }
}))

import { testCactbotConnection } from './cactbotIpc'

describe('cactbot connection test', () => {
  beforeEach(() => {
    resolveProxy.mockReset().mockResolvedValue('PROXY 127.0.0.1:7890')
    sessionFetch.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('bypasses Chromium cache for every proxy probe', async () => {
    await testCactbotConnection()
    await testCactbotConnection()

    const firstUrl = sessionFetch.mock.calls[0][0] as string
    const secondUrl = sessionFetch.mock.calls[1][0] as string
    expect(firstUrl).not.toBe(secondUrl)
    expect(firstUrl).toContain('_timeline_editor_probe=')
    expect(resolveProxy).toHaveBeenNthCalledWith(1, firstUrl)
    expect(sessionFetch.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    })
  })

  it('reports proxy connection failures', async () => {
    sessionFetch.mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED'))

    await expect(testCactbotConnection()).resolves.toEqual({
      success: false,
      error: 'net::ERR_PROXY_CONNECTION_FAILED'
    })
  })
})
