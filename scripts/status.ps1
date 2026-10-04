$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "[STATUS] SERVER AKTIF (Berjalan di Port 3000)" -ForegroundColor Green
    Write-Host ("PID Proses     : " + $conn.OwningProcess)
    if ($p) {
        Write-Host ("Penggunaan RAM : " + [math]::Round($p.WorkingSet64 / 1MB, 2) + " MB")
    }
    Write-Host "Akses Lokal    : http://127.0.0.1:3000" -ForegroundColor Cyan
    Write-Host "Akses Domain   : https://desktop-74ghl7q.tail53164c.ts.net" -ForegroundColor Cyan
} else {
    Write-Host "[STATUS] SERVER TIDAK AKTIF (Mati)" -ForegroundColor Red
}
