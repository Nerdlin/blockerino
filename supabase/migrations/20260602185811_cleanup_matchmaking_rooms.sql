CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.matchmaking_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player1_name TEXT NOT NULL,
  player2_name TEXT,
  game_mode TEXT NOT NULL DEFAULT 'classic',
  status TEXT NOT NULL DEFAULT 'waiting',
  winner_name TEXT,
  player1_id TEXT,
  player2_id TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.matchmaking_rooms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.matchmaking_rooms
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.matchmaking_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read matchmaking rooms" ON public.matchmaking_rooms;
CREATE POLICY "Anyone can read matchmaking rooms"
  ON public.matchmaking_rooms
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can create matchmaking rooms" ON public.matchmaking_rooms;
CREATE POLICY "Anyone can create matchmaking rooms"
  ON public.matchmaking_rooms
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update matchmaking rooms" ON public.matchmaking_rooms;
CREATE POLICY "Anyone can update matchmaking rooms"
  ON public.matchmaking_rooms
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can delete waiting matchmaking rooms" ON public.matchmaking_rooms;
CREATE POLICY "Anyone can delete waiting matchmaking rooms"
  ON public.matchmaking_rooms
  FOR DELETE
  USING (status = 'waiting');

CREATE INDEX IF NOT EXISTS idx_matchmaking_rooms_lobby
  ON public.matchmaking_rooms (is_private, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_matchmaking_rooms_cleanup
  ON public.matchmaking_rooms (status, is_private, created_at);

CREATE INDEX IF NOT EXISTS idx_matchmaking_rooms_updated_at
  ON public.matchmaking_rooms (updated_at);

CREATE OR REPLACE FUNCTION public.set_matchmaking_rooms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matchmaking_rooms_updated_at ON public.matchmaking_rooms;
CREATE TRIGGER trg_matchmaking_rooms_updated_at
  BEFORE UPDATE ON public.matchmaking_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_matchmaking_rooms_updated_at();

CREATE OR REPLACE FUNCTION public.cleanup_matchmaking_rooms()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.matchmaking_rooms
  WHERE
    created_at < NOW() - INTERVAL '24 hours'
    OR (
      status = 'waiting'
      AND COALESCE(is_private, FALSE) = FALSE
      AND created_at < NOW() - INTERVAL '5 minutes'
    )
    OR (
      status = 'waiting'
      AND COALESCE(is_private, FALSE) = TRUE
      AND created_at < NOW() - INTERVAL '30 minutes'
    )
    OR (
      status = 'playing'
      AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '90 minutes'
    )
    OR (
      status = 'finished'
      AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '2 hours'
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_matchmaking_rooms() TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can cleanup stale matchmaking rooms" ON public.matchmaking_rooms;
CREATE POLICY "Anyone can cleanup stale matchmaking rooms"
  ON public.matchmaking_rooms
  FOR DELETE
  USING (
    created_at < NOW() - INTERVAL '24 hours'
    OR (
      status = 'waiting'
      AND COALESCE(is_private, FALSE) = FALSE
      AND created_at < NOW() - INTERVAL '5 minutes'
    )
    OR (
      status = 'waiting'
      AND COALESCE(is_private, FALSE) = TRUE
      AND created_at < NOW() - INTERVAL '30 minutes'
    )
    OR (
      status = 'playing'
      AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '90 minutes'
    )
    OR (
      status = 'finished'
      AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '2 hours'
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE $cron$
      SELECT cron.unschedule('cleanup-matchmaking-rooms')
      WHERE EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'cleanup-matchmaking-rooms'
      );
    $cron$;

    EXECUTE $cron$
      SELECT cron.schedule(
        'cleanup-matchmaking-rooms',
        '*/5 * * * *',
        'SELECT public.cleanup_matchmaking_rooms();'
      );
    $cron$;
  END IF;
END;
$$;
