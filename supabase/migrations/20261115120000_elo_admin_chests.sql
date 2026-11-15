-- Versus rating, admin tools and chests.
--   * Versus: a win gives 25 rating, a loss takes 15 (was 10 and 10), so ranks are within reach. The rank levels
--     (client, components/MultiplayerMenu.tsx) become 0 / 200 / 500 / 900 / 1400 / 2000.
--   * The number of matches a profile shows is the player's rows in match_history plus an offset an admin can set
--     (player_matches); admins can set a player's rating and number of matches (admin_set_elo, admin_set_matches).
--   * Lucky hour: every day 17:00-18:00 UTC (20:00-21:00 Moscow) chests roll rarer (open_chest).
--   * Chests can be bought for coins in the shop (buy_chest): small 500, big 1200.
--   * Legendary items cost 1400-2000 (were 920-1160): new = 1400 + (old - 920) * 2.5, so a legendary feels rare and
--     a chest that rolls one is a real win. Cheaper items keep their prices. Mirrors constants/Shop.ts.

-- 1. Versus rating ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._settle_versus_match(p_room_id uuid, p_outcome text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_win CONSTANT integer := 25;
  c_loss CONSTANT integer := 15;
  c_pair_cap CONSTANT integer := 10;
  c_guest_cap CONSTANT integer := 5;
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
  v_m public.versus_matches%ROWTYPE;
  v_winner text;
  v_loser text;
  v_outcome text := p_outcome;
  v_acct text;
BEGIN
  SELECT * INTO v_m FROM public.versus_matches WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_m.settled_at IS NOT NULL THEN RETURN COALESCE(v_m.outcome, 'void'); END IF;

  IF v_outcome IN ('p1_win', 'p2_win') THEN
    v_winner := CASE WHEN v_outcome = 'p1_win' THEN v_m.player1_id ELSE v_m.player2_id END;
    v_loser := CASE WHEN v_outcome = 'p1_win' THEN v_m.player2_id ELSE v_m.player1_id END;

    IF (SELECT count(*) FROM public.versus_matches
         WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win')
           AND ((player1_id = v_m.player1_id AND player2_id = v_m.player2_id)
             OR (player1_id = v_m.player2_id AND player2_id = v_m.player1_id))) >= c_pair_cap THEN
      v_outcome := 'capped';
    END IF;

    -- Against a guest the opponent cannot be verified, so such matches are rationed per account.
    IF v_outcome <> 'capped' THEN
      FOREACH v_acct IN ARRAY ARRAY[v_m.player1_id, v_m.player2_id] LOOP
        IF public.is_real_account_id(v_acct)
           AND NOT public.is_real_account_id(CASE WHEN v_acct = v_m.player1_id THEN v_m.player2_id ELSE v_m.player1_id END)
           AND (SELECT count(*) FROM public.versus_matches
                 WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win')
                   AND (player1_id = v_acct OR player2_id = v_acct)
                   AND NOT public.is_real_account_id(CASE WHEN player1_id = v_acct THEN player2_id ELSE player1_id END)) >= c_guest_cap THEN
          v_outcome := 'capped';
        END IF;
      END LOOP;
    END IF;

    IF v_outcome <> 'capped' THEN
      IF public.is_real_account_id(v_winner) THEN
        UPDATE public.profiles SET elo = elo + c_win WHERE auth_user_id = v_winner::uuid;
      END IF;
      IF public.is_real_account_id(v_loser) THEN
        UPDATE public.profiles SET elo = GREATEST(0, elo - c_loss) WHERE auth_user_id = v_loser::uuid;
      END IF;
    END IF;
  END IF;

  UPDATE public.versus_matches SET outcome = v_outcome, settled_at = now() WHERE room_id = p_room_id;
  RETURN v_outcome;
END;
$$;
REVOKE ALL ON FUNCTION public._settle_versus_match(uuid, text) FROM PUBLIC, anon, authenticated;

-- 2. Matches and admin tools -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_match_offsets (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  matches_offset integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_match_offsets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_match_offsets FROM anon, authenticated;

-- Matches of a player (by account id, as match_history stores them): history rows plus the admin's offset.
CREATE OR REPLACE FUNCTION public.player_matches(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0,
    (SELECT count(*)::integer FROM public.match_history WHERE player1_id = p_user OR player2_id = p_user)
    + COALESCE((SELECT o.matches_offset FROM public.profile_match_offsets o
                  JOIN public.profiles p ON p.id = o.profile_id
                 WHERE p.auth_user_id = p_user), 0));
$$;
REVOKE ALL ON FUNCTION public.player_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_matches(uuid) TO anon, authenticated;

-- Players by nickname, now with their number of matches.
CREATE OR REPLACE FUNCTION public.admin_find_players(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := btrim(coalesce(p_query, ''));
BEGIN
  PERFORM public.admin_require();
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.last_seen DESC NULLS LAST)
    FROM (
      SELECT p.id, p.player_name, p.avatar_url, p.coins, p.elo, p.highscore_classic, p.highscore_chaos,
             p.streak_count, p.created_at, l.login_providers, l.last_login_at,
             greatest(p.updated_at, l.last_login_at) AS last_seen,
             p.auth_user_id IS NOT NULL AS has_account,
             EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p.auth_user_id) AS is_admin,
             CASE WHEN p.auth_user_id IS NULL THEN 0 ELSE public.player_matches(p.auth_user_id) END AS matches
      FROM public.profiles p
      LEFT JOIN public.profile_logins l ON l.profile_id = p.id
      WHERE v_query = '' OR p.player_name ILIKE '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%'
      ORDER BY greatest(p.updated_at, l.last_login_at) DESC NULLS LAST
      LIMIT 30
    ) r
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_elo(p_profile_id uuid, p_elo integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer;
BEGIN
  PERFORM public.admin_require();
  IF p_elo IS NULL OR p_elo < 0 OR p_elo > 100000 THEN RAISE EXCEPTION 'Bad rating'; END IF;
  SELECT elo INTO v_before FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  UPDATE public.profiles SET elo = p_elo WHERE id = p_profile_id;
  PERFORM public.admin_write_log('set_elo', p_profile_id, jsonb_build_object('before', v_before, 'after', p_elo, 'reason', p_reason));
  RETURN jsonb_build_object('elo', p_elo);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_matches(p_profile_id uuid, p_matches integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_before integer;
  v_history integer;
BEGIN
  PERFORM public.admin_require();
  IF p_matches IS NULL OR p_matches < 0 OR p_matches > 1000000 THEN RAISE EXCEPTION 'Bad number'; END IF;
  SELECT auth_user_id INTO v_user FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such player'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Player has no account'; END IF;
  v_before := public.player_matches(v_user);
  SELECT count(*)::integer INTO v_history FROM public.match_history WHERE player1_id = v_user OR player2_id = v_user;
  INSERT INTO public.profile_match_offsets (profile_id, matches_offset, updated_at)
  VALUES (p_profile_id, p_matches - v_history, now())
  ON CONFLICT (profile_id) DO UPDATE SET matches_offset = EXCLUDED.matches_offset, updated_at = now();
  PERFORM public.admin_write_log('set_matches', p_profile_id, jsonb_build_object('before', v_before, 'after', p_matches, 'reason', p_reason));
  RETURN jsonb_build_object('matches', p_matches);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_elo(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_elo(uuid, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_matches(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_matches(uuid, integer, text) TO authenticated;

-- 3. Chests ----------------------------------------------------------------------------------------------------------
-- Lucky hour: 17:00-18:00 UTC every day.
CREATE OR REPLACE FUNCTION public.chest_lucky_now()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT extract(hour FROM now() AT TIME ZONE 'utc') = 17; $$;

-- As before (streak_chest migration), but in the lucky hour the roll leans to the rare end (random() ^ 0.6):
--   small: coins 26%, common-or-rare 42%, epic 23%, legendary 8%;  big: rare 43%, epic 41%, legendary 16%.
-- The client shows the same odds (constants/Chests.ts).
CREATE OR REPLACE FUNCTION public.open_chest(p_size text, p_owned text[], p_roll double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  v_roll double precision := COALESCE(p_roll, CASE WHEN public.chest_lucky_now() THEN power(random(), 0.6) ELSE random() END);
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

CREATE OR REPLACE FUNCTION public.chest_price(p_size text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $ SELECT CASE p_size WHEN 'small' THEN 500 WHEN 'big' THEN 1200 ELSE NULL END; $;

-- Buys and opens a chest. Returns {status: ok | no_coins | bad_size | unauthenticated | no_profile, chest, coins,
-- owned_item_ids, lucky}.
CREATE OR REPLACE FUNCTION public.buy_chest(p_size text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price integer := public.chest_price(p_size);
  v_profile public.profiles%ROWTYPE;
  v_owned text[];
  v_chest jsonb;
  v_item text;
  v_coins integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF v_price IS NULL THEN RETURN jsonb_build_object('status', 'bad_size'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;
  IF v_profile.coins < v_price THEN
    RETURN jsonb_build_object('status', 'no_coins', 'coins', v_profile.coins);
  END IF;

  v_owned := COALESCE(v_profile.owned_item_ids, '{}');
  v_chest := public.open_chest(p_size, v_owned);
  v_item := v_chest ->> 'item_id';
  IF v_item IS NOT NULL THEN v_owned := array_append(v_owned, v_item); END IF;

  UPDATE public.profiles
     SET coins = coins - v_price + COALESCE((v_chest ->> 'coins')::integer, 0),
         owned_item_ids = v_owned
   WHERE id = v_profile.id
  RETURNING coins INTO v_coins;

  RETURN jsonb_build_object('status', 'ok', 'chest', v_chest, 'coins', v_coins,
    'owned_item_ids', to_jsonb(v_owned), 'lucky', public.chest_lucky_now());
END;
$$;
REVOKE ALL ON FUNCTION public.buy_chest(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_chest(text) TO authenticated;

-- 4. Legendary prices ------------------------------------------------------------------------------------------------
UPDATE public.shop_catalog SET price = 1400 WHERE item_id = 'background_jade_temple';
UPDATE public.shop_catalog SET price = 1400 WHERE item_id = 'music_koto_steps';
UPDATE public.shop_catalog SET price = 1400 WHERE item_id = 'piece_snow_mint';
UPDATE public.shop_catalog SET price = 1400 WHERE item_id = 'sfx_silk';
UPDATE public.shop_catalog SET price = 1450 WHERE item_id = 'background_peach_dusk';
UPDATE public.shop_catalog SET price = 1450 WHERE item_id = 'music_western_dust';
UPDATE public.shop_catalog SET price = 1450 WHERE item_id = 'piece_copper_wire';
UPDATE public.shop_catalog SET price = 1450 WHERE item_id = 'sfx_starlight';
UPDATE public.shop_catalog SET price = 1500 WHERE item_id = 'background_violet_lab';
UPDATE public.shop_catalog SET price = 1500 WHERE item_id = 'music_deep_house';
UPDATE public.shop_catalog SET price = 1500 WHERE item_id = 'piece_royal_velvet';
UPDATE public.shop_catalog SET price = 1500 WHERE item_id = 'sfx_clack';
UPDATE public.shop_catalog SET price = 1550 WHERE item_id = 'background_magma_sea';
UPDATE public.shop_catalog SET price = 1550 WHERE item_id = 'music_chip_calm';
UPDATE public.shop_catalog SET price = 1550 WHERE item_id = 'piece_magma_ice';
UPDATE public.shop_catalog SET price = 1550 WHERE item_id = 'sfx_peach';
UPDATE public.shop_catalog SET price = 1600 WHERE item_id = 'background_arctic_wire';
UPDATE public.shop_catalog SET price = 1600 WHERE item_id = 'music_marimba_run';
UPDATE public.shop_catalog SET price = 1600 WHERE item_id = 'piece_lime_shadow';
UPDATE public.shop_catalog SET price = 1600 WHERE item_id = 'sfx_void';
UPDATE public.shop_catalog SET price = 1650 WHERE item_id = 'background_mint_noir';
UPDATE public.shop_catalog SET price = 1650 WHERE item_id = 'music_cosmic_bell';
UPDATE public.shop_catalog SET price = 1650 WHERE item_id = 'piece_peach_soda';
UPDATE public.shop_catalog SET price = 1700 WHERE item_id = 'background_ruby_night';
UPDATE public.shop_catalog SET price = 1700 WHERE item_id = 'piece_void_pearl';
UPDATE public.shop_catalog SET price = 1750 WHERE item_id = 'background_circuit_bloom';
UPDATE public.shop_catalog SET price = 1800 WHERE item_id = 'background_pearl_void';
UPDATE public.shop_catalog SET price = 1850 WHERE item_id = 'background_bronze_city';
UPDATE public.shop_catalog SET price = 1900 WHERE item_id = 'background_rain_window';
UPDATE public.shop_catalog SET price = 1950 WHERE item_id = 'background_pixel_meadow';
UPDATE public.shop_catalog SET price = 2000 WHERE item_id = 'background_eclipse_gold';
