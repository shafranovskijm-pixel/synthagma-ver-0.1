param(
    [Parameter(Mandatory=$true)][string]$UnsignedApk,
    [Parameter(Mandatory=$true)][string]$SignedApk,
    [string]$SigningDirectory = 'D:/Codex/private/sintagma-android-signing',
    [string]$AndroidSdk = 'D:/Codex/tools/android/sdk'
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $UnsignedApk)) { throw 'Unsigned APK was not found.' }
if (Test-Path -LiteralPath $SignedApk) { throw 'Refusing to overwrite an existing signed release.' }
$secure = (Get-Content -LiteralPath (Join-Path $SigningDirectory 'password.dpapi') -Raw).Trim() | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:SINTAGMA_SIGNING_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $signer = Join-Path $AndroidSdk 'build-tools/36.0.0/apksigner.bat'
    & $signer sign --ks (Join-Path $SigningDirectory 'sintagma-release.p12') --ks-key-alias sintagma --ks-pass env:SINTAGMA_SIGNING_PASS --key-pass env:SINTAGMA_SIGNING_PASS --out $SignedApk $UnsignedApk
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
    & $signer verify --verbose --print-certs $SignedApk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    Get-FileHash -LiteralPath $SignedApk -Algorithm SHA256
} finally {
    Remove-Item Env:/SINTAGMA_SIGNING_PASS -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
}
