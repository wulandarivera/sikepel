# 1. Hapus dari Startup Folder
$startup = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup "SIKEPEL.lnk"
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    Write-Host "[OK] Shortcut Startup berhasil dihapus." -ForegroundColor Green
} else {
    Write-Host "[INFO] Shortcut Startup tidak ditemukan." -ForegroundColor Yellow
}

# 2. Hapus dari Task Scheduler
schtasks /delete /tn "SIKEPEL_Server" /f 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Task Scheduler SIKEPEL_Server berhasil dihapus." -ForegroundColor Green
}

Write-Host ""
Write-Host "Auto-start berhasil DICABUT." -ForegroundColor Green
Write-Host "Server SIKEPEL tidak akan otomatis berjalan saat Windows booting."
