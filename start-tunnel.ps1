# Narda Pro - restarts the tunnel and auto-updates the bot Menu Button URL.
# Usage:  powershell -ExecutionPolicy Bypass -File C:\NARDA\start-tunnel.ps1
# Needs:  backend running on localhost:3000 (apps/api), and a fresh dist:
#         pnpm --filter @narda/web build
$ErrorActionPreference = 'Stop'
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) { throw "cloudflared not found: $cf" }

# 1) Stop the old tunnel and start a new one.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-Item C:\NARDA\cf.log, C:\NARDA\cf.out -ErrorAction SilentlyContinue
Start-Process -FilePath $cf -ArgumentList 'tunnel','--url','http://localhost:3000' `
  -RedirectStandardError 'C:\NARDA\cf.log' -RedirectStandardOutput 'C:\NARDA\cf.out' -WindowStyle Hidden

# 2) Wait for the fresh *.trycloudflare.com URL.
$url = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  $log = Get-Content C:\NARDA\cf.log -Raw -ErrorAction SilentlyContinue
  $m = [regex]::Match([string]$log, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($m.Success) { $url = $m.Value; break }
}
if (-not $url) { throw "Tunnel URL not found (check cf.log)" }
Write-Host "Tunnel URL: $url"

# 3) Check the tunnel responds.
try {
  $r = Invoke-WebRequest -Uri "$url/" -UseBasicParsing -TimeoutSec 15
  Write-Host "Tunnel serve: HTTP $($r.StatusCode)"
} catch { Write-Warning "Tunnel not responding yet: $($_.Exception.Message)" }

# 4) Update the bot Menu Button URL (token read from .env, never printed).
$envText = Get-Content C:\NARDA\.env -Raw
$tok = [regex]::Match($envText, '(?m)^\s*TELEGRAM_BOT_TOKEN\s*=\s*"?([0-9]{6,}:[A-Za-z0-9_-]{30,})"?').Groups[1].Value
if (-not $tok) { throw "TELEGRAM_BOT_TOKEN not found in .env" }
# Version param busts Telegram's webview cache on each deploy.
$webUrl = "$url/?v=" + (Get-Date -Format 'yyyyMMddHHmm')
$body = @{ menu_button = @{ type = 'web_app'; text = 'Narda Pro'; web_app = @{ url = $webUrl } } } | ConvertTo-Json -Depth 6
$res = Invoke-RestMethod -Uri "https://api.telegram.org/bot$tok/setChatMenuButton" -Method Post `
  -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
Write-Host "Menu Button updated: ok=$($res.ok)  ->  $webUrl"
Write-Host "DONE. Open (or reopen) the bot in Telegram."
