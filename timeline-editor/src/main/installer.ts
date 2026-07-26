import { join, dirname } from 'path'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { existsSync } from 'fs'
import { rm, mkdir, readdir, stat, writeFile, unlink } from 'fs/promises'
import AdmZip from 'adm-zip'

const TMP_DIR = join(tmpdir(), 'timeline-editor-update')

// Escape for PowerShell single-quoted string literals
function psQuote(s: string): string {
  return s.replace(/'/g, "''")
}

function powershellPath(): string {
  return join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
  )
}

async function extractZip(zipPath: string, stagingDir: string): Promise<void> {
  if (existsSync(stagingDir)) {
    await rm(stagingDir, { recursive: true, force: true })
  }
  await mkdir(stagingDir, { recursive: true })
  let zip: AdmZip
  try {
    zip = new AdmZip(zipPath)
  } catch {
    throw new Error('更新包损坏或下载不完整，请重新下载')
  }
  zip.extractAllTo(stagingDir, true)
}

// GitHub release zips sometimes wrap everything in a single root folder
async function resolveStagingRoot(stagingDir: string): Promise<string> {
  const names = await readdir(stagingDir)
  const entries = await Promise.all(
    names.map(async (name) => ({ name, stat: await stat(join(stagingDir, name)) }))
  )
  const folders = entries.filter(e => e.stat.isDirectory())
  const files = entries.filter(e => e.stat.isFile())
  if (folders.length === 1 && files.length === 0) {
    return join(stagingDir, folders[0].name)
  }
  return stagingDir
}

// Returns the exe path relative to root (checks shallower levels first)
async function findExeRelative(root: string, sub = ''): Promise<string | null> {
  const dir = join(root, sub)
  const entries = await readdir(dir)
  const dirs: string[] = []
  for (const entry of entries) {
    const s = await stat(join(dir, entry))
    if (s.isFile() && entry.endsWith('.exe')) {
      return sub ? join(sub, entry) : entry
    }
    if (s.isDirectory()) dirs.push(entry)
  }
  for (const entry of dirs) {
    const found = await findExeRelative(root, sub ? join(sub, entry) : entry)
    if (found) return found
  }
  return null
}

interface InstallScriptParams {
  stagingRoot: string
  targetDir: string
  exeRel: string
  tmpDir: string
  appPid: number
}

function buildInstallScript(p: InstallScriptParams): string {
  return `# Timeline Editor Update Installer
$ErrorActionPreference = 'Stop'

$stagingDir = '${psQuote(p.stagingRoot)}'
$targetDir  = '${psQuote(p.targetDir)}'
$exeRel     = '${psQuote(p.exeRel)}'
$tmpDir     = '${psQuote(p.tmpDir)}'
$appPid     = ${p.appPid}
$logPath    = Join-Path $tmpDir 'update.log'

function Write-Log([string]$msg) {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Copy-UpdateFiles {
    Get-ChildItem -LiteralPath $stagingDir -Recurse -Force | ForEach-Object {
        $relative = $_.FullName.Substring($stagingDir.Length).TrimStart('\\')
        $dest = Join-Path $targetDir $relative
        if ($_.PSIsContainer) {
            if (-not (Test-Path -LiteralPath $dest)) {
                New-Item -ItemType Directory -Path $dest -Force | Out-Null
            }
        } else {
            $destParent = Split-Path -Path $dest -Parent
            if (-not (Test-Path -LiteralPath $destParent)) {
                New-Item -ItemType Directory -Path $destParent -Force | Out-Null
            }
            try {
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
            } catch {
                # File in use: rename it aside (running exe/dll images allow rename), then copy
                $bak = "$dest.old"
                if (Test-Path -LiteralPath $bak) {
                    Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue
                }
                Rename-Item -LiteralPath $dest -NewName (Split-Path -Path $bak -Leaf) -Force
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
            }
        }
    }
}

Write-Log "Updater started, waiting for app (PID $appPid) to exit"
Wait-Process -Id $appPid -Timeout 30 -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

try {
    $attempt = 0
    $copied = $false
    while (-not $copied) {
        $attempt++
        try {
            Copy-UpdateFiles
            $copied = $true
            Write-Log "Files copied (attempt $attempt)"
        } catch {
            Write-Log "Copy attempt $attempt failed: $($_.Exception.Message)"
            if ($attempt -ge 5) { throw }
            Start-Sleep -Seconds 2
        }
    }

    Get-ChildItem -LiteralPath $targetDir -Recurse -Force -Filter '*.old' |
        Remove-Item -Force -ErrorAction SilentlyContinue

    Write-Log 'Update complete, starting new version'
    Start-Process -FilePath (Join-Path $targetDir $exeRel) -WorkingDirectory $targetDir

    Start-Sleep -Seconds 1
    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
catch {
    Write-Log "FATAL: $($_.Exception.Message)"
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Timeline Editor 更新失败：$($_.Exception.Message)\`n\`n旧版本文件已保留，可直接重新启动。\`n日志：$logPath",
            'Timeline Editor 更新', 'OK', 'Error') | Out-Null
    } catch { }
    try {
        Start-Process -FilePath (Join-Path $targetDir $exeRel) -WorkingDirectory $targetDir
    } catch { Write-Log 'Failed to restart old version' }
    exit 1
}
`
}

// The launcher only fires the real installer via Start-Process and exits.
// Its grandchild silently breaks away from libuv's kill-on-close job, so it
// survives the app quitting — while still getting a (hidden) console, which
// powershell.exe requires (DETACHED_PROCESS makes it exit without running).
function buildLauncherScript(installScriptPath: string): string {
  return `$updater = '${psQuote(installScriptPath)}'
Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $updater + '"') -WindowStyle Hidden
`
}

// PowerShell 5.1 reads BOM-less scripts as ANSI, which corrupts non-ASCII
// paths (e.g. Chinese usernames in %TEMP%) — the BOM is required.
async function writePsScript(path: string, content: string): Promise<void> {
  await writeFile(path, '\ufeff' + content, 'utf-8')
}

export async function installUpdate(zipPath: string): Promise<void> {
  const stagingDir = join(TMP_DIR, 'staging')

  // Electron's patched fs treats the new resources/app.asar in staging as a
  // directory; disable that while extracting and scanning
  const prevNoAsar = process.noAsar
  process.noAsar = true
  let stagingRoot: string
  let exeRel: string | null
  try {
    await extractZip(zipPath, stagingDir)
    stagingRoot = await resolveStagingRoot(stagingDir)
    exeRel = await findExeRelative(stagingRoot)
  } finally {
    process.noAsar = prevNoAsar
  }
  if (!exeRel) {
    throw new Error('更新包中未找到主程序 (.exe)，安装已取消')
  }

  const scriptPath = join(TMP_DIR, 'install-update.ps1')
  const launcherPath = join(TMP_DIR, 'launch-update.ps1')
  await writePsScript(scriptPath, buildInstallScript({
    stagingRoot,
    targetDir: dirname(process.execPath),
    exeRel,
    tmpDir: TMP_DIR,
    appPid: process.pid
  }))
  await writePsScript(launcherPath, buildLauncherScript(scriptPath))

  spawn(powershellPath(), [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath
  ], {
    stdio: 'ignore',
    windowsHide: true
  }).unref()

  // NOTE: app.quit() is scheduled by the IPC handler after this resolves
}

// Remove *.old files a previous update may have left next to the exe
export async function cleanupLeftoverFiles(): Promise<void> {
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else if (e.name.endsWith('.old')) {
        try { await unlink(full) } catch { /* still locked, retry next launch */ }
      }
    }
  }
  try {
    await walk(dirname(process.execPath))
  } catch { /* best-effort */ }
}
