-- Check for 20261021100000_crash_reports.sql. Everything is rolled back; any failed assert stops the run.
begin;

set local role anon;

do $$
declare n integer;
begin
  n := report_crashes('[{"device_id":"dev-12345678","fingerprint":"abcd1234","message":"boom","stack":"at x","screen":"menu","fatal":true}]'::jsonb);
  assert n = 1, 'a valid report is stored';

  n := report_crashes('[{"device_id":"x","fingerprint":"abcd1234","message":"bad device"}, {"device_id":"dev-12345678","fingerprint":"!","message":"bad fingerprint"}, 5, {"device_id":"dev-12345678","fingerprint":"abcd1234","message":""}]'::jsonb);
  assert n = 0, 'malformed items are skipped';

  n := report_crashes('{"not":"an array"}'::jsonb);
  assert n = 0, 'not an array';

  -- 30 a day per device
  n := 0;
  for i in 1..35 loop
    n := n + report_crashes('[{"device_id":"flood-device-1","fingerprint":"abcd1234","message":"again"}]'::jsonb);
  end loop;
  assert n = 30, 'a device is capped at 30 a day';

  begin
    perform count(*) from crash_reports;
    assert false, 'table must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
declare top record;
begin
  select * into top from analytics_crashes_week order by reports_7d desc limit 1;
  assert top.fingerprint = 'abcd1234' and top.reports_7d = 31 and top.trend = 'new', 'the week digest groups and ranks';
end $$;

rollback;
select 'crash_reports ok' as result;
