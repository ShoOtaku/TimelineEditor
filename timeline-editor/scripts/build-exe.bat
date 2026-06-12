@echo off
REM Build and package Timeline Editor as portable .exe
REM Usage: scripts\build-exe.bat

cd /d %~dp0\..

echo === Step 1/3: TypeScript check ===
call npx tsc --noEmit -p tsconfig.json
if %ERRORLEVEL% neq 0 (
    echo TypeScript errors found, aborting
    exit /b 1
)
echo   OK

echo === Step 2/3: Vite build ===
call npx vite build
if %ERRORLEVEL% neq 0 (
    echo Vite build failed, aborting
    exit /b 1
)
echo   OK

echo === Step 3/3: Package .exe ===
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npx electron-builder --win dir

REM Check if exe was produced (ignore electron-builder exit code)
if exist "release\win-unpacked\Timeline Editor.exe" (
    for %%A in ("release\win-unpacked\Timeline Editor.exe") do set size=%%~zA
    set /a sizeMB=%size%/1048576
    echo.
    echo === SUCCESS ===
    echo   release\win-unpacked\Timeline Editor.exe
    echo   Copy the entire 'release\win-unpacked' folder to distribute
) else (
    echo.
    echo === FAILED ===
    echo   .exe not found in release\win-unpacked\
    exit /b 1
)
