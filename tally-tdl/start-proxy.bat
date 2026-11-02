@echo off
setlocal

:: ============================================================================
::  Tally CORS Proxy Server Launcher  (Portable Edition v2.2)
::
::  Path Discovery Order:
::  0. Command-line argument: start-proxy.bat "D:\MyPath\tally-proxy"
::  1. Reads "proxy-path.cfg" in same folder (if exists).
::  2. Falls back to sibling "..\tally-proxy".
::  3. Falls back to sub-folder ".\tally-proxy".
:: ============================================================================

set SCRIPT_DIR=%~dp0
set PROXY_DIR=

:: --- Priority 0: Command-line argument ---
if not "%~1"=="" (
    if exist "%~1\server.js" (
        set PROXY_DIR=%~1
        goto :FOUND
    )
)

:: --- Priority 1: proxy-path.cfg ---
if exist "%SCRIPT_DIR%proxy-path.cfg" (
    set /p PROXY_DIR=<"%SCRIPT_DIR%proxy-path.cfg"
)
if defined PROXY_DIR set PROXY_DIR=%PROXY_DIR:"=%
if defined PROXY_DIR if exist "%PROXY_DIR%\server.js" goto :FOUND

:: --- Priority 2: Sibling folder ---
set PROXY_DIR=%SCRIPT_DIR%..\tally-proxy
if exist "%PROXY_DIR%\server.js" goto :FOUND

:: --- Priority 3: Sub-folder ---
set PROXY_DIR=%SCRIPT_DIR%tally-proxy
if exist "%PROXY_DIR%\server.js" goto :FOUND

:: --- Not found ---
echo [ERROR] tally-proxy folder not found!
echo   Checked:
echo     0. Argument passed: "%~1"
echo     1. proxy-path.cfg
echo     2. %SCRIPT_DIR%..\tally-proxy
echo     3. %SCRIPT_DIR%tally-proxy
echo.
echo   Fix: Open Tally -> Press W -> Enter the Proxy Folder Path -> Save (Ctrl+A).
pause
exit /b 1

:FOUND
cd /d "%PROXY_DIR%"

:: Check if port 3001 is already listening
netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Tally Proxy is already running on port 3001.
    exit /b 0
)

:: Verify node is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js.
    pause
    exit /b 1
)

:: Start proxy in separate window
echo Starting Tally Proxy Server on port 3001...
echo Proxy directory: %PROXY_DIR%
start "Tally Proxy Server" node server.js
