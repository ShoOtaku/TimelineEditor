import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, createWriteStream, unlinkSync, mkdirSync } from 'fs'
import { get } from 'https'
import { tmpdir } from 'os'
import type { IncomingMessage } from 'http'

// --- Version ---

function getCurrentVersion(): string {
  try {
    // In packaged mode, package.json is at the app root (alongside the exe)
    const pkgPath = join(app.getAppPath(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const getVersion = getCurrentVersion

// --- GitHub API ---

const GITHUB_API = 'https://api.github.com/repos/ShoOtaku/TimelineEditor/releases/latest'

interface ReleaseInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  zipUrl: string | null
  releaseNotes: string | null
  error?: string
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    get(url, { headers }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, headers).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function compareVersions(a: string, b: string): number {
  // Returns positive if a > b, negative if a < b, 0 if equal
  const ap = a.replace(/^v/, '').split('.').map(Number)
  const bp = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const av = ap[i] || 0
    const bv = bp[i] || 0
    if (av !== bv) return av - bv
  }
  return 0
}

export async function checkForUpdates(): Promise<ReleaseInfo> {
  const currentVersion = getCurrentVersion()

  try {
    const release = await fetchJson(GITHUB_API, {
      'User-Agent': 'TimelineEditor-Updater',
      'Accept': 'application/vnd.github.v3+json'
    })

    const tagName: string = release.tag_name || ''
    const latestVersion = tagName.replace(/^v/, '')

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion,
        zipUrl: null,
        releaseNotes: null
      }
    }

    // Find the portable zip asset
    const assets: Array<{ name: string; browser_download_url: string }> = release.assets || []
    const zipAsset = assets.find((a: { name: string }) =>
      a.name.endsWith('-portable.zip') || a.name.endsWith('.zip')
    )

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      zipUrl: zipAsset?.browser_download_url || null,
      releaseNotes: release.body || null
    }
  } catch (err) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      zipUrl: null,
      releaseNotes: null,
      error: String(err)
    }
  }
}

// --- Download ---

interface DownloadProgress {
  percent: number
  downloaded: number
  total: number
  speed: string
}

export async function downloadUpdate(
  zipUrl: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<string> {
  const tmpDir = join(tmpdir(), 'timeline-editor-update')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const zipPath = join(tmpDir, 'update.zip')

  return new Promise((resolve, reject) => {
    const request = (url: string, redirectsLeft: number) => {
      get(url, {
        headers: { 'User-Agent': 'TimelineEditor-Updater' }
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (redirectsLeft <= 0) {
            reject(new Error('重定向次数过多'))
            return
          }
          request(res.headers.location, redirectsLeft - 1)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const file = createWriteStream(zipPath)
        pipeDownload(res, file, zipPath, onProgress, resolve, reject)
      }).on('error', reject)
    }
    request(zipUrl, 5)
  })
}

function pipeDownload(
  res: IncomingMessage,
  file: ReturnType<typeof createWriteStream>,
  zipPath: string,
  onProgress: (progress: DownloadProgress) => void,
  resolve: (path: string) => void,
  reject: (err: Error) => void
) {
  const total = parseInt(res.headers['content-length'] || '0', 10)
  let downloaded = 0
  let lastTime = Date.now()
  let lastBytes = 0

  res.on('data', (chunk: Buffer) => {
    downloaded += chunk.length
    const now = Date.now()
    const elapsed = (now - lastTime) / 1000
    let speed = ''
    if (elapsed >= 0.5) {
      const bytesPerSec = (downloaded - lastBytes) / elapsed
      speed = formatSpeed(bytesPerSec)
      lastTime = now
      lastBytes = downloaded
    }
    const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
    onProgress({ percent, downloaded, total, speed })
  })

  file.on('finish', () => {
    file.close()
    resolve(zipPath)
  })

  res.on('error', (err: Error) => {
    try { unlinkSync(zipPath) } catch { /* ignore */ }
    reject(err)
  })

  file.on('error', (err: Error) => {
    try { unlinkSync(zipPath) } catch { /* ignore */ }
    reject(err)
  })

  res.pipe(file)
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}
