-- First-party usage statistics (Blockerino 2.0). No third-party service, nothing personal:
--   * device_id is a random id the app creates for itself (not a hardware id), user_id is filled in
--     by the server from the signed-in account and is NULL for guests;
--   * clients can only call track_events(); they cannot read or edit the table;
--   * events older than 180 days are deleted every night;
--   * a player can switch collection off in Options (the app then sends nothing).
-- The analytics_* views below are for you (dashboard / SQL editor); clients cannot read them.

CREATE TABLE IF NOT EXISTS public.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  client_time timestamptz,
  device_id text NOT NULL,
  session_id text,
  user_id uuid,
  name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text,
  app_version text
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_name_created_at ON public.events (name, created_at);
CREATE INDEX IF NOT EXISTS idx_events_device_created_at ON public.events (device_id, created_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events FROM anon, authenticated;

-- Accepts a batch (up to 50) of {name, device_id, session_id, client_time, platform, app_version, props}.
-- Malformed events are skipped, props over 2 KB are dropped. Returns how many events were stored.
CREATE OR REPLACE FUNCTION public.track_events(p_events jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event jsonb;
  v_stored integer := 0;
  v_name text;
  v_device text;
  v_props jsonb;
  v_client_time timestamptz;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN RETURN 0; END IF;

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LIMIT 50 LOOP
    CONTINUE WHEN jsonb_typeof(v_event) <> 'object';

    v_name := v_event ->> 'name';
    v_device := v_event ->> 'device_id';
    CONTINUE WHEN v_name IS NULL OR v_name !~ '^[a-z][a-z0-9_]{1,39}$';
    CONTINUE WHEN v_device IS NULL OR v_device !~ '^[A-Za-z0-9-]{8,64}$';

    v_props := CASE WHEN jsonb_typeof(v_event -> 'props') = 'object' THEN v_event -> 'props' ELSE '{}'::jsonb END;
    IF length(v_props::text) > 2000 THEN v_props := '{}'::jsonb; END IF;

    BEGIN
      v_client_time := (v_event ->> 'client_time')::timestamptz;
    EXCEPTION WHEN others THEN
      v_client_time := NULL;
    END;

    INSERT INTO public.events (client_time, device_id, session_id, user_id, name, props, platform, app_version)
    VALUES (
      v_client_time,
      v_device,
      left(v_event ->> 'session_id', 64),
      auth.uid(),
      v_name,
      v_props,
      left(v_event ->> 'platform', 16),
      left(v_event ->> 'app_version', 24)
    );
    v_stored := v_stored + 1;
  END LOOP;

  RETURN v_stored;
END;
$$;

REVOKE ALL ON FUNCTION public.track_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_events(jsonb) TO anon, authenticated;

-- Nightly cleanup.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-old-events', '30 3 * * *', $cron$DELETE FROM public.events WHERE created_at < now() - interval '180 days'$cron$);

-- ---------------------------------------------------------------------------------------------
-- Reports (read them in the Supabase dashboard / SQL editor)
-- ---------------------------------------------------------------------------------------------

-- Distinct devices per day.
CREATE OR REPLACE VIEW public.analytics_daily_active AS
SELECT (created_at AT TIME ZONE 'utc')::date AS day,
       count(DISTINCT device_id) AS devices,
       count(DISTINCT user_id) AS signed_in_users
  FROM public.events
 GROUP BY 1
 ORDER BY 1 DESC;

-- Day-1 and day-7 retention by first-seen day: share of new devices that came back exactly 1 / 7 days later.
CREATE OR REPLACE VIEW public.analytics_retention AS
WITH first_seen AS (
  SELECT device_id, min((created_at AT TIME ZONE 'utc')::date) AS first_day
    FROM public.events GROUP BY device_id
), active AS (
  SELECT DISTINCT device_id, (created_at AT TIME ZONE 'utc')::date AS day FROM public.events
)
SELECT f.first_day,
       count(*) AS new_devices,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active a WHERE a.device_id = f.device_id AND a.day = f.first_day + 1)) / count(*), 1) AS day1_pct,
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM active a WHERE a.device_id = f.device_id AND a.day = f.first_day + 7)) / count(*), 1) AS day7_pct
  FROM first_seen f
 GROUP BY f.first_day
 ORDER BY f.first_day DESC;

-- Which screens are opened (last 30 days).
CREATE OR REPLACE VIEW public.analytics_screens AS
SELECT props ->> 'screen' AS screen, count(*) AS views, count(DISTINCT device_id) AS devices
  FROM public.events
 WHERE name = 'screen_view' AND created_at > now() - interval '30 days'
 GROUP BY 1
 ORDER BY views DESC;

-- Games started / finished per mode and the average score (last 30 days).
CREATE OR REPLACE VIEW public.analytics_game_funnel AS
SELECT mode,
       sum(started) AS started,
       sum(finished) AS finished,
       round(100.0 * sum(finished) / NULLIF(sum(started), 0), 1) AS finish_pct,
       round(avg(avg_score)) AS avg_score
  FROM (
    SELECT props ->> 'mode' AS mode,
           count(*) FILTER (WHERE name = 'game_start') AS started,
           count(*) FILTER (WHERE name = 'game_over') AS finished,
           avg((props ->> 'score')::numeric) FILTER (WHERE name = 'game_over') AS avg_score
      FROM public.events
     WHERE name IN ('game_start', 'game_over') AND created_at > now() - interval '30 days'
     GROUP BY 1
  ) t
 GROUP BY mode
 ORDER BY started DESC;

-- Games per device in the first session of a new device: how many play at all before leaving.
CREATE OR REPLACE VIEW public.analytics_first_session AS
WITH first_session AS (
  SELECT DISTINCT ON (device_id) device_id, session_id
    FROM public.events ORDER BY device_id, created_at
)
SELECT count(*) AS new_devices,
       count(*) FILTER (WHERE games = 0) AS no_game,
       count(*) FILTER (WHERE games = 1) AS one_game,
       count(*) FILTER (WHERE games >= 2) AS two_or_more
  FROM (
    SELECT f.device_id, count(e.id) FILTER (WHERE e.name = 'game_start') AS games
      FROM first_session f
      LEFT JOIN public.events e ON e.device_id = f.device_id AND e.session_id = f.session_id
     GROUP BY f.device_id
  ) t;

REVOKE ALL ON public.analytics_daily_active, public.analytics_retention, public.analytics_screens,
              public.analytics_game_funnel, public.analytics_first_session FROM anon, authenticated;
