-- Monthly leaderboard seasons.
--   * Classic / Chaos: separate per-season best score (season_scores), written only through
--     submit_season_score() so clients cannot edit it directly.
--   * Versus elo: soft reset at season end (elo halves toward 0, the default rating).
--   * close_season() snapshots the final top 10 of every board, then resets elo.
-- A season is a UTC calendar month; its key is 'YYYY-MM'.

CREATE OR REPLACE FUNCTION public.current_season_key()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
$$;

-- Per-season best score of each profile.
CREATE TABLE IF NOT EXISTS public.season_scores (
  season_key text NOT NULL,
  board text NOT NULL CHECK (board IN ('classic', 'chaos')),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_key, board, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_season_scores_rank
  ON public.season_scores (season_key, board, score DESC, updated_at ASC);

-- Final top 10 of each board when a season closes.
CREATE TABLE IF NOT EXISTS public.season_results (
  season_key text NOT NULL,
  board text NOT NULL CHECK (board IN ('classic', 'chaos', 'elo')),
  rank integer NOT NULL CHECK (rank > 0),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  score integer NOT NULL,
  PRIMARY KEY (season_key, board, rank)
);

-- One row per closed season; makes close_season() idempotent (no double elo reset).
CREATE TABLE IF NOT EXISTS public.season_closures (
  season_key text PRIMARY KEY,
  closed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.season_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read season scores" ON public.season_scores;
CREATE POLICY "Anyone can read season scores"
  ON public.season_scores FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Anyone can read season results" ON public.season_results;
CREATE POLICY "Anyone can read season results"
  ON public.season_results FOR SELECT USING (TRUE);

-- No insert/update/delete policies: writes happen only inside the functions below.
REVOKE ALL ON public.season_scores, public.season_results, public.season_closures FROM anon, authenticated;
GRANT SELECT ON public.season_scores, public.season_results TO anon, authenticated;

-- Read model for the client: score joined with the player's current name and avatar.
CREATE OR REPLACE VIEW public.season_leaderboard
WITH (security_invoker = true) AS
SELECT
  s.season_key,
  s.board,
  s.profile_id,
  p.player_name,
  p.avatar_url,
  s.score,
  s.updated_at
FROM public.season_scores s
JOIN public.profiles p ON p.id = s.profile_id;

GRANT SELECT ON public.season_leaderboard TO anon, authenticated;

-- Records the score of a finished run for the caller's own profile.
-- p_achieved_at lets a queued offline run keep its season; runs from a closed season are rejected.
CREATE OR REPLACE FUNCTION public.submit_season_score(
  p_board text,
  p_score integer,
  p_achieved_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_season text := public.current_season_key();
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 THEN RETURN FALSE; END IF;
  IF to_char(LEAST(p_achieved_at, now()) AT TIME ZONE 'utc', 'YYYY-MM') <> v_season THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.season_scores AS s (season_key, board, profile_id, score)
  VALUES (v_season, p_board, v_profile_id, p_score)
  ON CONFLICT (season_key, board, profile_id) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > s.score;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_season_score(text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_season_score(text, integer, timestamptz) TO authenticated;

-- Closes the previous calendar month: snapshots the top 10 of every board, then halves elo.
-- Safe to call repeatedly; a season is closed only once. Not callable by clients.
CREATE OR REPLACE FUNCTION public.close_season()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := to_char((now() AT TIME ZONE 'utc') - interval '1 month', 'YYYY-MM');
  v_board text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('close_season'));

  IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_key) THEN
    RETURN 'already closed: ' || v_key;
  END IF;

  FOREACH v_board IN ARRAY ARRAY['classic', 'chaos'] LOOP
    INSERT INTO public.season_results (season_key, board, rank, profile_id, player_name, score)
    SELECT v_key, v_board, (row_number() OVER (ORDER BY s.score DESC, s.updated_at ASC))::integer,
           s.profile_id, p.player_name, s.score
    FROM public.season_scores s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.season_key = v_key AND s.board = v_board
    ORDER BY s.score DESC, s.updated_at ASC
    LIMIT 10;
  END LOOP;

  INSERT INTO public.season_results (season_key, board, rank, profile_id, player_name, score)
  SELECT v_key, 'elo', (row_number() OVER (ORDER BY p.elo DESC, p.updated_at ASC))::integer,
         p.id, p.player_name, p.elo
  FROM public.profiles p
  WHERE p.elo > 0
  ORDER BY p.elo DESC, p.updated_at ASC
  LIMIT 10;

  -- Soft reset toward the default rating (0): keep half of the rating.
  UPDATE public.profiles
  SET previous_elo = elo,
      elo = elo / 2,
      elo_reset_at = now()
  WHERE elo > 0;

  INSERT INTO public.season_closures (season_key) VALUES (v_key);
  RETURN 'closed: ' || v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.close_season() FROM PUBLIC, anon, authenticated;

-- Run on the 1st of every month, just after midnight UTC. pg_cron is optional: when the
-- extension is not enabled, schedule public.close_season() from the Supabase dashboard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('close-season', '5 0 1 * *', 'SELECT public.close_season()');
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: schedule public.close_season() monthly yourself.';
  END IF;
END;
$$;
