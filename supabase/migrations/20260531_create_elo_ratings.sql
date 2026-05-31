CREATE TABLE IF NOT EXISTS public.elo_ratings (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  elo INTEGER NOT NULL DEFAULT 1000,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_elo_ratings_player_name ON public.elo_ratings (LOWER(player_name));

ALTER TABLE public.elo_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read elo_ratings" ON public.elo_ratings;
CREATE POLICY "Anyone can read elo_ratings"
  ON public.elo_ratings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can upsert elo_ratings" ON public.elo_ratings;
CREATE POLICY "Anyone can upsert elo_ratings"
  ON public.elo_ratings FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update elo_ratings" ON public.elo_ratings;
CREATE POLICY "Anyone can update elo_ratings"
  ON public.elo_ratings FOR UPDATE
  USING (true)
  WITH CHECK (true);
