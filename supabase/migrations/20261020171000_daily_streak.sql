-- Daily login streak and reward (Blockerino 2.0). The server keeps the streak and pays the coins.
--   * a day is a UTC day (the same clock as the leaderboard seasons);
--   * claiming on consecutive days grows the streak, missing a day starts it again from 1;
--   * reward: 50 coins on day 1, +10 per day up to 110 from day 7, +100 on every 7th day,
--     +500 on every 30th day;
--   * signed-in players only: guests have no server profile, the game invites them to sign in.
-- Clients cannot write the streak columns; they only call daily_reward_status() / claim_daily_reward().

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_best integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_day date;

CREATE OR REPLACE FUNCTION public.profiles_streak_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.streak_count := 0;
    NEW.streak_best := 0;
    NEW.streak_last_day := NULL;
  ELSE
    NEW.streak_count := OLD.streak_count;
    NEW.streak_best := OLD.streak_best;
    NEW.streak_last_day := OLD.streak_last_day;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_streak_guard ON public.profiles;
CREATE TRIGGER trg_profiles_streak_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_streak_guard();

-- Coins for reaching day n of a streak.
CREATE OR REPLACE FUNCTION public.streak_reward_coins(p_day integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 50 + 10 * LEAST(GREATEST(p_day, 1) - 1, 6)
         + CASE WHEN p_day % 7 = 0 THEN 100 ELSE 0 END
         + CASE WHEN p_day % 30 = 0 THEN 500 ELSE 0 END;
$$;

-- What the player would see: {streak, best, claimed_today, next_streak, next_reward}.
CREATE OR REPLACE FUNCTION public.daily_reward_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_profile public.profiles%ROWTYPE;
  v_claimed boolean;
  v_alive boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_claimed := v_profile.streak_last_day = v_today;
  v_alive := v_profile.streak_last_day IN (v_today, v_today - 1);

  RETURN jsonb_build_object(
    'status', 'ok',
    'streak', CASE WHEN v_alive THEN v_profile.streak_count ELSE 0 END,
    'best', v_profile.streak_best,
    'claimed_today', COALESCE(v_claimed, false),
    'next_streak', CASE WHEN v_claimed THEN v_profile.streak_count + 1
                        WHEN v_alive THEN v_profile.streak_count + 1
                        ELSE 1 END,
    'next_reward', public.streak_reward_coins(
      CASE WHEN v_claimed OR v_alive THEN v_profile.streak_count + 1 ELSE 1 END
    ),
    'coins', v_profile.coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.daily_reward_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_reward_status() TO authenticated;

-- Claims today's reward once. Returns {status: claimed | already, streak, reward, coins, best, next_reward}.
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_profile public.profiles%ROWTYPE;
  v_streak integer;
  v_reward integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF v_profile.streak_last_day = v_today THEN
    RETURN jsonb_build_object(
      'status', 'already', 'streak', v_profile.streak_count, 'best', v_profile.streak_best,
      'coins', v_profile.coins, 'next_reward', public.streak_reward_coins(v_profile.streak_count + 1)
    );
  END IF;

  v_streak := CASE WHEN v_profile.streak_last_day = v_today - 1 THEN v_profile.streak_count + 1 ELSE 1 END;
  v_reward := public.streak_reward_coins(v_streak);

  UPDATE public.profiles
     SET coins = coins + v_reward,
         streak_count = v_streak,
         streak_best = GREATEST(streak_best, v_streak),
         streak_last_day = v_today
   WHERE id = v_profile.id
  RETURNING coins, streak_best INTO v_profile.coins, v_profile.streak_best;

  RETURN jsonb_build_object(
    'status', 'claimed', 'streak', v_streak, 'reward', v_reward, 'best', v_profile.streak_best,
    'coins', v_profile.coins, 'next_reward', public.streak_reward_coins(v_streak + 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;
