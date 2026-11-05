-- Blockerino 2.0.7: twelve new achievement tiers and a Daily Puzzle board per day.
-- Additive only: older app versions never claim the new ids and never call the new functions.
--   * achievement_reward() gains the checkers, Daily Puzzle streak, challenge star and Versus rank tiers
--     (checkers_rookie, checkers_captain, checkers_grandmaster, daily_habit, daily_devotee, daily_legend, star_gazer, star_collector, star_master, rank_gold, rank_diamond, rank_legend);
--     the total any account can collect grows to 46220 coins;
--   * daily_puzzle_scores keeps each player's best Daily Puzzle score per puzzle day. The day is the player's
--     local date (the puzzle is seeded with it), so the server accepts yesterday, today and tomorrow in UTC.

CREATE OR REPLACE FUNCTION public.achievement_reward(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'first_steps' THEN 25
    WHEN 'regular_player' THEN 50
    WHEN 'marathoner' THEN 100
    WHEN 'score_hunter' THEN 50
    WHEN 'block_master' THEN 150
    WHEN 'score_legend' THEN 300
    WHEN 'line_breaker' THEN 25
    WHEN 'line_crusher' THEN 75
    WHEN 'steady_hands' THEN 25
    WHEN 'piece_architect' THEN 75
    WHEN 'comeback' THEN 20
    WHEN 'second_wind' THEN 50
    WHEN 'classic_riser' THEN 75
    WHEN 'chaos_tamer' THEN 75
    WHEN 'chaos_champion' THEN 250
    WHEN 'speed_spark' THEN 50
    WHEN 'speed_streak' THEN 100
    WHEN 'daily_solver' THEN 50
    WHEN 'move_planner' THEN 50
    WHEN 'mode_sampler' THEN 150
    WHEN 'score_collector' THEN 100
    WHEN 'solo_grinder' THEN 200
    WHEN 'solo_veteran' THEN 400
    WHEN 'line_engineer' THEN 150
    WHEN 'line_tycoon' THEN 300
    WHEN 'line_myth' THEN 750
    WHEN 'piece_builder' THEN 150
    WHEN 'piece_factory' THEN 300
    WHEN 'piece_city' THEN 600
    WHEN 'score_titan' THEN 750
    WHEN 'score_myth' THEN 2000
    WHEN 'classic_peak' THEN 300
    WHEN 'classic_orbit' THEN 800
    WHEN 'chaos_overlord' THEN 600
    WHEN 'speed_flash' THEN 300
    WHEN 'speed_blazer' THEN 600
    WHEN 'daily_regular' THEN 150
    WHEN 'daily_elite' THEN 400
    WHEN 'move_tactician' THEN 150
    WHEN 'move_mastermind' THEN 400
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
    WHEN 'checkers_rookie' THEN 50
    WHEN 'checkers_captain' THEN 200
    WHEN 'checkers_grandmaster' THEN 750
    WHEN 'daily_habit' THEN 50
    WHEN 'daily_devotee' THEN 150
    WHEN 'daily_legend' THEN 750
    WHEN 'star_gazer' THEN 100
    WHEN 'star_collector' THEN 250
    WHEN 'star_master' THEN 600
    WHEN 'rank_gold' THEN 150
    WHEN 'rank_diamond' THEN 400
    WHEN 'rank_legend' THEN 1500
    ELSE NULL
  END
$$;

CREATE TABLE IF NOT EXISTS public.daily_puzzle_scores (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  score integer NOT NULL CHECK (score > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_puzzle_scores_day_score ON public.daily_puzzle_scores (day, score DESC);

ALTER TABLE public.daily_puzzle_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_puzzle_scores FROM anon, authenticated;

-- Keeps the best score of the puzzle day (the all-time best still goes through submit_high_score).
CREATE OR REPLACE FUNCTION public.submit_daily_puzzle_score(p_day date, p_score integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_day IS NULL OR p_day < v_today - 1 OR p_day > v_today + 1 THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score('daily') THEN RETURN FALSE; END IF;

  INSERT INTO public.daily_puzzle_scores (user_id, day, score)
  VALUES (auth.uid(), p_day, p_score)
  ON CONFLICT (user_id, day) DO UPDATE
    SET score = GREATEST(daily_puzzle_scores.score, EXCLUDED.score),
        updated_at = CASE WHEN EXCLUDED.score > daily_puzzle_scores.score THEN now() ELSE daily_puzzle_scores.updated_at END;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_daily_puzzle_score(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_puzzle_score(date, integer) TO authenticated;

-- The best scores of one puzzle day: [{player_name, avatar_url, score, updated_at, is_me}], best first.
CREATE OR REPLACE FUNCTION public.get_daily_puzzle_leaderboard(p_day date, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'player_name', top.player_name, 'avatar_url', top.avatar_url, 'score', top.score,
             'updated_at', top.updated_at, 'is_me', top.is_me) ORDER BY top.score DESC, top.updated_at)
      FROM (
        SELECT p.player_name, p.avatar_url, s.score, s.updated_at, s.user_id = auth.uid() AS is_me
          FROM public.daily_puzzle_scores s
          JOIN public.profiles p ON p.auth_user_id = s.user_id
         WHERE s.day = p_day
         ORDER BY s.score DESC, s.updated_at
         LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
      ) top
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_puzzle_leaderboard(date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_puzzle_leaderboard(date, integer) TO anon, authenticated;
