@echo off
setlocal
title Tally Web Sync - Folder Path Setup Helper

echo ======================================================================
echo    JAY BAUDHIMAI TRADERS - TALLY WEB SYNC SETUP HELPER (v2.2)
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo [1] TDL Folder Path (where this script and .tdl file are):
echo.
echo       %SCRIPT_DIR%
echo.

set PROXY_DIR=%SCRIPT_DIR%\..\tally-proxy
if exist "%PROXY_DIR%\server.js" (
    for %%I in ("%PROXY_DIR%") do set PROXY_FULL=%%~fI
    call echo %%PROXY_FULL%%> "%SCRIPT_DIR%\proxy-path.cfg"
    echo [2] Proxy Folder Path (detected automatically):
    echo.
    call echo       %%PROXY_FULL%%
    echo.
    echo [OK] Created proxy-path.cfg automatically.
) else (
    echo [2] Proxy Folder Path:
    echo     [INFO] Sibling tally-proxy not found.
    echo     You can specify it directly in Tally's configuration screen!
)

echo.
echo ======================================================================
echo  HOW TO CONFIGURE IN TALLY:
echo ======================================================================
echo  1. Open TallyPrime.
echo  2. On Gateway of Tally, press 'W' (Web Sync Connector).
echo  3. You will see TWO fields:
echo        - TDL Folder Path   : Where tally-tdl is located
echo        - Proxy Folder Path : Where tally-proxy is located
echo  4. Verify / Edit the paths, then press Ctrl+A to save!
echo ======================================================================
echo.

pause
