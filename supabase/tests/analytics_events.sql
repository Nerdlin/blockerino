-- Manual check for 20261020160000_analytics_events.sql. Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/analytics_events.sql
begin;

-- guest (anon) sends a batch: expect 3 stored (2 valid + 1 with oversized props that is stored with empty props)
set local role anon;
select 'guest batch' as check, track_events(('[
  {"name":"screen_view","device_id":"device-aaaa1111","session_id":"s1","platform":"web","app_version":"2.0.0","props":{"screen":"menu"}},
  {"name":"game_start","device_id":"device-aaaa1111","session_id":"s1","props":{"mode":"classic"}},
  {"name":"game_over","device_id":"device-aaaa1111","session_id":"s1","props":{"note":"' || repeat('x', 3000) || '"}},
  {"name":"Bad Name!","device_id":"device-aaaa1111"},
  {"name":"ok_name","device_id":"short"},
  {"name":"ok_name"},
  "not an object"
]')::jsonb);

-- expect: 0 for non-array input, and at most 50 events from a bigger batch
select 'not an array' as check, track_events('{"name":"x"}'::jsonb);
select 'big batch' as check, track_events((select jsonb_agg(jsonb_build_object('name','spam','device_id','device-bbbb2222')) from generate_series(1, 80)));

-- clients cannot read the table or the reports
do $$
begin
  begin perform 1 from events; raise notice 'read events: NOT BLOCKED (bad)';
  exception when insufficient_privilege then raise notice 'read events: blocked (good)'; end;
  begin perform 1 from analytics_daily_active; raise notice 'read report: NOT BLOCKED (bad)';
  exception when insufficient_privilege then raise notice 'read report: blocked (good)'; end;
end $$;

-- a signed-in player: user_id is filled in by the server, a forged one is ignored
reset role;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'a@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select 'signed in' as check, track_events('[{"name":"screen_view","device_id":"device-cccc3333","user_id":"a0000000-0000-0000-0000-0000000000ff","props":{"screen":"shop"}}]'::jsonb);

reset role;
select 'stored (3 guest + 50 spam + 1 signed in = 54)' as check, count(*) from events;
select 'oversized props dropped' as check, props from events where name = 'game_over';
select 'user_id from server' as check, user_id from events where device_id = 'device-cccc3333';
select 'daily active' as check, day, devices, signed_in_users from analytics_daily_active;
select 'screens' as check, screen, views from analytics_screens order by screen;
select 'funnel' as check, mode, started, finished from analytics_game_funnel;
select 'first session' as check, new_devices, no_game, one_game, two_or_more from analytics_first_session;
select 'retention' as check, first_day, new_devices, day1_pct, day7_pct from analytics_retention;
rollback;
