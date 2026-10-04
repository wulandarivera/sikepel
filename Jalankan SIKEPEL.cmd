@echo off
cd /d "%~dp0"
title SIKEPEL - Server Lokal
echo SIKEPEL - Sistem Informasi Pelayanan Kelurahan
echo Buka http://127.0.0.1:3000 di browser setelah server siap.
echo Akun awal tersedia di .data\AKSES-LOKAL.txt
echo Tekan Ctrl+C untuk menghentikan aplikasi.
if not exist node_modules call npm.cmd ci
if errorlevel 1 goto gagal
if not exist .data\postgres call npm.cmd run setup
if errorlevel 1 goto gagal
if not exist .next\BUILD_ID call npm.cmd run build
if errorlevel 1 goto gagal
call npm.cmd start
pause
exit /b
:gagal
echo Aplikasi belum dapat dijalankan. Periksa pesan kesalahan di atas.
pause
exit /b 1
