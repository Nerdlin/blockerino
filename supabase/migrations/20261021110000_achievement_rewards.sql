-- Achievement rewards (Blockerino 2.0). Every achievement tier can be claimed once per account and pays a fixed
-- number of coins. The server owns the coin balance, so the reward table lives here and the client only asks
-- "claim these ids": it cannot pick an amount, and a tier already claimed is never paid twice.
--   * the daily-streak tiers are checked against the server's own streak_best;
--   * the other tiers count things only the device sees (games played, scores), so they are trusted once per
--     tier; the total any account can ever collect this way is 41270 coins.
-- Clients cannot read or write the table; they call claim_achievements(ids) and read the answer.

CREATE TABLE IF NOT EXISTS public.achievement_claims (
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  reward integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.achievement_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievement_claims FROM anon, authenticated;

-- Coins for each tier (kept in step with constants/Achievements.ts; a jest test compares both).
CREATE OR REPLACE FUNCTION public.achievement_reward(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'first_steps' THEN 25
    WHEN 'regular_player' THEN 50
    WHEN 'marathoner' THEN 100
    WHEN 'solo_grinder' THEN 200
    WHEN 'solo_veteran' THEN 400
    WHEN 'score_hunter' THEN 50
    WHEN 'block_master' THEN 150
    WHEN 'score_legend' THEN 300
    WHEN 'score_titan' THEN 750
    WHEN 'score_myth' THEN 2000
    WHEN 'line_breaker' THEN 25
    WHEN 'line_crusher' THEN 75
    WHEN 'line_engineer' THEN 150
    WHEN 'line_tycoon' THEN 300
    WHEN 'line_myth' THEN 750
    WHEN 'steady_hands' THEN 25
    WHEN 'piece_architect' THEN 75
    WHEN 'piece_builder' THEN 150
    WHEN 'piece_factory' THEN 300
    WHEN 'piece_city' THEN 600
    WHEN 'comeback' THEN 20
    WHEN 'second_wind' THEN 50
    WHEN 'classic_riser' THEN 75
    WHEN 'classic_peak' THEN 300
    WHEN 'classic_orbit' THEN 800
    WHEN 'chaos_tamer' THEN 75
    WHEN 'chaos_champion' THEN 250
    WHEN 'chaos_overlord' THEN 600
    WHEN 'speed_spark' THEN 50
    WHEN 'speed_streak' THEN 100
    WHEN 'speed_flash' THEN 300
    WHEN 'speed_blazer' THEN 600
    WHEN 'daily_solver' THEN 50
    WHEN 'daily_regular' THEN 150
    WHEN 'daily_elite' THEN 400
    WHEN 'move_planner' THEN 50
    WHEN 'move_tactician' THEN 150
    WHEN 'move_mastermind' THEN 400
    WHEN 'mode_sampler' THEN 150
    WHEN 'score_collector' THEN 100
    WHEN 'score_vault' THEN 300
    WHEN 'solo_legend' THEN 1500
    WHEN 'first_duel' THEN 50
    WHEN 'duelist' THEN 150
    WHEN 'arena_veteran' THEN 500
    WHEN 'arena_legend' THEN 1500
    WHEN 'sparring_partner' THEN 50
    WHEN 'regular_rival' THEN 150
    WHEN 'pawn_pusher' THEN 50
    WHEN 'knight_rider' THEN 200
    WHEN 'chess_master' THEN 750
    WHEN 'deckhand' THEN 50
    WHEN 'sea_captain' THEN 200
    WHEN 'admiral' THEN 750
    WHEN 'card_rookie' THEN 50
    WHEN 'card_shark' THEN 200
    WHEN 'never_the_fool' THEN 750
    WHEN 'crosses_and_noughts' THEN 50
    WHEN 'three_in_a_row' THEN 150
    WHEN 'tic_tac_pro' THEN 500
    WHEN 'number_novice' THEN 50
    WHEN 'number_cruncher' THEN 200
    WHEN 'sudoku_sage' THEN 750
    WHEN 'tile_turner' THEN 50
    WHEN 'tile_master' THEN 200
    WHEN 'mahjong_sage' THEN 750
    WHEN 'sparring_bot' THEN 25
    WHEN 'bot_basher' THEN 100
    WHEN 'bot_buster' THEN 400
    WHEN 'tough_nut' THEN 100
    WHEN 'machine_breaker' THEN 300
    WHEN 'terminator' THEN 800
    WHEN 'game_hopper' THEN 100
    WHEN 'all_rounder' THEN 300
    WHEN 'jack_of_all_games' THEN 1000
    WHEN 'piggy_bank' THEN 100
    WHEN 'coin_stack' THEN 250
    WHEN 'treasure_chest' THEN 750
    WHEN 'tycoon' THEN 2500
    WHEN 'royal_mint' THEN 10000
    WHEN 'good_habit' THEN 50
    WHEN 'week_warrior' THEN 100
    WHEN 'fortnight_fighter' THEN 250
    WHEN 'monthly_devotion' THEN 600
    WHEN 'centurion' THEN 2500
    ELSE NULL
  END
$$;

-- Streak length a streak tier needs; NULL for tiers the server cannot check.
CREATE OR REPLACE FUNCTION public.achievement_streak_requirement(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'good_habit' THEN 3
    WHEN 'week_warrior' THEN 7
    WHEN 'fortnight_fighter' THEN 14
    WHEN 'monthly_devotion' THEN 30
    WHEN 'centurion' THEN 100
    ELSE NULL
  END
$$;

-- Claims the given achievement ids (an empty list only reads the state). Returns
-- {status: ok | unauthenticated | no_profile, coins, granted: [ids paid now], claimed: [every id claimed so far]}.
CREATE OR REPLACE FUNCTION public.claim_achievements(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_id text;
  v_reward integer;
  v_required integer;
  v_total integer := 0;
  v_granted text[] := ARRAY[]::text[];
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  FOR v_id IN SELECT DISTINCT unnest(coalesce(p_ids, ARRAY[]::text[])) LIMIT 100 LOOP
    v_reward := public.achievement_reward(v_id);
    CONTINUE WHEN v_reward IS NULL;

    v_required := public.achievement_streak_requirement(v_id);
    CONTINUE WHEN v_required IS NOT NULL AND coalesce(v_profile.streak_best, 0) < v_required;

    INSERT INTO public.achievement_claims (user_id, achievement_id, reward)
    VALUES (auth.uid(), v_id, v_reward)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      v_total := v_total + v_reward;
      v_granted := v_granted || v_id;
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    UPDATE public.profiles SET coins = coins + v_total WHERE id = v_profile.id RETURNING coins INTO v_profile.coins;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'coins', v_profile.coins,
    'granted', to_jsonb(v_granted),
    'claimed', coalesce((SELECT jsonb_agg(achievement_id ORDER BY achievement_id) FROM public.achievement_claims WHERE user_id = auth.uid()), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_achievements(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_achievements(text[]) TO authenticated;
