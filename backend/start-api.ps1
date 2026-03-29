# Start LaserXe FastAPI from THIS folder (…\LaserXe\backend). Verifies main.py before uvicorn.
# Examples:
#   .\start-api.ps1                 # port 8000
#   .\start-api.ps1 -Port 8001      # troubleshoot alongside another app on 8000
param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
Set-Location $here

$mainPy = Join-Path $here "main.py"
if (-not (Test-Path $mainPy)) {
    throw "main.py not found in $here — run this script from LaserXe\backend."
}
$txt = Get-Content -Raw -Encoding UTF8 -Path $mainPy
if ($txt -notmatch "config-merge") {
    throw "main.py does not contain 'config-merge' — wrong copy of the repo or file not saved."
}

Write-Host "Stopping processes listening on TCP $Port (if any)..."
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$ids = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
foreach ($procId in $ids) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped PID $procId"
}

Write-Host ""
Write-Host "Starting uvicorn from: $here"
Write-Host "After startup, check: http://127.0.0.1:$Port/health"
Write-Host '  Expect: "laserxe_device_config_merge": true'
if ($Port -ne 8000) {
    Write-Host ""
    Write-Host "Frontend: set in repo root .env (copy from .env.example):"
    Write-Host "  PUBLIC_API_URL=http://localhost:$Port"
    Write-Host "Then restart the Astro dev server."
}
Write-Host ""
python -m uvicorn main:app --reload --port $Port
