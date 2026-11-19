-- Admin panel: look at and edit what a player has outside the score modes:
--   * level stars (level_progress, 0 removes the level; 'all' sets every level),
--   * chess rating and games per time class (chess_ratings),
--   * online rating of the other games (more_game_ratings, found by the player's name like the game does),
--   * win / loss / draw counters per game, with bots separate (player_game_records).
-- A value left out (null) keeps what is stored. Every change is written to the admin log with the old and new values.

CREATE OR REPLACE FUNCTION public.admin_player_details(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p public.profiles%ROWTYPE;
BEGIN
  PERFORM public.admin_require();
  SELECT * INTO v_p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  RETURN jsonb_build_object(
    'has_account', v_p.auth_user_id IS NOT NULL,
    'levels', COALESCE((SELECT jsonb_object_agg(level_id, stars) FROM public.level_progress WHERE user_id = v_p.auth_user_id), '{}'::jsonb),
    'chess', COALESCE((SELECT jsonb_agg(jsonb_build_object('time_class', time_class, 'rating', rating, 'wins', wins, 'losses', losses, 'draws', draws) ORDER BY time_class)
                         FROM public.chess_ratings WHERE profile_id = v_p.id), '[]'::jsonb),
    'more', COALESCE((SELECT jsonb_agg(jsonb_build_object('game_id', game_id, 'elo', elo, 'wins', wins, 'losses', losses, 'draws', draws) ORDER BY game_id)
                        FROM public.more_game_ratings WHERE player_key = public.more_game_player_key(v_p.player_name)), '[]'::jsonb),
    'records', COALESCE((SELECT jsonb_agg(jsonb_build_object('game_id', game_id, 'wins', wins, 'losses', losses, 'draws', draws,
                                                              'bot_wins', bot_wins, 'bot_losses', bot_losses, 'bot_draws', bot_draws) ORDER BY game_id)
                           FROM public.player_game_records WHERE user_id = v_p.auth_user_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_player_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_player_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_level_stars(p_profile_id uuid, p_level_id text, p_stars integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_before integer;
  v_changed integer := 0;
BEGIN
  PERFORM public.admin_require();
  IF p_stars IS NULL OR p_stars < 0 OR p_stars > 3 THEN RAISE EXCEPTION 'Bad stars'; END IF;
  SELECT auth_user_id INTO v_uid FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'The player has no account'; END IF;

  IF p_level_id = 'all' THEN
    IF p_stars = 0 THEN
      DELETE FROM public.level_progress WHERE user_id = v_uid;
      GET DIAGNOSTICS v_changed = ROW_COUNT;
    ELSE
      INSERT INTO public.level_progress (user_id, level_id, stars, updated_at)
      SELECT v_uid, c || '-' || i, p_stars, now() FROM generate_series(1, 5) AS c, generate_series(1, 10) AS i
      ON CONFLICT (user_id, level_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now();
      v_changed := 50;
    END IF;
  ELSE
    IF p_level_id !~ '^[1-5]-([1-9]|10)$' THEN RAISE EXCEPTION 'Bad level'; END IF;
    SELECT stars INTO v_before FROM public.level_progress WHERE user_id = v_uid AND level_id = p_level_id;
    IF p_stars = 0 THEN
      DELETE FROM public.level_progress WHERE user_id = v_uid AND level_id = p_level_id;
    ELSE
      INSERT INTO public.level_progress (user_id, level_id, stars, updated_at) VALUES (v_uid, p_level_id, p_stars, now())
      ON CONFLICT (user_id, level_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now();
    END IF;
    v_changed := 1;
  END IF;

  PERFORM public.admin_write_log('set_level_stars', p_profile_id, jsonb_build_object('level', p_level_id, 'before', v_before, 'after', p_stars, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'level', p_level_id, 'stars', p_stars, 'changed', v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_level_stars(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_level_stars(uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_chess_rating(
  p_profile_id uuid, p_time_class text, p_rating integer DEFAULT NULL, p_wins integer DEFAULT NULL,
  p_losses integer DEFAULT NULL, p_draws integer DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old public.chess_ratings%ROWTYPE;
  v_rating integer;
  v_wins integer;
  v_losses integer;
  v_draws integer;
BEGIN
  PERFORM public.admin_require();
  IF p_time_class NOT IN ('bullet', 'blitz', 'rapid') THEN RAISE EXCEPTION 'Unknown time class'; END IF;
  IF p_rating IS NOT NULL AND (p_rating < 100 OR p_rating > 10000) THEN RAISE EXCEPTION 'Bad rating'; END IF;
  IF COALESCE(p_wins, 0) < 0 OR COALESCE(p_losses, 0) < 0 OR COALESCE(p_draws, 0) < 0
     OR COALESCE(p_wins, 0) > 1000000 OR COALESCE(p_losses, 0) > 1000000 OR COALESCE(p_draws, 0) > 1000000 THEN RAISE EXCEPTION 'Bad count'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;

  SELECT * INTO v_old FROM public.chess_ratings WHERE profile_id = p_profile_id AND time_class = p_time_class FOR UPDATE;
  v_rating := COALESCE(p_rating, v_old.rating, 400);
  v_wins := COALESCE(p_wins, v_old.wins, 0);
  v_losses := COALESCE(p_losses, v_old.losses, 0);
  v_draws := COALESCE(p_draws, v_old.draws, 0);

  INSERT INTO public.chess_ratings (profile_id, time_class, rating, games_played, wins, losses, draws, updated_at)
  VALUES (p_profile_id, p_time_class, v_rating, v_wins + v_losses + v_draws, v_wins, v_losses, v_draws, now())
  ON CONFLICT (profile_id, time_class) DO UPDATE
    SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, wins = EXCLUDED.wins,
        losses = EXCLUDED.losses, draws = EXCLUDED.draws, updated_at = now();

  PERFORM public.admin_write_log('set_chess_rating', p_profile_id, jsonb_build_object(
    'time_class', p_time_class,
    'before', jsonb_build_object('rating', v_old.rating, 'wins', v_old.wins, 'losses', v_old.losses, 'draws', v_old.draws),
    'after', jsonb_build_object('rating', v_rating, 'wins', v_wins, 'losses', v_losses, 'draws', v_draws), 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'time_class', p_time_class, 'rating', v_rating, 'wins', v_wins, 'losses', v_losses, 'draws', v_draws);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_chess_rating(uuid, text, integer, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_chess_rating(uuid, text, integer, integer, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_more_game_rating(
  p_profile_id uuid, p_game_id text, p_elo integer DEFAULT NULL, p_wins integer DEFAULT NULL,
  p_losses integer DEFAULT NULL, p_draws integer DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_key text;
  v_old public.more_game_ratings%ROWTYPE;
  v_elo integer;
  v_wins integer;
  v_losses integer;
  v_draws integer;
BEGIN
  PERFORM public.admin_require();
  IF p_game_id NOT IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong', 'checkers', 'backgammon') THEN RAISE EXCEPTION 'Unknown game'; END IF;
  IF p_elo IS NOT NULL AND (p_elo < 0 OR p_elo > 100000) THEN RAISE EXCEPTION 'Bad rating'; END IF;
  IF COALESCE(p_wins, 0) < 0 OR COALESCE(p_losses, 0) < 0 OR COALESCE(p_draws, 0) < 0
     OR COALESCE(p_wins, 0) > 1000000 OR COALESCE(p_losses, 0) > 1000000 OR COALESCE(p_draws, 0) > 1000000 THEN RAISE EXCEPTION 'Bad count'; END IF;
  SELECT player_name INTO v_name FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  v_key := public.more_game_player_key(v_name);

  SELECT * INTO v_old FROM public.more_game_ratings WHERE game_id = p_game_id AND player_key = v_key FOR UPDATE;
  v_elo := COALESCE(p_elo, v_old.elo, 0);
  v_wins := COALESCE(p_wins, v_old.wins, 0);
  v_losses := COALESCE(p_losses, v_old.losses, 0);
  v_draws := COALESCE(p_draws, v_old.draws, 0);

  IF v_old.id IS NULL THEN
    INSERT INTO public.more_game_ratings (game_id, player_key, player_name, elo, wins, losses, draws, games_played)
    VALUES (p_game_id, v_key, v_name, v_elo, v_wins, v_losses, v_draws, v_wins + v_losses + v_draws);
  ELSE
    UPDATE public.more_game_ratings
       SET elo = v_elo, wins = v_wins, losses = v_losses, draws = v_draws, games_played = v_wins + v_losses + v_draws, updated_at = now()
     WHERE id = v_old.id;
  END IF;

  PERFORM public.admin_write_log('set_more_game_rating', p_profile_id, jsonb_build_object(
    'game', p_game_id,
    'before', jsonb_build_object('elo', v_old.elo, 'wins', v_old.wins, 'losses', v_old.losses, 'draws', v_old.draws),
    'after', jsonb_build_object('elo', v_elo, 'wins', v_wins, 'losses', v_losses, 'draws', v_draws), 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'game_id', p_game_id, 'elo', v_elo, 'wins', v_wins, 'losses', v_losses, 'draws', v_draws);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_more_game_rating(uuid, text, integer, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_more_game_rating(uuid, text, integer, integer, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_game_record(
  p_profile_id uuid, p_game_id text, p_wins integer DEFAULT NULL, p_losses integer DEFAULT NULL, p_draws integer DEFAULT NULL,
  p_bot_wins integer DEFAULT NULL, p_bot_losses integer DEFAULT NULL, p_bot_draws integer DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_old public.player_game_records%ROWTYPE;
  v_new public.player_game_records%ROWTYPE;
BEGIN
  PERFORM public.admin_require();
  IF p_game_id NOT IN ('versus', 'chess', 'battleship', 'durak', 'tictactoe', 'sudoku', 'mahjong', 'checkers', 'backgammon') THEN RAISE EXCEPTION 'Unknown game'; END IF;
  IF LEAST(COALESCE(p_wins, 0), COALESCE(p_losses, 0), COALESCE(p_draws, 0), COALESCE(p_bot_wins, 0), COALESCE(p_bot_losses, 0), COALESCE(p_bot_draws, 0)) < 0
     OR GREATEST(COALESCE(p_wins, 0), COALESCE(p_losses, 0), COALESCE(p_draws, 0), COALESCE(p_bot_wins, 0), COALESCE(p_bot_losses, 0), COALESCE(p_bot_draws, 0)) > 1000000 THEN
    RAISE EXCEPTION 'Bad count';
  END IF;
  SELECT auth_user_id INTO v_uid FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'The player has no account'; END IF;

  SELECT * INTO v_old FROM public.player_game_records WHERE user_id = v_uid AND game_id = p_game_id FOR UPDATE;
  v_new.wins := COALESCE(p_wins, v_old.wins, 0);
  v_new.losses := COALESCE(p_losses, v_old.losses, 0);
  v_new.draws := COALESCE(p_draws, v_old.draws, 0);
  v_new.bot_wins := COALESCE(p_bot_wins, v_old.bot_wins, 0);
  v_new.bot_losses := COALESCE(p_bot_losses, v_old.bot_losses, 0);
  v_new.bot_draws := COALESCE(p_bot_draws, v_old.bot_draws, 0);

  INSERT INTO public.player_game_records (user_id, game_id, wins, losses, draws, bot_wins, bot_losses, bot_draws, updated_at)
  VALUES (v_uid, p_game_id, v_new.wins, v_new.losses, v_new.draws, v_new.bot_wins, v_new.bot_losses, v_new.bot_draws, now())
  ON CONFLICT (user_id, game_id) DO UPDATE
    SET wins = EXCLUDED.wins, losses = EXCLUDED.losses, draws = EXCLUDED.draws,
        bot_wins = EXCLUDED.bot_wins, bot_losses = EXCLUDED.bot_losses, bot_draws = EXCLUDED.bot_draws, updated_at = now();

  PERFORM public.admin_write_log('set_game_record', p_profile_id, jsonb_build_object(
    'game', p_game_id,
    'before', jsonb_build_object('wins', v_old.wins, 'losses', v_old.losses, 'draws', v_old.draws, 'bot_wins', v_old.bot_wins, 'bot_losses', v_old.bot_losses, 'bot_draws', v_old.bot_draws),
    'after', jsonb_build_object('wins', v_new.wins, 'losses', v_new.losses, 'draws', v_new.draws, 'bot_wins', v_new.bot_wins, 'bot_losses', v_new.bot_losses, 'bot_draws', v_new.bot_draws),
    'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'game_id', p_game_id, 'wins', v_new.wins, 'losses', v_new.losses, 'draws', v_new.draws,
                            'bot_wins', v_new.bot_wins, 'bot_losses', v_new.bot_losses, 'bot_draws', v_new.bot_draws);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_game_record(uuid, text, integer, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_game_record(uuid, text, integer, integer, integer, integer, integer, integer, text) TO authenticated;
