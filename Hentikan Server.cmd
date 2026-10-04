@echo off
cd /d "%~dp0"
title Hentikan Server SIKEPEL
echo ========================================================
echo               HENTIKAN SERVER SIKEPEL
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"

echo.
pause
