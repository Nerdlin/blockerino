-- A rated Sea Battle / Durak result carries metadata.matchId (room code / table id). A second
-- record_more_game_match call for the same match fails on this index, and because the function runs in a
-- single transaction the rating update is rolled back, so one match can never be rated twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_more_game_match_history_match_once
  ON public.more_game_match_history (game_id, player1_key, player2_key, (metadata ->> 'matchId'))
  WHERE metadata ->> 'matchId' IS NOT NULL;
