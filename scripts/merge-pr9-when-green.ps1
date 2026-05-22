# Waits for PR #9 checks, merges to main, triggers prod deploy hint.
param(
  [int]$MaxPolls = 40,
  [int]$PollSeconds = 20
)

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
  $gh = "gh"
}

Write-Host "Polling PR #9 checks..." -ForegroundColor Cyan
for ($i = 0; $i -lt $MaxPolls; $i++) {
  $checks = & $gh pr checks 9 --repo sdvdmadrid-cmd/madrid-crm 2>&1 | Out-String
  Write-Host $checks
  if ($checks -match "Security Preflight\s+pending") {
    Start-Sleep -Seconds $PollSeconds
    continue
  }
  if ($checks -match "Security Preflight\s+fail") {
    Write-Host "Security Preflight failed. Fix CI before merge." -ForegroundColor Red
    exit 1
  }
  if ($checks -notmatch "pending") {
    break
  }
  Start-Sleep -Seconds $PollSeconds
}

$view = & $gh pr view 9 --repo sdvdmadrid-cmd/madrid-crm --json mergeable,mergeStateStatus,statusCheckRollup 2>&1
Write-Host $view

& $gh pr merge 9 --repo sdvdmadrid-cmd/madrid-crm --merge --delete-branch 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "PR #9 merged to main." -ForegroundColor Green
  Set-Location (Split-Path $PSScriptRoot -Parent)
  git checkout main
  git pull origin main
  Write-Host "Run: npx vercel --prod --yes" -ForegroundColor Yellow
} else {
  Write-Host "Merge failed (checks or branch protection). Open: https://github.com/sdvdmadrid-cmd/madrid-crm/pull/9" -ForegroundColor Yellow
  exit $LASTEXITCODE
}
