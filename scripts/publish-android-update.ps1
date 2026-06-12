param(
  [string]$ApkPath = "builds/blockerino-release.apk",
  [string]$Version = "1.0.2",
  [int]$BuildNumber = 3,
  [string]$ProjectRef = "ptcglecvavdvpxadqfqd",
  [string]$BucketPath = "android/blockerino-release.apk",
  [string]$ReleaseNotes = "Android release with stable shop audio playback, smoother music looping, safer profile sync, fixed friend requests, and match history ELO deltas.",
  [switch]$Mandatory
)

$ErrorActionPreference = "Stop"

$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$storageUri = "ss:///app-updates/$BucketPath"
$publicUrl = "https://$ProjectRef.supabase.co/storage/v1/object/public/app-updates/$BucketPath"
$releaseNotesSql = $ReleaseNotes.Replace("'", "''")
$mandatorySql = if ($Mandatory) { "true" } else { "false" }

Write-Host "Publishing $resolvedApk to $storageUri"

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$apiKeysJson = & supabase projects api-keys --project-ref $ProjectRef -o json 2>$null | Out-String
$apiKeysExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($apiKeysExitCode -ne 0) {
  throw "Could not load Supabase API keys for project $ProjectRef."
}

$apiKeys = $apiKeysJson | ConvertFrom-Json
$serviceRoleKey = ($apiKeys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1).api_key
if (-not $serviceRoleKey) {
  throw "Supabase service_role key was not found."
}

$previousServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
& node ".\scripts\supabase-tus-upload.mjs" `
  --project-ref $ProjectRef `
  --bucket "app-updates" `
  --object $BucketPath `
  --file $resolvedApk `
  --content-type "application/vnd.android.package-archive" `
  --cache-control "3600"
$uploadExitCode = $LASTEXITCODE
if ($null -eq $previousServiceRoleKey) {
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
} else {
  $env:SUPABASE_SERVICE_ROLE_KEY = $previousServiceRoleKey
}
if ($uploadExitCode -ne 0) {
  throw "Supabase TUS upload failed."
}

$sql = @"
INSERT INTO public.app_config (key, value)
VALUES (
  'android_version',
  jsonb_build_object(
    'latestVersion', '$Version',
    'latestBuildNumber', $BuildNumber,
    'downloadUrl', '$publicUrl',
    'releaseNotes', '$releaseNotesSql',
    'isMandatory', $mandatorySql
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
"@

& supabase db query --linked --output table $sql
if ($LASTEXITCODE -ne 0) {
  throw "Supabase app_config update failed."
}

$response = Invoke-WebRequest -Method Head -Uri $publicUrl -UseBasicParsing
if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
  throw "Published APK URL returned HTTP $($response.StatusCode)."
}

Write-Host "Android update published:"
Write-Host "  version: $Version"
Write-Host "  build:   $BuildNumber"
Write-Host "  url:     $publicUrl"
