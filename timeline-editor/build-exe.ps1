$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Timeline Editor — Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build Vite
Write-Host "`n[1/3] Building with Vite..." -ForegroundColor Yellow
npx vite build
if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
Write-Host "  Vite build OK" -ForegroundColor Green

# Step 2: Verify output files
Write-Host "`n[2/3] Verifying output..." -ForegroundColor Yellow
if (-not (Test-Path "dist/index.html")) { throw "dist/index.html missing" }
if (-not (Test-Path "dist-electron/index.js")) { throw "dist-electron/index.js missing" }
if (-not (Test-Path "dist-electron/preload.js")) { throw "dist-electron/preload.js missing" }
if (-not (Test-Path "data/actions.json")) {
    Write-Host "  Warning: data/actions.json not found — run: python scripts/export_actions.py" -ForegroundColor DarkYellow
}
Write-Host "  All required files present" -ForegroundColor Green

# Step 3: Package with electron-builder (dir target, no signing)
Write-Host "`n[3/3] Packaging with electron-builder..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win dir
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

# Done
$exe = Get-ChildItem -Path "release\win-unpacked" -Filter "*.exe" -Recurse | Select-Object -First 1
if ($exe) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host " BUILD SUCCESS" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Output: release\win-unpacked\" -ForegroundColor White
    Write-Host " Launch: $($exe.Name)" -ForegroundColor White
    $size = (Get-ChildItem -Path "release\win-unpacked" -Recurse | Measure-Object -Property Length -Sum).Sum
    Write-Host " Size:   $([math]::Round($size / 1MB, 1)) MB" -ForegroundColor White
} else {
    Write-Host "`nERROR: No exe found in release\win-unpacked\" -ForegroundColor Red
}
