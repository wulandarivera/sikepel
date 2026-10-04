@echo off
setlocal
cd /d "%~dp0\.."

:: 1. Cek apakah server sudah aktif di port 3000 (mencegah proses ganda / konflik PGlite)
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    exit /b 0
)

:: 2. Pastikan folder data dan log tersedia
if not exist .data mkdir .data
echo [%date% %time%] Memulai server latar belakang... >> ".data\server.log"

:: 3. Bersihkan sisa lock postmaster.pid jika ada
if exist .data\postgres\postmaster.pid del /f /q .data\postgres\postmaster.pid >> ".data\server.log" 2>&1

:: 4. Cek dan pastikan dependensi & build sudah siap
if not exist node_modules (
    echo [%date% %time%] Menginstal dependensi... >> ".data\server.log"
    call npm.cmd ci >> ".data\server.log" 2>&1
)
if not exist .data\postgres (
    echo [%date% %time%] Setup database awal... >> ".data\server.log"
    call npm.cmd run setup >> ".data\server.log" 2>&1
)
if not exist .next\BUILD_ID (
    echo [%date% %time%] Melakukan build Next.js... >> ".data\server.log"
    call npm.cmd run build >> ".data\server.log" 2>&1
)

:: 5. Aktifkan Tailscale Funnel di background
tailscale funnel --bg 3000 >> ".data\server.log" 2>&1

:: 6. Jalankan server Next.js (output diarahkan ke file log)
echo [%date% %time%] Menjalankan server Next.js pada port 3000... >> ".data\server.log"
call npm.cmd start >> ".data\server.log" 2>&1
