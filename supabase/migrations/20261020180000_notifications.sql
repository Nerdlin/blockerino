-- Notifications (Blockerino 2.0): "you were overtaken", streak reminders, season ending, friends table.
-- The server creates the notifications; the app shows them in two ways:
--   * push: native clients register an Expo push token and the send-push Edge Function delivers
--     pending notifications through the Expo push service (see docs/push-notifications.md);
--   * in the app: every client (web and Discord included) fetches its unread notifications on launch.
-- Opting out of push = unregistering the token. Notifications are only ever about the player's own account.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  -- Language of the app on that device, so the push text is in the player's language.
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ru')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_profile ON public.push_tokens (profile_id);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('overtaken', 'streak_risk', 'season_ending')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- A repeated key for the same player is silently dropped: this is how notifications are throttled.
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  pushed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_dedupe
  ON public.user_notifications (profile_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON public.user_notifications (profile_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_notifications_unpushed
  ON public.user_notifications (created_at) WHERE pushed_at IS NULL;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tokens, public.user_notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Client API
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text, p_language text DEFAULT 'en')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_platform NOT IN ('android', 'ios') THEN RETURN FALSE; END IF;
  IF p_token IS NULL OR p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$' THEN RETURN FALSE; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.push_tokens (token, profile_id, platform, language)
  VALUES (p_token, v_profile_id, p_platform, CASE WHEN p_language = 'ru' THEN 'ru' ELSE 'en' END)
  ON CONFLICT (token) DO UPDATE SET profile_id = EXCLUDED.profile_id, platform = EXCLUDED.platform,
    language = EXCLUDED.language, updated_at = now();

  -- A player keeps at most 5 devices; the oldest registrations are dropped.
  DELETE FROM public.push_tokens
   WHERE profile_id = v_profile_id
     AND token NOT IN (SELECT token FROM public.push_tokens WHERE profile_id = v_profile_id ORDER BY updated_at DESC LIMIT 5);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM public.push_tokens
   WHERE token = p_token
     AND profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid());
  RETURN TRUE;
END;
$$;

-- The player's unread notifications, newest first.
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
         WHERE profile_id = v_profile_id AND read_at IS NULL AND created_at > now() - interval '7 days'
         ORDER BY created_at DESC LIMIT 20
      ) n
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  UPDATE public.user_notifications
     SET read_at = now()
   WHERE id = ANY (p_ids) AND read_at IS NULL
     AND profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.get_my_notifications(), public.mark_notifications_read(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.get_my_notifications(), public.mark_notifications_read(bigint[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- "You were overtaken": same function as before plus the notifications.
-- Players who were at or above the new score's previous level, are now below it and sit in the top 20
-- get one notification per board per 6 hours.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_season_score(
  p_board text,
  p_score integer,
  p_achieved_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_name text;
  v_old integer;
  v_current text := public.current_season_key();
  v_target text := to_char(LEAST(p_achieved_at, now()) AT TIME ZONE 'utc', 'YYYY-MM');
  v_previous text := to_char((now() AT TIME ZONE 'utc') - interval '1 month', 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_board NOT IN ('classic', 'chaos') THEN RETURN FALSE; END IF;
  IF p_score IS NULL OR p_score <= 0 OR p_score > public.max_plausible_score(p_board) THEN RETURN FALSE; END IF;

  PERFORM pg_advisory_xact_lock_shared(hashtext('close_season'));

  IF v_target <> v_current THEN
    IF v_target <> v_previous THEN RETURN FALSE; END IF;
    IF EXISTS (SELECT 1 FROM public.season_closures WHERE season_key = v_target) THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT id, player_name INTO v_profile_id, v_name FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN FALSE; END IF;

  SELECT score INTO v_old FROM public.season_scores
   WHERE season_key = v_target AND board = p_board AND profile_id = v_profile_id;

  INSERT INTO public.season_scores AS s (season_key, board, profile_id, score)
  VALUES (v_target, p_board, v_profile_id, p_score)
  ON CONFLICT (season_key, board, profile_id) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > s.score;

  IF p_score > COALESCE(v_old, 0) THEN
    INSERT INTO public.user_notifications (profile_id, kind, payload, dedupe_key)
    SELECT o.profile_id,
           'overtaken',
           jsonb_build_object('board', p_board, 'by', v_name, 'by_score', p_score, 'score', o.score, 'season', v_target),
           'overtaken:' || p_board || ':' || v_target || ':' || floor(extract(epoch FROM now()) / 21600)::bigint
      FROM public.season_scores o
     WHERE o.season_key = v_target AND o.board = p_board
       AND o.profile_id <> v_profile_id
       AND o.score >= COALESCE(v_old, 0) AND o.score < p_score
       AND (SELECT count(*) FROM public.season_scores x
             WHERE x.season_key = v_target AND x.board = p_board AND x.score > o.score) < 20
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Scheduled reminders
-- ---------------------------------------------------------------------------------------------

-- Players with a streak of 3+ days who have not claimed today (cron: every day 17:00 UTC).
CREATE OR REPLACE FUNCTION public.generate_streak_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  WITH inserted AS (
    INSERT INTO public.user_notifications (profile_id, kind, payload, dedupe_key)
    SELECT id, 'streak_risk', jsonb_build_object('streak', streak_count, 'reward', public.streak_reward_coins(streak_count + 1)),
           'streak_risk:' || v_today
      FROM public.profiles
     WHERE streak_count >= 3 AND streak_last_day = v_today - 1
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;

-- On the last day of a month: the top 30 of each board hear where they stand and what the top 10 needs.
-- Safe to run every day at 12:00 UTC; it does nothing unless tomorrow is the 1st (p_force skips that check).
CREATE OR REPLACE FUNCTION public.generate_season_ending_reminders(p_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_season text := public.current_season_key();
  v_board text;
  v_count integer;
  v_total integer := 0;
BEGIN
  IF NOT p_force AND extract(day FROM v_today + 1) <> 1 THEN RETURN 0; END IF;

  FOREACH v_board IN ARRAY ARRAY['classic', 'chaos'] LOOP
    WITH ranked AS (
      SELECT profile_id, score,
             rank() OVER (ORDER BY score DESC, updated_at ASC) AS rnk
        FROM public.season_scores WHERE season_key = v_season AND board = v_board
    ), tenth AS (
      SELECT min(score) AS score FROM ranked WHERE rnk = 10
    ), inserted AS (
      INSERT INTO public.user_notifications (profile_id, kind, payload, dedupe_key)
      SELECT r.profile_id, 'season_ending',
             jsonb_build_object('board', v_board, 'rank', r.rnk, 'season', v_season,
                                'to_top10', CASE WHEN r.rnk <= 10 THEN 0 ELSE GREATEST(0, COALESCE(t.score, r.score) - r.score + 1) END),
             'season_ending:' || v_board || ':' || v_season
        FROM ranked r CROSS JOIN tenth t
       WHERE r.rnk <= 30
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM inserted;
    v_total := v_total + v_count;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_streak_reminders(), public.generate_season_ending_reminders(boolean) FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('streak-reminders', '0 17 * * *', 'SELECT public.generate_streak_reminders()');
SELECT cron.schedule('season-ending-reminders', '0 12 * * *', 'SELECT public.generate_season_ending_reminders()');
SELECT cron.schedule('purge-old-notifications', '40 3 * * *', $cron$DELETE FROM public.user_notifications WHERE created_at < now() - interval '30 days'$cron$);

-- ---------------------------------------------------------------------------------------------
-- Friends: season leaderboard among me and my accepted friends.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_friends_season_leaderboard(p_board text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_season text := public.current_season_key();
BEGIN
  IF auth.uid() IS NULL OR p_board NOT IN ('classic', 'chaos') THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    WITH circle AS (
      SELECT auth.uid() AS user_id
      UNION
      SELECT CASE WHEN f.user_id_1 = auth.uid() THEN f.user_id_2 ELSE f.user_id_1 END
        FROM public.friends f
       WHERE f.status = 'accepted' AND auth.uid() IN (f.user_id_1, f.user_id_2)
    ), ranked AS (
      SELECT p.player_name, p.avatar_url, s.score, p.auth_user_id = auth.uid() AS is_me,
             rank() OVER (ORDER BY s.score DESC, s.updated_at ASC) AS rnk
        FROM circle c
        JOIN public.profiles p ON p.auth_user_id = c.user_id
        JOIN public.season_scores s ON s.profile_id = p.id AND s.season_key = v_season AND s.board = p_board
    )
    SELECT jsonb_agg(jsonb_build_object('player_name', player_name, 'avatar_url', avatar_url, 'score', score, 'rank', rnk, 'is_me', is_me) ORDER BY rnk)
      FROM ranked
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_friends_season_leaderboard(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends_season_leaderboard(text) TO authenticated;
