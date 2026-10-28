-- The chess ratings of the caller's accepted friends, for the friends list of the chess menu.
-- Only friends (status 'accepted') are returned; nothing about anyone else, and no write access.

CREATE OR REPLACE FUNCTION public.get_friend_chess_ratings()
RETURNS TABLE (friend_ref text, time_class text, rating integer, games_played integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mine AS (SELECT auth.uid()::text AS uid),
  ids AS (
    SELECT CASE WHEN f.user_id_1::text = m.uid THEN f.user_id_2::text ELSE f.user_id_1::text END AS fid
    FROM public.friends f CROSS JOIN mine m
    WHERE f.status = 'accepted' AND (f.user_id_1::text = m.uid OR f.user_id_2::text = m.uid)
  )
  SELECT ids.fid, r.time_class, r.rating, r.games_played
  FROM ids
  JOIN public.profiles p ON p.auth_user_id::text = ids.fid OR p.player_id::text = ids.fid
  JOIN public.chess_ratings r ON r.profile_id = p.id;
$$;

REVOKE ALL ON FUNCTION public.get_friend_chess_ratings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_chess_ratings() TO authenticated;
