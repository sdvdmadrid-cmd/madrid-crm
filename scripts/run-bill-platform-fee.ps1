param(
  [string]$BaseUrl,
  [string]$CronSecret,
  [string]$ChargeMonth,
  [switch]$DryRun,
  [int]$TimeoutSec = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-HealthyBaseUrl {
  param(
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }

    $url = $candidate.Trim().TrimEnd("/")
    try {
      $health = Invoke-RestMethod -Method Get -Uri "$url/api/health" -TimeoutSec 8
      if ($health -and $health.success -eq $true) {
        return $url
      }
    } catch {
      continue
    }
  }

  return $null
}

function Resolve-BaseUrl {
  param(
    [string]$ExplicitBaseUrl
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitBaseUrl)) {
    return $ExplicitBaseUrl.Trim().TrimEnd("/")
  }

  $candidates = @(
    [string]$env:BILL_PLATFORM_FEE_BASE_URL,
    [string]$env:BILL_AUTOPAY_BASE_URL,
    [string]$env:APP_BASE_URL,
    [string]$env:APP_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  )

  if ($env:PORT) {
    $port = [string]$env:PORT
    $candidates += "https://localhost:$port"
    $candidates += "https://127.0.0.1:$port"
    $candidates += "http://localhost:$port"
    $candidates += "http://127.0.0.1:$port"
  }

  return Resolve-HealthyBaseUrl -Candidates $candidates
}

$resolvedBaseUrl = Resolve-BaseUrl -ExplicitBaseUrl $BaseUrl
if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
  throw "Unable to resolve Bill Platform Fee base URL. Set BILL_PLATFORM_FEE_BASE_URL, BILL_AUTOPAY_BASE_URL, APP_BASE_URL, APP_URL, or pass -BaseUrl explicitly."
}

$resolvedSecret = if (-not [string]::IsNullOrWhiteSpace($CronSecret)) {
  $CronSecret.Trim()
} else {
  [string]$env:BILL_PLATFORM_FEE_CRON_SECRET
}

if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
  $resolvedSecret = [string]$env:BILL_AUTOPAY_CRON_SECRET
}

if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
  throw "Missing BILL_PLATFORM_FEE_CRON_SECRET (or BILL_AUTOPAY_CRON_SECRET fallback). Pass -CronSecret or set the environment variable."
}

$endpoint = "$resolvedBaseUrl/api/bill-payments/platform-fee/process"
Write-Output "Triggering Bill Platform Fee processor: $endpoint"

$body = @{}
if (-not [string]::IsNullOrWhiteSpace($ChargeMonth)) {
  $body.chargeMonth = $ChargeMonth.Trim()
}
if ($DryRun.IsPresent) {
  $body.dryRun = $true
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers @{ "x-cron-secret" = $resolvedSecret } `
  -ContentType "application/json" `
  -Body ($body | ConvertTo-Json -Depth 5) `
  -TimeoutSec $TimeoutSec

if (-not $response.success) {
  $failureJson = $response | ConvertTo-Json -Depth 8
  throw "Bill Platform Fee processor returned an unsuccessful response: $failureJson"
}

$response | ConvertTo-Json -Depth 8
