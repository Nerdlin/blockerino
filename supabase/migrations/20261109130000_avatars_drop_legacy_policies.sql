-- Three storage policies made by hand in the dashboard (never in a migration) let any signed-in player
-- upload into, overwrite or delete ANY file in the avatars bucket, i.e. other players' pictures.
-- Policies are OR-ed, so they cancelled the per-folder rules from 20261030100000_avatar_uploads.sql.
-- The app only writes to `<auth.uid()>/...`, which avatars_insert_own / _update_own / _delete_own still allow.
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
