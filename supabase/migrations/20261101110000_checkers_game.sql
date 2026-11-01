-- Checkers joins the More Games: its ratings, match history and win/loss records are accepted like the other games.

ALTER TABLE public.more_game_ratings DROP CONSTRAINT more_game_ratings_game_id_check;
ALTER TABLE public.more_game_ratings ADD CONSTRAINT more_game_ratings_game_id_check
  CHECK (game_id IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong', 'checkers'));

ALTER TABLE public.more_game_match_history DROP CONSTRAINT more_game_match_history_game_id_check;
ALTER TABLE public.more_game_match_history ADD CONSTRAINT more_game_match_history_game_id_check
  CHECK (game_id IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong', 'checkers'));

ALTER TABLE public.player_game_records DROP CONSTRAINT player_game_records_game_id_check;
ALTER TABLE public.player_game_records ADD CONSTRAINT player_game_records_game_id_check
  CHECK (game_id IN ('versus', 'chess', 'battleship', 'durak', 'tictactoe', 'sudoku', 'mahjong', 'checkers'));

-- Both functions keep their bodies; only their list of game ids gains 'checkers'.
DO $$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_more_game_match(text, text, text, text, text, jsonb)'::regprocedure,
    'public.sync_game_records(jsonb)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := replace(v_def, '''tictactoe'', ''sudoku'', ''mahjong'')', '''tictactoe'', ''sudoku'', ''mahjong'', ''checkers'')');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'game id list not found in %', v_fn;
    END IF;
    EXECUTE v_new;
  END LOOP;
END;
$$;
