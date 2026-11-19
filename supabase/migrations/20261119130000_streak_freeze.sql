-- Streak freezes: a player can hold up to 2. A missed day does not break the login streak while a freeze covers it:
-- the next claim uses one freeze per missed day and the streak goes on. They come from two places:
--   * bought for coins (buy_streak_freeze, 300 coins, at most 2 held);
--   * days 14 and 28 of the season calendar each give one.
-- A new season still starts the calendar again at day 1, freezes or not. The server owns all of it.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_freezes integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_streak_freezes_range;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_streak_freezes_range CHECK (streak_freezes BETWEEN 0 AND 2);

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
    NEW.streak_season := NULL;
    NEW.streak_freezes := 0;
  ELSE
    NEW.streak_count := OLD.streak_count;
    NEW.streak_best := OLD.streak_best;
    NEW.streak_last_day := OLD.streak_last_day;
    NEW.streak_season := OLD.streak_season;
    NEW.streak_freezes := OLD.streak_freezes;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.streak_freeze_price()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 300; $$;

CREATE OR REPLACE FUNCTION public.streak_freeze_cap()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 2; $$;

-- The calendar answers which days give a freeze.
CREATE OR REPLACE FUNCTION public.streak_calendar()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_agg(jsonb_build_object('day', d, 'coins', public.streak_reward_coins(d), 'chest', public.streak_chest(d), 'freeze', d IN (14, 28)) ORDER BY d)
    FROM generate_series(1, 28) AS d;
$$;

-- Missed days a claim today would cover with freezes (0 when the streak goes on from yesterday or starts again).
CREATE OR REPLACE FUNCTION public._streak_freezes_used(p_profile public.profiles, p_today date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_profile.streak_last_day IS NOT NULL
     AND p_profile.streak_last_day < p_today - 1
     AND p_today - p_profile.streak_last_day - 1 <= p_profile.streak_freezes
     AND p_profile.streak_season IS NOT DISTINCT FROM public.current_season_key()
      THEN p_today - p_profile.streak_last_day - 1
    ELSE 0
  END;
$$;

-- The day the next claim reaches: the streak goes on from yesterday, or over missed days that freezes cover, inside the same season.
CREATE OR REPLACE FUNCTION public._streak_next_day(p_profile public.profiles, p_today date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_profile.streak_last_day IS NOT NULL
     AND p_profile.streak_last_day < p_today
     AND p_today - p_profile.streak_last_day - 1 <= p_profile.streak_freezes
     AND p_profile.streak_season IS NOT DISTINCT FROM public.current_season_key()
      THEN p_profile.streak_count + 1
    ELSE 1
  END;
$$;

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
  v_streak integer;
  v_next integer;
  v_to_use integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_claimed := v_profile.streak_last_day = v_today AND v_profile.streak_season IS NOT DISTINCT FROM public.current_season_key();
  IF v_claimed THEN
    v_streak := v_profile.streak_count;
    v_next := v_profile.streak_count + 1;
  ELSE
    v_next := public._streak_next_day(v_profile, v_today);
    v_streak := v_next - 1;
    v_to_use := public._streak_freezes_used(v_profile, v_today);
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'streak', v_streak,
    'best', v_profile.streak_best,
    'claimed_today', COALESCE(v_claimed, false),
    'next_streak', v_next,
    'next_reward', public.streak_reward_coins(v_next),
    'next_chest', public.streak_chest(v_next),
    'season', public.current_season_key(),
    'calendar', public.streak_calendar(),
    'coins', v_profile.coins,
    'freezes', v_profile.streak_freezes,
    'freeze_cap', public.streak_freeze_cap(),
    'freeze_price', public.streak_freeze_price(),
    'freezes_to_use', v_to_use
  );
END;
$$;

REVOKE ALL ON FUNCTION public.daily_reward_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_reward_status() TO authenticated;

-- Claims today's reward once. Returns {status: claimed | already, streak, reward, coins, best, next_reward,
-- next_chest, chest: null | open_chest's answer, owned_item_ids, freezes_used, freezes_left, freeze_granted}.
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_season text := public.current_season_key();
  v_profile public.profiles%ROWTYPE;
  v_streak integer;
  v_reward integer;
  v_size text;
  v_owned text[];
  v_item text;
  v_chest jsonb := NULL;
  v_chest_coins integer := 0;
  v_used integer;
  v_grant integer;
  v_freezes integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_owned := COALESCE(v_profile.owned_item_ids, '{}');

  IF v_profile.streak_last_day = v_today AND v_profile.streak_season IS NOT DISTINCT FROM v_season THEN
    RETURN jsonb_build_object(
      'status', 'already', 'streak', v_profile.streak_count, 'best', v_profile.streak_best,
      'coins', v_profile.coins, 'next_reward', public.streak_reward_coins(v_profile.streak_count + 1),
      'next_chest', public.streak_chest(v_profile.streak_count + 1), 'chest', NULL,
      'owned_item_ids', to_jsonb(v_owned),
      'freezes_used', 0, 'freezes_left', v_profile.streak_freezes, 'freeze_granted', false
    );
  END IF;

  v_streak := public._streak_next_day(v_profile, v_today);
  v_used := public._streak_freezes_used(v_profile, v_today);
  v_reward := public.streak_reward_coins(v_streak);
  v_size := public.streak_chest(v_streak);
  v_grant := CASE WHEN v_streak IN (14, 28) THEN 1 ELSE 0 END;
  v_freezes := LEAST(public.streak_freeze_cap(), v_profile.streak_freezes - v_used + v_grant);

  IF v_size IS NOT NULL THEN
    v_chest := public.open_chest(v_size, v_owned);
    v_item := v_chest ->> 'item_id';
    v_chest_coins := COALESCE((v_chest ->> 'coins')::integer, 0);
  END IF;

  IF v_item IS NOT NULL THEN
    v_owned := array_append(v_owned, v_item);
  END IF;

  UPDATE public.profiles
     SET coins = coins + v_reward + v_chest_coins,
         owned_item_ids = v_owned,
         streak_count = v_streak,
         streak_best = GREATEST(streak_best, v_streak),
         streak_last_day = v_today,
         streak_season = v_season,
         streak_freezes = v_freezes
   WHERE id = v_profile.id
  RETURNING coins, streak_best INTO v_profile.coins, v_profile.streak_best;

  RETURN jsonb_build_object(
    'status', 'claimed', 'streak', v_streak, 'reward', v_reward, 'best', v_profile.streak_best,
    'coins', v_profile.coins, 'next_reward', public.streak_reward_coins(v_streak + 1),
    'next_chest', public.streak_chest(v_streak + 1), 'chest', v_chest,
    'owned_item_ids', to_jsonb(v_owned),
    'freezes_used', v_used, 'freezes_left', v_freezes,
    'freeze_granted', v_grant = 1 AND v_profile.streak_freezes - v_used < public.streak_freeze_cap()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;

-- Buys one freeze with coins. Returns {status: ok | full | not_enough_coins | no_profile | unauthenticated, coins, freezes}.
CREATE OR REPLACE FUNCTION public.buy_streak_freeze()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF v_profile.streak_freezes >= public.streak_freeze_cap() THEN
    RETURN jsonb_build_object('status', 'full', 'coins', v_profile.coins, 'freezes', v_profile.streak_freezes);
  END IF;
  IF v_profile.coins < public.streak_freeze_price() THEN
    RETURN jsonb_build_object('status', 'not_enough_coins', 'coins', v_profile.coins, 'freezes', v_profile.streak_freezes);
  END IF;

  UPDATE public.profiles
     SET coins = coins - public.streak_freeze_price(),
         streak_freezes = streak_freezes + 1
   WHERE id = v_profile.id
  RETURNING coins, streak_freezes INTO v_profile.coins, v_profile.streak_freezes;

  RETURN jsonb_build_object('status', 'ok', 'coins', v_profile.coins, 'freezes', v_profile.streak_freezes);
END;
$$;

REVOKE ALL ON FUNCTION public.buy_streak_freeze() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze() TO authenticated;
