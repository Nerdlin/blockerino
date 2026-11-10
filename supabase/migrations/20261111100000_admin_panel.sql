-- Admin panel: a few server functions only the game's administrator may call. The client shows the panel only to
-- an admin, but every function checks is_admin() itself, and every change is written to admin_log.

CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admins FROM anon, authenticated;

-- The account "Nerdlin" (e-mail, Discord and Google sign-in).
-- (only where that account exists, so the migration also applies to an empty local database)
INSERT INTO public.admins (user_id)
SELECT id FROM auth.users WHERE id = 'ba298ab7-104b-4bc6-8614-3a54f3cab5cf'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_profile_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.admin_require()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_write_log(p_action text, p_target uuid, p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ INSERT INTO public.admin_log (admin_id, action, target_profile_id, details) VALUES (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb)) $$;

-- Numbers for the first screen of the panel.
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day timestamptz := date_trunc('day', now());
BEGIN
  PERFORM public.admin_require();
  RETURN jsonb_build_object(
    'players', (SELECT count(*) FROM public.profiles),
    'accounts', (SELECT count(*) FROM public.profiles WHERE auth_user_id IS NOT NULL),
    'new_today', (SELECT count(*) FROM public.profiles WHERE created_at >= v_day),
    'active_today', (SELECT count(*) FROM public.profiles p
                     LEFT JOIN public.profile_logins l ON l.profile_id = p.id
                     WHERE p.updated_at >= v_day OR l.last_login_at >= v_day),
    'active_week', (SELECT count(*) FROM public.profiles p
                    LEFT JOIN public.profile_logins l ON l.profile_id = p.id
                    WHERE p.updated_at >= v_day - interval '6 days' OR l.last_login_at >= v_day - interval '6 days'),
    'coins_total', (SELECT coalesce(sum(coins), 0) FROM public.profiles),
    'season_players', (SELECT count(DISTINCT profile_id) FROM public.season_scores WHERE season_key = public.current_season_key()),
    'duels_today', (SELECT count(*) FROM public.match_history WHERE created_at >= v_day),
    'android_version', (SELECT value FROM public.app_config WHERE key = 'android_version')
  );
END;
$$;

-- Players by nickname (part of it), newest activity first.
CREATE OR REPLACE FUNCTION public.admin_find_players(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := btrim(coalesce(p_query, ''));
BEGIN
  PERFORM public.admin_require();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.last_seen DESC NULLS LAST)
    FROM (
      SELECT p.id, p.player_name, p.avatar_url, p.coins, p.elo, p.highscore_classic, p.highscore_chaos,
             p.streak_count, p.created_at, l.login_providers, l.last_login_at,
             greatest(p.updated_at, l.last_login_at) AS last_seen,
             p.auth_user_id IS NOT NULL AS has_account,
             EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p.auth_user_id) AS is_admin
      FROM public.profiles p
      LEFT JOIN public.profile_logins l ON l.profile_id = p.id
      WHERE v_query = '' OR p.player_name ILIKE '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%'
      ORDER BY greatest(p.updated_at, l.last_login_at) DESC NULLS LAST
      LIMIT 30
    ) r
  ), '[]'::jsonb);
END;
$$;

-- Adds or takes coins (negative delta). The balance never goes below zero.
CREATE OR REPLACE FUNCTION public.admin_adjust_coins(p_profile_id uuid, p_delta integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  PERFORM public.admin_require();
  IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 10000000 THEN RAISE EXCEPTION 'Bad amount'; END IF;
  SELECT coins INTO v_before FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  v_after := greatest(0, v_before + p_delta);
  UPDATE public.profiles SET coins = v_after WHERE id = p_profile_id;
  PERFORM public.admin_write_log('adjust_coins', p_profile_id, jsonb_build_object('before', v_before, 'after', v_after, 'reason', p_reason));
  RETURN jsonb_build_object('coins', v_after);
END;
$$;

-- Wipes a record that looks fake: the all-time best of a mode and the player's entry on the running season board.
CREATE OR REPLACE FUNCTION public.admin_reset_record(p_profile_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer;
BEGIN
  PERFORM public.admin_require();
  IF p_mode NOT IN ('classic', 'chaos') THEN RAISE EXCEPTION 'Unknown mode'; END IF;
  IF p_mode = 'classic' THEN
    SELECT highscore_classic INTO v_before FROM public.profiles WHERE id = p_profile_id;
    UPDATE public.profiles SET highscore_classic = 0 WHERE id = p_profile_id;
  ELSE
    SELECT highscore_chaos INTO v_before FROM public.profiles WHERE id = p_profile_id;
    UPDATE public.profiles SET highscore_chaos = 0 WHERE id = p_profile_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  DELETE FROM public.season_scores WHERE profile_id = p_profile_id AND board = p_mode AND season_key = public.current_season_key();
  PERFORM public.admin_write_log('reset_record', p_profile_id, jsonb_build_object('mode', p_mode, 'before', v_before));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- The running season's top 10 of a board, to look at before the season closes.
CREATE OR REPLACE FUNCTION public.admin_season_top(p_board text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_require();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.score DESC)
    FROM (
      SELECT s.profile_id, p.player_name, s.score, s.updated_at, p.created_at AS account_created
      FROM public.season_scores s JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.board = p_board AND s.season_key = public.current_season_key()
      ORDER BY s.score DESC LIMIT 10
    ) r
  ), '[]'::jsonb);
END;
$$;

-- The "update available" prompt of the Android app.
CREATE OR REPLACE FUNCTION public.admin_set_android_version(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_require();
  IF jsonb_typeof(p_value) <> 'object' OR NOT (p_value ? 'latestVersion') OR NOT (p_value ? 'latestBuildNumber') OR NOT (p_value ? 'downloadUrl') THEN
    RAISE EXCEPTION 'latestVersion, latestBuildNumber and downloadUrl are required';
  END IF;
  INSERT INTO public.app_config (key, value) VALUES ('android_version', p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  PERFORM public.admin_write_log('set_android_version', NULL, p_value);
  RETURN p_value;
END;
$$;

-- The last actions, newest first.
CREATE OR REPLACE FUNCTION public.admin_recent_log()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_require();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
    FROM (
      SELECT l.action, l.details, l.created_at, p.player_name AS target
      FROM public.admin_log l LEFT JOIN public.profiles p ON p.id = l.target_profile_id
      ORDER BY l.created_at DESC LIMIT 20
    ) r
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_require() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_write_log(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_overview()', 'public.admin_find_players(text)', 'public.admin_adjust_coins(uuid, integer, text)',
    'public.admin_reset_record(uuid, text)', 'public.admin_season_top(text)', 'public.admin_set_android_version(jsonb)',
    'public.admin_recent_log()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
