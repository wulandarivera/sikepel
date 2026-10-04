$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host ("[OK] Server SIKEPEL (PID " + $conn.OwningProcess + ") berhasil dihentikan.") -ForegroundColor Green
} else {
    Write-Host "[INFO] Server SIKEPEL tidak sedang berjalan." -ForegroundColor Yellow
}
