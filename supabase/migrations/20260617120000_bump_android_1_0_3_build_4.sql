INSERT INTO public.app_config (key, value)
VALUES (
  'android_version',
  jsonb_build_object(
    'latestVersion', '1.0.3',
    'latestBuildNumber', 4,
    'downloadUrl', 'https://ptcglecvavdvpxadqfqd.supabase.co/storage/v1/object/public/app-updates/android/blockerino-release.apk',
    'releaseNotes', 'Android release with fixed challenge leaderboard back navigation, Move Limit bonus moves, safer friend requests and 1v1 invites, web 404 page, and reduced Android permissions.',
    'isMandatory', false
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
