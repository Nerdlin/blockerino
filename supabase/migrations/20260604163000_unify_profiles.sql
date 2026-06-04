ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highscore_classic INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_chaos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_time_attack INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_daily INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_elo INTEGER,
  ADD COLUMN IF NOT EXISTS elo_reset_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regclass('public.elo_ratings') IS NOT NULL THEN
    INSERT INTO public.profiles (
      player_name,
      elo,
      previous_elo,
      elo_reset_at,
      updated_at
    )
    SELECT
      player_name,
      0,
      elo,
      NOW(),
      COALESCE(updated_at, NOW())
    FROM public.elo_ratings
    ON CONFLICT (player_name) DO UPDATE
    SET
      previous_elo = EXCLUDED.previous_elo,
      elo_reset_at = NOW(),
      elo = 0,
      updated_at = NOW();
  END IF;
END;
$$;

-- Drop old tables that are now unified into profiles
DROP TABLE IF EXISTS public.high_scores CASCADE;
DROP TABLE IF EXISTS public.elo_ratings CASCADE;
