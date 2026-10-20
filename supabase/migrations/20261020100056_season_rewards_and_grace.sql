-- Season rewards, a one-day grace window for late runs, and a safer close_season().
--   * season_rewards: coins / exclusive item per top-10 place, written only by close_season()
--     and handed out exactly once through claim_season_rewards().
--   * submit_season_score(): a run of the previous month is still accepted until that season
--     is closed, so the last evening of a month is not lost (the close job now runs on the 2nd).
--   * close_season(): closes the previous UTC month, snapshots top 10, writes rewards, halves elo.

CREATE TABLE IF NOT EXISTS public.season_rewards (
  season_key text NOT NULL,
  board text NOT NULL CHECK (board IN ('classic', 'chaos', 'elo')),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  coins integer NOT NULL CHECK (coins >= 0),
  item_id text,
  claimed_at timestamptz,
  PRIMARY KEY (season_key, board, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_season_rewards_unclaimed
  ON public.season_rewards (profile_id) WHERE claimed_at IS NULL;

ALTER TABLE public.season_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_rewards FROM anon, authenticated;

-- Coins for a final place (1-based).
CREATE OR REPLACE FUNCTION public.season_reward_coins(p_rank integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_rank = 1 THEN 1000
    WHEN p_rank = 2 THEN 700
    WHEN p_rank = 3 THEN 500
    WHEN p_rank <= 5 THEN 300
    WHEN p_rank <= 10 THEN 150
    ELSE 0
  END;
$$;

-- Exclusive cosmetic for a podium place; NULL below the top 3.
CREATE OR REPLACE FUNCTION public.season_reward_item(p_rank integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_rank = 1 THEN 'background_season_gold'
    WHEN p_rank = 2 THEN 'background_season_silver'
    WHEN p_rank = 3 THEN 'background_season_bronze'
    ELSE NULL
  END;
$$;

-- Runs of the previous month are accepted until close_season() has closed that season.
CREATE OR REPLACE FUNCTION public.submit_season_score(
  p_board text,
  p_score integer,
  p_achieved_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_current text := public.current_season_key();
  v_target text := to_char(LEAST(p_achieved_at, now()) AT TIME ZONE 'utc', 'YYYY-MM');
  v_previous text := to_char((now() AT TIME ZONE 'utc') - interval '1 month', 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 THEN RETURN FALSE; END IF;

  -- Shared lock: a run cannot slip into a season while close_season() snapshots it.
  PERFORM pg_advisory_xact_lock_shared(hashtext('close_season'));

  IF v_target <> v_current THEN
    IF v_target <> v_previous THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_target) THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.season_scores AS s (season_key, board, profile_id, score)
  VALUES (v_target, p_board, v_profile_id, p_score)
  ON CONFLICT (season_key, board, profile_id) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > s.score;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_season_score(text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_season_score(text, integer, timestamptz) TO authenticated;

-- Closes the previous calendar month: snapshots the top 10 of every board, writes rewards,
-- then halves elo. Safe to call repeatedly; a season is closed only once.
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

  INSERT INTO public.season_rewards (season_key, board, profile_id, rank, coins, item_id)
  SELECT r.season_key, r.board, r.profile_id, r.rank,
         public.season_reward_coins(r.rank), public.season_reward_item(r.rank)
  FROM public.season_results r
  WHERE r.season_key = v_key AND r.profile_id IS NOT NULL
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

-- Hands out the caller's unclaimed rewards exactly once and returns what they are.
-- The client applies coins and items to the shop state, which it owns.
CREATE OR REPLACE FUNCTION public.claim_season_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_entries jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN NULL; END IF;

  WITH claimed AS (
    UPDATE public.season_rewards
    SET claimed_at = now()
    WHERE profile_id = v_profile_id AND claimed_at IS NULL
    RETURNING season_key, board, rank, coins, item_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'season_key', season_key, 'board', board, 'rank', rank, 'coins', coins, 'item_id', item_id
         ) ORDER BY season_key, board), '[]'::jsonb)
  INTO v_entries
  FROM claimed;

  RETURN jsonb_build_object('entries', v_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_season_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_season_rewards() TO authenticated;

-- Close on the 2nd (00:05 UTC) so the last evening of the month can still be submitted.
SELECT cron.schedule('close-season', '5 0 2 * *', 'SELECT public.close_season()');
