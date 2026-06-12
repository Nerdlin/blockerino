INSERT INTO public.app_config (key, value)
VALUES (
  'android_version',
  jsonb_build_object(
    'latestVersion', '1.0.2',
    'latestBuildNumber', 3,
    'downloadUrl', 'https://ptcglecvavdvpxadqfqd.supabase.co/storage/v1/object/public/app-updates/android/blockerino-release.apk',
    'releaseNotes', 'Android release with stable shop audio playback, smoother music looping, safer profile sync, fixed friend requests, and match history ELO deltas.',
    'isMandatory', false
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
