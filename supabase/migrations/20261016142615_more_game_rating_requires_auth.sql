-- More Games ratings are written only by a signed-in player, and only for themselves.
-- Before this the RPCs ran for anon with no checks, so anyone could record a result for any pair of
-- names and raise or zero somebody else's rating.
--   * record_more_game_match: the caller's profile name must be one of the two players
--   * record_more_game_solo_result: the caller's profile name must be the rated player
-- Names are compared through more_game_player_key(), the same key the ratings are stored under.
-- Note: a participant can still report a wrong opponent or result; closing that needs both players
-- (or the server) to confirm the result.

CREATE OR REPLACE FUNCTION public.record_more_game_match(p_game_id text, p_player1_name text, p_player2_name text, p_result text, p_room_code text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(player_name text, player_key text, elo integer, old_elo integer, elo_change integer, wins integer, losses integer, draws integer, games_played integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_player1_name TEXT := public.normalize_more_game_player_name(p_player1_name);
  v_player2_name TEXT := public.normalize_more_game_player_name(p_player2_name);
  v_player1_key TEXT := public.more_game_player_key(p_player1_name);
  v_player2_key TEXT := public.more_game_player_key(p_player2_name);
  v_caller_name TEXT;
  v_player1 public.more_game_ratings%ROWTYPE;
  v_player2 public.more_game_ratings%ROWTYPE;
  v_player1_after public.more_game_ratings%ROWTYPE;
  v_player2_after public.more_game_ratings%ROWTYPE;
  v_new_elo1 INTEGER;
  v_new_elo2 INTEGER;
  v_delta1 INTEGER;
  v_delta2 INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a match' USING ERRCODE = '28000';
  END IF;

  SELECT p.player_name INTO v_caller_name FROM public.profiles p WHERE p.auth_user_id = auth.uid();
  IF v_caller_name IS NULL OR public.more_game_player_key(v_caller_name) NOT IN (v_player1_key, v_player2_key) THEN
    RAISE EXCEPTION 'Only a player of the match can record its result' USING ERRCODE = '42501';
  END IF;

  IF p_game_id NOT IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong') THEN
    RAISE EXCEPTION 'Unsupported more game id: %', p_game_id;
  END IF;

  IF v_player1_name IS NULL OR v_player2_name IS NULL THEN
    RAISE EXCEPTION 'Both player names are required';
  END IF;

  IF v_player1_key = v_player2_key THEN
    RAISE EXCEPTION 'Players must be different';
  END IF;

  IF p_result NOT IN ('player1', 'player2', 'draw') THEN
    RAISE EXCEPTION 'Unsupported result: %', p_result;
  END IF;

  INSERT INTO public.more_game_ratings (game_id, player_key, player_name)
  VALUES
    (p_game_id, v_player1_key, v_player1_name),
    (p_game_id, v_player2_key, v_player2_name)
  ON CONFLICT (game_id, player_key)
  DO UPDATE SET player_name = EXCLUDED.player_name;

  SELECT * INTO v_player1
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player1_key
  FOR UPDATE;

  SELECT * INTO v_player2
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player2_key
  FOR UPDATE;

  v_delta1 := CASE WHEN p_result = 'player1' THEN 10 WHEN p_result = 'player2' THEN -10 ELSE 0 END;
  v_delta2 := CASE WHEN p_result = 'player2' THEN 10 WHEN p_result = 'player1' THEN -10 ELSE 0 END;
  v_new_elo1 := GREATEST(0, v_player1.elo + v_delta1);
  v_new_elo2 := GREATEST(0, v_player2.elo + v_delta2);

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo1,
    wins = wins + CASE WHEN p_result = 'player1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = 'player2' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_result = 'player1' THEN 'win' WHEN p_result = 'player2' THEN 'loss' ELSE 'draw' END,
    last_played_at = NOW(),
    player_name = v_player1_name
  WHERE id = v_player1.id
  RETURNING * INTO v_player1_after;

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo2,
    wins = wins + CASE WHEN p_result = 'player2' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = 'player1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_result = 'player2' THEN 'win' WHEN p_result = 'player1' THEN 'loss' ELSE 'draw' END,
    last_played_at = NOW(),
    player_name = v_player2_name
  WHERE id = v_player2.id
  RETURNING * INTO v_player2_after;

  INSERT INTO public.more_game_match_history (
    game_id,
    room_code,
    player1_key,
    player1_name,
    player2_key,
    player2_name,
    result,
    winner_key,
    player1_elo_before,
    player1_elo_after,
    player1_elo_change,
    player2_elo_before,
    player2_elo_after,
    player2_elo_change,
    metadata
  )
  VALUES (
    p_game_id,
    p_room_code,
    v_player1_key,
    v_player1_name,
    v_player2_key,
    v_player2_name,
    p_result,
    CASE WHEN p_result = 'player1' THEN v_player1_key WHEN p_result = 'player2' THEN v_player2_key ELSE NULL END,
    v_player1.elo,
    v_player1_after.elo,
    v_player1_after.elo - v_player1.elo,
    v_player2.elo,
    v_player2_after.elo,
    v_player2_after.elo - v_player2.elo,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN QUERY
  SELECT v_player1_after.player_name, v_player1_after.player_key, v_player1_after.elo, v_player1.elo, v_player1_after.elo - v_player1.elo, v_player1_after.wins, v_player1_after.losses, v_player1_after.draws, v_player1_after.games_played
  UNION ALL
  SELECT v_player2_after.player_name, v_player2_after.player_key, v_player2_after.elo, v_player2.elo, v_player2_after.elo - v_player2.elo, v_player2_after.wins, v_player2_after.losses, v_player2_after.draws, v_player2_after.games_played;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_more_game_solo_result(p_game_id text, p_player_name text, p_won boolean DEFAULT true, p_score integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(player_name text, player_key text, elo integer, old_elo integer, elo_change integer, wins integer, losses integer, draws integer, games_played integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_player_name TEXT := public.normalize_more_game_player_name(p_player_name);
  v_player_key TEXT := public.more_game_player_key(p_player_name);
  v_caller_name TEXT;
  v_player public.more_game_ratings%ROWTYPE;
  v_player_after public.more_game_ratings%ROWTYPE;
  v_new_elo INTEGER;
  v_delta INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a result' USING ERRCODE = '28000';
  END IF;

  SELECT p.player_name INTO v_caller_name FROM public.profiles p WHERE p.auth_user_id = auth.uid();
  IF v_caller_name IS NULL OR public.more_game_player_key(v_caller_name) <> v_player_key THEN
    RAISE EXCEPTION 'Only the player can record their own result' USING ERRCODE = '42501';
  END IF;

  IF p_game_id NOT IN ('sudoku', 'mahjong') THEN
    RAISE EXCEPTION 'Solo ratings are only supported for sudoku and mahjong';
  END IF;

  IF v_player_name IS NULL THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  INSERT INTO public.more_game_ratings (game_id, player_key, player_name)
  VALUES (p_game_id, v_player_key, v_player_name)
  ON CONFLICT (game_id, player_key)
  DO UPDATE SET player_name = EXCLUDED.player_name;

  SELECT * INTO v_player
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player_key
  FOR UPDATE;

  v_delta := CASE WHEN p_won THEN 10 ELSE -10 END;
  v_new_elo := GREATEST(0, v_player.elo + v_delta);

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo,
    wins = wins + CASE WHEN p_won THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_won THEN 0 ELSE 1 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    last_played_at = NOW(),
    player_name = v_player_name
  WHERE id = v_player.id
  RETURNING * INTO v_player_after;

  INSERT INTO public.more_game_match_history (
    game_id,
    player1_key,
    player1_name,
    player2_key,
    player2_name,
    result,
    winner_key,
    player1_elo_before,
    player1_elo_after,
    player1_elo_change,
    player2_elo_before,
    player2_elo_after,
    player2_elo_change,
    metadata
  )
  VALUES (
    p_game_id,
    v_player_key,
    v_player_name,
    'solo-board',
    'Board',
    CASE WHEN p_won THEN 'player1' ELSE 'player2' END,
    CASE WHEN p_won THEN v_player_key ELSE 'solo-board' END,
    v_player.elo,
    v_player_after.elo,
    v_player_after.elo - v_player.elo,
    0,
    0,
    0,
    COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('score', p_score)
  );

  RETURN QUERY
  SELECT v_player_after.player_name, v_player_after.player_key, v_player_after.elo, v_player.elo, v_player_after.elo - v_player.elo, v_player_after.wins, v_player_after.losses, v_player_after.draws, v_player_after.games_played;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_more_game_match(text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_more_game_match(text, text, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.record_more_game_solo_result(text, text, boolean, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_more_game_solo_result(text, text, boolean, integer, jsonb) TO authenticated;
