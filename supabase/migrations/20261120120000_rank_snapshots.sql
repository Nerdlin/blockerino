-- Rank arrows on the leaderboards: a daily snapshot of the top 100 of the season boards (classic, chaos) and of the Elo
-- ladder. The client asks get_rank_changes(board) for the rank each name had in the last snapshot older than today and
-- shows up / down arrows from the difference. Snapshots older than two weeks are dropped.

CREATE TABLE IF NOT EXISTS public.rank_snapshots (
  board text NOT NULL CHECK (board IN ('season_classic', 'season_chaos', 'elo')),
  taken_on date NOT NULL,
  player_name text NOT NULL,
  rank integer NOT NULL CHECK (rank > 0),
  PRIMARY KEY (board, taken_on, player_name)
);

ALTER TABLE public.rank_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rank_snapshots FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.take_rank_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.rank_snapshots WHERE taken_on = current_date;

  INSERT INTO public.rank_snapshots (board, taken_on, player_name, rank)
  SELECT 'season_' || t.board, current_date, t.player_name, t.rank
  FROM (
    SELECT l.board, l.player_name,
           (row_number() OVER (PARTITION BY l.board ORDER BY l.score DESC, l.updated_at ASC))::integer AS rank
    FROM public.season_leaderboard l
    WHERE l.season_key = public.current_season_key()
  ) t
  WHERE t.rank <= 100
  ON CONFLICT DO NOTHING;

  INSERT INTO public.rank_snapshots (board, taken_on, player_name, rank)
  SELECT 'elo', current_date, t.player_name, t.rank
  FROM (
    SELECT p.player_name, (row_number() OVER (ORDER BY p.elo DESC, p.updated_at DESC))::integer AS rank
    FROM public.profiles p
    WHERE p.player_name IS NOT NULL
  ) t
  WHERE t.rank <= 100
  ON CONFLICT DO NOTHING;

  DELETE FROM public.rank_snapshots WHERE taken_on < current_date - 14;
END;
$$;

REVOKE ALL ON FUNCTION public.take_rank_snapshots() FROM PUBLIC, anon, authenticated;

-- Where each name stood in the last snapshot taken before today (nothing for names that were not in the top 100).
CREATE OR REPLACE FUNCTION public.get_rank_changes(p_board text)
RETURNS TABLE (player_name text, prev_rank integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.player_name, s.rank
  FROM public.rank_snapshots s
  WHERE s.board = p_board
    AND s.taken_on = (SELECT max(x.taken_on) FROM public.rank_snapshots x WHERE x.board = p_board AND x.taken_on < current_date);
$$;

REVOKE ALL ON FUNCTION public.get_rank_changes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rank_changes(text) TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('rank-snapshots', '5 0 * * *', $cron$SELECT public.take_rank_snapshots()$cron$);

-- a first snapshot now, so tomorrow's table already has something to compare with
SELECT public.take_rank_snapshots();
