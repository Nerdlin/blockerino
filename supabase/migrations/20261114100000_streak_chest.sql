-- The daily login reward becomes a season calendar of 28 days (4 weeks of 7):
--   * each day pays coins (50 on day 1 of a week, +10 a day, 110 on day 7); weeks 2-4 pay a little more;
--   * days 7, 14 and 21 open a small chest, day 28 a big one (see open_chest: rarities, odds, no duplicates);
--   * after day 28 every day pays 120 coins until the season ends;
--   * missing a day, or a new season (the leaderboard's monthly season, current_season_key), starts again at day 1.
-- The server rolls and pays everything inside claim_daily_reward; the calendar it returns is what the client draws.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS streak_season text;

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
  ELSE
    NEW.streak_count := OLD.streak_count;
    NEW.streak_best := OLD.streak_best;
    NEW.streak_last_day := OLD.streak_last_day;
    NEW.streak_season := OLD.streak_season;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.streak_calendar_length()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 28; $$;

-- Coins for reaching day n of the season calendar.
CREATE OR REPLACE FUNCTION public.streak_reward_coins(p_day integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_day > 28 THEN 120
    ELSE 50 + 10 * ((GREATEST(p_day, 1) - 1) % 7) + 5 * ((GREATEST(p_day, 1) - 1) / 7)
  END;
$$;

-- 'small' on days 7, 14, 21; 'big' on day 28; NULL otherwise.
CREATE OR REPLACE FUNCTION public.streak_chest(p_day integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_day = 28 THEN 'big' WHEN p_day IN (7, 14, 21) THEN 'small' ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.streak_calendar()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_agg(jsonb_build_object('day', d, 'coins', public.streak_reward_coins(d), 'chest', public.streak_chest(d)) ORDER BY d)
    FROM generate_series(1, 28) AS d;
$$;

-- Rarity of a shop item, by its price.
CREATE OR REPLACE FUNCTION public.item_rarity(p_price integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_price <= 300 THEN 'common' WHEN p_price <= 600 THEN 'rare' WHEN p_price <= 900 THEN 'epic' ELSE 'legendary' END;
$$;

CREATE OR REPLACE FUNCTION public._rarity_rank(p_rarity text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'legendary' THEN 4 ELSE 0 END;
$$;

-- Rolls a chest for a set of owned items. Pays nothing: the caller adds the item and coins.
--   small: 45% coins 250-600; else an item: 35% common-or-rare, 15% epic, 5% legendary;
--   big:   always an item: 60% rare, 30% epic, 10% legendary; plus 300 coins.
-- The item is one the player does not own; with none left of that rarity a lower one is taken; with none at all
-- the chest holds coins, more for a rarer roll. Returns {size, kind: item|coins, item_id, rarity, coins}.
-- p_roll (0..1) replaces random() in tests.
CREATE OR REPLACE FUNCTION public.open_chest(p_size text, p_owned text[], p_roll double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  v_roll double precision := COALESCE(p_roll, random());
  v_target integer;
  v_low integer := 1;
  r integer;
  v_item text;
  v_rarity text;
  v_bonus integer := CASE WHEN p_size = 'big' THEN 300 ELSE 0 END;
BEGIN
  IF p_size = 'small' THEN
    IF v_roll < 0.45 THEN
      RETURN jsonb_build_object('size', p_size, 'kind', 'coins', 'rarity', 'common',
        'coins', 250 + floor(random() * 351)::integer);
    END IF;
    v_target := CASE WHEN v_roll < 0.80 THEN 2 WHEN v_roll < 0.95 THEN 3 ELSE 4 END;
  ELSE
    v_target := CASE WHEN v_roll < 0.60 THEN 2 WHEN v_roll < 0.90 THEN 3 ELSE 4 END;
    v_low := 2;
  END IF;

  -- the rolled rarity, else the nearest lower one down to v_low (a small chest's rare roll may also give a common item)
  FOR r IN REVERSE v_target..v_low LOOP
    SELECT item_id, public.item_rarity(price) INTO v_item, v_rarity
      FROM public.shop_catalog
     WHERE kind = 'paid'
       AND NOT (item_id = ANY (COALESCE(p_owned, '{}')))
       AND public._rarity_rank(public.item_rarity(price)) BETWEEN CASE WHEN p_size = 'small' AND r = 2 THEN 1 ELSE r END AND r
     ORDER BY random()
     LIMIT 1;
    EXIT WHEN v_item IS NOT NULL;
  END LOOP;

  IF v_item IS NULL THEN
    RETURN jsonb_build_object('size', p_size, 'kind', 'coins',
      'rarity', CASE v_target WHEN 4 THEN 'legendary' WHEN 3 THEN 'epic' ELSE 'rare' END,
      'coins', v_bonus + CASE v_target WHEN 4 THEN 1500 WHEN 3 THEN 1000 ELSE 600 END);
  END IF;

  RETURN jsonb_build_object('size', p_size, 'kind', 'item', 'item_id', v_item, 'rarity', v_rarity, 'coins', v_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.open_chest(text, text[], double precision) FROM PUBLIC, anon, authenticated;

-- The day the next claim reaches: the streak goes on only from yesterday and inside the same season.
CREATE OR REPLACE FUNCTION public._streak_next_day(p_profile public.profiles, p_today date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_profile.streak_last_day = p_today - 1 AND p_profile.streak_season IS NOT DISTINCT FROM public.current_season_key()
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
    'coins', v_profile.coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.daily_reward_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_reward_status() TO authenticated;

-- Claims today's reward once. Returns {status: claimed | already, streak, reward, coins, best, next_reward,
-- next_chest, chest: null | open_chest's answer, owned_item_ids}.
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
      'owned_item_ids', to_jsonb(v_owned)
    );
  END IF;

  v_streak := public._streak_next_day(v_profile, v_today);
  v_reward := public.streak_reward_coins(v_streak);
  v_size := public.streak_chest(v_streak);

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
         streak_season = v_season
   WHERE id = v_profile.id
  RETURNING coins, streak_best INTO v_profile.coins, v_profile.streak_best;

  RETURN jsonb_build_object(
    'status', 'claimed', 'streak', v_streak, 'reward', v_reward, 'best', v_profile.streak_best,
    'coins', v_profile.coins, 'next_reward', public.streak_reward_coins(v_streak + 1),
    'next_chest', public.streak_chest(v_streak + 1), 'chest', v_chest,
    'owned_item_ids', to_jsonb(v_owned)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;

-- Players in a running streak keep it into this season's calendar on the day this ships.
UPDATE public.profiles
   SET streak_season = public.current_season_key(),
       streak_count = LEAST(streak_count, 27)
 WHERE streak_last_day >= (now() AT TIME ZONE 'utc')::date - 1;
