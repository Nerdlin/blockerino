-- Integrity rules for matchmaking_rooms. The table is writable by everyone (players are identified by a
-- client-generated id, not by auth), so the rules live in a trigger instead of RLS:
--   * the host, game mode and creation time never change
--   * a waiting room can only be joined once: waiting -> playing with an opponent set
--   * the opponent of a playing room cannot be replaced
--   * a room finishes once: playing -> finished with a winner; a finished room is frozen
--     (re-sending the same result is accepted and changes nothing)
-- is_private is allowed to change only while joining (the client flips it to false then).
-- This stops rewriting or hijacking other people's rooms. It cannot stop a stranger who knows a room id
-- from ending a game; that needs rooms bound to a signed-in player.

CREATE OR REPLACE FUNCTION public.matchmaking_rooms_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR NEW.player1_name IS DISTINCT FROM OLD.player1_name
     OR NEW.game_mode IS DISTINCT FROM OLD.game_mode
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The host and settings of a matchmaking room cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'finished' THEN
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'A finished matchmaking room cannot be changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'waiting' THEN
    IF NEW.status = 'waiting' THEN
      IF NEW.player2_id IS DISTINCT FROM OLD.player2_id
         OR NEW.player2_name IS DISTINCT FROM OLD.player2_name
         OR NEW.winner_name IS DISTINCT FROM OLD.winner_name
         OR NEW.is_private IS DISTINCT FROM OLD.is_private THEN
        RAISE EXCEPTION 'A waiting matchmaking room can only be joined' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status = 'playing' THEN
      IF OLD.player2_name IS NOT NULL OR NEW.player2_name IS NULL OR NEW.winner_name IS NOT NULL THEN
        RAISE EXCEPTION 'Only an empty waiting room can be joined' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'A waiting matchmaking room can only start playing' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'playing' THEN
    IF NEW.player2_id IS DISTINCT FROM OLD.player2_id
       OR NEW.player2_name IS DISTINCT FROM OLD.player2_name
       OR NEW.is_private IS DISTINCT FROM OLD.is_private THEN
      RAISE EXCEPTION 'The opponent of a playing room cannot be replaced' USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('playing', 'finished') THEN
      RAISE EXCEPTION 'A playing matchmaking room can only finish' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'playing' AND NEW.winner_name IS DISTINCT FROM OLD.winner_name THEN
      RAISE EXCEPTION 'A winner can only be set when the room finishes' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matchmaking_rooms_guard ON public.matchmaking_rooms;
CREATE TRIGGER trg_matchmaking_rooms_guard
  BEFORE UPDATE ON public.matchmaking_rooms
  FOR EACH ROW EXECUTE FUNCTION public.matchmaking_rooms_guard();
