@echo off
cd /d "%~dp0"
title Hapus Auto-Start SIKEPEL
echo ========================================================
echo             HAPUS AUTO-START SERVER SIKEPEL
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-autostart.ps1"

echo.
echo ========================================================
pause
