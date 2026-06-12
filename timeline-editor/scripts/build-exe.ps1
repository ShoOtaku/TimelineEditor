# Build and package Timeline Editor as portable .exe
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-exe.ps1
# Or: .\scripts\build-exe.ps1

$ErrorActionPreference = "Continue"
Push-Location $PSScriptRoot\..

Write-Host "=== Step 1/3: TypeScript check ===" -ForegroundColor Cyan
npx tsc --noEmit -p tsconfig.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors found, aborting" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host "=== Step 2/3: Vite build ===" -ForegroundColor Cyan
npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Vite build failed, aborting" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host "=== Step 3/3: Package .exe ===" -ForegroundColor Cyan
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npx electron-builder --win dir 2>&1 | Out-Host
$buildExit = $LASTEXITCODE

# electron-builder may exit code 1 due to winCodeSign symlink errors on Windows
# The exe itself builds fine — check if it exists
$exe = Get-ChildItem release\win-unpacked\Timeline Editor.exe -ErrorAction SilentlyContinue

if ($exe) {
    $size = [math]::Round($exe.Length / 1MB, 1)
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "  release\win-unpacked\Timeline Editor.exe  ($size MB)" -ForegroundColor White
    Write-Host "  Copy the entire 'release\win-unpacked' folder to distribute" -ForegroundColor Gray
} else {
    Write-Host "`n=== FAILED ===" -ForegroundColor Red
    Write-Host "  .exe not found in release\win-unpacked\" -ForegroundColor Yellow
    Write-Host "  Try running electron-builder manually:" -ForegroundColor Gray
    Write-Host "    `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/' ; npx electron-builder --win dir" -ForegroundColor Gray
    Pop-Location
    exit 1
}

Pop-Location
