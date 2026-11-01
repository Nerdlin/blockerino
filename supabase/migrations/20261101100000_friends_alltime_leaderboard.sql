-- The Friends tab of the high scores ranks the player and their accepted friends by their all-time best. The
-- season ranking among friends started empty every month (and stayed empty until someone played), so the tab
-- looked broken for the first days of each season.
CREATE OR REPLACE FUNCTION public.get_friends_alltime_leaderboard(p_board text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_board NOT IN ('classic', 'chaos') THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    WITH circle AS (
      SELECT auth.uid() AS user_id
      UNION
      SELECT CASE WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 ELSE f.user_id_1 END
        FROM public.friends f
       WHERE f.status = 'accepted' AND auth.uid() IN (f.user_id_1, f.user_id_2)
    ), scored AS (
      SELECT p.player_name, p.avatar_url, p.auth_user_id = auth.uid() AS is_me,
             CASE WHEN p_board = 'classic' THEN p.highscore_classic ELSE p.highscore_chaos END AS score
        FROM circle c
        JOIN public.profiles p ON p.auth_user_id = c.user_id
    ), ranked AS (
      SELECT player_name, avatar_url, score, is_me, rank() OVER (ORDER BY score DESC) AS rnk
        FROM scored
       WHERE COALESCE(score, 0) > 0
    )
    SELECT jsonb_agg(jsonb_build_object('player_name', player_name, 'avatar_url', avatar_url, 'score', score, 'rank', rnk, 'is_me', is_me) ORDER BY rnk)
      FROM ranked
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_friends_alltime_leaderboard(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_alltime_leaderboard(text) TO authenticated;
