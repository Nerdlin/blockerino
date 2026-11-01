-- Moving a chess.com rating over to Blockerino, once per account, after proving the chess.com account is the player's:
-- the player gets a short code, puts it into the "Location" field of their chess.com profile, and the edge function
-- chess-com-import reads the public profile, finds the code there and sets the ratings with the function below.
-- A chess.com account can give its rating to one Blockerino account only.

CREATE TABLE IF NOT EXISTS public.chess_com_claims (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_created_at timestamptz NOT NULL DEFAULT now(),
  username text,
  imported_at timestamptz,
  imported_ratings jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS chess_com_claims_username_key
  ON public.chess_com_claims (lower(username)) WHERE imported_at IS NOT NULL;

ALTER TABLE public.chess_com_claims ENABLE ROW LEVEL SECURITY;
-- no policies: clients only go through the functions below

/** The caller's verification code (a new one after a day), and their import if it already happened. */
CREATE OR REPLACE FUNCTION public.chess_com_import_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile uuid;
  v_claim public.chess_com_claims%ROWTYPE;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := 'BLK-';
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile IS NULL THEN RETURN jsonb_build_object('status', 'signed_out'); END IF;

  SELECT * INTO v_claim FROM public.chess_com_claims WHERE profile_id = v_profile;
  IF FOUND AND v_claim.imported_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'imported', 'username', v_claim.username, 'importedAt', v_claim.imported_at, 'ratings', v_claim.imported_ratings);
  END IF;

  IF NOT FOUND OR v_claim.code_created_at < now() - interval '1 day' THEN
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    INSERT INTO public.chess_com_claims (profile_id, code, code_created_at)
    VALUES (v_profile, v_code, now())
    ON CONFLICT (profile_id) DO UPDATE SET code = EXCLUDED.code, code_created_at = EXCLUDED.code_created_at;
    RETURN jsonb_build_object('status', 'pending', 'code', v_code);
  END IF;

  RETURN jsonb_build_object('status', 'pending', 'code', v_claim.code);
END;
$$;

REVOKE ALL ON FUNCTION public.chess_com_import_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chess_com_import_status() TO authenticated;

/**
 * Sets the player's ratings from chess.com. Only the edge function (service role) calls it, after it found the code
 * in the chess.com profile. p_ratings is {"bullet": 1234, ...}; a class chess.com has no rating for is left alone.
 */
CREATE OR REPLACE FUNCTION public.chess_com_apply_import(p_profile uuid, p_username text, p_ratings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_class text;
  v_rating integer;
  v_applied jsonb := '{}'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.chess_com_claims WHERE profile_id = p_profile AND imported_at IS NOT NULL) THEN
    RETURN jsonb_build_object('status', 'already_imported');
  END IF;
  IF EXISTS (SELECT 1 FROM public.chess_com_claims WHERE lower(username) = lower(p_username) AND imported_at IS NOT NULL) THEN
    RETURN jsonb_build_object('status', 'username_taken');
  END IF;

  FOREACH v_class IN ARRAY ARRAY['bullet', 'blitz', 'rapid'] LOOP
    CONTINUE WHEN coalesce(jsonb_typeof(p_ratings -> v_class), '') <> 'number';
    v_rating := least(3500, greatest(100, (p_ratings ->> v_class)::numeric::int));
    INSERT INTO public.chess_ratings (profile_id, time_class, rating)
    VALUES (p_profile, v_class, v_rating)
    ON CONFLICT (profile_id, time_class) DO UPDATE SET rating = EXCLUDED.rating, updated_at = now();
    v_applied := v_applied || jsonb_build_object(v_class, v_rating);
  END LOOP;

  UPDATE public.chess_com_claims
  SET username = p_username, imported_at = now(), imported_ratings = v_applied
  WHERE profile_id = p_profile;

  RETURN jsonb_build_object('status', 'imported', 'username', p_username, 'ratings', v_applied);
END;
$$;

REVOKE ALL ON FUNCTION public.chess_com_apply_import(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chess_com_apply_import(uuid, text, jsonb) TO service_role;
