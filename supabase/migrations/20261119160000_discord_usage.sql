-- Where the Discord Activity is played (owner-only monitoring).
-- The app sends one "discord_open" event per session (only when the player's usage statistics switch is on): surface (guild or dm),
-- Discord platform (desktop or mobile) and the server id. Three rules for this event:
--   * it is stored without the account (user_id NULL), so a server id can not be tied to a player;
--   * it is deleted after 90 days (other events keep 180);
--   * only an admin can read the result (admin_discord_usage), clients cannot read the table.

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
      CASE WHEN v_name = 'discord_open' THEN NULL ELSE auth.uid() END,
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

-- 90 days for the Discord event.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-discord-usage', '40 3 * * *', $cron$DELETE FROM public.events WHERE name = 'discord_open' AND created_at < now() - interval '90 days'$cron$);

-- Servers and surfaces over the last p_days (default 7): sessions, distinct devices, desktop/mobile split. Admin only.
CREATE OR REPLACE FUNCTION public.admin_discord_usage(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
BEGIN
  PERFORM public.admin_require();
  RETURN jsonb_build_object(
    'days', v_days,
    'total', (SELECT count(*) FROM public.events WHERE name = 'discord_open' AND created_at > now() - make_interval(days => v_days)),
    'devices', (SELECT count(DISTINCT device_id) FROM public.events WHERE name = 'discord_open' AND created_at > now() - make_interval(days => v_days)),
    'surfaces', coalesce((
      SELECT jsonb_agg(jsonb_build_object('surface', surface, 'platform', platform, 'sessions', sessions, 'devices', devices) ORDER BY sessions DESC)
      FROM (
        SELECT props ->> 'discord_surface' AS surface, props ->> 'discord_platform' AS platform, count(*) AS sessions, count(DISTINCT device_id) AS devices
          FROM public.events
         WHERE name = 'discord_open' AND created_at > now() - make_interval(days => v_days)
         GROUP BY 1, 2
      ) s
    ), '[]'::jsonb),
    'servers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('guild', guild, 'sessions', sessions, 'devices', devices, 'last_seen', last_seen) ORDER BY sessions DESC)
      FROM (
        SELECT props ->> 'discord_guild' AS guild, count(*) AS sessions, count(DISTINCT device_id) AS devices, max(created_at) AS last_seen
          FROM public.events
         WHERE name = 'discord_open' AND props ->> 'discord_guild' IS NOT NULL AND created_at > now() - make_interval(days => v_days)
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 30
      ) g
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_discord_usage(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_discord_usage(integer) TO authenticated;
