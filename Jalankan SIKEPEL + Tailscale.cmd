@echo off
cd /d "%~dp0"
title SIKEPEL + Tailscale Tunnel
echo ===================================================
echo   SIKEPEL - Sistem Informasi Pelayanan Kelurahan
echo   Mode: Local Server + Tailscale Tunnel
echo ===================================================
echo.

:: 1. Cek Tailscale
echo [1/3] Memeriksa status Tailscale...
tailscale status >nul 2>&1
if errorlevel 1 (
    echo [PERINGATAN] Tailscale belum aktif atau belum login.
    echo Pastikan aplikasi Tailscale sudah berjalan dan terhubung.
    echo.
) else (
    echo [OK] Tailscale aktif.
)

:: 2. Persiapan dependensi & build jika belum ada
if not exist node_modules (
    echo [2/3] Menginstal dependensi...
    call npm.cmd ci
    if errorlevel 1 goto gagal
)
if not exist .data\postgres (
    echo [2/3] Inisialisasi database lokal...
    call npm.cmd run setup
    if errorlevel 1 goto gagal
)
if not exist .next\BUILD_ID (
    echo [2/3] Melakukan build Next.js...
    call npm.cmd run build
    if errorlevel 1 goto gagal
)

:: 3. Jalankan Tailscale Funnel di background
echo [3/3] Mengaktifkan Tailscale Funnel port 3000...
tailscale funnel --bg 3000
echo.
echo ---------------------------------------------------
echo Server Lokal     : http://127.0.0.1:3000
echo Domain Tailscale : https://desktop-74ghl7q.tail53164c.ts.net
echo Kredensial Awal  : Lihat .data\AKSES-LOKAL.txt
echo ---------------------------------------------------
echo.
echo Menjalankan server web... Tekan Ctrl+C untuk berhenti.
echo.

call npm.cmd start
pause
exit /b

:gagal
echo.
echo [ERROR] Gagal menjalankan aplikasi. Periksa log di atas.
pause
exit /b 1
