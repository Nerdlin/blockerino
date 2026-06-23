ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highscore_move_limit INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_highscore_move_limit
  ON public.profiles (highscore_move_limit DESC)
  WHERE highscore_move_limit > 0;
