-- Season pass: a FREE track of 30 tiers for every leaderboard season (a UTC calendar month, current_season_key()).
--   * XP comes from play: Classic, Chaos, the challenge modes, the level map, More Games, Versus and the daily tasks.
--     Every source has a daily limit of events, a client report of a solo game may come at most once in 30 seconds per
--     source, and the whole day has a limit of XP, so grinding cannot outrun a normal player by much.
--   * Tier n needs 5n^2 + 145n XP in all (150 for the first tier, 440 for the last, 8 850 for the pass).
--   * A tier pays coins, chest keys, a chest opened on the spot, or a season cosmetic. Tiers are claimed one by one; a
--     tier not claimed before the season ends is lost.
--   * Economy (about half of the first draft): a full pass is 1 015 coins, 5 keys, 2 small chests, 1 big chest and the
--     4 cosmetics of the season. Valued at the shop prices of the chests (400 and 1 000) that is 4 815 coins, against
--     9 050 before; an honest day of play is worth about 140 coin-equivalents.
--   * Season cosmetics rotate: season_pass_cosmetics(season_key, tier, item_id) says which four skins a season hands
--     out (tiers 10, 18, 25 and 30). A new season needs a migration that adds its set; a season without a set pays coins
--     for those tiers instead. They are never sold and never in a chest (kind 'server_only', price 0).
--   * Everything is server-side: the client never writes a table. XP is added by security-definer functions on
--     auth.uid(); guests (anonymous accounts) are refused. XP for Versus and daily tasks is not reported by the client at
--     all, the server counts it from versus_matches and daily_quest_claims.
-- Client mirror: constants/SeasonPass.ts (a jest test compares the tables below with it).

-- 1. Tables (no client access: only the functions below read and write them) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.season_pass_progress (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_key text NOT NULL CHECK (season_key ~ '^[0-9]{4}-[0-9]{2}$'),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  claimed_tiers integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, season_key)
);

-- What a profile earned today, per source: the daily limits are checked against it. last_at is the last report of a
-- source (the 30 second spacing).
CREATE TABLE IF NOT EXISTS public.season_pass_daily (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  source text NOT NULL,
  events integer NOT NULL DEFAULT 0 CHECK (events >= 0),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  last_at timestamptz,
  PRIMARY KEY (profile_id, day, source)
);

-- The cosmetics of each season, by tier. Filled by migrations only.
CREATE TABLE IF NOT EXISTS public.season_pass_cosmetics (
  season_key text NOT NULL CHECK (season_key ~ '^[0-9]{4}-[0-9]{2}$'),
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 30),
  item_id text NOT NULL REFERENCES public.shop_catalog(item_id),
  PRIMARY KEY (season_key, tier)
);

-- Row level security on, no policy and no grant: a direct request through the API sees and changes nothing.
ALTER TABLE public.season_pass_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_cosmetics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_pass_progress FROM anon, authenticated;
REVOKE ALL ON public.season_pass_daily FROM anon, authenticated;
REVOKE ALL ON public.season_pass_cosmetics FROM anon, authenticated;

-- 2. Rules --------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.season_pass_tier_count()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 30; $$;

-- XP in all that tier p_tier needs (cumulative).
CREATE OR REPLACE FUNCTION public.season_pass_tier_xp(p_tier integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN p_tier <= 0 THEN 0 ELSE 5 * p_tier * p_tier + 145 * p_tier END; $$;

-- The tier an XP total has reached (0 to 30).
CREATE OR REPLACE FUNCTION public.season_pass_tier(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT COALESCE(max(n), 0)::integer FROM generate_series(1, 30) AS n WHERE 5 * n * n + 145 * n <= p_xp; $$;

-- The most XP a day can give, over all sources.
CREATE OR REPLACE FUNCTION public.season_pass_daily_cap()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 350; $$;

-- Seconds that must pass between two reports of the same source.
CREATE OR REPLACE FUNCTION public.season_pass_min_gap_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 30; $$;

-- XP of one event of a source.
CREATE OR REPLACE FUNCTION public.season_pass_event_xp(p_source text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_source
    WHEN 'classic' THEN 20
    WHEN 'chaos' THEN 20
    WHEN 'challenge' THEN 15
    WHEN 'level' THEN 10
    WHEN 'more_win' THEN 20
    WHEN 'more_play' THEN 8
    WHEN 'versus' THEN 40
    WHEN 'quest_task' THEN 15
    WHEN 'quest_bonus' THEN 30
    ELSE NULL
  END;
$$;

-- Events of a source that count in one UTC day.
CREATE OR REPLACE FUNCTION public.season_pass_event_max(p_source text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_source
    WHEN 'classic' THEN 5
    WHEN 'chaos' THEN 5
    WHEN 'challenge' THEN 4
    WHEN 'level' THEN 5
    WHEN 'more_win' THEN 4
    WHEN 'more_play' THEN 4
    WHEN 'versus' THEN 5
    WHEN 'quest_task' THEN 3
    WHEN 'quest_bonus' THEN 1
    ELSE NULL
  END;
$$;

-- The reward of a tier: {coins, keys, chest: small|big, cosmetic: true}. A cosmetic tier hands out the season's skin
-- (season_pass_cosmetics); without one, or when the player owns it already, it pays season_pass_cosmetic_coins.
CREATE OR REPLACE FUNCTION public.season_pass_reward(p_tier integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 1 THEN '{"coins":25}'::jsonb
    WHEN 2 THEN '{"keys":1}'::jsonb
    WHEN 3 THEN '{"coins":25}'::jsonb
    WHEN 4 THEN '{"coins":30}'::jsonb
    WHEN 5 THEN '{"chest":"small"}'::jsonb
    WHEN 6 THEN '{"coins":30}'::jsonb
    WHEN 7 THEN '{"keys":1}'::jsonb
    WHEN 8 THEN '{"coins":35}'::jsonb
    WHEN 9 THEN '{"coins":35}'::jsonb
    WHEN 10 THEN '{"cosmetic":true}'::jsonb
    WHEN 11 THEN '{"coins":40}'::jsonb
    WHEN 12 THEN '{"coins":40}'::jsonb
    WHEN 13 THEN '{"keys":1}'::jsonb
    WHEN 14 THEN '{"coins":45}'::jsonb
    WHEN 15 THEN '{"coins":45}'::jsonb
    WHEN 16 THEN '{"coins":50}'::jsonb
    WHEN 17 THEN '{"coins":50}'::jsonb
    WHEN 18 THEN '{"cosmetic":true}'::jsonb
    WHEN 19 THEN '{"coins":55}'::jsonb
    WHEN 20 THEN '{"chest":"small"}'::jsonb
    WHEN 21 THEN '{"keys":1}'::jsonb
    WHEN 22 THEN '{"coins":60}'::jsonb
    WHEN 23 THEN '{"coins":60}'::jsonb
    WHEN 24 THEN '{"coins":65}'::jsonb
    WHEN 25 THEN '{"cosmetic":true}'::jsonb
    WHEN 26 THEN '{"coins":70}'::jsonb
    WHEN 27 THEN '{"keys":1}'::jsonb
    WHEN 28 THEN '{"coins":75}'::jsonb
    WHEN 29 THEN '{"coins":80}'::jsonb
    WHEN 30 THEN '{"coins":100,"chest":"big","cosmetic":true}'::jsonb
    ELSE NULL
  END;
$$;

-- Coins paid instead of a cosmetic: the season has no set, or the player owns the skin already.
CREATE OR REPLACE FUNCTION public.season_pass_cosmetic_coins(p_tier integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 10 THEN 100
    WHEN 18 THEN 150
    WHEN 25 THEN 200
    WHEN 30 THEN 300
    ELSE 0
  END;
$$;

-- The season's cosmetic at a tier, or NULL when the season has no set.
CREATE OR REPLACE FUNCTION public.season_pass_cosmetic(p_season text, p_tier integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT item_id FROM public.season_pass_cosmetics WHERE season_key = p_season AND tier = p_tier; $$;

REVOKE ALL ON FUNCTION public.season_pass_tier_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_tier_xp(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_tier(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_daily_cap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_min_gap_seconds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_event_xp(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_event_max(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_reward(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_cosmetic_coins(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.season_pass_cosmetic(text, integer) FROM PUBLIC, anon, authenticated;

-- 3. Season cosmetics: not sold, not in any chest (price 0 keeps them out of chest pools and collections) ------------
-- A new season adds 4 rows here and 4 to season_pass_cosmetics in its own migration, and the client gets the skins in
-- an update (constants/Shop.ts, Piece.tsx, SkinFx.ts, SkinTextures.ts, i18n/shopItems.ts).
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('piece_season_dawn', 0, 'server_only'),
  ('piece_season_nova', 0, 'server_only'),
  ('background_season_horizon', 0, 'server_only'),
  ('background_season_zenith', 0, 'server_only'),
  ('piece_season_snowfall', 0, 'server_only'),
  ('piece_season_garland', 0, 'server_only'),
  ('background_season_frostlake', 0, 'server_only'),
  ('background_season_midwinter', 0, 'server_only'),
  ('piece_season_confetti', 0, 'server_only'),
  ('piece_season_sparkler', 0, 'server_only'),
  ('background_season_countdown', 0, 'server_only'),
  ('background_season_newyear', 0, 'server_only'),
  ('piece_season_heartbeat', 0, 'server_only'),
  ('piece_season_quartz', 0, 'server_only'),
  ('background_season_rosedusk', 0, 'server_only'),
  ('background_season_blizzard', 0, 'server_only')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- Tiers 10 and 25 are skins for blocks, tiers 18 and 30 backgrounds. November is the season the pass starts in.
INSERT INTO public.season_pass_cosmetics (season_key, tier, item_id) VALUES
  ('2026-11', 10, 'piece_season_dawn'),
  ('2026-11', 18, 'background_season_horizon'),
  ('2026-11', 25, 'piece_season_nova'),
  ('2026-11', 30, 'background_season_zenith'),
  ('2026-12', 10, 'piece_season_snowfall'),
  ('2026-12', 18, 'background_season_frostlake'),
  ('2026-12', 25, 'piece_season_garland'),
  ('2026-12', 30, 'background_season_midwinter'),
  ('2027-01', 10, 'piece_season_confetti'),
  ('2027-01', 18, 'background_season_countdown'),
  ('2027-01', 25, 'piece_season_sparkler'),
  ('2027-01', 30, 'background_season_newyear'),
  ('2027-02', 10, 'piece_season_heartbeat'),
  ('2027-02', 18, 'background_season_rosedusk'),
  ('2027-02', 25, 'piece_season_quartz'),
  ('2027-02', 30, 'background_season_blizzard')
ON CONFLICT (season_key, tier) DO UPDATE SET item_id = EXCLUDED.item_id;

-- 4. Internals ----------------------------------------------------------------------------------------------------
-- Adds XP for events of a source to a profile. The caller has locked the profile row (FOR UPDATE), which also
-- serialises every XP write of that player. Returns the XP given: the source's daily event limit and the day's XP limit
-- both apply, so it can be less than events x XP per event, or 0. Every call stamps the source's last_at.
CREATE OR REPLACE FUNCTION public._season_pass_credit(p_profile uuid, p_source text, p_events integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_season text := public.current_season_key();
  v_per integer := public.season_pass_event_xp(p_source);
  v_max integer := public.season_pass_event_max(p_source);
  v_events integer;
  v_allowed integer;
  v_day_total integer;
  v_xp integer;
BEGIN
  IF v_per IS NULL OR p_events IS NULL OR p_events < 1 THEN RETURN 0; END IF;

  INSERT INTO public.season_pass_daily (profile_id, day, source) VALUES (p_profile, v_today, p_source)
  ON CONFLICT (profile_id, day, source) DO NOTHING;
  SELECT events INTO v_events FROM public.season_pass_daily
   WHERE profile_id = p_profile AND day = v_today AND source = p_source;
  UPDATE public.season_pass_daily SET last_at = now() WHERE profile_id = p_profile AND day = v_today AND source = p_source;

  v_allowed := LEAST(p_events, v_max - v_events);
  IF v_allowed < 1 THEN RETURN 0; END IF;

  SELECT COALESCE(sum(xp), 0) INTO v_day_total FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today;
  v_xp := GREATEST(LEAST(v_allowed * v_per, public.season_pass_daily_cap() - v_day_total), 0);

  UPDATE public.season_pass_daily SET events = events + v_allowed, xp = xp + v_xp
   WHERE profile_id = p_profile AND day = v_today AND source = p_source;

  IF v_xp > 0 THEN
    INSERT INTO public.season_pass_progress (profile_id, season_key, xp)
    VALUES (p_profile, v_season, LEAST(v_xp, public.season_pass_tier_xp(public.season_pass_tier_count())))
    ON CONFLICT (profile_id, season_key) DO UPDATE
      SET xp = LEAST(public.season_pass_progress.xp + v_xp, public.season_pass_tier_xp(public.season_pass_tier_count())),
          updated_at = now();
  END IF;

  -- the table only has to remember the last days
  DELETE FROM public.season_pass_daily WHERE profile_id = p_profile AND day < v_today - 7;
  RETURN v_xp;
END;
$$;
REVOKE ALL ON FUNCTION public._season_pass_credit(uuid, text, integer) FROM PUBLIC, anon, authenticated;

-- XP the server can verify itself: Versus matches that settled today and daily tasks claimed today. Counts what is
-- there and pays only the part not paid yet, so calling it again (or from two devices) never pays twice.
CREATE OR REPLACE FUNCTION public._season_pass_sync_verified(p_profile uuid, p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
  v_matches integer;
  v_tasks integer;
  v_bonus integer;
  v_paid integer;
BEGIN
  -- Versus: a match counts once it has settled with a result; capped, void and disputed matches pay nothing.
  SELECT count(*) INTO v_matches FROM public.versus_matches
   WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win', 'draw')
     AND (player1_id = p_uid::text OR player2_id = p_uid::text);
  SELECT COALESCE(max(events), 0) INTO v_paid FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today AND source = 'versus';
  PERFORM public._season_pass_credit(p_profile, 'versus', v_matches - v_paid);

  -- Daily tasks: 15 XP for each claimed task, 30 for the bonus of all three.
  SELECT count(*) FILTER (WHERE quest_id <> 'bonus'), count(*) FILTER (WHERE quest_id = 'bonus') INTO v_tasks, v_bonus
    FROM public.daily_quest_claims WHERE user_id = p_uid AND claimed_at >= v_day_start;
  SELECT COALESCE(max(events), 0) INTO v_paid FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today AND source = 'quest_task';
  PERFORM public._season_pass_credit(p_profile, 'quest_task', v_tasks - v_paid);
  SELECT COALESCE(max(events), 0) INTO v_paid FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today AND source = 'quest_bonus';
  PERFORM public._season_pass_credit(p_profile, 'quest_bonus', v_bonus - v_paid);
END;
$$;
REVOKE ALL ON FUNCTION public._season_pass_sync_verified(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The pass of a profile as the client draws it, with the season's cosmetics by tier.
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
BEGIN
  SELECT xp, claimed_tiers INTO v_xp, v_claimed FROM public.season_pass_progress WHERE profile_id = p_profile AND season_key = v_season;
  v_xp := COALESCE(v_xp, 0);
  v_claimed := COALESCE(v_claimed, '{}');
  v_tier := public.season_pass_tier(v_xp);
  SELECT COALESCE(sum(xp), 0) INTO v_today_xp FROM public.season_pass_daily WHERE profile_id = p_profile AND day = v_today;
  SELECT COALESCE(jsonb_object_agg(tier::text, item_id), '{}'::jsonb) INTO v_cosmetics
    FROM public.season_pass_cosmetics WHERE season_key = v_season;

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
    'cosmetics', v_cosmetics
  );
END;
$$;
REVOKE ALL ON FUNCTION public._season_pass_state(uuid) FROM PUBLIC, anon, authenticated;

-- 5. What the client calls ------------------------------------------------------------------------------------------
-- Counts the XP the server can verify and answers with the pass.
-- Returns {status: ok | guest | unauthenticated | no_profile, season, ends_at, xp, tier, tier_count, claimed, today_xp,
-- daily_cap, cosmetics: {tier: item_id}}.
CREATE OR REPLACE FUNCTION public.season_pass_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  PERFORM public._season_pass_sync_verified(v_profile.id, auth.uid());
  RETURN public._season_pass_state(v_profile.id);
END;
$$;
REVOKE ALL ON FUNCTION public.season_pass_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_pass_sync() TO authenticated;

-- One finished game the device reports: p_source is classic, chaos, challenge, level, more_win or more_play. The
-- device only reports games that were long and good enough (a score and a time per mode, client side); the server
-- cannot see a game, so it holds to what it can check: a source may report once in 30 seconds, only so many events
-- count per day and only so much XP per day.
-- Returns season_pass_sync's answer plus gained (the XP this call gave), {status: too_fast, retry_after} when the
-- source reported less than 30 seconds ago, or {status: bad_source}.
CREATE OR REPLACE FUNCTION public.season_pass_add_xp(p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_last timestamptz;
  v_gap interval := make_interval(secs => public.season_pass_min_gap_seconds());
  v_gained integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;
  IF p_source IS NULL OR p_source NOT IN ('classic', 'chaos', 'challenge', 'level', 'more_win', 'more_play') THEN
    RETURN jsonb_build_object('status', 'bad_source');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  SELECT max(last_at) INTO v_last FROM public.season_pass_daily WHERE profile_id = v_profile.id AND source = p_source;
  IF v_last IS NOT NULL AND v_last > now() - v_gap THEN
    RETURN jsonb_build_object('status', 'too_fast', 'retry_after', ceil(extract(epoch FROM (v_last + v_gap - now())))::integer);
  END IF;

  v_gained := public._season_pass_credit(v_profile.id, p_source, 1);
  RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('gained', v_gained);
END;
$$;
REVOKE ALL ON FUNCTION public.season_pass_add_xp(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_pass_add_xp(text) TO authenticated;

-- Pays one tier of the current season, once. Coins and cosmetics go to the profile, keys to the chest state, a chest
-- is opened on the spot (as the daily reward does: same odds, same prize shape). A cosmetic tier gives the season's
-- skin; with no set for the season, or a skin the player owns already, it pays season_pass_cosmetic_coins instead.
-- Returns the pass as season_pass_sync gives it, plus {status: ok | locked | already | bad_tier | guest |
-- unauthenticated | no_profile} and, for ok: claimed_tier, coins (granted by the tier, a replacement included), keys,
-- chest (open_chest's answer or null), item_id (the skin, or null), duplicate (the skin was owned already), wallet (the
-- balance now), owned_item_ids and state (the chest state).
CREATE OR REPLACE FUNCTION public.season_pass_claim(p_tier integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_season text := public.current_season_key();
  v_profile public.profiles%ROWTYPE;
  v_xp integer;
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
  INSERT INTO public.season_pass_progress (profile_id, season_key) VALUES (v_profile.id, v_season)
  ON CONFLICT (profile_id, season_key) DO NOTHING;
  SELECT xp, claimed_tiers INTO v_xp, v_claimed FROM public.season_pass_progress
   WHERE profile_id = v_profile.id AND season_key = v_season FOR UPDATE;

  IF public.season_pass_tier(v_xp) < p_tier THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'locked');
  END IF;
  IF p_tier = ANY (v_claimed) THEN
    RETURN public._season_pass_state(v_profile.id) || jsonb_build_object('status', 'already');
  END IF;

  v_reward := public.season_pass_reward(p_tier);
  v_owned := COALESCE(v_profile.owned_item_ids, '{}');
  v_coins := COALESCE((v_reward ->> 'coins')::integer, 0);
  v_keys := COALESCE((v_reward ->> 'keys')::integer, 0);

  IF v_reward ? 'cosmetic' THEN
    v_item := public.season_pass_cosmetic(v_season, p_tier);
    IF v_item IS NULL THEN
      v_coins := v_coins + public.season_pass_cosmetic_coins(p_tier);
    ELSIF v_item = ANY (v_owned) THEN
      v_duplicate := true;
      v_coins := v_coins + public.season_pass_cosmetic_coins(p_tier);
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

  UPDATE public.season_pass_progress SET claimed_tiers = array_append(claimed_tiers, p_tier), updated_at = now()
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
REVOKE ALL ON FUNCTION public.season_pass_claim(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_pass_claim(integer) TO authenticated;
