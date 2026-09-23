param(
  [string]$Architectures = "armeabi-v7a,arm64-v8a,x86,x86_64",
  [string]$OutputPath = "builds/blockerino-release.apk"
)

$ErrorActionPreference = "Stop"

$candidateJdks = @(
  $env:JAVA_HOME,
  "$env:USERPROFILE\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2",
  "C:\Program Files\Android\Android Studio\jbr"
)
foreach ($cand in $candidateJdks) {
  if ($cand -and (Test-Path -LiteralPath "$cand\bin\javac.exe") -and (Test-Path -LiteralPath "$cand\lib\jvm.cfg")) {
    $env:JAVA_HOME = $cand
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
    break
  }
}

$env:NODE_ENV = "production"

& ".\android\gradlew.bat" -p android assembleRelease "-Pexpo.useLegacyPackaging=true" "-PreactNativeArchitectures=$Architectures"
if ($LASTEXITCODE -ne 0) {
  throw "Android release build failed."
}

$apkPath = "android\app\build\outputs\apk\release\app-release.apk"
$outputDirectory = Split-Path -Parent ([System.IO.Path]::GetFullPath($OutputPath))
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Copy-Item -LiteralPath $apkPath -Destination $OutputPath -Force

$artifact = Get-Item -LiteralPath $OutputPath
Write-Host "Android release APK copied:"
Write-Host "  path: $($artifact.FullName)"
Write-Host "  size: $($artifact.Length) bytes"
