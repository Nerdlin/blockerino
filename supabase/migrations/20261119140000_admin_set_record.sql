-- Admin panel: set a player's best score in any mode to a given value (admin_reset_record only zeroes Classic and Chaos).
-- Modes are the ones submit_high_score knows: classic, chaos, time_attack, move_limit, rescue, combo_trial and daily
-- (daily_puzzle is accepted as an alias). Classic and Chaos also have a row on this season's leaderboard; it moves with the
-- record, and a score of 0 removes the player from the board. Every change is written to the admin log with the old and new value.

CREATE OR REPLACE FUNCTION public.admin_set_record(p_profile_id uuid, p_mode text, p_score integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'daily_puzzle' THEN 'daily' ELSE p_mode END;
  v_before integer;
BEGIN
  PERFORM public.admin_require();
  IF v_mode NOT IN ('classic', 'chaos', 'time_attack', 'move_limit', 'rescue', 'combo_trial', 'daily') THEN RAISE EXCEPTION 'Unknown mode'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100000000 THEN RAISE EXCEPTION 'Bad score'; END IF;

  SELECT CASE v_mode
           WHEN 'classic' THEN highscore_classic WHEN 'chaos' THEN highscore_chaos
           WHEN 'time_attack' THEN highscore_time_attack WHEN 'move_limit' THEN highscore_move_limit
           WHEN 'rescue' THEN highscore_rescue WHEN 'combo_trial' THEN highscore_combo_trial
           ELSE highscore_daily END
    INTO v_before FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;

  UPDATE public.profiles SET
    highscore_classic = CASE WHEN v_mode = 'classic' THEN p_score ELSE highscore_classic END,
    highscore_chaos = CASE WHEN v_mode = 'chaos' THEN p_score ELSE highscore_chaos END,
    highscore_time_attack = CASE WHEN v_mode = 'time_attack' THEN p_score ELSE highscore_time_attack END,
    highscore_move_limit = CASE WHEN v_mode = 'move_limit' THEN p_score ELSE highscore_move_limit END,
    highscore_rescue = CASE WHEN v_mode = 'rescue' THEN p_score ELSE highscore_rescue END,
    highscore_combo_trial = CASE WHEN v_mode = 'combo_trial' THEN p_score ELSE highscore_combo_trial END,
    highscore_daily = CASE WHEN v_mode = 'daily' THEN p_score ELSE highscore_daily END
  WHERE id = p_profile_id;

  IF v_mode IN ('classic', 'chaos') THEN
    IF p_score > 0 THEN
      INSERT INTO public.season_scores (season_key, board, profile_id, score, updated_at)
      VALUES (public.current_season_key(), v_mode, p_profile_id, p_score, now())
      ON CONFLICT (season_key, board, profile_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
    ELSE
      DELETE FROM public.season_scores WHERE profile_id = p_profile_id AND board = v_mode AND season_key = public.current_season_key();
    END IF;
  END IF;

  PERFORM public.admin_write_log('set_record', p_profile_id, jsonb_build_object('mode', v_mode, 'before', v_before, 'after', p_score, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'mode', v_mode, 'score', p_score);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_record(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_record(uuid, text, integer, text) TO authenticated;

-- The player list carries the records of every mode, so the panel can show the current values.
CREATE OR REPLACE FUNCTION public.admin_find_players(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_query text := btrim(coalesce(p_query, ''));
BEGIN
  PERFORM public.admin_require();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.last_seen DESC NULLS LAST)
    FROM (
      SELECT p.id, p.player_name, p.avatar_url, p.coins, p.elo, p.highscore_classic, p.highscore_chaos,
             p.highscore_time_attack, p.highscore_move_limit, p.highscore_rescue, p.highscore_combo_trial, p.highscore_daily,
             p.streak_count, p.created_at, l.login_providers, l.last_login_at,
             greatest(p.updated_at, l.last_login_at) AS last_seen,
             p.auth_user_id IS NOT NULL AS has_account,
             EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p.auth_user_id) AS is_admin,
             CASE WHEN p.auth_user_id IS NULL THEN 0 ELSE public.player_matches(p.auth_user_id) END AS matches
      FROM public.profiles p
      LEFT JOIN public.profile_logins l ON l.profile_id = p.id
      WHERE v_query = '' OR p.player_name ILIKE '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%'
      ORDER BY greatest(p.updated_at, l.last_login_at) DESC NULLS LAST
      LIMIT 30
    ) r
  ), '[]'::jsonb);
END;
$$;
