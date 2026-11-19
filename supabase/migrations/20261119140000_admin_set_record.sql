-- Admin panel: set a player's best score in Classic or Chaos to a given value (admin_reset_record only zeroes it).
-- The profile's record and this season's leaderboard row move together; a score of 0 removes the player from this season's board.
-- Every change is written to the admin log with the old and new value.

CREATE OR REPLACE FUNCTION public.admin_set_record(p_profile_id uuid, p_mode text, p_score integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before integer;
BEGIN
  PERFORM public.admin_require();
  IF p_mode NOT IN ('classic', 'chaos') THEN RAISE EXCEPTION 'Unknown mode'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100000000 THEN RAISE EXCEPTION 'Bad score'; END IF;

  IF p_mode = 'classic' THEN
    SELECT highscore_classic INTO v_before FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
    UPDATE public.profiles SET highscore_classic = p_score WHERE id = p_profile_id;
  ELSE
    SELECT highscore_chaos INTO v_before FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
    UPDATE public.profiles SET highscore_chaos = p_score WHERE id = p_profile_id;
  END IF;

  IF p_score > 0 THEN
    INSERT INTO public.season_scores (season_key, board, profile_id, score, updated_at)
    VALUES (public.current_season_key(), p_mode, p_profile_id, p_score, now())
    ON CONFLICT (season_key, board, profile_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  ELSE
    DELETE FROM public.season_scores WHERE profile_id = p_profile_id AND board = p_mode AND season_key = public.current_season_key();
  END IF;

  PERFORM public.admin_write_log('set_record', p_profile_id, jsonb_build_object('mode', p_mode, 'before', v_before, 'after', p_score, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'score', p_score);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_record(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_record(uuid, text, integer, text) TO authenticated;
