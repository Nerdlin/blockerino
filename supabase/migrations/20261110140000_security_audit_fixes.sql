-- Security audit 2026-11 (findings B1-B3, C1-C3 and the low-risk hardening of the audit draft).
-- One player must not be able to change another player's rating, coins or friendships on their own word.

------------------------------------------------------------------------------------------------------------
-- C1. A friend request could be accepted by its own sender: the UPDATE policy let the sender swap
-- user_id_1/user_id_2 and then pass the "recipient accepts" check. Only the recipient may accept, and the
-- two sides of a row never change.
------------------------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their friend requests" ON public.friends;
DROP POLICY IF EXISTS "Recipient can accept a friend request" ON public.friends;
CREATE POLICY "Recipient can accept a friend request" ON public.friends
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id_2)
  WITH CHECK ((SELECT auth.uid()) = user_id_2 AND status = 'accepted');

CREATE OR REPLACE FUNCTION public.friends_sides_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id_1 IS DISTINCT FROM OLD.user_id_1 OR NEW.user_id_2 IS DISTINCT FROM OLD.user_id_2 THEN
    RAISE EXCEPTION 'The two sides of a friendship cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friends_sides_guard ON public.friends;
CREATE TRIGGER trg_friends_sides_guard
  BEFORE UPDATE ON public.friends
  FOR EACH ROW EXECUTE FUNCTION public.friends_sides_guard();

------------------------------------------------------------------------------------------------------------
-- C2. Login details were readable by anyone through profiles. They move to a table without policies (only
-- the server reads it); writes from old builds and the Discord function still land there through a trigger.
-- Match history is readable by its own players only.
------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_logins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_login_at timestamptz,
  login_providers text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_logins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_logins FROM anon, authenticated;

INSERT INTO public.profile_logins (profile_id, last_login_at, login_providers)
SELECT id, last_login_at, login_providers FROM public.profiles
WHERE last_login_at IS NOT NULL OR login_providers IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE SET
  last_login_at = EXCLUDED.last_login_at, login_providers = EXCLUDED.login_providers, updated_at = now();

CREATE OR REPLACE FUNCTION public.profiles_move_login_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_login_at IS NOT NULL OR NEW.login_providers IS NOT NULL THEN
    INSERT INTO public.profile_logins (profile_id, last_login_at, login_providers)
    VALUES (NEW.id, NEW.last_login_at, NEW.login_providers)
    ON CONFLICT (profile_id) DO UPDATE SET
      last_login_at = COALESCE(EXCLUDED.last_login_at, public.profile_logins.last_login_at),
      login_providers = COALESCE(EXCLUDED.login_providers, public.profile_logins.login_providers),
      updated_at = now();
  END IF;
  NEW.last_login_at := NULL;
  NEW.login_providers := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_move_login_details() FROM PUBLIC, anon, authenticated;

-- Updates are caught before they land; a new profile row is cleaned up right after its insert (the
-- profile_logins row needs the profile to exist for its foreign key).
DROP TRIGGER IF EXISTS trg_profiles_move_login_details ON public.profiles;
CREATE TRIGGER trg_profiles_move_login_details
  BEFORE UPDATE OF last_login_at, login_providers ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_move_login_details();

CREATE OR REPLACE FUNCTION public.profiles_move_login_details_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_login_at IS NOT NULL OR NEW.login_providers IS NOT NULL THEN
    INSERT INTO public.profile_logins (profile_id, last_login_at, login_providers)
    VALUES (NEW.id, NEW.last_login_at, NEW.login_providers)
    ON CONFLICT (profile_id) DO UPDATE SET
      last_login_at = EXCLUDED.last_login_at, login_providers = EXCLUDED.login_providers, updated_at = now();
    UPDATE public.profiles SET last_login_at = NULL, login_providers = NULL WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_move_login_details_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_move_login_details_insert ON public.profiles;
CREATE TRIGGER trg_profiles_move_login_details_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_move_login_details_after_insert();

UPDATE public.profiles SET last_login_at = NULL, login_providers = NULL
WHERE last_login_at IS NOT NULL OR login_providers IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can read match history" ON public.match_history;
DROP POLICY IF EXISTS "Players read their own match history" ON public.match_history;
CREATE POLICY "Players read their own match history" ON public.match_history
  FOR SELECT
  USING ((SELECT auth.uid())::text = player1_id OR (SELECT auth.uid())::text = player2_id);

------------------------------------------------------------------------------------------------------------
-- B1. Chess: a "win" over any player could be reported by name for a game that never happened.
-- The server now records who sat in a room (quick match pairs both players; friend games call
-- chess_join_game when both are at the board). A one-sided result is only applied when both players were
-- seated, and one pair of players is rated at most 10 times a day.
------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chess_room_seats (
  room_code text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, profile_id)
);
ALTER TABLE public.chess_room_seats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chess_room_seats FROM anon, authenticated;

ALTER TABLE public.chess_matches DROP CONSTRAINT IF EXISTS chess_matches_status_check;
ALTER TABLE public.chess_matches ADD CONSTRAINT chess_matches_status_check
  CHECK (status = ANY (ARRAY['applied'::text, 'disputed'::text, 'capped'::text]));

-- "ABCD1234-3" (the third game of a room) belongs to room "ABCD1234".
CREATE OR REPLACE FUNCTION public.chess_room_base(p_room_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT regexp_replace(upper(coalesce(p_room_code, '')), '-[0-9]+$', '') $$;

CREATE OR REPLACE FUNCTION public.chess_both_seated(p_room_code text, p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM public.chess_room_seats s
          WHERE s.room_code = public.chess_room_base(p_room_code) AND s.profile_id IN (p_a, p_b)) = 2
$$;
REVOKE ALL ON FUNCTION public.chess_both_seated(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.chess_join_game(p_room_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_room text := public.chess_room_base(p_room_code);
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF length(v_room) NOT BETWEEN 4 AND 40 THEN RETURN jsonb_build_object('status', 'bad_request'); END IF;
  SELECT id INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_me IS NULL THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('chess_seat:' || v_room));
  IF EXISTS (SELECT 1 FROM public.chess_room_seats WHERE room_code = v_room AND profile_id = v_me) THEN
    RETURN jsonb_build_object('status', 'seated');
  END IF;
  IF (SELECT count(*) FROM public.chess_room_seats WHERE room_code = v_room) >= 2 THEN
    RETURN jsonb_build_object('status', 'full');
  END IF;
  INSERT INTO public.chess_room_seats (room_code, profile_id) VALUES (v_room, v_me);
  DELETE FROM public.chess_room_seats WHERE joined_at < now() - interval '3 days';
  RETURN jsonb_build_object('status', 'seated');
END;
$$;
REVOKE ALL ON FUNCTION public.chess_join_game(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chess_join_game(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.chess_quick_match(p_control text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me public.profiles%ROWTYPE;
  v_base integer;
  v_inc integer;
  v_class text;
  v_rating integer;
  v_joined timestamptz;
  v_my_window integer;
  v_pair public.chess_pairings%ROWTYPE;
  v_opp public.chess_queue%ROWTYPE;
  v_code text;
  v_my_color text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_control IS NULL OR p_control !~ '^[0-9]{2,5}\+[0-9]{1,3}$' THEN RETURN jsonb_build_object('status', 'bad_request'); END IF;
  v_base := split_part(p_control, '+', 1)::integer;
  v_inc := split_part(p_control, '+', 2)::integer;
  IF v_base < 30 OR v_base > 10800 OR v_inc > 180 THEN RETURN jsonb_build_object('status', 'bad_request'); END IF;
  v_class := CASE WHEN v_base + 40 * v_inc < 180 THEN 'bullet' WHEN v_base + 40 * v_inc < 480 THEN 'blitz' ELSE 'rapid' END;

  SELECT * INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('chess_match:' || p_control));

  -- the other side may already have paired us
  SELECT * INTO v_pair FROM public.chess_pairings WHERE profile_id = v_me.id;
  IF FOUND THEN
    DELETE FROM public.chess_pairings WHERE profile_id = v_me.id;
    IF v_pair.created_at > now() - interval '2 minutes' THEN
      DELETE FROM public.chess_queue WHERE profile_id = v_me.id;
      RETURN jsonb_build_object('status', 'matched', 'code', v_pair.room_code, 'color', v_pair.color, 'opponent', v_pair.opponent_name, 'control', v_pair.control);
    END IF;
  END IF;

  DELETE FROM public.chess_queue WHERE seen_at < now() - interval '15 seconds';

  v_rating := coalesce((SELECT r.rating FROM public.chess_ratings r WHERE r.profile_id = v_me.id AND r.time_class = v_class), 400);

  INSERT INTO public.chess_queue (profile_id, control, rating, name)
  VALUES (v_me.id, p_control, v_rating, v_me.player_name)
  ON CONFLICT (profile_id) DO UPDATE SET
    joined_at = CASE WHEN public.chess_queue.control = EXCLUDED.control THEN public.chess_queue.joined_at ELSE now() END,
    control = EXCLUDED.control,
    rating = EXCLUDED.rating,
    name = EXCLUDED.name,
    seen_at = now();

  SELECT q.joined_at INTO v_joined FROM public.chess_queue q WHERE q.profile_id = v_me.id;
  v_my_window := least(600, 150 + 30 * floor(extract(epoch FROM (now() - v_joined)))::integer);

  SELECT * INTO v_opp FROM public.chess_queue q
  WHERE q.profile_id <> v_me.id
    AND q.control = p_control
    AND abs(q.rating - v_rating) <= greatest(v_my_window, least(600, 150 + 30 * floor(extract(epoch FROM (now() - q.joined_at)))::integer))
  ORDER BY abs(q.rating - v_rating), q.joined_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'searching', 'waited', floor(extract(epoch FROM (now() - v_joined)))::integer);
  END IF;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_my_color := CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END;
  DELETE FROM public.chess_queue WHERE profile_id IN (v_me.id, v_opp.profile_id);
  INSERT INTO public.chess_pairings (profile_id, room_code, color, opponent_name, control)
  VALUES (v_opp.profile_id, v_code, CASE WHEN v_my_color = 'w' THEN 'b' ELSE 'w' END, v_me.player_name, p_control)
  ON CONFLICT (profile_id) DO UPDATE SET
    room_code = EXCLUDED.room_code, color = EXCLUDED.color, opponent_name = EXCLUDED.opponent_name, control = EXCLUDED.control, created_at = now();
  -- both players of a quick match are seated by the server itself
  INSERT INTO public.chess_room_seats (room_code, profile_id)
  VALUES (v_code, v_me.id), (v_code, v_opp.profile_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'matched', 'code', v_code, 'color', v_my_color, 'opponent', v_opp.name, 'control', p_control);
END;
$function$;

CREATE OR REPLACE FUNCTION public.chess_apply_match(p_room text, p_time_class text, p_white uuid, p_black uuid, p_result text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_white public.chess_ratings%ROWTYPE;
  v_black public.chess_ratings%ROWTYPE;
  v_white_score numeric := CASE p_result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  v_new_white integer;
  v_new_black integer;
  v_inserted integer;
  v_pair_today integer;
BEGIN
  -- one pair of players is rated at most 10 times a day, so a second account cannot feed a main one
  SELECT count(*) INTO v_pair_today FROM public.chess_matches m
  WHERE m.status = 'applied' AND m.decided_at > now() - interval '1 day'
    AND ((m.white_id = p_white AND m.black_id = p_black) OR (m.white_id = p_black AND m.black_id = p_white));
  IF v_pair_today >= 10 THEN
    INSERT INTO public.chess_matches (room_code, time_class, white_id, black_id, result, status)
    VALUES (p_room, p_time_class, p_white, p_black, p_result, 'capped')
    ON CONFLICT (room_code) DO NOTHING;
    RETURN false;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.report_chess_match(p_room_code text, p_time_class text, p_my_color text, p_opponent_name text, p_result text, p_plies integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN jsonb_build_object('status', CASE WHEN v_match.status = 'capped' THEN 'pending' ELSE v_match.status END, 'white_id', v_match.white_id,
                              'before', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_before ELSE v_match.black_before END,
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
    -- a loss on one's own word is applied at once, but only for a game the server saw both players sit down to
    v_my_lost := (p_my_color = 'w' AND p_result = '0-1') OR (p_my_color = 'b' AND p_result = '1-0');
    IF v_my_lost AND public.chess_both_seated(p_room_code, v_me.id, v_opponent.id) THEN
      PERFORM public.chess_apply_match(p_room_code, p_time_class, v_white, v_black, p_result);
    END IF;
  END IF;

  SELECT * INTO v_match FROM public.chess_matches WHERE room_code = p_room_code;
  IF NOT FOUND OR v_match.status = 'capped' THEN RETURN jsonb_build_object('status', 'pending'); END IF;
  RETURN jsonb_build_object('status', v_match.status,
    'before', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_before ELSE v_match.black_before END,
    'after', CASE WHEN v_match.white_id = v_me.id THEN v_match.white_after ELSE v_match.black_after END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_chess_reports()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- an opponent who went silent is only judged when the server saw both players at the board
      AND public.chess_both_seated(r.room_code, r.reporter_id, r.opponent_id)
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
$function$;

------------------------------------------------------------------------------------------------------------
-- B2. Mini-game ratings: any player could record wins over anyone by name, without limit.
-- Now a decisive result changes ratings only when the LOSER reports it (every client reports its own
-- games); a draw needs both players. The opponent must be a real account, a room code is required, and one
-- pair is rated at most 10 times a day per game. Solo boards (sudoku, mahjong): at most one result per 30
-- seconds and 30 a day.
------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.more_game_draw_reports (
  game_id text NOT NULL,
  room_code text NOT NULL,
  reporter_key text NOT NULL,
  opponent_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, room_code, reporter_key, opponent_key)
);
ALTER TABLE public.more_game_draw_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.more_game_draw_reports FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_more_game_match(p_game_id text, p_player1_name text, p_player2_name text, p_result text, p_room_code text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(player_name text, player_key text, elo integer, old_elo integer, elo_change integer, wins integer, losses integer, draws integer, games_played integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_player1_name TEXT := public.normalize_more_game_player_name(p_player1_name);
  v_player2_name TEXT := public.normalize_more_game_player_name(p_player2_name);
  v_player1_key TEXT := public.more_game_player_key(p_player1_name);
  v_player2_key TEXT := public.more_game_player_key(p_player2_name);
  v_caller_name TEXT;
  v_caller_key TEXT;
  v_opponent_key TEXT;
  v_caller_lost BOOLEAN;
  v_pair_today INTEGER;
  v_player1 public.more_game_ratings%ROWTYPE;
  v_player2 public.more_game_ratings%ROWTYPE;
  v_player1_after public.more_game_ratings%ROWTYPE;
  v_player2_after public.more_game_ratings%ROWTYPE;
  v_new_elo1 INTEGER;
  v_new_elo2 INTEGER;
  v_delta1 INTEGER;
  v_delta2 INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a match' USING ERRCODE = '28000';
  END IF;

  SELECT p.player_name INTO v_caller_name FROM public.profiles p WHERE p.auth_user_id = auth.uid();
  v_caller_key := public.more_game_player_key(v_caller_name);
  IF v_caller_name IS NULL OR v_caller_key NOT IN (v_player1_key, v_player2_key) THEN
    RAISE EXCEPTION 'Only a player of the match can record its result' USING ERRCODE = '42501';
  END IF;

  -- chess has its own rating; sudoku and mahjong are solo boards
  IF p_game_id NOT IN ('battleship', 'durak', 'tictactoe', 'checkers') THEN
    RAISE EXCEPTION 'Unsupported more game id: %', p_game_id;
  END IF;

  IF v_player1_name IS NULL OR v_player2_name IS NULL THEN
    RAISE EXCEPTION 'Both player names are required';
  END IF;

  IF v_player1_key = v_player2_key THEN
    RAISE EXCEPTION 'Players must be different';
  END IF;

  IF p_result NOT IN ('player1', 'player2', 'draw') THEN
    RAISE EXCEPTION 'Unsupported result: %', p_result;
  END IF;

  IF p_room_code IS NULL OR length(p_room_code) NOT BETWEEN 3 AND 80 THEN RETURN; END IF;

  v_opponent_key := CASE WHEN v_caller_key = v_player1_key THEN v_player2_key ELSE v_player1_key END;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE public.more_game_player_key(p.player_name) = v_opponent_key AND p.auth_user_id IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  v_caller_lost := (p_result = 'player1' AND v_caller_key = v_player2_key) OR (p_result = 'player2' AND v_caller_key = v_player1_key);

  IF p_result = 'draw' THEN
    DELETE FROM public.more_game_draw_reports r WHERE r.created_at < now() - interval '1 day';
    DELETE FROM public.more_game_draw_reports r
    WHERE r.game_id = p_game_id AND r.room_code = p_room_code AND r.reporter_key = v_opponent_key AND r.opponent_key = v_caller_key
      AND r.created_at > now() - interval '15 minutes';
    IF NOT FOUND THEN
      INSERT INTO public.more_game_draw_reports (game_id, room_code, reporter_key, opponent_key)
      VALUES (p_game_id, p_room_code, v_caller_key, v_opponent_key)
      ON CONFLICT (game_id, room_code, reporter_key, opponent_key) DO UPDATE SET created_at = now();
      RETURN;
    END IF;
  ELSIF NOT v_caller_lost THEN
    -- a win is counted when the loser's own game reports the loss
    RETURN;
  END IF;

  SELECT count(*) INTO v_pair_today FROM public.more_game_match_history h
  WHERE h.game_id = p_game_id AND h.created_at > now() - interval '1 day'
    AND ((h.player1_key = v_player1_key AND h.player2_key = v_player2_key) OR (h.player1_key = v_player2_key AND h.player2_key = v_player1_key));
  IF v_pair_today >= 10 THEN RETURN; END IF;

  INSERT INTO public.more_game_ratings (game_id, player_key, player_name)
  VALUES
    (p_game_id, v_player1_key, v_player1_name),
    (p_game_id, v_player2_key, v_player2_name)
  ON CONFLICT (game_id, player_key)
  DO UPDATE SET player_name = EXCLUDED.player_name;

  SELECT * INTO v_player1
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player1_key
  FOR UPDATE;

  SELECT * INTO v_player2
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player2_key
  FOR UPDATE;

  v_delta1 := CASE WHEN p_result = 'player1' THEN 10 WHEN p_result = 'player2' THEN -10 ELSE 0 END;
  v_delta2 := CASE WHEN p_result = 'player2' THEN 10 WHEN p_result = 'player1' THEN -10 ELSE 0 END;
  v_new_elo1 := GREATEST(0, v_player1.elo + v_delta1);
  v_new_elo2 := GREATEST(0, v_player2.elo + v_delta2);

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo1,
    wins = wins + CASE WHEN p_result = 'player1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = 'player2' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_result = 'player1' THEN 'win' WHEN p_result = 'player2' THEN 'loss' ELSE 'draw' END,
    last_played_at = NOW(),
    player_name = v_player1_name
  WHERE id = v_player1.id
  RETURNING * INTO v_player1_after;

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo2,
    wins = wins + CASE WHEN p_result = 'player2' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_result = 'player1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_result = 'player2' THEN 'win' WHEN p_result = 'player1' THEN 'loss' ELSE 'draw' END,
    last_played_at = NOW(),
    player_name = v_player2_name
  WHERE id = v_player2.id
  RETURNING * INTO v_player2_after;

  INSERT INTO public.more_game_match_history (
    game_id, room_code, player1_key, player1_name, player2_key, player2_name, result, winner_key,
    player1_elo_before, player1_elo_after, player1_elo_change,
    player2_elo_before, player2_elo_after, player2_elo_change, metadata
  )
  VALUES (
    p_game_id, p_room_code, v_player1_key, v_player1_name, v_player2_key, v_player2_name, p_result,
    CASE WHEN p_result = 'player1' THEN v_player1_key WHEN p_result = 'player2' THEN v_player2_key ELSE NULL END,
    v_player1.elo, v_player1_after.elo, v_player1_after.elo - v_player1.elo,
    v_player2.elo, v_player2_after.elo, v_player2_after.elo - v_player2.elo,
    COALESCE(p_metadata, '{}'::JSONB)
  );

  RETURN QUERY
  SELECT v_player1_after.player_name, v_player1_after.player_key, v_player1_after.elo, v_player1.elo, v_player1_after.elo - v_player1.elo, v_player1_after.wins, v_player1_after.losses, v_player1_after.draws, v_player1_after.games_played
  UNION ALL
  SELECT v_player2_after.player_name, v_player2_after.player_key, v_player2_after.elo, v_player2.elo, v_player2_after.elo - v_player2.elo, v_player2_after.wins, v_player2_after.losses, v_player2_after.draws, v_player2_after.games_played;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_more_game_solo_result(p_game_id text, p_player_name text, p_won boolean DEFAULT true, p_score integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(player_name text, player_key text, elo integer, old_elo integer, elo_change integer, wins integer, losses integer, draws integer, games_played integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_player_name TEXT := public.normalize_more_game_player_name(p_player_name);
  v_player_key TEXT := public.more_game_player_key(p_player_name);
  v_caller_name TEXT;
  v_player public.more_game_ratings%ROWTYPE;
  v_player_after public.more_game_ratings%ROWTYPE;
  v_new_elo INTEGER;
  v_delta INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a result' USING ERRCODE = '28000';
  END IF;

  SELECT p.player_name INTO v_caller_name FROM public.profiles p WHERE p.auth_user_id = auth.uid();
  IF v_caller_name IS NULL OR public.more_game_player_key(v_caller_name) <> v_player_key THEN
    RAISE EXCEPTION 'Only the player can record their own result' USING ERRCODE = '42501';
  END IF;

  IF p_game_id NOT IN ('sudoku', 'mahjong') THEN
    RAISE EXCEPTION 'Solo ratings are only supported for sudoku and mahjong';
  END IF;

  IF v_player_name IS NULL THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  -- a board takes time to solve: one result per 30 seconds and at most 30 a day
  IF EXISTS (
    SELECT 1 FROM public.more_game_match_history h
    WHERE h.game_id = p_game_id AND h.player1_key = v_player_key AND h.created_at > now() - interval '30 seconds'
  ) OR (
    SELECT count(*) FROM public.more_game_match_history h
    WHERE h.game_id = p_game_id AND h.player1_key = v_player_key AND h.created_at > now() - interval '1 day'
  ) >= 30 THEN
    RETURN;
  END IF;

  INSERT INTO public.more_game_ratings (game_id, player_key, player_name)
  VALUES (p_game_id, v_player_key, v_player_name)
  ON CONFLICT (game_id, player_key)
  DO UPDATE SET player_name = EXCLUDED.player_name;

  SELECT * INTO v_player
  FROM public.more_game_ratings
  WHERE game_id = p_game_id AND player_key = v_player_key
  FOR UPDATE;

  v_delta := CASE WHEN p_won THEN 10 ELSE -10 END;
  v_new_elo := GREATEST(0, v_player.elo + v_delta);

  UPDATE public.more_game_ratings
  SET
    elo = v_new_elo,
    wins = wins + CASE WHEN p_won THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN p_won THEN 0 ELSE 1 END,
    games_played = games_played + 1,
    last_result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    last_played_at = NOW(),
    player_name = v_player_name
  WHERE id = v_player.id
  RETURNING * INTO v_player_after;

  INSERT INTO public.more_game_match_history (
    game_id, player1_key, player1_name, player2_key, player2_name, result, winner_key,
    player1_elo_before, player1_elo_after, player1_elo_change,
    player2_elo_before, player2_elo_after, player2_elo_change, metadata
  )
  VALUES (
    p_game_id, v_player_key, v_player_name, 'solo-board', 'Board',
    CASE WHEN p_won THEN 'player1' ELSE 'player2' END,
    CASE WHEN p_won THEN v_player_key ELSE 'solo-board' END,
    v_player.elo, v_player_after.elo, v_player_after.elo - v_player.elo,
    0, 0, 0,
    COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('score', p_score)
  );

  RETURN QUERY
  SELECT v_player_after.player_name, v_player_after.player_key, v_player_after.elo, v_player.elo, v_player_after.elo - v_player.elo, v_player_after.wins, v_player_after.losses, v_player_after.draws, v_player_after.games_played;
END;
$function$;

------------------------------------------------------------------------------------------------------------
-- B3. Durak for coins: an early "win" report took the whole pot 90 seconds later while the others were still
-- playing. The pot now goes to a winner only when every other player reported a loss. Any other picture
-- (a missing report, two winners, a draw) gives every stake back. A table with missing reports waits
-- 10 minutes after the first report, so slow clients still get to report.
------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._settle_durak_table(p_table_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wins integer;
  v_losses integer;
  v_stakes integer;
  v_pot integer;
  v_outcome text;
BEGIN
  SELECT count(*) FILTER (WHERE result = 'win'), count(*) FILTER (WHERE result = 'loss'), count(*), COALESCE(sum(amount), 0)
    INTO v_wins, v_losses, v_stakes, v_pot
    FROM public.durak_stakes WHERE table_id = p_table_id;

  IF v_wins = 1 AND v_losses = v_stakes - 1 AND v_stakes >= 2 THEN
    UPDATE public.profiles p SET coins = p.coins + v_pot
      FROM public.durak_stakes s
     WHERE s.table_id = p_table_id AND s.result = 'win' AND p.id = s.profile_id;
    v_outcome := 'won';
  ELSE
    UPDATE public.profiles p SET coins = p.coins + s.amount
      FROM public.durak_stakes s
     WHERE s.table_id = p_table_id AND p.id = s.profile_id;
    v_outcome := CASE WHEN v_wins <= 1 THEN 'refunded' ELSE 'disputed' END;
  END IF;

  UPDATE public.durak_tables SET settled_at = now(), outcome = v_outcome WHERE table_id = p_table_id;
  RETURN v_outcome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_pending_durak()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table_id text;
  v_count integer := 0;
BEGIN
  FOR v_table_id IN
    SELECT table_id FROM public.durak_tables
     WHERE settled_at IS NULL
       AND (first_report_at < now() - interval '10 minutes' OR created_at < now() - interval '3 hours')
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._settle_durak_table(v_table_id);
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.durak_tables WHERE settled_at < now() - interval '30 days';
  RETURN v_count;
END;
$function$;

------------------------------------------------------------------------------------------------------------
-- C3. Realtime invitations: the channel "invites:<user id>" was public, so anyone could read a player's
-- invitations or send fake ones. New builds use it as a private channel: only its owner may listen, and
-- only an accepted friend may send to it. (Policies on realtime.messages only cover private channels; the
-- old public channel stays open for builds before 2.0.8 until "Allow public access" is turned off in the
-- Realtime settings.)
------------------------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner listens to own invitations" ON realtime.messages;
CREATE POLICY "Owner listens to own invitations" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'invites:' || (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Friends send invitations" ON realtime.messages;
CREATE POLICY "Friends send invitations" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) LIKE 'invites:%'
    AND EXISTS (
      SELECT 1 FROM public.friends f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id_1 = (SELECT auth.uid()) AND f.user_id_2::text = substr((SELECT realtime.topic()), 9))
          OR (f.user_id_2 = (SELECT auth.uid()) AND f.user_id_1::text = substr((SELECT realtime.topic()), 9))
        )
    )
  );

------------------------------------------------------------------------------------------------------------
-- Low-risk hardening from the audit draft.
------------------------------------------------------------------------------------------------------------
-- A player could change the primary key and the creation date of their own profile row.
CREATE OR REPLACE FUNCTION public.profiles_identity_pin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_identity_pin ON public.profiles;
CREATE TRIGGER trg_profiles_identity_pin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_identity_pin();

-- Advisor "function_search_path_mutable".
ALTER FUNCTION public.achievement_reward(text) SET search_path = public;
ALTER FUNCTION public.achievement_streak_requirement(text) SET search_path = public;
ALTER FUNCTION public.chess_elo_change(integer, integer, numeric, integer) SET search_path = public;
ALTER FUNCTION public.current_season_key() SET search_path = public;
ALTER FUNCTION public.daily_puzzle_reward_coins() SET search_path = public;
ALTER FUNCTION public.daily_puzzle_three_star_score() SET search_path = public;
ALTER FUNCTION public.daily_quest_reward(text) SET search_path = public;
ALTER FUNCTION public.matchmaking_rooms_guard() SET search_path = public;
ALTER FUNCTION public.matchmaking_rooms_identity_guard() SET search_path = public;
ALTER FUNCTION public.max_plausible_score(text) SET search_path = public;
ALTER FUNCTION public.more_game_player_key(text) SET search_path = public;
ALTER FUNCTION public.normalize_more_game_player_name(text) SET search_path = public;
ALTER FUNCTION public.profiles_integrity_guard() SET search_path = public;
ALTER FUNCTION public.profiles_owned_items_guard() SET search_path = public;
ALTER FUNCTION public.profiles_streak_guard() SET search_path = public;
ALTER FUNCTION public.profiles_strip_email() SET search_path = public;
ALTER FUNCTION public.season_reward_coins(integer) SET search_path = public;
ALTER FUNCTION public.season_reward_item(integer) SET search_path = public;
ALTER FUNCTION public.set_more_game_ratings_updated_at() SET search_path = public;
ALTER FUNCTION public.streak_reward_coins(integer) SET search_path = public;
ALTER FUNCTION public.update_friends_updated_at() SET search_path = public;

-- TRUNCATE is not covered by row level security; REFERENCES and TRIGGER are never needed by the app roles.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
