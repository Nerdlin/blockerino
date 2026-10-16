-- Close the previous leaderboard season on the 1st of every month, 00:05 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Same job name replaces an existing schedule, so this is safe to re-run.
SELECT cron.schedule('close-season', '5 0 1 * *', 'SELECT public.close_season()');
