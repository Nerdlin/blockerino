-- Fix Row Level Security policy for matchmaking_rooms update
-- Allow anonymous / guest players to update rooms when joining games
DROP POLICY IF EXISTS "Players can update their rooms" ON public.matchmaking_rooms;
DROP POLICY IF EXISTS "Anyone can update matchmaking rooms" ON public.matchmaking_rooms;

CREATE POLICY "Anyone can update matchmaking rooms"
  ON public.matchmaking_rooms
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);
