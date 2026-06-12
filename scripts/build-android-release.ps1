param(
  [string]$Architectures = "armeabi-v7a,arm64-v8a,x86,x86_64",
  [string]$OutputPath = "builds/blockerino-release.apk"
)

$ErrorActionPreference = "Stop"

$javaHome = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path -LiteralPath $javaHome) {
  $env:JAVA_HOME = $javaHome
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}

$env:NODE_ENV = "production"

& ".\android\gradlew.bat" -p android assembleRelease "-Pexpo.useLegacyPackaging=true" "-PreactNativeArchitectures=$Architectures"
if ($LASTEXITCODE -ne 0) {
  throw "Android release build failed."
}

$apkPath = "android\app\build\outputs\apk\release\app-release.apk"
Copy-Item -LiteralPath $apkPath -Destination $OutputPath -Force

$artifact = Get-Item -LiteralPath $OutputPath
Write-Host "Android release APK copied:"
Write-Host "  path: $($artifact.FullName)"
Write-Host "  size: $($artifact.Length) bytes"
