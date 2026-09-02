[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$DatabaseUrl = $env:SINTAGMA_STAGING_DATABASE_URL,

  [Parameter(Mandatory = $true)]
  [Guid]$ProtectedCourseId,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$StagingGuardToken,

  [Parameter(Mandatory = $false)]
  [string[]]$AllowedStagingProjectRefs = @(
    $env:SINTAGMA_ALLOWED_STAGING_PROJECT_REFS -split ',' |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ }
  ),

  [Parameter(Mandatory = $false)]
  [string[]]$AllowedStagingHosts = @(
    $env:SINTAGMA_ALLOWED_STAGING_HOSTS -split ',' |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ }
  ),

  [Parameter(Mandatory = $false)]
  [string]$PsqlCommand = 'psql'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProductionProjectRef = 'atxwvjxbqjgkbjlhsdch'
$DryRunScript = Join-Path $PSScriptRoot '..\supabase\tests\course_library_migration_dry_run.sql'

function Normalize-Allowlist {
  param([string[]]$Values)

  return @(
    $Values |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Where-Object { $_ } |
      Select-Object -Unique
  )
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'SINTAGMA_STAGING_DATABASE_URL (or -DatabaseUrl) is required.'
}

$AllowedStagingProjectRefs = Normalize-Allowlist $AllowedStagingProjectRefs
$AllowedStagingHosts = Normalize-Allowlist $AllowedStagingHosts

if ($AllowedStagingProjectRefs.Count -eq 0) {
  throw 'An explicit staging project-ref allowlist is required.'
}
if ($AllowedStagingHosts.Count -eq 0) {
  throw 'An explicit staging database-host allowlist is required.'
}
if ($AllowedStagingProjectRefs -contains $ProductionProjectRef) {
  throw 'The production project ref cannot appear in the staging allowlist.'
}

try {
  $DatabaseUri = [Uri]$DatabaseUrl
} catch {
  throw 'The staging database URL is not a valid absolute PostgreSQL URL.'
}

if (-not $DatabaseUri.IsAbsoluteUri -or $DatabaseUri.Scheme -notin @('postgres', 'postgresql')) {
  throw 'Only an absolute postgres:// or postgresql:// staging URL is accepted.'
}

$DatabaseHost = $DatabaseUri.DnsSafeHost.ToLowerInvariant()
if ($DatabaseHost -notin $AllowedStagingHosts) {
  throw "Database host '$DatabaseHost' is not in the staging host allowlist."
}

$DecodedUserInfo = [Uri]::UnescapeDataString($DatabaseUri.UserInfo)
$DatabaseUser = ($DecodedUserInfo -split ':', 2)[0].ToLowerInvariant()
$DetectedProjectRef = $null

if ($DatabaseHost -match '^db\.([a-z0-9]+)\.supabase\.co$') {
  $DetectedProjectRef = $Matches[1]
} elseif ($DatabaseUser -match '^postgres\.([a-z0-9]+)$') {
  # Supavisor/pooler URLs carry the project ref in the username.
  $DetectedProjectRef = $Matches[1]
}

if ([string]::IsNullOrWhiteSpace($DetectedProjectRef)) {
  throw 'Could not derive a Supabase project ref from the staging host or username.'
}
if ($DetectedProjectRef -eq $ProductionProjectRef -or
    $DatabaseUrl.IndexOf($ProductionProjectRef, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  throw 'Refusing to run against the SINTAGMA production Supabase project.'
}
if ($DetectedProjectRef -notin $AllowedStagingProjectRefs) {
  throw "Project ref '$DetectedProjectRef' is not in the staging project-ref allowlist."
}

$ResolvedPsql = Get-Command -Name $PsqlCommand -ErrorAction Stop
if (-not (Test-Path -LiteralPath $DryRunScript -PathType Leaf)) {
  throw "Dry-run SQL file is missing: $DryRunScript"
}

# The sentinel is deliberately not created here. A staging database
# administrator must provision public.sintagma_staging_guard and its one-time
# token independently. This read-only probe happens only after the connection
# target has passed the production-ref and explicit allowlist checks above.
$ProbeSql = @"
SELECT 'ready'
FROM public.sintagma_staging_guard
WHERE token = :'staging_guard_token'
LIMIT 1;
"@

$ProbeOutput = & $ResolvedPsql.Source `
  $DatabaseUrl `
  '--no-psqlrc' `
  '--no-password' `
  '--set=ON_ERROR_STOP=1' `
  "--set=staging_guard_token=$StagingGuardToken" `
  '--tuples-only' `
  '--no-align' `
  '--command' $ProbeSql

if ($LASTEXITCODE -ne 0) {
  throw 'The clone-only staging sentinel could not be verified.'
}
if (($ProbeOutput | Out-String).Trim() -ne 'ready') {
  throw 'The clone-only staging sentinel token does not match.'
}

& $ResolvedPsql.Source `
  $DatabaseUrl `
  '--no-psqlrc' `
  '--no-password' `
  '--set=ON_ERROR_STOP=1' `
  "--set=protected_course_id=$ProtectedCourseId" `
  "--set=staging_guard_token=$StagingGuardToken" `
  '--file' $DryRunScript

if ($LASTEXITCODE -ne 0) {
  throw "Migration dry-run failed with psql exit code $LASTEXITCODE."
}
