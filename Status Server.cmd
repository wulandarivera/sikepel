@echo off
cd /d "%~dp0"
title Status Server SIKEPEL
echo ========================================================
echo                 STATUS SERVER SIKEPEL
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status.ps1"

echo.
echo Status Tailscale Funnel:
tailscale funnel status
echo.
echo --------------------------------------------------------
echo 10 Baris Terakhir Log Server (.data\server.log):
if exist ".data\server.log" (
    powershell -NoProfile -Command "Get-Content '.data\server.log' -Tail 10"
) else (
    echo Belum ada log server.
)
echo ========================================================
echo.
pause
