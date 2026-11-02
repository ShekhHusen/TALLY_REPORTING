@echo off
setlocal

:: ============================================================================
::  Tally CORS Proxy Server Launcher
::  Port: 3001  ->  Tally Target: Port 9000
:: ============================================================================

set SCRIPT_DIR=%~dp0
set PROXY_DIR=%SCRIPT_DIR%..\tally-proxy

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
start "Tally Proxy Server" node server.js
