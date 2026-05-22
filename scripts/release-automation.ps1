# FieldBase release automation — runs everything that does not need manual Stripe/GitHub login.
param(
  [string]$ProdBase = "https://fieldbaseapp.net",
  [switch]$SkipE2E,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Write-Step([string]$msg) {
  Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

$report = @{
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  prodBase = $ProdBase
  steps = @()
}

function Add-Result([string]$name, [bool]$ok, [string]$detail = "") {
  $report.steps += @{ name = $name; ok = $ok; detail = $detail }
}

Write-Step "Production HTTP smoke"
foreach ($path in @("/api/health", "/login", "/legal", "/robots.txt")) {
  $url = "$ProdBase$path"
  try {
    $resp = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 25 -UseBasicParsing
    $ok = $resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400
    if ($ok) { Write-Ok "$($resp.StatusCode) $path" } else { Write-Fail "$($resp.StatusCode) $path" }
    Add-Result "http$path" $ok "$($resp.StatusCode)"
  } catch {
    Write-Fail "$url — $($_.Exception.Message)"
    Add-Result "http$path" $false $_.Exception.Message
  }
}

if (-not $SkipBuild) {
  Write-Step "npm run build"
  npm run build
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "build"
    Add-Result "build" $true
  } else {
    Write-Fail "build exit $LASTEXITCODE"
    Add-Result "build" $false "exit $LASTEXITCODE"
  }
}

if (-not $SkipE2E) {
  Write-Step "Playwright E2E (local dev server must be running on :3000)"
  npx playwright test 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "e2e"
    Add-Result "e2e" $true
  } else {
    Write-Warn "e2e failed or server not running — skip if intentional"
    Add-Result "e2e" $false "exit $LASTEXITCODE"
  }
}

Write-Step "Security preflight (requires app on http://127.0.0.1:3000)"
$health = $null
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 3 -UseBasicParsing
} catch {}

if (-not $health) {
  Write-Warn "Starting next start on port 3000..."
  Start-Process -FilePath "npm" -ArgumentList "run","start","--","-p","3000" -WorkingDirectory $root -WindowStyle Hidden
  $ready = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    try {
      $h = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 3 -UseBasicParsing
      if ($h.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) {
    Write-Fail "Local app did not become healthy"
    Add-Result "security-preflight" $false "app not healthy"
  }
}

if ($health -or $ready) {
  powershell -ExecutionPolicy Bypass -File "$root\scripts\security-preflight.ps1" `
    -BaseUrl "http://127.0.0.1:3000" `
    -JsonOutputPath "$root\release-automation-preflight.json"
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "security preflight"
    Add-Result "security-preflight" $true
  } else {
    Write-Fail "security preflight"
    Add-Result "security-preflight" $false "exit $LASTEXITCODE"
  }
}

Write-Step "GitHub PR #9 status (public API)"
try {
  $pr = Invoke-RestMethod -Uri "https://api.github.com/repos/sdvdmadrid-cmd/madrid-crm/pulls/9" -TimeoutSec 20
  $sha = $pr.head.sha
  $checks = Invoke-RestMethod -Uri "https://api.github.com/repos/sdvdmadrid-cmd/madrid-crm/commits/$sha/check-runs" -TimeoutSec 20
  foreach ($run in $checks.check_runs) {
    $line = "$($run.name): $($run.status) / $($run.conclusion)"
    if ($run.conclusion -eq "success") { Write-Ok $line } elseif ($run.status -eq "in_progress") { Write-Warn $line } else { Write-Fail $line }
  }
  Add-Result "pr9-mergeable" ($pr.mergeable_state -eq "clean") $pr.mergeable_state
  Write-Host "PR: $($pr.html_url) — mergeable_state=$($pr.mergeable_state)" -ForegroundColor White
} catch {
  Write-Warn "Could not fetch PR checks: $($_.Exception.Message)"
}

Write-Step "Manual only (cannot automate)"
Write-Host "  Merge PR #9 when Security Preflight is green: https://github.com/sdvdmadrid-cmd/madrid-crm/pull/9" -ForegroundColor DarkGray
Write-Host "  Stripe Connect: https://dashboard.stripe.com/connect (see docs/STRIPE_CONNECT_APPLICATION_DRAFT.md)" -ForegroundColor DarkGray

$reportPath = Join-Path $root "release-automation-report.json"
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportPath -Encoding UTF8
Write-Ok "Report: $reportPath"
