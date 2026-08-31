@echo off
REM ============================================
REM  Real-Time Audio Simulator - local launcher
REM  Author : limlin
REM  Built with Yuanbao (Yuanbao AI Assistant)
REM  Note   : keep ASCII only to avoid cmd garbling
REM ============================================
@echo off
title Real-time Audio Simulator
cd /d "%~dp0"

echo.
echo   ==================================================
echo     Real-time Audio Simulator
echo     Local server mode   (needed for "Audio Input")
echo   ==================================================
echo.
echo   Starting local server...
echo   Your browser will open automatically.
echo.
echo   Close this window to stop the server.
echo   --------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"

if errorlevel 1 (
  echo.
  echo   [ERROR] Failed to start the server.
  echo.
  echo   Possible causes:
  echo     1. PowerShell is not available on this system
  echo     2. Ports 8765-8784 are all occupied
  echo.
  pause
)
