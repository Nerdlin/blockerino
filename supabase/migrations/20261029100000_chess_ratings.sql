-- Chess ratings per time class (bullet, blitz, rapid) with real Elo (Blockerino 2.1).
--
-- Games between two signed-in players are reported by the clients; the server decides when a result counts:
--   * a result the reporter LOST counts at once (nobody lies about their own loss to hurt themselves for gain)
--   * a win or a draw counts when the opponent reports the same result
--   * two different results mark the match "disputed": nothing changes for either player
--   * a win the opponent never answered counts after two minutes, at most DAILY_UNCONFIRMED_LIMIT times a day per
--     player, and only for games of at least eight half-moves (an opponent who closed the app must not cost a win)
-- Elo: K 40 for the first ten games of a class, 20 below 2300, 10 above; start 1000, floor 100. Games against bots
-- are not reported at all. Clients cannot read or write these tables; they call the functions below.

CREATE TABLE IF NOT EXISTS public.chess_ratings (
  profile_id uuid NOT NULL,
  time_class text NOT NULL CHECK (time_class IN ('bullet', 'blitz', 'rapid')),
  rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 100),
  games_played integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, time_class)
);

CREATE TABLE IF NOT EXISTS public.chess_match_reports (
  room_code text NOT NULL,
  reporter_id uuid NOT NULL,
  opponent_id uuid NOT NULL,
  time_class text NOT NULL CHECK (time_class IN ('bullet', 'blitz', 'rapid')),
  reporter_color text NOT NULL CHECK (reporter_color IN ('w', 'b')),
  result text NOT NULL CHECK (result IN ('1-0', '0-1', '1/2-1/2')),
  plies integer NOT NULL CHECK (plies >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, reporter_id)
);

CREATE TABLE IF NOT EXISTS public.chess_matches (
  room_code text PRIMARY KEY,
  time_class text NOT NULL,
  white_id uuid NOT NULL,
  black_id uuid NOT NULL,
  result text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'disputed')),
  white_before integer,
  white_after integer,
  black_before integer,
  black_after integer,
  decided_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chess_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chess_ratings, public.chess_match_reports, public.chess_matches FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_chess_reports_created ON public.chess_match_reports (created_at);

CREATE OR REPLACE FUNCTION public.chess_elo_change(p_rating integer, p_opponent integer, p_score numeric, p_games integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    (CASE WHEN p_games < 10 THEN 40 WHEN p_rating < 2300 THEN 20 ELSE 10 END)
    * (p_score - 1.0 / (1.0 + power(10.0, (p_opponent - p_rating) / 400.0)))
  )::integer;
$$;

-- Applies one decided result to both players. Idempotent: a room code is applied once.
CREATE OR REPLACE FUNCTION public.chess_apply_match(p_room text, p_time_class text, p_white uuid, p_black uuid, p_result text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_white public.chess_ratings%ROWTYPE;
  v_black public.chess_ratings%ROWTYPE;
  v_white_score numeric := CASE p_result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  v_new_white integer;
  v_new_black integer;
  v_inserted integer;
BEGIN
  INSERT INTO public.chess_matches (room_code, time_class, white_id, black_id, result, status)
  VALUES (p_room, p_time_class, p_white, p_black, p_result, 'applied')
  ON CONFLICT (room_code) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN false; END IF;

  INSERT INTO public.chess_ratings (profile_id, time_class) VALUES (p_white, p_time_class), (p_black, p_time_class)
  ON CONFLICT (profile_id, time_class) DO NOTHING;

  -- lock in a fixed order so two matches of the same players cannot deadlock
  PERFORM 1 FROM public.chess_ratings WHERE time_class = p_time_class AND profile_id IN (p_white, p_black) ORDER BY profile_id FOR UPDATE;
  SELECT * INTO v_white FROM public.chess_ratings WHERE profile_id = p_white AND time_class = p_time_class;
  SELECT * INTO v_black FROM public.chess_ratings WHERE profile_id = p_black AND time_class = p_time_class;

  v_new_white := greatest(100, v_white.rating + public.chess_elo_change(v_white.rating, v_black.rating, v_white_score, v_white.games_played));
  v_new_black := greatest(100, v_black.rating + public.chess_elo_change(v_black.rating, v_white.rating, 1 - v_white_score, v_black.games_played));

  UPDATE public.chess_ratings SET
    rating = v_new_white, games_played = games_played + 1, updated_at = now(),
    wins = wins + CASE WHEN p_result = '1-0' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = '0-1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = '1/2-1/2' THEN 1 ELSE 0 END
  WHERE profile_id = p_white AND time_class = p_time_class;
  UPDATE public.chess_ratings SET
    rating = v_new_black, games_played = games_played + 1, updated_at = now(),
    wins = wins + CASE WHEN p_result = '0-1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = '1-0' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = '1/2-1/2' THEN 1 ELSE 0 END
  WHERE profile_id = p_black AND time_class = p_time_class;

  UPDATE public.chess_matches SET white_before = v_white.rating, white_after = v_new_white, black_before = v_black.rating, black_after = v_new_black
  WHERE room_code = p_room;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.chess_apply_match(text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- A client reports how a game it played ended. Returns the state of the match for the caller.
CREATE OR REPLACE FUNCTION public.report_chess_match(p_room_code text, p_time_class text, p_my_color text, p_opponent_name text, p_result text, p_plies integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me public.profiles%ROWTYPE;
  v_opponent public.profiles%ROWTYPE;
  v_other public.chess_match_reports%ROWTYPE;
  v_match public.chess_matches%ROWTYPE;
  v_white uuid;
  v_black uuid;
  v_my_lost boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_time_class NOT IN ('bullet', 'blitz', 'rapid') OR p_my_color NOT IN ('w', 'b') OR p_result NOT IN ('1-0', '0-1', '1/2-1/2') THEN
    RETURN jsonb_build_object('status', 'bad_request');
  END IF;
  IF p_room_code IS NULL OR length(p_room_code) NOT BETWEEN 4 AND 40 THEN RETURN jsonb_build_object('status', 'bad_request'); END IF;
  -- an unfinished or aborted game is not rated: at least two moves each
  IF p_plies IS NULL OR p_plies < 4 THEN RETURN jsonb_build_object('status', 'too_short'); END IF;

  SELECT * INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;
  SELECT * INTO v_opponent FROM public.profiles
    WHERE public.more_game_player_key(player_name) = public.more_game_player_key(p_opponent_name) AND auth_user_id IS NOT NULL AND id <> v_me.id
    LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'opponent_unknown'); END IF;

  v_white := CASE WHEN p_my_color = 'w' THEN v_me.id ELSE v_opponent.id END;
  v_black := CASE WHEN p_my_color = 'w' THEN v_opponent.id ELSE v_me.id END;

  SELECT * INTO v_match FROM public.chess_matches WHERE room_code = p_room_code;
  IF FOUND THEN
    IF v_match.white_id <> v_me.id AND v_match.black_id <> v_me.id THEN RETURN jsonb_build_object('status', 'not_your_match'); END IF;
    RETURN jsonb_build_object('status', v_match.status, 'white_id', v_match.white_id, 'before', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_before ELSE v_match.black_before END,
                              'after', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_after ELSE v_match.black_after END);
  END IF;

  INSERT INTO public.chess_match_reports (room_code, reporter_id, opponent_id, time_class, reporter_color, result, plies)
  VALUES (p_room_code, v_me.id, v_opponent.id, p_time_class, p_my_color, p_result, p_plies)
  ON CONFLICT (room_code, reporter_id) DO NOTHING;

  SELECT * INTO v_other FROM public.chess_match_reports WHERE room_code = p_room_code AND reporter_id = v_opponent.id;

  IF FOUND THEN
    -- both reported: same colours reversed and same result, or a dispute
    IF v_other.result = p_result AND v_other.reporter_color <> p_my_color AND v_other.time_class = p_time_class THEN
      PERFORM public.chess_apply_match(p_room_code, p_time_class, v_white, v_black, p_result);
    ELSE
      INSERT INTO public.chess_matches (room_code, time_class, white_id, black_id, result, status)
      VALUES (p_room_code, p_time_class, v_white, v_black, p_result, 'disputed')
      ON CONFLICT (room_code) DO NOTHING;
    END IF;
  ELSE
    v_my_lost := (p_my_color = 'w' AND p_result = '0-1') OR (p_my_color = 'b' AND p_result = '1-0');
    IF v_my_lost THEN
      PERFORM public.chess_apply_match(p_room_code, p_time_class, v_white, v_black, p_result);
    END IF;
  END IF;

  SELECT * INTO v_match FROM public.chess_matches WHERE room_code = p_room_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pending'); END IF;
  RETURN jsonb_build_object('status', v_match.status,
    'before', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_before ELSE v_match.black_before END,
    'after', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_after ELSE v_match.black_after END);
END;
$$;

REVOKE ALL ON FUNCTION public.report_chess_match(text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_chess_match(text, text, text, text, text, integer) TO authenticated;

-- The caller's rating in each class that has one.
CREATE OR REPLACE FUNCTION public.get_my_chess_ratings()
RETURNS TABLE (time_class text, rating integer, games_played integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.time_class, r.rating, r.games_played
  FROM public.chess_ratings r
  JOIN public.profiles p ON p.id = r.profile_id
  WHERE p.auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_chess_ratings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_chess_ratings() TO authenticated;

-- Settles reports nobody answered: a win the opponent left unchallenged for two minutes counts, with a daily cap.
CREATE OR REPLACE FUNCTION public.settle_chess_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_report public.chess_match_reports%ROWTYPE;
  v_white uuid;
  v_black uuid;
  v_won boolean;
  v_today integer;
  v_applied integer := 0;
BEGIN
  FOR v_report IN
    SELECT r.* FROM public.chess_match_reports r
    WHERE r.created_at < now() - interval '2 minutes' AND r.created_at > now() - interval '1 day' AND r.plies >= 8
      AND NOT EXISTS (SELECT 1 FROM public.chess_matches m WHERE m.room_code = r.room_code)
      AND NOT EXISTS (SELECT 1 FROM public.chess_match_reports o WHERE o.room_code = r.room_code AND o.reporter_id <> r.reporter_id)
    ORDER BY r.created_at
    LIMIT 50
  LOOP
    v_won := (v_report.reporter_color = 'w' AND v_report.result = '1-0') OR (v_report.reporter_color = 'b' AND v_report.result = '0-1');
    CONTINUE WHEN NOT v_won;
    SELECT count(*) INTO v_today FROM public.chess_matches m
      WHERE m.decided_at > now() - interval '1 day' AND m.status = 'applied'
        AND ((m.white_id = v_report.reporter_id AND m.result = '1-0') OR (m.black_id = v_report.reporter_id AND m.result = '0-1'))
        AND NOT EXISTS (SELECT 1 FROM public.chess_match_reports o WHERE o.room_code = m.room_code AND o.reporter_id <> v_report.reporter_id);
    CONTINUE WHEN v_today >= 10;
    v_white := CASE WHEN v_report.reporter_color = 'w' THEN v_report.reporter_id ELSE v_report.opponent_id END;
    v_black := CASE WHEN v_report.reporter_color = 'w' THEN v_report.opponent_id ELSE v_report.reporter_id END;
    IF public.chess_apply_match(v_report.room_code, v_report.time_class, v_white, v_black, v_report.result) THEN
      v_applied := v_applied + 1;
    END IF;
  END LOOP;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_chess_reports() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('settle-chess-reports', '* * * * *', $cron$SELECT public.settle_chess_reports()$cron$);
SELECT cron.schedule('purge-old-chess-reports', '45 3 * * *', $cron$DELETE FROM public.chess_match_reports WHERE created_at < now() - interval '30 days'$cron$);
