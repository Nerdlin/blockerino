-- Photo avatars (Blockerino 2.1). A signed-in player may upload one small square picture as an avatar.
--   * Bucket 'avatars' is public for reading (the picture is shown to other players) and tiny: the app shrinks every
--     picture to 256x256 JPEG before uploading, so 300 KB is far above a real file and a hard cap for anything else.
--   * Only jpeg/png/webp are accepted by the bucket itself.
--   * Writes are limited to the caller's own folder '<auth uid>/...': nobody can overwrite or delete another player's file.
--   * User-generated content needs a way to report it (Google Play policy): report_avatar() records a complaint about
--     another player's picture; a person reviews avatar_reports in the dashboard (see docs/moderation.md). The table has
--     no client policies, so only the function and the service role can touch it.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 307200, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.avatar_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_url text,
  reason text NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (reporter_id, target_id)
);
ALTER TABLE public.avatar_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avatar_reports FROM PUBLIC, anon, authenticated;

-- report_avatar(p_target, p_reason): a signed-in player complains about another player's avatar.
-- reason is one of: inappropriate | personal | other. One open complaint per reporter and target, 20 a day per reporter.
-- Returns {status: ok | unauthenticated | self | not_found | limit}.
CREATE OR REPLACE FUNCTION public.report_avatar(p_target uuid, p_reason text DEFAULT 'other')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_url text;
  v_reason text := CASE WHEN p_reason IN ('inappropriate', 'personal') THEN p_reason ELSE 'other' END;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_target IS NULL OR p_target = v_uid THEN RETURN jsonb_build_object('status', 'self'); END IF;

  SELECT avatar_url INTO v_url FROM public.profiles WHERE auth_user_id = p_target LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  IF (SELECT count(*) FROM public.avatar_reports WHERE reporter_id = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
    RETURN jsonb_build_object('status', 'limit');
  END IF;

  INSERT INTO public.avatar_reports (reporter_id, target_id, avatar_url, reason)
  VALUES (v_uid, p_target, v_url, v_reason)
  ON CONFLICT (reporter_id, target_id) DO UPDATE
    SET avatar_url = EXCLUDED.avatar_url, reason = EXCLUDED.reason, created_at = now(), resolved_at = NULL;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.report_avatar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_avatar(uuid, text) TO authenticated;
