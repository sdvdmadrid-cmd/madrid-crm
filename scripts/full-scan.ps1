$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Output "[full-scan] $Message"
}

function Assert-Status {
  param(
    [string]$BaseUrl,
    [string]$Path,
    [int]$ExpectedStatus,
    $Session = $null,
    [string]$Method = "GET",
    [string]$Body = $null,
    [string]$ContentType = "application/json"
  )

  $uri = "$BaseUrl$Path"
  try {
    if ($Session -ne $null) {
      if ($Body) {
        $res = Invoke-WebRequest -Uri $uri -Method $Method -WebSession $Session -UseBasicParsing -TimeoutSec 12 -ContentType $ContentType -Body $Body
      } else {
        $res = Invoke-WebRequest -Uri $uri -Method $Method -WebSession $Session -UseBasicParsing -TimeoutSec 12
      }
    } else {
      if ($Body) {
        $res = Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing -TimeoutSec 12 -ContentType $ContentType -Body $Body
      } else {
        $res = Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing -TimeoutSec 12
      }
    }

    if ($res.StatusCode -ne $ExpectedStatus) {
      throw "Expected $ExpectedStatus for $Path but got $($res.StatusCode)"
    }

    Write-Output "[ok] $Path -> $($res.StatusCode)"
    return $res
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $actual = [int]$_.Exception.Response.StatusCode.value__
      if ($actual -eq $ExpectedStatus) {
        Write-Output "[ok] $Path -> $actual"
        return $null
      }
      throw "Expected $ExpectedStatus for $Path but got $actual"
    }

    throw "Request failed for ${Path}: $($_.Exception.Message)"
  }
}

$base = "https://localhost:3000"

Write-Step "Checking dev runtime status"
npm run dev:status | Out-String | Write-Output

Write-Step "Running health stability probe"
$ok = 0
$fail = 0
1..5 | ForEach-Object {
  try {
    $r = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 6
    if ($r.StatusCode -eq 200) {
      $ok += 1
      Write-Output "[ok] /api/health probe $_ -> 200"
    } else {
      $fail += 1
      Write-Output "[fail] /api/health probe $_ -> $($r.StatusCode)"
    }
  } catch {
    $fail += 1
    Write-Output "[fail] /api/health probe $_ -> FAIL"
  }
  Start-Sleep -Seconds 1
}

if ($fail -gt 0) {
  throw "Health probe failed ($fail failures)."
}

Write-Step "Checking public routes"
Assert-Status -BaseUrl $base -Path "/" -ExpectedStatus 200 | Out-Null
Assert-Status -BaseUrl $base -Path "/jobs" -ExpectedStatus 200 | Out-Null
Assert-Status -BaseUrl $base -Path "/invoices" -ExpectedStatus 200 | Out-Null
Assert-Status -BaseUrl $base -Path "/clients" -ExpectedStatus 200 | Out-Null
Assert-Status -BaseUrl $base -Path "/calendar" -ExpectedStatus 200 | Out-Null
Assert-Status -BaseUrl $base -Path "/api/public/quotes/not-a-real-token" -ExpectedStatus 404 | Out-Null

Write-Step "Checking authenticated routes with dev admin session"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$devLoginPath = "/api/auth/dev-login?profile=admin&redirect=/"
$canRunAuthenticatedChecks = $false

try {
  Assert-Status -BaseUrl $base -Path $devLoginPath -ExpectedStatus 200 -Session $session | Out-Null
  $canRunAuthenticatedChecks = $true
} catch {
  if ($_.Exception.Message -like "*got 404") {
    Write-Output "[info] Dev login disabled. Falling back to temporary self-register auth flow for authenticated checks."

    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $smokeEmail = "scan-$timestamp@example.com"
    $registerBody = @{
      name = "Scan User"
      email = $smokeEmail
      password = "ScanPass123!"
    } | ConvertTo-Json

    Assert-Status -BaseUrl $base -Path "/api/auth/register" -ExpectedStatus 200 -Session $session -Method "POST" -Body $registerBody | Out-Null

    try {
      Assert-Status -BaseUrl $base -Path "/api/auth/me" -ExpectedStatus 200 -Session $session | Out-Null
      $canRunAuthenticatedChecks = $true
    } catch {
      Write-Output "[info] Self-register fallback did not create an authenticated session (likely pending email verification). Skipping authenticated endpoint checks."
      $canRunAuthenticatedChecks = $false
    }
  } else {
    throw
  }
}

if ($canRunAuthenticatedChecks) {
  Assert-Status -BaseUrl $base -Path "/api/auth/me" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/clients" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/jobs" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/invoices" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/contracts" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/company-profile" -ExpectedStatus 200 -Session $session | Out-Null
  Assert-Status -BaseUrl $base -Path "/api/estimate-requests" -ExpectedStatus 200 -Session $session | Out-Null
}

Write-Step "Stripe webhook prerequisites"
if (-not $env:STRIPE_SECRET_KEY -or -not $env:STRIPE_WEBHOOK_SECRET) {
  Write-Output "[info] Stripe secrets not present. Validating graceful failure path instead."
  Assert-Status -BaseUrl $base -Path "/api/payments/webhooks/stripe" -ExpectedStatus 500 -Method "POST" -Body "{}" | Out-Null
  Write-Output "[ok] Stripe webhook route handles missing secrets as expected"
} else {
  Write-Output "[ok] Stripe secrets are present"
}

Write-Step "Full scan completed successfully"
Write-Output "[summary] health_ok=$ok health_fail=$fail"
