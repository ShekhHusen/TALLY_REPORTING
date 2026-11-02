@echo off
setlocal

:: ============================================================================
::  Stop Tally Proxy Server (Port 3001)  — Portable Edition
:: ============================================================================

echo Stopping Tally Proxy on port 3001...
set FOUND=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Terminating PID: %%a ...
    taskkill /F /PID %%a >nul 2>&1
)

if "%FOUND%"=="1" (
    echo [SUCCESS] Tally Proxy stopped.
) else (
    echo [INFO] No process was running on port 3001.
)
