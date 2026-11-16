-- Chests worth opening, keys, gifts, collection sets and more season rewards.
--   * Chests: small 400 (coins 30% at 400-800, common-or-rare item 40%, epic 20%, legendary 10%), big 1000 (epic 70%,
--     legendary 30%, plus 200 coins). A chest is worth about 1.5x its price on average: a random prize must beat
--     choosing the item in the shop.
--   * Chest exclusives: 12 items (kind 'server_only' with a price, the price only sets the rarity) that only chests
--     give. A big chest picks an exclusive more often than a small one.
--   * Pity: after 9 bought or key chests in a row without a legendary, the next one is legendary.
--   * Keys open a small chest for free. They come from the daily quest bonus (all three quests), from Versus wins
--     (5 wins make a key), from gifts, collection sets and season places.
--   * Gifts: an item or a chest (a key) for a friend, paid by the sender; the friend sees it on the next start.
--   * Collection sets: every category x rarity of the shop, plus the exclusives; a complete set pays keys once.
--   * Seasons: the top 10 of Classic, Chaos and Versus also get keys; the top 3 of the all-time challenge boards
--     (Time Attack, Daily, Move Limit, Rescue, Combo Trial) get coins and keys at every season close.
-- Client mirrors: constants/Chests.ts, constants/Collection.ts, constants/Gifts.ts, constants/Shop.ts.

-- 1. Chest state ------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_chest_state (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  keys integer NOT NULL DEFAULT 0 CHECK (keys >= 0),
  key_shards integer NOT NULL DEFAULT 0 CHECK (key_shards >= 0 AND key_shards < 5),
  pity integer NOT NULL DEFAULT 0 CHECK (pity >= 0),
  collection_sets text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_chest_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_chest_state FROM anon, authenticated;

-- The row of a profile, created on first use and locked for the caller's transaction.
CREATE OR REPLACE FUNCTION public._chest_state(p_profile uuid)
RETURNS public.player_chest_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state public.player_chest_state%ROWTYPE;
BEGIN
  INSERT INTO public.player_chest_state (profile_id) VALUES (p_profile) ON CONFLICT (profile_id) DO NOTHING;
  SELECT * INTO v_state FROM public.player_chest_state WHERE profile_id = p_profile FOR UPDATE;
  RETURN v_state;
END;
$$;
REVOKE ALL ON FUNCTION public._chest_state(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._grant_keys(p_profile uuid, p_keys integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_keys integer;
BEGIN
  PERFORM public._chest_state(p_profile);
  UPDATE public.player_chest_state SET keys = keys + GREATEST(p_keys, 0), updated_at = now()
   WHERE profile_id = p_profile RETURNING keys INTO v_keys;
  RETURN v_keys;
END;
$$;
REVOKE ALL ON FUNCTION public._grant_keys(uuid, integer) FROM PUBLIC, anon, authenticated;

-- A Versus win: one shard, five shards make a key.
CREATE OR REPLACE FUNCTION public._add_key_shard(p_profile uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._chest_state(p_profile);
  UPDATE public.player_chest_state
     SET keys = keys + CASE WHEN key_shards >= 4 THEN 1 ELSE 0 END,
         key_shards = CASE WHEN key_shards >= 4 THEN 0 ELSE key_shards + 1 END,
         updated_at = now()
   WHERE profile_id = p_profile;
END;
$$;
REVOKE ALL ON FUNCTION public._add_key_shard(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._chest_state_json(p_state public.player_chest_state)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('keys', p_state.keys, 'key_shards', p_state.key_shards, 'pity', p_state.pity,
    'pity_max', 10, 'collection_sets', to_jsonb(p_state.collection_sets));
$$;

CREATE OR REPLACE FUNCTION public.get_chest_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile IS NULL THEN RETURN NULL; END IF;
  RETURN public._chest_state_json(public._chest_state(v_profile));
END;
$$;
REVOKE ALL ON FUNCTION public.get_chest_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chest_state() TO authenticated;

-- 2. Exclusives -------------------------------------------------------------------------------------------------------
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('piece_chest_aurora', 820, 'server_only'),
  ('piece_chest_cosmic', 860, 'server_only'),
  ('piece_chest_toxic', 880, 'server_only'),
  ('piece_chest_dragon', 1700, 'server_only'),
  ('piece_chest_prism', 1800, 'server_only'),
  ('piece_chest_relic', 2000, 'server_only'),
  ('background_chest_northern', 820, 'server_only'),
  ('background_chest_sunken', 860, 'server_only'),
  ('background_chest_galaxy', 900, 'server_only'),
  ('background_chest_dragon', 1700, 'server_only'),
  ('background_chest_crystal', 1800, 'server_only'),
  ('background_chest_treasure', 2000, 'server_only')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- 3. Chests -----------------------------------------------------------------------------------------------------------
-- p_roll forces the roll (pity passes 0.999, which is the top tier of both sizes). In the lucky hour the roll leans to
-- the rare end (random() ^ 0.6): small coins 13%, common-or-rare 42%, epic 29%, legendary 16%; big epic 55%,
-- legendary 45%. The client shows the same odds (constants/Chests.ts).
CREATE OR REPLACE FUNCTION public.open_chest(p_size text, p_owned text[], p_roll double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  v_roll double precision := COALESCE(p_roll, CASE WHEN public.chest_lucky_now() THEN power(random(), 0.6) ELSE random() END);
  v_target integer;
  v_low integer;
  r integer;
  v_item text;
  v_rarity text;
  v_exclusive boolean := false;
  v_bonus integer := CASE WHEN p_size = 'big' THEN 200 ELSE 0 END;
  v_excl_chance double precision := CASE WHEN p_size = 'big' THEN 0.35 ELSE 0.15 END;
BEGIN
  IF p_size = 'small' THEN
    IF v_roll < 0.30 THEN
      RETURN jsonb_build_object('size', p_size, 'kind', 'coins', 'rarity', 'common',
        'coins', 400 + floor(random() * 401)::integer);
    END IF;
    v_target := CASE WHEN v_roll < 0.70 THEN 2 WHEN v_roll < 0.90 THEN 3 ELSE 4 END;
    v_low := 1;
  ELSE
    v_target := CASE WHEN v_roll < 0.70 THEN 3 ELSE 4 END;
    v_low := 3;
  END IF;

  FOR r IN REVERSE v_target..v_low LOOP
    -- epic and legendary tiers sometimes come from the chest-only items
    IF r >= 3 AND random() < v_excl_chance THEN
      SELECT item_id, public.item_rarity(price) INTO v_item, v_rarity
        FROM public.shop_catalog
       WHERE kind = 'server_only' AND price > 0
         AND NOT (item_id = ANY (COALESCE(p_owned, '{}')))
         AND public._rarity_rank(public.item_rarity(price)) = r
       ORDER BY random()
       LIMIT 1;
      v_exclusive := v_item IS NOT NULL;
    END IF;
    IF v_item IS NULL THEN
      SELECT item_id, public.item_rarity(price) INTO v_item, v_rarity
        FROM public.shop_catalog
       WHERE kind = 'paid'
         AND NOT (item_id = ANY (COALESCE(p_owned, '{}')))
         AND public._rarity_rank(public.item_rarity(price)) BETWEEN CASE WHEN p_size = 'small' AND r = 2 THEN 1 ELSE r END AND r
       ORDER BY random()
       LIMIT 1;
    END IF;
    IF v_item IS NULL AND r >= 3 THEN
      -- the shop tier is complete: an exclusive of the same tier, if one is left
      SELECT item_id, public.item_rarity(price) INTO v_item, v_rarity
        FROM public.shop_catalog
       WHERE kind = 'server_only' AND price > 0
         AND NOT (item_id = ANY (COALESCE(p_owned, '{}')))
         AND public._rarity_rank(public.item_rarity(price)) = r
       ORDER BY random()
       LIMIT 1;
      v_exclusive := v_item IS NOT NULL;
    END IF;
    EXIT WHEN v_item IS NOT NULL;
  END LOOP;

  IF v_item IS NULL THEN
    RETURN jsonb_build_object('size', p_size, 'kind', 'coins',
      'rarity', CASE v_target WHEN 4 THEN 'legendary' WHEN 3 THEN 'epic' ELSE 'rare' END,
      'coins', v_bonus + CASE v_target WHEN 4 THEN 1500 WHEN 3 THEN 1000 ELSE 600 END);
  END IF;

  RETURN jsonb_build_object('size', p_size, 'kind', 'item', 'item_id', v_item, 'rarity', v_rarity,
    'coins', v_bonus, 'exclusive', v_exclusive);
END;
$$;
REVOKE ALL ON FUNCTION public.open_chest(text, text[], double precision) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.chest_price(p_size text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE p_size WHEN 'small' THEN 400 WHEN 'big' THEN 1000 ELSE NULL END; $$;

-- Opens a chest for a profile row already locked by the caller, with pity: the tenth chest without a legendary is
-- one. Pays the chest's coins and item; the caller has taken the price (coins or a key) already.
CREATE OR REPLACE FUNCTION public._open_paid_chest(p_profile public.profiles, p_size text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state public.player_chest_state%ROWTYPE := public._chest_state(p_profile.id);
  v_owned text[] := COALESCE(p_profile.owned_item_ids, '{}');
  v_chest jsonb;
  v_item text;
  v_coins integer;
  v_pity boolean := v_state.pity >= 9;
BEGIN
  v_chest := public.open_chest(p_size, v_owned, CASE WHEN v_pity THEN 0.999 ELSE NULL END);
  v_item := v_chest ->> 'item_id';
  IF v_item IS NOT NULL THEN v_owned := array_append(v_owned, v_item); END IF;

  UPDATE public.profiles
     SET coins = coins + COALESCE((v_chest ->> 'coins')::integer, 0),
         owned_item_ids = v_owned
   WHERE id = p_profile.id
  RETURNING coins INTO v_coins;

  UPDATE public.player_chest_state
     SET pity = CASE WHEN v_chest ->> 'rarity' = 'legendary' THEN 0 ELSE pity + 1 END, updated_at = now()
   WHERE profile_id = p_profile.id
  RETURNING * INTO v_state;

  RETURN jsonb_build_object('status', 'ok', 'chest', v_chest || jsonb_build_object('pity', v_pity), 'coins', v_coins,
    'owned_item_ids', to_jsonb(v_owned), 'lucky', public.chest_lucky_now(), 'state', public._chest_state_json(v_state));
END;
$$;
REVOKE ALL ON FUNCTION public._open_paid_chest(public.profiles, text) FROM PUBLIC, anon, authenticated;

-- Buys and opens a chest. Returns {status: ok | no_coins | bad_size | unauthenticated | no_profile, chest, coins,
-- owned_item_ids, lucky, state}.
CREATE OR REPLACE FUNCTION public.buy_chest(p_size text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price integer := public.chest_price(p_size);
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF v_price IS NULL THEN RETURN jsonb_build_object('status', 'bad_size'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;
  IF v_profile.coins < v_price THEN
    RETURN jsonb_build_object('status', 'no_coins', 'coins', v_profile.coins);
  END IF;

  UPDATE public.profiles SET coins = coins - v_price WHERE id = v_profile.id RETURNING * INTO v_profile;
  RETURN public._open_paid_chest(v_profile, p_size);
END;
$$;
REVOKE ALL ON FUNCTION public.buy_chest(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_chest(text) TO authenticated;

-- Opens a small chest with a key. Returns as buy_chest, or {status: no_keys}.
CREATE OR REPLACE FUNCTION public.open_key_chest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_state public.player_chest_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_state := public._chest_state(v_profile.id);
  IF v_state.keys < 1 THEN
    RETURN jsonb_build_object('status', 'no_keys', 'state', public._chest_state_json(v_state));
  END IF;
  UPDATE public.player_chest_state SET keys = keys - 1, updated_at = now() WHERE profile_id = v_profile.id;
  RETURN public._open_paid_chest(v_profile, 'small');
END;
$$;
REVOKE ALL ON FUNCTION public.open_key_chest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_key_chest() TO authenticated;

-- 4. Versus wins give key shards (as in 20261115120000, plus the shard for a counted win) ----------------------------
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
  v_winner_profile uuid;
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
        UPDATE public.profiles SET elo = elo + c_win WHERE auth_user_id = v_winner::uuid RETURNING id INTO v_winner_profile;
        IF v_winner_profile IS NOT NULL THEN PERFORM public._add_key_shard(v_winner_profile); END IF;
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

-- 5. Daily quests: the bonus for all three quests also gives a key (as in 20261021120000 otherwise) ------------------
CREATE OR REPLACE FUNCTION public.claim_daily_quests(p_day date, p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_id text;
  v_reward integer;
  v_total integer := 0;
  v_granted text[] := ARRAY[]::text[];
  v_inserted integer;
  v_quest_claims integer;
  v_wants_bonus boolean;
  v_keys integer := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  -- The device's calendar day may be a day ahead or behind the server's (time zones); nothing older or newer pays.
  IF p_day IS NULL OR p_day < current_date - 1 OR p_day > current_date + 1 THEN
    RETURN jsonb_build_object('status', 'bad_day');
  END IF;

  v_wants_bonus := 'bonus' = ANY (coalesce(p_ids, ARRAY[]::text[]));

  FOR v_id IN SELECT DISTINCT unnest(coalesce(p_ids, ARRAY[]::text[])) LIMIT 10 LOOP
    CONTINUE WHEN v_id = 'bonus';
    v_reward := public.daily_quest_reward(v_id);
    CONTINUE WHEN v_reward IS NULL;

    SELECT count(*) INTO v_quest_claims FROM public.daily_quest_claims
      WHERE user_id = auth.uid() AND day = p_day AND quest_id <> 'bonus';
    CONTINUE WHEN v_quest_claims >= 3;

    INSERT INTO public.daily_quest_claims (user_id, day, quest_id, reward)
    VALUES (auth.uid(), p_day, v_id, v_reward)
    ON CONFLICT (user_id, day, quest_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      v_total := v_total + v_reward;
      v_granted := v_granted || v_id;
    END IF;
  END LOOP;

  -- The bonus needs all three quests of the day to be claimed already (or in this very call).
  IF v_wants_bonus THEN
    SELECT count(*) INTO v_quest_claims FROM public.daily_quest_claims
      WHERE user_id = auth.uid() AND day = p_day AND quest_id <> 'bonus';
    IF v_quest_claims >= 3 THEN
      INSERT INTO public.daily_quest_claims (user_id, day, quest_id, reward)
      VALUES (auth.uid(), p_day, 'bonus', public.daily_quest_reward('bonus'))
      ON CONFLICT (user_id, day, quest_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        v_total := v_total + public.daily_quest_reward('bonus');
        v_granted := array_append(v_granted, 'bonus'::text);
        v_keys := public._grant_keys(v_profile.id, 1);
      END IF;
    END IF;
  END IF;

  IF v_total > 0 THEN
    UPDATE public.profiles SET coins = coins + v_total WHERE id = v_profile.id RETURNING coins INTO v_profile.coins;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'coins', v_profile.coins,
    'keys', v_keys,
    'granted', to_jsonb(v_granted),
    'claimed', coalesce((SELECT jsonb_agg(quest_id ORDER BY quest_id) FROM public.daily_quest_claims WHERE user_id = auth.uid() AND day = p_day), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_daily_quests(date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_quests(date, text[]) TO authenticated;

-- 6. Gifts -------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('item', 'chest')),
  item_id text,
  price integer NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gifts_unseen ON public.gifts (to_user) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gifts_sender_day ON public.gifts (from_user, created_at);
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gifts FROM anon, authenticated;

-- Sends a friend an item (they must not own it) or a chest (a key). The sender pays the shop price; 5 gifts a day.
-- Returns {status: ok | not_friends | no_coins | owned | not_for_sale | limit | no_profile | unauthenticated, coins}.
CREATE OR REPLACE FUNCTION public.send_gift(p_friend uuid, p_kind text, p_item_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_daily_limit CONSTANT integer := 5;
  v_me public.profiles%ROWTYPE;
  v_friend public.profiles%ROWTYPE;
  v_price integer;
  v_item public.shop_catalog%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_friend IS NULL OR p_friend = auth.uid() OR p_kind NOT IN ('item', 'chest') THEN
    RETURN jsonb_build_object('status', 'bad_request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friends
                  WHERE status = 'accepted'
                    AND ((user_id_1 = auth.uid() AND user_id_2 = p_friend) OR (user_id_1 = p_friend AND user_id_2 = auth.uid()))) THEN
    RETURN jsonb_build_object('status', 'not_friends');
  END IF;
  IF NOT public.is_real_account_id(p_friend::text) THEN RETURN jsonb_build_object('status', 'not_friends'); END IF;

  -- both rows locked in a fixed order, so two friends gifting each other at once cannot deadlock
  PERFORM 1 FROM public.profiles WHERE auth_user_id IN (auth.uid(), p_friend) ORDER BY id FOR UPDATE;
  SELECT * INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  SELECT * INTO v_friend FROM public.profiles WHERE auth_user_id = p_friend;
  IF v_me.id IS NULL OR v_friend.id IS NULL THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF (SELECT count(*) FROM public.gifts WHERE from_user = auth.uid() AND created_at > now() - interval '1 day') >= c_daily_limit THEN
    RETURN jsonb_build_object('status', 'limit', 'coins', v_me.coins);
  END IF;

  IF p_kind = 'chest' THEN
    v_price := public.chest_price('small');
  ELSE
    SELECT * INTO v_item FROM public.shop_catalog WHERE item_id = p_item_id;
    IF NOT FOUND OR v_item.kind <> 'paid' THEN RETURN jsonb_build_object('status', 'not_for_sale', 'coins', v_me.coins); END IF;
    IF p_item_id = ANY (COALESCE(v_friend.owned_item_ids, '{}')) THEN
      RETURN jsonb_build_object('status', 'owned', 'coins', v_me.coins);
    END IF;
    v_price := v_item.price;
  END IF;

  IF v_me.coins < v_price THEN RETURN jsonb_build_object('status', 'no_coins', 'coins', v_me.coins); END IF;

  UPDATE public.profiles SET coins = coins - v_price WHERE id = v_me.id RETURNING coins INTO v_me.coins;
  IF p_kind = 'chest' THEN
    PERFORM public._grant_keys(v_friend.id, 1);
  ELSE
    UPDATE public.profiles SET owned_item_ids = array_append(COALESCE(owned_item_ids, '{}'), p_item_id) WHERE id = v_friend.id;
  END IF;
  INSERT INTO public.gifts (from_user, to_user, kind, item_id, price)
  VALUES (auth.uid(), p_friend, p_kind, CASE WHEN p_kind = 'item' THEN p_item_id END, v_price);

  RETURN jsonb_build_object('status', 'ok', 'coins', v_me.coins);
END;
$$;
REVOKE ALL ON FUNCTION public.send_gift(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_gift(uuid, text, text) TO authenticated;

-- The gifts nobody has shown yet (already paid into the account by send_gift). Marks them seen.
-- Returns {gifts: [{kind, item_id, from_name, created_at}], owned_item_ids, state}.
CREATE OR REPLACE FUNCTION public.claim_gifts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_gifts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;

  WITH seen AS (
    UPDATE public.gifts SET seen_at = now()
     WHERE to_user = auth.uid() AND seen_at IS NULL
    RETURNING kind, item_id, from_user, created_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id,
           'from_name', COALESCE(p.player_name, '?'), 'created_at', s.created_at) ORDER BY s.created_at), '[]'::jsonb)
    INTO v_gifts
    FROM seen s LEFT JOIN public.profiles p ON p.auth_user_id = s.from_user;

  RETURN jsonb_build_object('gifts', v_gifts, 'owned_item_ids', to_jsonb(COALESCE(v_profile.owned_item_ids, '{}')),
    'state', public._chest_state_json(public._chest_state(v_profile.id)));
END;
$$;
REVOKE ALL ON FUNCTION public.claim_gifts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_gifts() TO authenticated;

-- 7. Collection sets ---------------------------------------------------------------------------------------------------
-- The shop category of an item id (ids start with their category; constants/Collection.test.ts checks the client).
CREATE OR REPLACE FUNCTION public.item_category(p_item_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_item_id LIKE 'chess\_piece\_%' THEN 'chess_piece'
    WHEN p_item_id LIKE 'chess\_board\_%' THEN 'chess_board'
    WHEN p_item_id LIKE 'sea\_skin\_%' THEN 'sea_skin'
    WHEN p_item_id LIKE 'card\_skin\_%' THEN 'card_skin'
    WHEN p_item_id LIKE 'sudoku\_theme\_%' THEN 'sudoku_theme'
    WHEN p_item_id LIKE 'mahjong\_theme\_%' THEN 'mahjong_theme'
    WHEN p_item_id LIKE 'piece\_%' THEN 'piece_skin'
    WHEN p_item_id LIKE 'background\_%' THEN 'background'
    WHEN p_item_id LIKE 'music\_%' THEN 'music'
    WHEN p_item_id LIKE 'sfx\_%' THEN 'sfx'
    ELSE NULL
  END;
$$;

-- A set is '<category>:<rarity>' over the items sold in the shop, or 'exclusive' (the chest-only items).
CREATE OR REPLACE FUNCTION public.collection_set_items(p_set text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(item_id), '{}') FROM public.shop_catalog
   WHERE CASE WHEN p_set = 'exclusive' THEN kind = 'server_only' AND price > 0
              ELSE kind = 'paid' AND public.item_category(item_id) || ':' || public.item_rarity(price) = p_set END;
$$;
REVOKE ALL ON FUNCTION public.collection_set_items(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.collection_set_keys(p_set text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_set = 'exclusive' THEN 10
    WHEN p_set LIKE '%:legendary' THEN 5
    WHEN p_set LIKE '%:epic' THEN 3
    WHEN p_set LIKE '%:rare' THEN 2
    WHEN p_set LIKE '%:common' THEN 1
    ELSE 0
  END;
$$;

-- Pays a complete set once. Returns {status: ok | incomplete | already | unknown_set, keys, state}.
CREATE OR REPLACE FUNCTION public.claim_collection_set(p_set text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_state public.player_chest_state%ROWTYPE;
  v_items text[] := public.collection_set_items(p_set);
  v_keys integer := public.collection_set_keys(p_set);
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;
  v_state := public._chest_state(v_profile.id);

  IF cardinality(v_items) = 0 OR v_keys = 0 THEN
    RETURN jsonb_build_object('status', 'unknown_set', 'state', public._chest_state_json(v_state));
  END IF;
  IF p_set = ANY (v_state.collection_sets) THEN
    RETURN jsonb_build_object('status', 'already', 'state', public._chest_state_json(v_state));
  END IF;
  IF NOT (v_items <@ COALESCE(v_profile.owned_item_ids, '{}')) THEN
    RETURN jsonb_build_object('status', 'incomplete', 'state', public._chest_state_json(v_state));
  END IF;

  UPDATE public.player_chest_state
     SET keys = keys + v_keys, collection_sets = array_append(collection_sets, p_set), updated_at = now()
   WHERE profile_id = v_profile.id
  RETURNING * INTO v_state;
  RETURN jsonb_build_object('status', 'ok', 'keys', v_keys, 'state', public._chest_state_json(v_state));
END;
$$;
REVOKE ALL ON FUNCTION public.claim_collection_set(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_collection_set(text) TO authenticated;

-- 8. Season rewards: keys, and the all-time challenge boards ---------------------------------------------------------
ALTER TABLE public.season_rewards ADD COLUMN IF NOT EXISTS keys integer NOT NULL DEFAULT 0 CHECK (keys >= 0);
ALTER TABLE public.season_rewards DROP CONSTRAINT IF EXISTS season_rewards_board_check;
ALTER TABLE public.season_rewards ADD CONSTRAINT season_rewards_board_check
  CHECK (board IN ('classic', 'chaos', 'elo', 'time_attack', 'daily', 'move_limit', 'rescue', 'combo_trial'));

CREATE OR REPLACE FUNCTION public.season_reward_keys(p_rank integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_rank = 1 THEN 5 WHEN p_rank = 2 THEN 4 WHEN p_rank = 3 THEN 3 WHEN p_rank <= 5 THEN 2 WHEN p_rank <= 10 THEN 1 ELSE 0 END;
$$;

-- Holders of the top 3 of an all-time challenge board when a season closes.
CREATE OR REPLACE FUNCTION public.challenge_reward_coins(p_rank integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE p_rank WHEN 1 THEN 300 WHEN 2 THEN 200 WHEN 3 THEN 100 ELSE 0 END; $$;

CREATE OR REPLACE FUNCTION public.challenge_reward_keys(p_rank integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE p_rank WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END; $$;

CREATE OR REPLACE FUNCTION public.close_season()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := to_char(date_trunc('month', now() AT TIME ZONE 'utc') - interval '1 month', 'YYYY-MM');
  v_board text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('close_season'));

  IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_key) THEN
    RETURN 'already closed: ' || v_key;
  END IF;

  FOREACH v_board IN ARRAY ARRAY['classic', 'chaos'] LOOP
    INSERT INTO public.season_results (season_key, board, rank, profile_id, player_name, score)
    SELECT v_key, v_board, (row_number() OVER (ORDER BY s.score DESC, s.updated_at ASC))::integer,
           s.profile_id, p.player_name, s.score
    FROM public.season_scores s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.season_key = v_key AND s.board = v_board
    ORDER BY s.score DESC, s.updated_at ASC
    LIMIT 10;
  END LOOP;

  INSERT INTO public.season_results (season_key, board, rank, profile_id, player_name, score)
  SELECT v_key, 'elo', (row_number() OVER (ORDER BY p.elo DESC, p.updated_at ASC))::integer,
         p.id, p.player_name, p.elo
  FROM public.profiles p
  WHERE p.elo > 0
  ORDER BY p.elo DESC, p.updated_at ASC
  LIMIT 10;

  INSERT INTO public.season_rewards (season_key, board, profile_id, rank, coins, item_id, keys)
  SELECT r.season_key, r.board, r.profile_id, r.rank,
         public.season_reward_coins(r.rank), public.season_reward_item(r.rank), public.season_reward_keys(r.rank)
  FROM public.season_results r
  WHERE r.season_key = v_key AND r.profile_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- all-time challenge boards: whoever holds the top 3 at the close
  INSERT INTO public.season_rewards (season_key, board, profile_id, rank, coins, item_id, keys)
  SELECT v_key, b.board, b.profile_id, b.rank, public.challenge_reward_coins(b.rank), NULL, public.challenge_reward_keys(b.rank)
  FROM (
    SELECT c.board, p.id AS profile_id,
           row_number() OVER (PARTITION BY c.board ORDER BY c.score DESC, p.updated_at ASC)::integer AS rank
    FROM public.profiles p
    CROSS JOIN LATERAL (VALUES
      ('time_attack', p.highscore_time_attack), ('daily', p.highscore_daily), ('move_limit', p.highscore_move_limit),
      ('rescue', p.highscore_rescue), ('combo_trial', p.highscore_combo_trial)) AS c(board, score)
    WHERE c.score > 0 AND p.auth_user_id IS NOT NULL
  ) b
  WHERE b.rank <= 3
  ON CONFLICT DO NOTHING;

  -- Soft reset toward the default rating (0): keep half of the rating.
  UPDATE public.profiles
  SET previous_elo = elo,
      elo = elo / 2,
      elo_reset_at = now()
  WHERE elo > 0;

  INSERT INTO public.season_closures (season_key) VALUES (v_key);
  RETURN 'closed: ' || v_key;
END;
$$;
REVOKE ALL ON FUNCTION public.close_season() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_season_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_entries jsonb;
  v_coins integer;
  v_keys integer;
  v_items text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF v_profile_id IS NULL THEN RETURN NULL; END IF;

  WITH claimed AS (
    UPDATE public.season_rewards
    SET claimed_at = now()
    WHERE profile_id = v_profile_id AND claimed_at IS NULL
    RETURNING season_key, board, rank, coins, item_id, keys
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'season_key', season_key, 'board', board, 'rank', rank, 'coins', coins, 'item_id', item_id, 'keys', keys
         ) ORDER BY season_key, board), '[]'::jsonb),
         COALESCE(sum(coins), 0),
         COALESCE(sum(keys), 0),
         COALESCE(array_agg(DISTINCT item_id) FILTER (WHERE item_id IS NOT NULL), '{}')
  INTO v_entries, v_coins, v_keys, v_items
  FROM claimed;

  IF v_coins > 0 OR cardinality(v_items) > 0 THEN
    UPDATE public.profiles
       SET coins = coins + v_coins,
           owned_item_ids = ARRAY(SELECT DISTINCT item FROM unnest(COALESCE(owned_item_ids, '{}') || v_items) AS item)
     WHERE id = v_profile_id;
  END IF;
  IF v_keys > 0 THEN PERFORM public._grant_keys(v_profile_id, v_keys); END IF;

  RETURN jsonb_build_object('entries', v_entries);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_season_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_season_rewards() TO authenticated;
