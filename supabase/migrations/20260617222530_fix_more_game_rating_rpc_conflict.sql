CREATE OR REPLACE FUNCTION public.record_more_game_match(
  p_game_id TEXT,
  p_player1_name TEXT,
  p_player2_name TEXT,
  p_result TEXT,
  p_room_code TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  player_name TEXT,
  player_key TEXT,
  elo INTEGER,
  old_elo INTEGER,
  elo_change INTEGER,
  wins INTEGER,
  losses INTEGER,
  draws INTEGER,
  games_played INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_player1_name TEXT := public.normalize_more_game_player_name(p_player1_name);
  v_player2_name TEXT := public.normalize_more_game_player_name(p_player2_name);
  v_player1_key TEXT := public.more_game_player_key(p_player1_name);
  v_player2_key TEXT := public.more_game_player_key(p_player2_name);
  v_player1 public.more_game_ratings%ROWTYPE;
  v_player2 public.more_game_ratings%ROWTYPE;
  v_player1_after public.more_game_ratings%ROWTYPE;
  v_player2_after public.more_game_ratings%ROWTYPE;
  v_new_elo1 INTEGER;
  v_new_elo2 INTEGER;
  v_delta1 INTEGER;
  v_delta2 INTEGER;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.record_more_game_solo_result(
  p_game_id TEXT,
  p_player_name TEXT,
  p_won BOOLEAN DEFAULT TRUE,
  p_score INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  player_name TEXT,
  player_key TEXT,
  elo INTEGER,
  old_elo INTEGER,
  elo_change INTEGER,
  wins INTEGER,
  losses INTEGER,
  draws INTEGER,
  games_played INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_player_name TEXT := public.normalize_more_game_player_name(p_player_name);
  v_player_key TEXT := public.more_game_player_key(p_player_name);
  v_player public.more_game_ratings%ROWTYPE;
  v_player_after public.more_game_ratings%ROWTYPE;
  v_new_elo INTEGER;
  v_delta INTEGER;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.record_more_game_match(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_more_game_solo_result(TEXT, TEXT, BOOLEAN, INTEGER, JSONB) TO anon, authenticated;
