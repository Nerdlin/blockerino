-- Chess ratings start at 400 (the weakest bot's level) instead of 1000: a new player climbs from the bottom, and the
-- rating of an account that never played no longer looks like a mid-level one. Nobody had a rating yet, so no rows move.

ALTER TABLE public.chess_ratings ALTER COLUMN rating SET DEFAULT 400;

-- The quick match looks for opponents around the player's rating; one without a rating counts as 400 now.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.chess_quick_match(text)'::regprocedure);
  v_new := replace(v_def, 'AND r.time_class = v_class), 1000);', 'AND r.time_class = v_class), 400);');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'start rating not found in chess_quick_match';
  END IF;
  EXECUTE v_new;
END;
$$;
