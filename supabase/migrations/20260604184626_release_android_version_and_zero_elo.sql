CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app config" ON public.app_config;
CREATE POLICY "Anyone can read app config"
  ON public.app_config
  FOR SELECT
  USING (TRUE);

CREATE OR REPLACE FUNCTION public.set_app_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON public.app_config;
CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_app_config_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS previous_elo INTEGER,
  ADD COLUMN IF NOT EXISTS elo_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS login_providers TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_auth_user_id
  ON public.profiles (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

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

    TRUNCATE TABLE public.elo_ratings;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN elo SET DEFAULT 0;

UPDATE public.profiles
SET
  previous_elo = CASE
    WHEN elo IS DISTINCT FROM 0 THEN elo
    ELSE previous_elo
  END,
  elo_reset_at = CASE
    WHEN elo IS DISTINCT FROM 0 THEN NOW()
    ELSE elo_reset_at
  END,
  elo = 0
WHERE elo IS DISTINCT FROM 0;

INSERT INTO public.app_config (key, value)
VALUES (
  'android_version',
  jsonb_build_object(
    'latestVersion', '1.0.2',
    'latestBuildNumber', 3,
    'downloadUrl', 'https://github.com/Nerdlin/blockerino/raw/main/builds/blockerino-release.apk',
    'releaseNotes', 'Android stability release with fixed hand refresh crashes, clearer online diagnostics, profile scores, and consistent pixel icons.',
    'isMandatory', false
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
