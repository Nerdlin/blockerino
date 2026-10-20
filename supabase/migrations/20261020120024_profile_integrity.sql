-- Profile integrity (Blockerino 2.0).
-- Until now any signed-in player could write highscores, coins and other sensitive columns
-- of their own profile row straight from the client. This migration:
--   * freezes the sensitive columns for client roles (authenticated / anon) in a trigger,
--     while the dashboard, SQL editor, service_role and SECURITY DEFINER functions stay free;
--   * limits how fast coins can grow (spending is always free);
--   * adds submit_high_score() with a plausibility ceiling per mode;
--   * adds the same ceiling to submit_season_score();
--   * freezes elo for clients; Elo is changed only by the server (see the versus_elo migration).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins_gain_day date,
  ADD COLUMN IF NOT EXISTS coins_gained_today integer NOT NULL DEFAULT 0,
  -- Exists in production (added by hand); declared here so a fresh database matches it.
  ADD COLUMN IF NOT EXISTS discord_id text;

-- Row policies. Production already has the two "Users can ..." policies (set by hand); the
-- older migrations still created permissive "Anyone can ..." ones, so a fresh database was
-- weaker than production. Declare the real ones here; on production this is a no-op rewrite.
DROP POLICY IF EXISTS "Anyone can insert a profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update their profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Highest score a mode can realistically produce. Tune here, nowhere else.
CREATE OR REPLACE FUNCTION public.max_plausible_score(p_mode text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_mode
    WHEN 'classic' THEN 2000000
    WHEN 'chaos' THEN 2000000
    WHEN 'time_attack' THEN 300000
    WHEN 'daily' THEN 10000
    WHEN 'move_limit' THEN 50000
    ELSE 0
  END;
$$;

-- Coin limits are deliberately wide: after a write the client adopts the server's balance, so a limit
-- that clipped an honest player (weeks of offline play, a big Durak win) would take coins away for good.
-- They only stop absurd values; coins are not ranked, so the aim is the Durak table economy, not purity.
-- Runs as the caller (no SECURITY DEFINER) so current_user tells clients from admins:
-- PostgREST requests arrive as 'authenticated'/'anon', everything else is privileged.
CREATE OR REPLACE FUNCTION public.profiles_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c_max_gain_per_write CONSTANT integer := 100000;
  c_max_gain_per_day CONSTANT integer := 300000;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_used integer;
  v_gain integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.highscore_classic := 0;
    NEW.highscore_chaos := 0;
    NEW.highscore_time_attack := 0;
    NEW.highscore_daily := 0;
    NEW.highscore_move_limit := 0;
    NEW.coins := 0;
    NEW.coins_gain_day := NULL;
    NEW.coins_gained_today := 0;
    NEW.discord_id := NULL;
    NEW.elo := 0;
    NEW.previous_elo := NULL;
    NEW.elo_reset_at := NULL;
    RETURN NEW;
  END IF;

  NEW.elo := OLD.elo;
  NEW.previous_elo := OLD.previous_elo;
  NEW.elo_reset_at := OLD.elo_reset_at;
  NEW.highscore_classic := OLD.highscore_classic;
  NEW.highscore_chaos := OLD.highscore_chaos;
  NEW.highscore_time_attack := OLD.highscore_time_attack;
  NEW.highscore_daily := OLD.highscore_daily;
  NEW.highscore_move_limit := OLD.highscore_move_limit;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.player_id := OLD.player_id;
  NEW.discord_id := OLD.discord_id;

  IF NEW.coins IS NULL OR NEW.coins < 0 THEN
    NEW.coins := OLD.coins;
  END IF;

  IF NEW.coins > OLD.coins THEN
    v_used := CASE WHEN OLD.coins_gain_day = v_today THEN OLD.coins_gained_today ELSE 0 END;
    v_gain := LEAST(NEW.coins - OLD.coins, c_max_gain_per_write, GREATEST(c_max_gain_per_day - v_used, 0));
    NEW.coins := OLD.coins + v_gain;
    NEW.coins_gain_day := v_today;
    NEW.coins_gained_today := v_used + v_gain;
  ELSE
    NEW.coins_gain_day := OLD.coins_gain_day;
    NEW.coins_gained_today := OLD.coins_gained_today;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_integrity_guard ON public.profiles;
CREATE TRIGGER trg_profiles_integrity_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_integrity_guard();

-- The only way for a client to raise a global highscore.
CREATE OR REPLACE FUNCTION public.submit_high_score(p_mode text, p_score integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode text := CASE WHEN p_mode = 'daily_puzzle' THEN 'daily' ELSE p_mode END;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF v_mode NOT IN ('classic', 'chaos', 'time_attack', 'daily', 'move_limit') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score(v_mode) THEN RETURN FALSE; END IF;

  IF v_mode = 'classic' THEN
    UPDATE public.profiles SET highscore_classic = GREATEST(highscore_classic, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'chaos' THEN
    UPDATE public.profiles SET highscore_chaos = GREATEST(highscore_chaos, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'time_attack' THEN
    UPDATE public.profiles SET highscore_time_attack = GREATEST(highscore_time_attack, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'daily' THEN
    UPDATE public.profiles SET highscore_daily = GREATEST(highscore_daily, p_score) WHERE auth_user_id = auth.uid();
  ELSE
    UPDATE public.profiles SET highscore_move_limit = GREATEST(highscore_move_limit, p_score) WHERE auth_user_id = auth.uid();
  END IF;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_high_score(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_high_score(text, integer) TO authenticated;

-- Same body as before plus the plausibility ceiling.
CREATE OR REPLACE FUNCTION public.submit_season_score(
  p_board text,
  p_score integer,
  p_achieved_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_current text := public.current_season_key();
  v_target text := to_char(LEAST(p_achieved_at, now()) AT TIME ZONE 'utc', 'YYYY-MM');
  v_previous text := to_char((now() AT TIME ZONE 'utc') - interval '1 month', 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score(p_board) THEN RETURN FALSE; END IF;

  PERFORM pg_advisory_xact_lock_shared(hashtext('close_season'));

  IF v_target <> v_current THEN
    IF v_target <> v_previous THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_target) THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.season_scores AS s (season_key, board, profile_id, score)
  VALUES (v_target, p_board, v_profile_id, p_score)
  ON CONFLICT (season_key, board, profile_id) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > s.score;

  RETURN TRUE;
END;
$$;
