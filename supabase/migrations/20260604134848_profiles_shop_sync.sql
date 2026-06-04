CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  player_id TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  elo INTEGER NOT NULL DEFAULT 1000,
  owned_item_ids TEXT[] DEFAULT '{}'::TEXT[],
  equipped JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS player_id TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS elo INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owned_item_ids TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equipped JSONB DEFAULT '{}'::JSONB;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_coins_nonnegative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_coins_nonnegative CHECK (coins >= 0) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_player_name_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_player_name_key UNIQUE (player_name);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_player_id
  ON public.profiles (player_id)
  WHERE player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at
  ON public.profiles (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profiles_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
CREATE POLICY "Anyone can read profiles"
  ON public.profiles FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can insert a profile" ON public.profiles;
CREATE POLICY "Anyone can insert a profile"
  ON public.profiles FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update their profile" ON public.profiles;
CREATE POLICY "Anyone can update their profile"
  ON public.profiles FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);
