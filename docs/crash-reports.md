# Crash reports: where to look

Reports go to the `crash_reports` table of our own Supabase (no third party). Open the dashboard
(Table Editor, views section):

- `analytics_crashes_week` - what crashes most in the last 7 days next to the 7 days before; `trend` is
  `new`, `growing` or `steady`. Start here after a release.
- `analytics_crashes` - the same errors over 30 days, newest first.
- `crash_reports` - the raw rows (stack, screen, app version, platform).

Rows older than 90 days are deleted every night. Players can switch reporting off in Options
("Usage statistics"). Clients can only call `report_crashes()`; they cannot read any of these.
