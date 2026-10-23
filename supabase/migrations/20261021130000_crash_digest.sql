-- "What is crashing most this week" for the Supabase dashboard (Table Editor -> views): the top errors of the
-- last 7 days next to the 7 days before, so a new or growing problem stands out. Not readable by clients.
CREATE OR REPLACE VIEW public.analytics_crashes_week AS
SELECT fingerprint,
       max(message) AS message,
       count(*) FILTER (WHERE created_at > now() - interval '7 days') AS reports_7d,
       count(*) FILTER (WHERE created_at <= now() - interval '7 days') AS reports_prev_7d,
       count(DISTINCT device_id) FILTER (WHERE created_at > now() - interval '7 days') AS devices_7d,
       bool_or(fatal) FILTER (WHERE created_at > now() - interval '7 days') AS any_fatal,
       array_agg(DISTINCT app_version) FILTER (WHERE created_at > now() - interval '7 days') AS versions,
       mode() WITHIN GROUP (ORDER BY screen) AS common_screen,
       CASE
         WHEN count(*) FILTER (WHERE created_at <= now() - interval '7 days') = 0 THEN 'new'
         WHEN count(*) FILTER (WHERE created_at > now() - interval '7 days')
              > count(*) FILTER (WHERE created_at <= now() - interval '7 days') THEN 'growing'
         ELSE 'steady'
       END AS trend,
       max(created_at) AS last_seen
  FROM public.crash_reports
 WHERE created_at > now() - interval '14 days'
 GROUP BY fingerprint
HAVING count(*) FILTER (WHERE created_at > now() - interval '7 days') > 0
 ORDER BY reports_7d DESC, last_seen DESC;

REVOKE ALL ON public.analytics_crashes_week FROM anon, authenticated;
