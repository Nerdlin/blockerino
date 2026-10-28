-- Random opponent for chess (Blockerino 2.1): a queue per time control, paired on the server by rating.
--
-- A player in the queue calls chess_quick_match every couple of seconds (that doubles as "still here"; entries not
-- seen for 15 s are dropped). The call that finds a fitting opponent creates the room code, picks the colors, removes
-- both from the queue and leaves a pairing for the other player, who gets it with their next call. The rating window
-- starts at 150 points and widens by 30 for every second waited, up to 600. All pairing for one control runs under an
-- advisory lock, so two players cannot be paired with two different people (or rooms) at the same moment.

CREATE TABLE IF NOT EXISTS public.chess_queue (
  profile_id uuid PRIMARY KEY,
  control text NOT NULL,
  rating integer NOT NULL,
  name text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chess_pairings (
  profile_id uuid PRIMARY KEY,
  room_code text NOT NULL,
  color text NOT NULL CHECK (color IN ('w', 'b')),
  opponent_name text NOT NULL,
  control text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chess_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_pairings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chess_queue, public.chess_pairings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.chess_quick_match(p_control text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  v_rating := coalesce((SELECT r.rating FROM public.chess_ratings r WHERE r.profile_id = v_me.id AND r.time_class = v_class), 1000);

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

  RETURN jsonb_build_object('status', 'matched', 'code', v_code, 'color', v_my_color, 'opponent', v_opp.name, 'control', p_control);
END;
$$;

REVOKE ALL ON FUNCTION public.chess_quick_match(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chess_quick_match(text) TO authenticated;

-- Leaves the queue (and drops a pairing the caller has not picked up).
CREATE OR REPLACE FUNCTION public.chess_cancel_search()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.chess_queue WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid());
  DELETE FROM public.chess_pairings WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.chess_cancel_search() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chess_cancel_search() TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-chess-matchmaking', '*/5 * * * *', $cron$DELETE FROM public.chess_pairings WHERE created_at < now() - interval '5 minutes'; DELETE FROM public.chess_queue WHERE seen_at < now() - interval '1 minute'$cron$);
