CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL UNIQUE,
  coins INTEGER NOT NULL DEFAULT 0,
  elo INTEGER NOT NULL DEFAULT 1000,
  owned_item_ids TEXT[] DEFAULT '{}'::TEXT[],
  equipped JSONB DEFAULT '{"block": "classic", "background": "classic_night"}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
