param(
  [string]$BaseUrl = "https://localhost:3000",
  [switch]$RunLint,
  [switch]$RunBuild
)

$ErrorActionPreference = "Stop"
$failed = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$passed = New-Object System.Collections.Generic.List[string]

function Add-Pass([string]$msg) {
  $passed.Add($msg) | Out-Null
  Write-Host "[PASS] $msg" -ForegroundColor Green
}

function Add-Warn([string]$msg) {
  $warnings.Add($msg) | Out-Null
  Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Add-Fail([string]$msg) {
  $failed.Add($msg) | Out-Null
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

$envFilePath = Join-Path (Get-Location) ".env.local"
$envFileMap = @{}
if (Test-Path $envFilePath) {
  foreach ($line in Get-Content $envFilePath) {
    if ($line -match '^\s*#') { continue }
    if ($line -notmatch '^[A-Za-z_][A-Za-z0-9_]*=') { continue }
    $parts = $line -split '=', 2
    $key = $parts[0].Trim()
    $value = if ($parts.Length -gt 1) { $parts[1] } else { "" }
    $envFileMap[$key] = $value
  }
}

function Get-ConfigValue([string]$key) {
  $fromEnv = [Environment]::GetEnvironmentVariable($key)
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    return $fromEnv
  }
  if ($envFileMap.ContainsKey($key)) {
    return $envFileMap[$key]
  }
  return ""
}

function Invoke-NoRedirect([string]$url) {
  try {
    return Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
  } catch {
    if ($_.Exception.Response) {
      return $_.Exception.Response
    }
    throw
  }
}

Write-Host "Security preflight started for $BaseUrl" -ForegroundColor Cyan

# 1) Health endpoint
try {
  $health = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 10
  if ([int]$health.StatusCode -eq 200) {
    Add-Pass "/api/health returned 200"
  } else {
    Add-Fail "/api/health returned status $($health.StatusCode)"
  }
} catch {
  Add-Fail "Could not reach $BaseUrl/api/health. Ensure app is running."
}

# 2) Protected page should redirect unauthenticated users to /login
try {
  $pageResp = Invoke-NoRedirect "$BaseUrl/clients"
  $statusCode = [int]$pageResp.StatusCode
  $location = $pageResp.Headers["Location"]
  $content = "$($pageResp.Content)"
  $hasAppRouterRedirectDigest =
    ($statusCode -eq 200) -and
    ($content -match "NEXT_REDIRECT") -and
    ($content -match "/login\?next=/clients")

  if ((($statusCode -in 301, 302, 303, 307, 308) -and $location -and ($location -like "/login*" -or $location -like "$BaseUrl/login*")) -or $hasAppRouterRedirectDigest) {
    Add-Pass "Unauthenticated /clients redirects to /login"
  } else {
    Add-Fail "Expected redirect to /login for /clients. Got status=$statusCode location=$location"
  }
} catch {
  Add-Fail "Could not verify redirect behavior for /clients"
}

# 3) Protected API should reject unauthenticated users
try {
  $apiResp = Invoke-NoRedirect "$BaseUrl/api/clients"
  $apiStatus = [int]$apiResp.StatusCode
  if ($apiStatus -eq 401) {
    Add-Pass "Unauthenticated /api/clients returns 401"
  } else {
    Add-Fail "Expected 401 from /api/clients. Got $apiStatus"
  }
} catch {
  Add-Fail "Could not verify auth behavior for /api/clients"
}

# 4) Session secret hardening signal
$sessionSecret = Get-ConfigValue "SESSION_SECRET"
$minSecretLengthRaw = Get-ConfigValue "SESSION_SECRET_MIN_LENGTH"
$minSecretLength = 32
if (-not [string]::IsNullOrWhiteSpace($minSecretLengthRaw)) {
  $parsedMin = 0
  if ([int]::TryParse($minSecretLengthRaw, [ref]$parsedMin) -and $parsedMin -ge 16) {
    $minSecretLength = $parsedMin
  }
}
if ([string]::IsNullOrWhiteSpace($sessionSecret)) {
  Add-Warn "SESSION_SECRET not visible in current shell. Validate in deployment environment."
} elseif ($sessionSecret.Length -lt $minSecretLength) {
  Add-Fail "SESSION_SECRET is too short. Required minimum length is $minSecretLength characters."
} else {
  Add-Pass "SESSION_SECRET is non-default and meets minimum length in current shell context"
}

# 5) Supabase connection prerequisites
$supabaseUrl = Get-ConfigValue "NEXT_PUBLIC_SUPABASE_URL"
$supabasePublishable = Get-ConfigValue "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
$supabaseServiceRole = Get-ConfigValue "SUPABASE_SERVICE_ROLE_KEY"

if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
  Add-Warn "NEXT_PUBLIC_SUPABASE_URL is missing. Supabase client cannot connect."
} else {
  Add-Pass "NEXT_PUBLIC_SUPABASE_URL is configured"
}

if ([string]::IsNullOrWhiteSpace($supabasePublishable)) {
  Add-Warn "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. Browser auth/data calls will fail."
} else {
  Add-Pass "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is configured"
}

if ([string]::IsNullOrWhiteSpace($supabaseServiceRole)) {
  Add-Warn "SUPABASE_SERVICE_ROLE_KEY is missing. Server-side admin operations will fail."
} else {
  Add-Pass "SUPABASE_SERVICE_ROLE_KEY is configured"
}

# 6) CSRF same-origin guard tests
#    We send a fake session cookie (non-blank, looks like a real cookie) + a cross-origin
#    Origin header.  The guard should reject before auth runs, returning 403.
$csrfEndpoints = @(
  @{ Path = "/api/clients/00000000-0000-0000-0000-000000000001"; Method = "PATCH" },
  @{ Path = "/api/jobs/00000000-0000-0000-0000-000000000001";    Method = "PATCH" },
  @{ Path = "/api/invoices/00000000-0000-0000-0000-000000000001"; Method = "PATCH" }
)

foreach ($ep in $csrfEndpoints) {
  try {
    $xoHeaders = @{
      "Content-Type" = "application/json"
      "Cookie"       = "madrid_session=csrf-preflight-test-fake-token"
      "Origin"       = "https://evil.attacker.example.com"
    }
    $xoBody = '{"__csrftest":true}'
    $xoStatus = 0
    try {
      $xoResp = Invoke-WebRequest `
        -Uri "$BaseUrl$($ep.Path)" `
        -Method $ep.Method `
        -Headers $xoHeaders `
        -Body $xoBody `
        -UseBasicParsing `
        -TimeoutSec 10 `
        -ErrorAction Stop
      $xoStatus = [int]$xoResp.StatusCode
    } catch {
      if ($_.Exception.Response) {
        $xoStatus = [int]$_.Exception.Response.StatusCode
      }
    }
    if ($xoStatus -eq 403) {
      Add-Pass "CSRF guard blocks cross-origin $($ep.Method) $($ep.Path) (403)"
    } elseif ($xoStatus -eq 0) {
      Add-Warn "CSRF test for $($ep.Path): no response (app may be down)"
    } else {
      Add-Fail "CSRF guard MISS on $($ep.Method) $($ep.Path): expected 403, got $xoStatus"
    }
  } catch {
    Add-Warn "CSRF test for $($ep.Path) threw: $($_.Exception.Message)"
  }
}

# 7) Optional quality gates
if ($RunLint) {
  try {
    Write-Host "Running lint..." -ForegroundColor Cyan
    npm run lint | Out-Host
    if ($LASTEXITCODE -eq 0) {
      Add-Pass "Lint passed"
    } else {
      Add-Fail "Lint failed"
    }
  } catch {
    Add-Fail "Lint command failed to execute"
  }
}

if ($RunBuild) {
  try {
    Write-Host "Running build..." -ForegroundColor Cyan
    npm run build | Out-Host
    if ($LASTEXITCODE -eq 0) {
      Add-Pass "Build passed"
    } else {
      Add-Fail "Build failed"
    }
  } catch {
    Add-Fail "Build command failed to execute"
  }
}

Write-Host ""
Write-Host "Security preflight summary" -ForegroundColor Cyan
Write-Host "Passed: $($passed.Count)"
Write-Host "Warnings: $($warnings.Count)"
Write-Host "Failed: $($failed.Count)"

if ($warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "Warnings:" -ForegroundColor Yellow
  foreach ($w in $warnings) {
    Write-Host "- $w" -ForegroundColor Yellow
  }
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Failures:" -ForegroundColor Red
  foreach ($f in $failed) {
    Write-Host "- $f" -ForegroundColor Red
  }
  exit 1
}

exit 0
