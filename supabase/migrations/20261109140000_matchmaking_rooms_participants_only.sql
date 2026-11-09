-- matchmaking_rooms was open to griefing: anyone (even signed out) could delete another player's
-- waiting room or finish someone else's running match.
-- Guests have no server identity, so their slots cannot be checked; signed-in players' slots can:
-- * a waiting room hosted by an account can be deleted only by that account (stale-room cleanup stays);
-- * a running match where both players are accounts can be changed only by one of them.

DROP POLICY IF EXISTS "Anyone can delete waiting matchmaking rooms" ON public.matchmaking_rooms;
DROP POLICY IF EXISTS "Host can delete own waiting matchmaking room" ON public.matchmaking_rooms;
CREATE POLICY "Host can delete own waiting matchmaking room"
  ON public.matchmaking_rooms FOR DELETE
  USING (
    status = 'waiting'
    AND (player1_id = auth.uid()::text OR NOT public.is_account_id(player1_id))
  );

CREATE OR REPLACE FUNCTION public.matchmaking_rooms_participant_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR OLD.status <> 'playing' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND v_uid IN (OLD.player1_id, OLD.player2_id) THEN
    RETURN NEW;
  END IF;

  -- A guest is in the match: there is no way to tell them from anyone else.
  IF NOT public.is_account_id(OLD.player1_id) OR NOT public.is_account_id(OLD.player2_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the players of a match can change it' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_matchmaking_rooms_participant_guard ON public.matchmaking_rooms;
CREATE TRIGGER trg_matchmaking_rooms_participant_guard
  BEFORE UPDATE ON public.matchmaking_rooms
  FOR EACH ROW EXECUTE FUNCTION public.matchmaking_rooms_participant_guard();

-- Same rule twice under two names; keep one of each.
DROP POLICY IF EXISTS "Allow public insert access" ON public.matchmaking_rooms;
DROP POLICY IF EXISTS "Allow public read access" ON public.matchmaking_rooms;
