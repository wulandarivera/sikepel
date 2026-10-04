$projectRoot = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $projectRoot "Jalankan Latar Belakang.vbs"

# 1. Pasang di Windows Startup Folder
$ws = New-Object -ComObject WScript.Shell
$startup = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup "SIKEPEL.lnk"

$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Server SIKEPEL Latar Belakang"
$shortcut.Save()

Write-Host "[OK] Shortcut Startup berhasil dipasang di:" -ForegroundColor Green
Write-Host "     $shortcutPath" -ForegroundColor Cyan

# 2. Pasang di Windows Task Scheduler (onlogon)
$action = "wscript.exe `"$vbsPath`""
schtasks /create /tn "SIKEPEL_Server" /tr $action /sc onlogon /f 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Task Scheduler SIKEPEL_Server berhasil didaftarkan." -ForegroundColor Green
}

Write-Host ""
Write-Host "Auto-start BERHASIL aktif!" -ForegroundColor Green
Write-Host "Setiap kali Windows menyala/login, server SIKEPEL dan Tailscale akan otomatis berjalan tanpa jendela terminal."
