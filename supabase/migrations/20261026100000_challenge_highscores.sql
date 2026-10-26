-- Global leaderboards for the Rescue and Combo Trial challenges.
-- Additive only: older app versions never touch these columns and keep working.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highscore_rescue INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highscore_combo_trial INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_highscore_rescue
  ON public.profiles (highscore_rescue DESC)
  WHERE highscore_rescue > 0;

CREATE INDEX IF NOT EXISTS idx_profiles_highscore_combo_trial
  ON public.profiles (highscore_combo_trial DESC)
  WHERE highscore_combo_trial > 0;

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
    WHEN 'rescue' THEN 500000
    WHEN 'combo_trial' THEN 500000
    ELSE 0
  END;
$$;

-- Same guard as before, with the two new columns frozen for clients too.
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
    NEW.highscore_rescue := 0;
    NEW.highscore_combo_trial := 0;
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
  NEW.highscore_rescue := OLD.highscore_rescue;
  NEW.highscore_combo_trial := OLD.highscore_combo_trial;
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
  IF v_mode NOT IN ('classic', 'chaos', 'time_attack', 'daily', 'move_limit', 'rescue', 'combo_trial') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score(v_mode) THEN RETURN FALSE; END IF;

  IF v_mode = 'classic' THEN
    UPDATE public.profiles SET highscore_classic = GREATEST(highscore_classic, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'chaos' THEN
    UPDATE public.profiles SET highscore_chaos = GREATEST(highscore_chaos, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'time_attack' THEN
    UPDATE public.profiles SET highscore_time_attack = GREATEST(highscore_time_attack, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'daily' THEN
    UPDATE public.profiles SET highscore_daily = GREATEST(highscore_daily, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'rescue' THEN
    UPDATE public.profiles SET highscore_rescue = GREATEST(highscore_rescue, p_score) WHERE auth_user_id = auth.uid();
  ELSIF v_mode = 'combo_trial' THEN
    UPDATE public.profiles SET highscore_combo_trial = GREATEST(highscore_combo_trial, p_score) WHERE auth_user_id = auth.uid();
  ELSE
    UPDATE public.profiles SET highscore_move_limit = GREATEST(highscore_move_limit, p_score) WHERE auth_user_id = auth.uid();
  END IF;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_high_score(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_high_score(text, integer) TO authenticated;
