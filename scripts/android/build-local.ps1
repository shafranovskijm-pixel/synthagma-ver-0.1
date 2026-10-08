param([switch]$Release)
$ErrorActionPreference = 'Stop'
$toolRoot = 'D:/Codex/tools/android'
$env:JAVA_HOME = "$toolRoot/jdk21/jdk-21.0.12.1+1"
$env:ANDROID_HOME = "$toolRoot/sdk"
$env:ANDROID_USER_HOME = "$toolRoot/user"
$env:GRADLE_USER_HOME = "$toolRoot/gradle"
$env:TEMP = "$toolRoot/temp"
$env:TMP = $env:TEMP
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$toolRoot/user -Djava.io.tmpdir=$toolRoot/temp"
$nodeDirectory = 'D:/Codex/tools/node-v22.23.2/node-v22.23.2-win-x64'
$env:PATH = "$nodeDirectory;$env:PATH"
Push-Location (Join-Path $PSScriptRoot '../..')
try {
    $buildArgs = @('scripts/android/build.mjs')
    if ($Release) { $buildArgs += '--release' }
    & "$nodeDirectory/node.exe" @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "Android build failed: $LASTEXITCODE" }
} finally { Pop-Location }
