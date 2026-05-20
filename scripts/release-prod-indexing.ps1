param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
}

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not $SkipBuild) {
  Invoke-Step -Name "Build" -Action {
    npm run build
  }
}

Invoke-Step -Name "Deploy to Vercel (production)" -Action {
  npx --yes vercel@latest --prod --yes
}

Invoke-Step -Name "Verify indexing endpoints" -Action {
  npm run indexing:verify
}

Invoke-Step -Name "Submit IndexNow" -Action {
  npm run indexnow:submit
}

Write-Host ""
Write-Host "Pipeline completed: build/deploy/verify/indexnow." -ForegroundColor Green
