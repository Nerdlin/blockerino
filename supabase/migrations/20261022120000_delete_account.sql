-- Account deletion (Blockerino 2.0). Google Play (and the privacy rules behind it) require that a player who made an
-- account in the app can delete it, with its data, from inside the app. delete_my_account() removes everything that
-- belongs to the caller and then the sign-in itself; it can only ever act on the caller's own account.
--   * rows keyed by the account (profile, friends, privacy choice, records, presence, push tokens, notifications,
--     season scores and rewards, achievement and quest claims, analytics events, crash reports, Durak stakes) are deleted;
--   * rooms the player sat in are deleted; the player's name is removed from the More Games rating table;
--   * the finished season history keeps the result but under the name 'Deleted player' (it is public history);
--   * match history rows of other players keep an anonymous id that no longer points to anybody.
-- Returns {status: ok | unauthenticated}.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_names text[];
  v_profile_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]), coalesce(array_agg(lower(player_name)), ARRAY[]::text[])
    INTO v_profile_ids, v_names
    FROM public.profiles WHERE auth_user_id = v_uid;

  DELETE FROM public.achievement_claims WHERE user_id = v_uid;
  DELETE FROM public.daily_quest_claims WHERE user_id = v_uid;
  DELETE FROM public.crash_reports WHERE user_id = v_uid;
  DELETE FROM public.events WHERE user_id = v_uid;

  DELETE FROM public.matchmaking_rooms WHERE player1_id = v_uid::text OR player2_id = v_uid::text;
  UPDATE public.match_history SET player1_id = NULL WHERE player1_id = v_uid::text;
  UPDATE public.match_history SET player2_id = NULL WHERE player2_id = v_uid::text;
  UPDATE public.match_history SET winner_id = NULL WHERE winner_id = v_uid::text;

  IF cardinality(v_names) > 0 THEN
    DELETE FROM public.more_game_ratings WHERE lower(player_name) = ANY (v_names);
  END IF;
  IF cardinality(v_profile_ids) > 0 THEN
    UPDATE public.season_results SET player_name = 'Deleted player' WHERE profile_id = ANY (v_profile_ids);
  END IF;

  -- Profile rows go first: push tokens, notifications, season scores and rewards and Durak stakes follow by cascade.
  DELETE FROM public.profiles WHERE auth_user_id = v_uid;
  -- The sign-in: friends, privacy choice, game records, presence, identities and sessions follow by cascade.
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
