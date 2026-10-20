-- Server-owned Versus Elo (Blockerino 2.0).
-- Until now each client computed its own Elo and wrote it. Now:
--   * a room slot that belongs to a signed-in account can only be taken by that account
--     (guests keep their random device ids and stay unrestricted);
--   * players report their own result with report_versus_result(room, win|loss|draw);
--     the server checks they sat in that room and changes Elo by +-10 itself:
--       - win + loss        -> decisive, applied at once
--       - a lone 'loss'     -> accepted at once (nobody lies against themselves)
--       - a lone 'win'      -> waits 90 s for the opponent, then counts (opponent left / crashed)
--       - win + win, loss + loss, draw + win ... -> disputed, nobody's Elo changes
--       - draw + draw       -> no change
--   * limits against farming with a second account: 10 decisive matches per pair per UTC day,
--     5 per day against opponents that are not accounts (guests).
-- Elo columns are already frozen for clients by profiles_integrity_guard.

-- True when the id is the id of a signed-in account (a random guest device id is not).
CREATE OR REPLACE FUNCTION public.is_account_id(p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT CASE
    WHEN p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_id::uuid)
    ELSE FALSE
  END;
$$;

-- Called by the room trigger as the player (signed in or guest), so both roles need it; it only
-- answers "is this id an account?" for an unguessable uuid.
REVOKE ALL ON FUNCTION public.is_account_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_account_id(text) TO anon, authenticated;

-- Nobody can sit in a room under someone else's account id.
CREATE OR REPLACE FUNCTION public.matchmaking_rooms_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.player1_id IS NOT NULL
       AND public.is_account_id(NEW.player1_id)
       AND NEW.player1_id IS DISTINCT FROM auth.uid()::text THEN
      RAISE EXCEPTION 'A room slot of a signed-in account can only be taken by that account' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.player2_id IS NOT NULL
     AND NEW.player2_id IS DISTINCT FROM OLD.player2_id
     AND public.is_account_id(NEW.player2_id)
     AND NEW.player2_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'A room slot of a signed-in account can only be taken by that account' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matchmaking_rooms_identity_guard ON public.matchmaking_rooms;
CREATE TRIGGER trg_matchmaking_rooms_identity_guard
  BEFORE INSERT OR UPDATE ON public.matchmaking_rooms
  FOR EACH ROW EXECUTE FUNCTION public.matchmaking_rooms_identity_guard();

-- One row per match: a snapshot of who sat in the room and what each side reported.
-- Rooms are deleted a couple of hours after they finish, so this outlives them.
CREATE TABLE IF NOT EXISTS public.versus_matches (
  room_id uuid PRIMARY KEY,
  player1_id text NOT NULL,
  player2_id text NOT NULL,
  game_mode text,
  p1_result text CHECK (p1_result IN ('win', 'loss', 'draw')),
  p2_result text CHECK (p2_result IN ('win', 'loss', 'draw')),
  p1_reported_at timestamptz,
  p2_reported_at timestamptz,
  outcome text CHECK (outcome IN ('p1_win', 'p2_win', 'draw', 'disputed', 'capped', 'void')),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versus_matches_unsettled
  ON public.versus_matches (created_at) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_versus_matches_settled_at
  ON public.versus_matches (settled_at) WHERE settled_at IS NOT NULL;

ALTER TABLE public.versus_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.versus_matches FROM anon, authenticated;

-- Closes a match with an outcome and applies the Elo change. Internal.
CREATE OR REPLACE FUNCTION public._settle_versus_match(p_room_id uuid, p_outcome text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_delta CONSTANT integer := 10;
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
        IF public.is_account_id(v_acct)
           AND NOT public.is_account_id(CASE WHEN v_acct = v_m.player1_id THEN v_m.player2_id ELSE v_m.player1_id END)
           AND (SELECT count(*) FROM public.versus_matches
                 WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win')
                   AND (player1_id = v_acct OR player2_id = v_acct)
                   AND NOT public.is_account_id(CASE WHEN player1_id = v_acct THEN player2_id ELSE player1_id END)) >= c_guest_cap THEN
          v_outcome := 'capped';
        END IF;
      END LOOP;
    END IF;

    IF v_outcome <> 'capped' THEN
      IF public.is_account_id(v_winner) THEN
        UPDATE public.profiles SET elo = elo + c_delta WHERE auth_user_id = v_winner::uuid;
      END IF;
      IF public.is_account_id(v_loser) THEN
        UPDATE public.profiles SET elo = GREATEST(0, elo - c_delta) WHERE auth_user_id = v_loser::uuid;
      END IF;
    END IF;
  END IF;

  UPDATE public.versus_matches SET outcome = v_outcome, settled_at = now() WHERE room_id = p_room_id;
  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public._settle_versus_match(uuid, text) FROM PUBLIC, anon, authenticated;

-- A player reports how their own match ended. Returns {status, elo}.
CREATE OR REPLACE FUNCTION public.report_versus_result(p_room_id uuid, p_result text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_room public.matchmaking_rooms%ROWTYPE;
  v_m public.versus_matches%ROWTYPE;
  v_side integer;
  v_outcome text;
  v_status text;
  v_elo integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_result IS NULL OR p_result NOT IN ('win', 'loss', 'draw') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_m FROM public.versus_matches WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_room FROM public.matchmaking_rooms WHERE id = p_room_id;
    IF NOT FOUND OR v_room.player2_id IS NULL OR v_room.player1_id IS NOT DISTINCT FROM v_room.player2_id THEN
      RETURN jsonb_build_object('status', 'invalid_room');
    END IF;
    INSERT INTO public.versus_matches (room_id, player1_id, player2_id, game_mode)
    VALUES (p_room_id, v_room.player1_id, v_room.player2_id, v_room.game_mode)
    ON CONFLICT (room_id) DO NOTHING;
    SELECT * INTO v_m FROM public.versus_matches WHERE room_id = p_room_id FOR UPDATE;
  END IF;

  v_side := CASE WHEN v_uid = v_m.player1_id THEN 1 WHEN v_uid = v_m.player2_id THEN 2 ELSE 0 END;
  IF v_side = 0 THEN RETURN jsonb_build_object('status', 'not_participant'); END IF;

  IF v_m.settled_at IS NOT NULL
     OR (v_side = 1 AND v_m.p1_result IS NOT NULL)
     OR (v_side = 2 AND v_m.p2_result IS NOT NULL) THEN
    v_status := 'already';
  ELSE
    IF v_side = 1 THEN
      UPDATE public.versus_matches SET p1_result = p_result, p1_reported_at = now() WHERE room_id = p_room_id;
    ELSE
      UPDATE public.versus_matches SET p2_result = p_result, p2_reported_at = now() WHERE room_id = p_room_id;
    END IF;
    SELECT * INTO v_m FROM public.versus_matches WHERE room_id = p_room_id;

    v_outcome := NULL;
    IF v_m.p1_result IS NOT NULL AND v_m.p2_result IS NOT NULL THEN
      v_outcome := CASE
        WHEN v_m.p1_result = 'win' AND v_m.p2_result = 'loss' THEN 'p1_win'
        WHEN v_m.p1_result = 'loss' AND v_m.p2_result = 'win' THEN 'p2_win'
        WHEN v_m.p1_result = 'draw' AND v_m.p2_result = 'draw' THEN 'draw'
        ELSE 'disputed'
      END;
    ELSIF p_result = 'loss' THEN
      v_outcome := CASE WHEN v_side = 1 THEN 'p2_win' ELSE 'p1_win' END;
    END IF;

    IF v_outcome IS NULL THEN
      v_status := 'pending';
    ELSE
      v_status := public._settle_versus_match(p_room_id, v_outcome);
    END IF;
  END IF;

  SELECT elo INTO v_elo FROM public.profiles WHERE auth_user_id = auth.uid();
  RETURN jsonb_build_object('status', v_status, 'elo', v_elo);
END;
$$;

REVOKE ALL ON FUNCTION public.report_versus_result(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_versus_result(uuid, text) TO authenticated;

-- A lone 'win' whose opponent never answered (left the match, crashed) counts after 90 seconds.
CREATE OR REPLACE FUNCTION public.settle_pending_versus()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m public.versus_matches%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_m IN
    SELECT * FROM public.versus_matches
     WHERE settled_at IS NULL
       AND (p1_result IS NULL) <> (p2_result IS NULL)
       AND COALESCE(p1_reported_at, p2_reported_at) < now() - interval '90 seconds'
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._settle_versus_match(
      v_m.room_id,
      CASE WHEN v_m.p1_result = 'win' THEN 'p1_win' WHEN v_m.p2_result = 'win' THEN 'p2_win' ELSE 'void' END
    );
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.versus_matches WHERE created_at < now() - interval '60 days';
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_pending_versus() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('settle-versus', '* * * * *', 'SELECT public.settle_pending_versus()');
