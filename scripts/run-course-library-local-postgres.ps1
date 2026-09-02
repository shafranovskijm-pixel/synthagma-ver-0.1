[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$PostgresBin,

  [Parameter(Mandatory = $false)]
  [ValidateNotNullOrEmpty()]
  [string]$WorkRoot = 'D:\CodexTmp\course-library-local-acceptance',

  [Parameter(Mandatory = $false)]
  [ValidateRange(1024, 65535)]
  [int]$Port = 55439
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Migration = Join-Path $RepoRoot 'supabase\migrations\20260903100000_csz_electronic_library_schema.sql'
$CatalogDryRun = Join-Path $RepoRoot 'supabase\tests\course_library_migration_dry_run.sql'
$BaseFixture = Join-Path $RepoRoot 'supabase\tests\fixtures\course_library_local_base.sql'
$RlsContract = Join-Path $RepoRoot 'supabase\tests\course_library_local_rls_contract.sql'

$ProtectedCourseId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
$LocalGuardToken = 'local-isolated-course-library'
$DatabaseName = 'course_library_acceptance'

function Resolve-RequiredFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) {
    throw "Required file is missing: $Path"
  }
  return $resolved.Path
}

function Assert-DDrivePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [IO.Path]::GetFullPath($Path)
  if ([IO.Path]::GetPathRoot($fullPath) -ne 'D:\') {
    throw "Local acceptance artifacts must stay on D:. Refusing path: $fullPath"
  }
  return $fullPath.TrimEnd('\')
}

function Assert-PortAvailable {
  param([Parameter(Mandatory = $true)][int]$CandidatePort)

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $CandidatePort)
  try {
    $listener.Start()
  } catch {
    throw "Port $CandidatePort is already in use; choose another local port."
  } finally {
    $listener.Stop()
  }
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Add-Content -LiteralPath $LogPath -Encoding utf8 -Value "`n=== $Label ==="
  $output = & $Executable @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $output | Tee-Object -FilePath $LogPath -Append
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
  return @($output)
}

function Invoke-LoggedPgCtl {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Add-Content -LiteralPath $LogPath -Encoding utf8 -Value "`n=== $Label ==="
  $suffix = [Guid]::NewGuid().ToString('N')
  $stdoutPath = "$LogPath.$suffix.stdout"
  $stderrPath = "$LogPath.$suffix.stderr"
  $quotedArguments = ($Arguments | ForEach-Object {
    '"' + $_.Replace('"', '\"') + '"'
  }) -join ' '

  # Do not pipe pg_ctl output through PowerShell: on Windows the child
  # postgres process can inherit that pipe and keep the caller blocked.
  $process = Start-Process -FilePath $Executable `
    -ArgumentList $quotedArguments `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath
  $process.WaitForExit()

  $stdout = if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath -Raw
  } else { '' }
  $stderr = if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath -Raw
  } else { '' }
  @($stdout, $stderr) | Where-Object { $_ } | Tee-Object -FilePath $LogPath -Append

  if ($process.ExitCode -ne 0) {
    throw "$Label failed with exit code $($process.ExitCode)."
  }
}

$WorkRoot = Assert-DDrivePath $WorkRoot
$PostgresBin = Assert-DDrivePath $PostgresBin

$RequiredExecutables = @{
  postgres = Join-Path $PostgresBin 'postgres.exe'
  initdb = Join-Path $PostgresBin 'initdb.exe'
  pg_ctl = Join-Path $PostgresBin 'pg_ctl.exe'
  createdb = Join-Path $PostgresBin 'createdb.exe'
  psql = Join-Path $PostgresBin 'psql.exe'
}
foreach ($name in @($RequiredExecutables.Keys)) {
  $RequiredExecutables[$name] = Resolve-RequiredFile $RequiredExecutables[$name]
}

$Migration = Resolve-RequiredFile $Migration
$CatalogDryRun = Resolve-RequiredFile $CatalogDryRun
$BaseFixture = Resolve-RequiredFile $BaseFixture
$RlsContract = Resolve-RequiredFile $RlsContract

$PostgresVersion = (& $RequiredExecutables.postgres '--version' 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $PostgresVersion -notmatch 'PostgreSQL\) 17\.') {
  throw "PostgreSQL 17 is required; found: $PostgresVersion"
}

Assert-PortAvailable $Port

New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
$RunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$RunRoot = Join-Path $WorkRoot $RunId
$DataDir = Join-Path $RunRoot 'data'
$ServerLog = Join-Path $RunRoot 'postgres.log'
$AcceptanceLog = Join-Path $RunRoot 'acceptance.log'
$ResultJson = Join-Path $RunRoot 'result.json'
New-Item -ItemType Directory -Path $RunRoot | Out-Null
New-Item -ItemType File -Path $AcceptanceLog | Out-Null

$Git = Get-Command git -ErrorAction Stop
$GitSha = (& $Git.Source -C $RepoRoot rev-parse HEAD 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $GitSha -notmatch '^[0-9a-f]{40}$') {
  throw 'Could not resolve the exact Git commit for the acceptance evidence.'
}

$Evidence = [ordered]@{
  status = 'FAILED'
  started_at = (Get-Date).ToUniversalTime().ToString('o')
  completed_at = $null
  git_sha = $GitSha
  postgres_version = $PostgresVersion
  listen_address = '127.0.0.1'
  port = $Port
  database = $DatabaseName
  run_root = $RunRoot
  migration_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Migration).Hash
  catalog_dry_run_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $CatalogDryRun).Hash
  base_fixture_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $BaseFixture).Hash
  rls_contract_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $RlsContract).Hash
  catalog_marker = $false
  rls_marker = $false
  error = $null
  limitations = @(
    'No Supabase JWT or PostgREST verification',
    'No Supabase Storage API or signed URL verification',
    'No browser E2E verification'
  )
}

$ServerStarted = $false
$Failure = $null

try {
  Add-Content -LiteralPath $AcceptanceLog -Encoding utf8 -Value @(
    "Git SHA: $GitSha",
    "PostgreSQL: $PostgresVersion",
    "Run root: $RunRoot",
    "Listen: 127.0.0.1:$Port"
  )

  Invoke-LoggedCommand -Executable $RequiredExecutables.initdb -Arguments @(
    "--pgdata=$DataDir",
    '--username=postgres',
    '--encoding=UTF8',
    '--no-locale',
    '--auth-local=trust',
    '--auth-host=trust'
  ) -LogPath $AcceptanceLog -Label 'initdb' | Out-Null

  Invoke-LoggedPgCtl -Executable $RequiredExecutables.pg_ctl -Arguments @(
    '--pgdata', $DataDir,
    '--log', $ServerLog,
    '--options', "-h 127.0.0.1 -p $Port",
    '--wait',
    '--timeout', '60',
    'start'
  ) -LogPath $AcceptanceLog -Label 'pg_ctl start' | Out-Null
  $ServerStarted = $true

  Invoke-LoggedCommand -Executable $RequiredExecutables.createdb -Arguments @(
    '--host=127.0.0.1',
    "--port=$Port",
    '--username=postgres',
    $DatabaseName
  ) -LogPath $AcceptanceLog -Label 'createdb' | Out-Null

  $PsqlCommon = @(
    '--host=127.0.0.1',
    "--port=$Port",
    '--username=postgres',
    "--dbname=$DatabaseName",
    '--no-psqlrc',
    '--no-password',
    '--set=ON_ERROR_STOP=1'
  )

  Invoke-LoggedCommand -Executable $RequiredExecutables.psql -Arguments ($PsqlCommon + @(
    '--file', $BaseFixture
  )) -LogPath $AcceptanceLog -Label 'base fixture' | Out-Null

  $CatalogOutput = Invoke-LoggedCommand -Executable $RequiredExecutables.psql -Arguments ($PsqlCommon + @(
    "--set=protected_course_id=$ProtectedCourseId",
    "--set=staging_guard_token=$LocalGuardToken",
    '--file', $CatalogDryRun
  )) -LogPath $AcceptanceLog -Label 'migration catalog dry-run'
  $Evidence.catalog_marker = (($CatalogOutput | Out-String) -match 'PASS - migration verified and transaction successfully rolled back')
  if (-not $Evidence.catalog_marker) {
    throw 'Catalog dry-run finished without the required PASS marker.'
  }

  Invoke-LoggedCommand -Executable $RequiredExecutables.psql -Arguments ($PsqlCommon + @(
    '--file', $Migration
  )) -LogPath $AcceptanceLog -Label 'apply migration to disposable database' | Out-Null

  $RlsOutput = Invoke-LoggedCommand -Executable $RequiredExecutables.psql -Arguments ($PsqlCommon + @(
    '--file', $RlsContract
  )) -LogPath $AcceptanceLog -Label 'local RLS contract'
  $Evidence.rls_marker = (($RlsOutput | Out-String) -match 'PASS - local PostgreSQL parser, catalog and RLS contract verified')
  if (-not $Evidence.rls_marker) {
    throw 'RLS contract finished without the required PASS marker.'
  }

  $Evidence.status = 'PASS'
} catch {
  $Failure = $_
  $Evidence.error = $_.Exception.Message
} finally {
  if ($ServerStarted) {
    try {
      Invoke-LoggedPgCtl -Executable $RequiredExecutables.pg_ctl -Arguments @(
        '--pgdata', $DataDir,
        '--wait',
        '--timeout', '60',
        '--mode', 'fast',
        'stop'
      ) -LogPath $AcceptanceLog -Label 'pg_ctl stop' | Out-Null
    } catch {
      Add-Content -LiteralPath $AcceptanceLog -Encoding utf8 -Value "Failed to stop PostgreSQL cleanly: $($_.Exception.Message)"
      if ($null -eq $Failure) {
        $Failure = $_
        $Evidence.status = 'FAILED'
        $Evidence.error = $_.Exception.Message
      }
    }
  }

  $Evidence.completed_at = (Get-Date).ToUniversalTime().ToString('o')
  $Evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultJson -Encoding utf8
}

if ($null -ne $Failure) {
  throw $Failure
}

Write-Host "PASS: local course-library PostgreSQL acceptance completed."
Write-Host "Evidence: $ResultJson"
Write-Host 'Limitations: Supabase JWT/PostgREST/Storage/signed URL and browser E2E remain staging gates.'
