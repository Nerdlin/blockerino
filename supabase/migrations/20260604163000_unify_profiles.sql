ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highscore_classic INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_chaos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_time_attack INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_daily INTEGER NOT NULL DEFAULT 0;

-- Drop old tables that are now unified into profiles
DROP TABLE IF EXISTS public.high_scores CASCADE;
DROP TABLE IF EXISTS public.elo_ratings CASCADE;
