-- 1v1 invites by push + "online" dots for friends (Blockerino 2.0).
--   * A friend who has the app closed gets the invite as a push: notify_invite() adds a notification of the new
--     kind 'invite' (the send-push function delivers it within a minute, but only while it is under 3 minutes old).
--     A friend who opens the app from that push finds the invite again with get_my_pending_invites().
--     Invites never show up in the "news" inbox (get_my_notifications skips them).
--   * Online dots: the app reports "I am here" about once a minute (touch_presence); get_friends_online() gives a
--     player only the ids of their ACCEPTED friends seen in the last 2 minutes, and leaves out friends whose profile
--     visibility is "nobody". Nobody can list who is online in general.
-- Both new tables are closed to clients; they call the functions below.

-- ---------------------------------------------------------------------------------------------
-- Notification kind 'invite'
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.user_notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%overtaken%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_notifications DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_kind_check CHECK (kind IN ('overtaken', 'streak_risk', 'season_ending', 'invite'));

-- Invites stay out of the news inbox: they are live prompts, not news.
CREATE OR REPLACE FUNCTION public.get_my_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'payload', n.payload, 'created_at', n.created_at) ORDER BY n.created_at DESC)
      FROM (
        SELECT * FROM public.user_notifications
         WHERE profile_id = v_profile_id AND read_at IS NULL AND kind <> 'invite' AND created_at > now() - interval '7 days'
         ORDER BY created_at DESC LIMIT 20
      ) n
  ), '[]'::jsonb);
END;
$$;

-- The host calls this after creating a private room: "tell this friend about it".
-- Returns {status: ok | unauthenticated | not_friends | no_room | throttled}.
CREATE OR REPLACE FUNCTION public.notify_invite(p_room_id uuid, p_friend_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me public.profiles%ROWTYPE;
  v_friend_profile uuid;
  v_room public.matchmaking_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  SELECT * INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friends f
     WHERE f.status = 'accepted'
       AND ((f.user_id_1 = auth.uid() AND f.user_id_2 = p_friend_user_id) OR (f.user_id_2 = auth.uid() AND f.user_id_1 = p_friend_user_id))
  ) THEN
    RETURN jsonb_build_object('status', 'not_friends');
  END IF;

  SELECT * INTO v_room FROM public.matchmaking_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.player1_id IS DISTINCT FROM auth.uid()::text OR v_room.status <> 'waiting' OR NOT coalesce(v_room.is_private, false) THEN
    RETURN jsonb_build_object('status', 'no_room');
  END IF;

  -- No spam: at most 5 invites from one player to the same friend within 10 minutes.
  SELECT id INTO v_friend_profile FROM public.profiles WHERE auth_user_id = p_friend_user_id;
  IF v_friend_profile IS NULL THEN RETURN jsonb_build_object('status', 'not_friends'); END IF;
  IF (SELECT count(*) FROM public.user_notifications
       WHERE profile_id = v_friend_profile AND kind = 'invite'
         AND payload->>'from_user' = auth.uid()::text AND created_at > now() - interval '10 minutes') >= 5 THEN
    RETURN jsonb_build_object('status', 'throttled');
  END IF;

  INSERT INTO public.user_notifications (profile_id, kind, payload, dedupe_key)
  VALUES (
    v_friend_profile,
    'invite',
    jsonb_build_object('room_id', p_room_id, 'from', v_me.player_name, 'from_user', auth.uid(), 'mode', coalesce(v_room.game_mode, 'classic')),
    'invite:' || p_room_id
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- Invites from the last 3 minutes the player has not seen yet, for opening the app from a push.
-- Returns [{id, room_id, from, mode, created_at}], newest first.
CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', n.id, 'room_id', n.payload->>'room_id', 'from', n.payload->>'from', 'mode', n.payload->>'mode', 'created_at', n.created_at
           ) ORDER BY n.created_at DESC)
      FROM (
        SELECT * FROM public.user_notifications
         WHERE profile_id = v_profile_id AND kind = 'invite' AND read_at IS NULL AND created_at > now() - interval '3 minutes'
         ORDER BY created_at DESC LIMIT 3
      ) n
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Presence
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_presence FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.player_presence (user_id, seen_at) VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET seen_at = excluded.seen_at
    WHERE public.player_presence.seen_at < now() - interval '20 seconds';
  RETURN TRUE;
END;
$$;

-- Accepted friends seen within 2 minutes, as a list of their account ids.
CREATE OR REPLACE FUNCTION public.get_friends_online()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(pr.user_id)
      FROM public.friends f
      JOIN public.player_presence pr
        ON pr.user_id = CASE WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 ELSE f.user_id_1 END
     WHERE f.status = 'accepted' AND auth.uid() IN (f.user_id_1, f.user_id_2)
       AND pr.seen_at > now() - interval '2 minutes'
       AND coalesce((SELECT visibility FROM public.profile_privacy WHERE user_id = pr.user_id), 'everyone') <> 'nobody'
  ), '[]'::jsonb);
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-old-presence', '50 3 * * *', $cron$DELETE FROM public.player_presence WHERE seen_at < now() - interval '2 days'$cron$);

REVOKE ALL ON FUNCTION public.notify_invite(uuid, uuid), public.get_my_pending_invites(), public.touch_presence(),
  public.get_friends_online() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_invite(uuid, uuid), public.get_my_pending_invites(), public.touch_presence(),
  public.get_friends_online() TO authenticated;
