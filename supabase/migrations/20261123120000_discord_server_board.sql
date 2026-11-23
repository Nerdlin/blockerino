-- Server leaderboard for the Discord Activity: the best score of a player in a season, kept separately for every Discord server
-- (guild) the game was played in. The client sends the guild id the Discord SDK gives it (discordSdk.guildId); it can not be
-- verified on the server, so it is only checked for its shape ('^\d{5,25}$') and the board is a convenience table, not a prize.
--   * guild_season_scores: written only through submit_guild_score(), read only through get_guild_season_board().
--     Like the other private tables (monthly_quest_claims, ...) it has RLS on and no direct access: a public SELECT policy
--     as on season_scores would let anyone list which servers a profile plays in.
--   * guild_board_opt_out: players who asked not to be shown ("hide me from the server table" in Options). Their results are
--     not stored, their old rows are deleted when they switch it on, and the read function leaves them out.
-- Score limits are the same as for the global season board (max_plausible_score). A season is a UTC month, key 'YYYY-MM'.

CREATE TABLE IF NOT EXISTS public.guild_season_scores (
  season_key text NOT NULL CHECK (season_key ~ '^[0-9]{4}-[0-9]{2}$'),
  guild_id text NOT NULL CHECK (guild_id ~ '^\d{5,25}$'),
  board text NOT NULL CHECK (board IN ('classic', 'chaos')),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_key, guild_id, board, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_season_scores_rank
  ON public.guild_season_scores (season_key, guild_id, board, score DESC, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_guild_season_scores_profile
  ON public.guild_season_scores (profile_id);

CREATE TABLE IF NOT EXISTS public.guild_board_opt_out (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guild_season_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_board_opt_out ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guild_season_scores, public.guild_board_opt_out FROM anon, authenticated;

-- Records the score of a finished run for the caller in the given server. Returns TRUE when the run was handled (stored, or
-- deliberately ignored because the player is hidden), FALSE when it was refused (not signed in, bad input, closed season).
CREATE OR REPLACE FUNCTION public.submit_guild_score(
  p_guild text,
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
  IF p_guild IS NULL OR p_guild !~ '^\d{5,25}$' THEN RETURN FALSE; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score(p_board) THEN RETURN FALSE; END IF;

  PERFORM pg_advisory_xact_lock_shared(hashtext('close_season'));

  IF v_target <> v_current THEN
    IF v_target <> v_previous THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_target) THEN RETURN FALSE; END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM public.guild_board_opt_out WHERE profile_id = v_profile_id) THEN RETURN TRUE; END IF;

  INSERT INTO public.guild_season_scores AS g (season_key, guild_id, board, profile_id, score)
  VALUES (v_target, p_guild, p_board, v_profile_id, p_score)
  ON CONFLICT (season_key, guild_id, board, profile_id) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > g.score;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_guild_score(text, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_guild_score(text, text, integer, timestamptz) TO authenticated;

-- The server's table for the running season: the best p_limit players, plus the caller's own row and the row just above it
-- (so the client can show "your place" and "points to the next place" even outside the top). Hidden players are left out.
CREATE OR REPLACE FUNCTION public.get_guild_season_board(
  p_guild text,
  p_board text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (rank integer, player_name text, avatar_url text, score integer, is_me boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_me uuid;
  v_my_rank integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_guild IS NULL OR p_guild !~ '^\d{5,25}$' THEN RETURN; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN; END IF;

  SELECT id INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();

  RETURN QUERY
  WITH ranked AS (
    SELECT (row_number() OVER (ORDER BY g.score DESC, g.updated_at ASC))::integer AS rk,
           g.profile_id, p.player_name AS name, p.avatar_url AS avatar, g.score AS pts
      FROM public.guild_season_scores g
      JOIN public.profiles p ON p.id = g.profile_id
     WHERE g.season_key = public.current_season_key()
       AND g.guild_id = p_guild
       AND g.board = p_board
       AND NOT EXISTS (SELECT 1 FROM public.guild_board_opt_out o WHERE o.profile_id = g.profile_id)
  ), mine AS (
    SELECT rk FROM ranked WHERE profile_id = v_me
  )
  SELECT r.rk, coalesce(r.name, 'Player'), r.avatar, r.pts, (r.profile_id = v_me)
    FROM ranked r
   WHERE r.rk <= v_limit
      OR r.profile_id = v_me
      OR r.rk = (SELECT m.rk - 1 FROM mine m)
   ORDER BY r.rk;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guild_season_board(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_guild_season_board(text, text, integer) TO authenticated;

-- "Hide me from the server table": on removes the caller's rows for good and keeps new ones from being stored.
CREATE OR REPLACE FUNCTION public.set_server_board_hidden(p_hidden boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  IF coalesce(p_hidden, FALSE) THEN
    INSERT INTO public.guild_board_opt_out (profile_id) VALUES (v_profile_id) ON CONFLICT DO NOTHING;
    DELETE FROM public.guild_season_scores WHERE profile_id = v_profile_id;
  ELSE
    DELETE FROM public.guild_board_opt_out WHERE profile_id = v_profile_id;
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_server_board_hidden(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_server_board_hidden(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_server_board_hidden()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guild_board_opt_out o
      JOIN public.profiles p ON p.id = o.profile_id
     WHERE p.auth_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.get_server_board_hidden() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_server_board_hidden() TO authenticated;
