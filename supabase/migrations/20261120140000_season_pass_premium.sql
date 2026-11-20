-- Season pass, PREMIUM track. A second reward for every one of the 30 tiers, unlocked once per season for coins (no real
-- money is involved). Tiers are the same: reaching tier n unlocks the free reward and, for a premium player, the premium
-- one. Each premium tier is claimed on its own, once.
--   * Price: 2 000 coins (season_pass_premium_price). Premium opens only for a season that has a premium set
--     (season_pass_premium_cosmetics); a season without one says 'unavailable'.
--   * Rewards (season_pass_premium_reward): coins on most tiers, 3 keys, 2 small chests and a big one, and four season
--     exclusive skins (tiers 8, 16, 24 and 30) that are never sold and in no chest (kind 'server_only', price 0).
--   * A skin the player owns already pays season_pass_premium_cosmetic_coins instead, like the free track.
--   * Valued like the free pass (a key opens a small chest, 400; a big chest is 1 000) the coins, keys and chests are worth
--     about 4 400 for a price of 2 000: the premium track is a coin sink that pays most of itself back, and the skins
--     are the reason to buy it.
-- Client mirror: constants/SeasonPass.ts (a jest test compares the tables below with it).

-- 1. Tables (no client access) --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.season_pass_premium (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_key text NOT NULL CHECK (season_key ~ '^[0-9]{4}-[0-9]{2}$'),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  claimed_tiers integer[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (profile_id, season_key)
);

CREATE TABLE IF NOT EXISTS public.season_pass_premium_cosmetics (
  season_key text NOT NULL CHECK (season_key ~ '^[0-9]{4}-[0-9]{2}$'),
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 30),
  item_id text NOT NULL REFERENCES public.shop_catalog(item_id),
  PRIMARY KEY (season_key, tier)
);

ALTER TABLE public.season_pass_premium ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_premium_cosmetics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_pass_premium FROM anon, authenticated;
REVOKE ALL ON public.season_pass_premium_cosmetics FROM anon, authenticated;

-- 2. The first season set: four exclusive skins for December 2026 --------------------------------------------------
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('piece_premium_snowglass', 0, 'server_only'),
  ('piece_premium_goldholly', 0, 'server_only'),
  ('background_premium_northern', 0, 'server_only'),
  ('background_premium_starfall', 0, 'server_only')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

INSERT INTO public.season_pass_premium_cosmetics (season_key, tier, item_id) VALUES
  ('2026-12', 8, 'piece_premium_snowglass'),
  ('2026-12', 16, 'background_premium_northern'),
  ('2026-12', 24, 'piece_premium_goldholly'),
  ('2026-12', 30, 'background_premium_starfall')
ON CONFLICT (season_key, tier) DO UPDATE SET item_id = EXCLUDED.item_id;

-- 3. Rules ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.season_pass_premium_price()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 2000; $$;

CREATE OR REPLACE FUNCTION public.season_pass_premium_reward(p_tier integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 1 THEN '{"coins":30}'::jsonb
    WHEN 2 THEN '{"keys":1}'::jsonb
    WHEN 3 THEN '{"coins":30}'::jsonb
    WHEN 4 THEN '{"coins":40}'::jsonb
    WHEN 5 THEN '{"chest":"small"}'::jsonb
    WHEN 6 THEN '{"coins":40}'::jsonb
    WHEN 7 THEN '{"coins":50}'::jsonb
    WHEN 8 THEN '{"cosmetic":true}'::jsonb
    WHEN 9 THEN '{"coins":50}'::jsonb
    WHEN 10 THEN '{"coins":50}'::jsonb
    WHEN 11 THEN '{"coins":60}'::jsonb
    WHEN 12 THEN '{"keys":1}'::jsonb
    WHEN 13 THEN '{"coins":60}'::jsonb
    WHEN 14 THEN '{"coins":60}'::jsonb
    WHEN 15 THEN '{"chest":"small"}'::jsonb
    WHEN 16 THEN '{"cosmetic":true}'::jsonb
    WHEN 17 THEN '{"coins":70}'::jsonb
    WHEN 18 THEN '{"coins":70}'::jsonb
    WHEN 19 THEN '{"coins":80}'::jsonb
    WHEN 20 THEN '{"coins":80}'::jsonb
    WHEN 21 THEN '{"coins":80}'::jsonb
    WHEN 22 THEN '{"coins":90}'::jsonb
    WHEN 23 THEN '{"keys":1}'::jsonb
    WHEN 24 THEN '{"cosmetic":true}'::jsonb
    WHEN 25 THEN '{"coins":100}'::jsonb
    WHEN 26 THEN '{"coins":100}'::jsonb
    WHEN 27 THEN '{"coins":110}'::jsonb
    WHEN 28 THEN '{"coins":120}'::jsonb
    WHEN 29 THEN '{"coins":120}'::jsonb
    WHEN 30 THEN '{"coins":150,"chest":"big","cosmetic":true}'::jsonb
    ELSE NULL
  END;
$$;

-- Coins paid instead of a skin the player owns already.
CREATE OR REPLACE FUNCTION public.season_pass_premium_cosmetic_coins(p_tier integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier WHEN 8 THEN 100 WHEN 16 THEN 150 WHEN 24 THEN 200 WHEN 30 THEN 300 ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION public.season_pass_premium_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_premium_reward(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_premium_cosmetic_coins(integer) FROM PUBLIC, anon, authenticated;

-- 4. The pass as the client sees it now also says where the premium track stands ------------------------------------
CREATE OR REPLACE FUNCTION public._season_pass_state(p_profile uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_season text := public.current_season_key();
  v_xp integer := 0;
  v_claimed integer[] := '{}';
  v_tier integer;
  v_today_xp integer;
  v_cosmetics jsonb;
  v_prem_cosmetics jsonb;
  v_prem_claimed integer[];
  v_prem_unlocked boolean;
BEGIN
  SELECT xp, claimed_tiers INTO v_xp, v_claimed FROM public.season_pass_progress WHERE profile_id = p_profile AND season_key = v_season;
  v_xp := COALESCE(v_xp, 0);
  v_claimed := COALESCE(v_claimed, '{}');
  v_tier := public.season_pass_tier(v_xp);
  SELECT COALESCE(sum(xp), 0) INTO v_today_xp FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today;
  SELECT COALESCE(jsonb_object_agg(tier::text, item_id), '{}'::jsonb) INTO v_cosmetics
    FROM public.season_pass_cosmetics WHERE season_key = v_season;
  SELECT COALESCE(jsonb_object_agg(tier::text, item_id), '{}'::jsonb) INTO v_prem_cosmetics
    FROM public.season_pass_premium_cosmetics WHERE season_key = v_season;
  SELECT claimed_tiers INTO v_prem_claimed FROM public.season_pass_premium WHERE profile_id = p_profile AND season_key = v_season;
  v_prem_unlocked := FOUND;

  RETURN jsonb_build_object(
    'status', 'ok',
    'season', v_season,
    'ends_at', (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month') AT TIME ZONE 'utc',
    'xp', v_xp,
    'tier', v_tier,
    'tier_count', public.season_pass_tier_count(),
    'claimed', to_jsonb(v_claimed),
    'today_xp', v_today_xp,
    'daily_cap', public.season_pass_daily_cap(),
    'cosmetics', v_cosmetics,
    'premium', jsonb_build_object(
      'available', v_prem_cosmetics <> '{}'::jsonb,
      'unlocked', v_prem_unlocked,
      'price', public.season_pass_premium_price(),
      'claimed', to_jsonb(COALESCE(v_prem_claimed, '{}')),
      'cosmetics', v_prem_cosmetics
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public._season_pass_state(uuid) FROM PUBLIC, anon, authenticated;

-- 5. What the client calls -----------------------------------------------------------------------------------------
-- Opens the premium track of the current season for coins. {status: ok | already | poor | unavailable | guest |
-- unauthenticated | no_profile} plus the pass, and for ok the balance now (wallet).
CREATE OR REPLACE FUNCTION public.season_pass_unlock_premium()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_season text := public.current_season_key();
  v_profile public.profiles%ROWTYPE;
  v_price integer := public.season_pass_premium_price();
  v_wallet integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.season_pass_premium_cosmetics WHERE season_key = v_season) THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'unavailable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.season_pass_premium WHERE profile_id = v_profile.id AND season_key = v_season) THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'already');
  END IF;
  IF v_profile.coins < v_price THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'poor', 'wallet', v_profile.coins);
  END IF;

  UPDATE public.profiles SET coins = coins - v_price WHERE id = v_profile.id RETURNING coins INTO v_wallet;
  INSERT INTO public.season_pass_premium (profile_id, season_key) VALUES (v_profile.id, v_season);

  RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'ok', 'wallet', v_wallet);
END;
$$;
REVOKE ALL ON FUNCTION public.season_pass_unlock_premium() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_pass_unlock_premium() TO authenticated;

-- Pays one premium tier of the current season, once; the same answer as season_pass_claim (plus status not_premium
-- when the track was not opened). The tier must be reached on the free track's XP.
CREATE OR REPLACE FUNCTION public.season_pass_claim_premium(p_tier integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_season text := public.current_season_key();
  v_profile public.profiles%ROWTYPE;
  v_xp integer := 0;
  v_claimed integer[];
  v_reward jsonb;
  v_coins integer := 0;
  v_keys integer := 0;
  v_item text;
  v_granted text;
  v_duplicate boolean := false;
  v_owned text[];
  v_chest jsonb := NULL;
  v_chest_coins integer := 0;
  v_wallet integer;
  v_state public.player_chest_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;
  IF p_tier IS NULL OR p_tier < 1 OR p_tier > public.season_pass_tier_count() THEN RETURN jsonb_build_object('status', 'bad_tier'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  PERFORM public._season_pass_sync_verified(v_profile.id, auth.uid());
  SELECT claimed_tiers INTO v_claimed FROM public.season_pass_premium WHERE profile_id = v_profile.id AND season_key = v_season FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'not_premium');
  END IF;
  SELECT COALESCE(xp, 0) INTO v_xp FROM public.season_pass_progress WHERE profile_id = v_profile.id AND season_key = v_season;
  v_xp := COALESCE(v_xp, 0);

  IF public.season_pass_tier(v_xp) < p_tier THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'locked');
  END IF;
  IF p_tier = ANY (v_claimed) THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'already');
  END IF;

  v_reward := public.season_pass_premium_reward(p_tier);
  v_owned := COALESCE(v_profile.owned_item_ids, '{}');
  v_coins := COALESCE((v_reward ->> 'coins')::integer, 0);
  v_keys := COALESCE((v_reward ->> 'keys')::integer, 0);

  IF v_reward ? 'cosmetic' THEN
    SELECT item_id INTO v_item FROM public.season_pass_premium_cosmetics WHERE season_key = v_season AND tier = p_tier;
    IF v_item IS NULL THEN
      v_coins := v_coins + public.season_pass_premium_cosmetic_coins(p_tier);
    ELSIF v_item = ANY (v_owned) THEN
      v_duplicate := true;
      v_coins := v_coins + public.season_pass_premium_cosmetic_coins(p_tier);
    ELSE
      v_granted := v_item;
      v_owned := array_append(v_owned, v_item);
    END IF;
  END IF;

  IF v_reward ? 'chest' THEN
    v_chest := public.open_chest(v_reward ->> 'chest', v_owned);
    IF v_chest ->> 'item_id' IS NOT NULL THEN v_owned := array_append(v_owned, v_chest ->> 'item_id'); END IF;
    v_chest_coins := COALESCE((v_chest ->> 'coins')::integer, 0);
  END IF;

  UPDATE public.profiles SET coins = coins + v_coins + v_chest_coins, owned_item_ids = v_owned
   WHERE id = v_profile.id RETURNING coins INTO v_wallet;

  IF v_keys > 0 THEN PERFORM public._grant_keys(v_profile.id, v_keys); END IF;
  v_state := public._chest_state(v_profile.id);

  UPDATE public.season_pass_premium SET claimed_tiers = array_append(claimed_tiers, p_tier)
   WHERE profile_id = v_profile.id AND season_key = v_season;

  RETURN public._season_pass_state(v_profile.id) || jsonb_build_object(
    'status', 'ok',
    'claimed_tier', p_tier,
    'coins', v_coins,
    'keys', v_keys,
    'chest', v_chest,
    'item_id', v_item,
    'duplicate', v_duplicate,
    'wallet', v_wallet,
    'owned_item_ids', to_jsonb(v_owned),
    'state', public._chest_state_json(v_state)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.season_pass_claim_premium(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_pass_claim_premium(integer) TO authenticated;
