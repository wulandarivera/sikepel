@echo off
cd /d "%~dp0"
title Pasang Auto-Start SIKEPEL
echo ========================================================
echo        PASANG AUTO-START SERVER SIKEPEL (BOOTING)
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-autostart.ps1"

echo.
echo ========================================================
pause
