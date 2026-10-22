-- First-party crash reports (Blockerino 2.0). Same rules as the usage statistics: no third-party service,
-- nothing personal (error text, a short stack, screen and app version only), the player can switch it off in
-- Options ("Usage statistics"), clients can only call report_crashes() and cannot read the table, and reports
-- older than 90 days are deleted every night. Read them in the Supabase dashboard (view analytics_crashes).

CREATE TABLE IF NOT EXISTS public.crash_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  client_time timestamptz,
  device_id text NOT NULL,
  user_id uuid,
  fingerprint text NOT NULL,
  message text NOT NULL,
  stack text,
  screen text,
  fatal boolean NOT NULL DEFAULT false,
  platform text,
  app_version text,
  os_version text
);

CREATE INDEX IF NOT EXISTS idx_crash_reports_created_at ON public.crash_reports (created_at);
CREATE INDEX IF NOT EXISTS idx_crash_reports_fingerprint ON public.crash_reports (fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_crash_reports_device_created_at ON public.crash_reports (device_id, created_at);

ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crash_reports FROM anon, authenticated;

-- Accepts a batch (up to 10) of {device_id, fingerprint, message, stack, screen, fatal, client_time, platform,
-- app_version, os_version}. Malformed items are skipped. Returns how many were stored.
CREATE OR REPLACE FUNCTION public.report_crashes(p_reports jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_stored integer := 0;
  v_device text;
  v_fingerprint text;
  v_message text;
  v_client_time timestamptz;
BEGIN
  IF p_reports IS NULL OR jsonb_typeof(p_reports) <> 'array' THEN RETURN 0; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_reports) LIMIT 10 LOOP
    CONTINUE WHEN jsonb_typeof(v_item) <> 'object';

    v_device := v_item ->> 'device_id';
    v_fingerprint := v_item ->> 'fingerprint';
    v_message := v_item ->> 'message';
    CONTINUE WHEN v_device IS NULL OR v_device !~ '^[A-Za-z0-9-]{8,64}$';
    CONTINUE WHEN v_fingerprint IS NULL OR v_fingerprint !~ '^[A-Za-z0-9]{4,24}$';
    CONTINUE WHEN v_message IS NULL OR length(v_message) = 0;

    -- One device cannot flood the table: at most 30 reports a day.
    CONTINUE WHEN (SELECT count(*) FROM public.crash_reports
                    WHERE device_id = v_device AND created_at > now() - interval '1 day') >= 30;

    BEGIN
      v_client_time := (v_item ->> 'client_time')::timestamptz;
    EXCEPTION WHEN others THEN
      v_client_time := NULL;
    END;

    INSERT INTO public.crash_reports (client_time, device_id, user_id, fingerprint, message, stack, screen, fatal, platform, app_version, os_version)
    VALUES (
      v_client_time,
      v_device,
      auth.uid(),
      v_fingerprint,
      left(v_message, 300),
      left(v_item ->> 'stack', 2000),
      left(v_item ->> 'screen', 40),
      coalesce((v_item ->> 'fatal') = 'true', false),
      left(v_item ->> 'platform', 16),
      left(v_item ->> 'app_version', 24),
      left(v_item ->> 'os_version', 24)
    );
    v_stored := v_stored + 1;
  END LOOP;

  RETURN v_stored;
END;
$$;

REVOKE ALL ON FUNCTION public.report_crashes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_crashes(jsonb) TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-old-crash-reports', '40 3 * * *', $cron$DELETE FROM public.crash_reports WHERE created_at < now() - interval '90 days'$cron$);

-- Same error grouped: how often, on how many devices, in which versions (last 30 days), newest first.
CREATE OR REPLACE VIEW public.analytics_crashes AS
SELECT fingerprint,
       max(message) AS message,
       count(*) AS reports,
       count(DISTINCT device_id) AS devices,
       bool_or(fatal) AS any_fatal,
       array_agg(DISTINCT app_version) AS versions,
       array_agg(DISTINCT platform) AS platforms,
       mode() WITHIN GROUP (ORDER BY screen) AS common_screen,
       max(created_at) AS last_seen,
       (array_agg(stack ORDER BY created_at DESC))[1] AS latest_stack
  FROM public.crash_reports
 WHERE created_at > now() - interval '30 days'
 GROUP BY fingerprint
 ORDER BY max(created_at) DESC;

REVOKE ALL ON public.analytics_crashes FROM anon, authenticated;
