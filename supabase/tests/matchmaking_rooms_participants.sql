-- Manual check for 20261109140000_matchmaking_rooms_participants_only.sql. Everything is rolled back.
-- Run against the LOCAL database only:
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/matchmaking_rooms_participants.sql
-- Accounts: A = aaaaaaaa-…, B = bbbbbbbb-…, C = cccccccc-… (outsider). Guest ids are plain text.
begin;
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), ('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into matchmaking_rooms (id, player1_id, player1_name, player2_id, player2_name, game_mode, status, is_private) values
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', null, null, 'classic', 'waiting', false),
  ('00000000-0000-0000-0000-000000000002', 'guest_1', 'G', null, null, 'classic', 'waiting', false),
  ('00000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'classic', 'playing', false),
  ('00000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'guest_2', 'G2', 'classic', 'playing', false);

-- outsider C (signed in)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
-- expect: 0 rows (A's waiting room is protected)
with d as (delete from matchmaking_rooms where id = '00000000-0000-0000-0000-000000000001' returning 1) select 'C deletes A room' as check, count(*) from d;
-- expect: error caught -> 'blocked'
do $$ begin
  update matchmaking_rooms set status = 'finished', winner_name = 'C' where id = '00000000-0000-0000-0000-000000000003';
  raise notice 'C finishes A-vs-B: ALLOWED (bad)';
exception when insufficient_privilege then raise notice 'C finishes A-vs-B: blocked (ok)'; end $$;

-- signed out
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- expect: 0 rows
with d as (delete from matchmaking_rooms where id = '00000000-0000-0000-0000-000000000001' returning 1) select 'anon deletes A room' as check, count(*) from d;
do $$ begin
  update matchmaking_rooms set status = 'finished', winner_name = 'X' where id = '00000000-0000-0000-0000-000000000003';
  raise notice 'anon finishes A-vs-B: ALLOWED (bad)';
exception when insufficient_privilege then raise notice 'anon finishes A-vs-B: blocked (ok)'; end $$;
-- expect: 1 row (guest rooms stay as before: a guest has no identity to check)
with d as (delete from matchmaking_rooms where id = '00000000-0000-0000-0000-000000000002' returning 1) select 'anon deletes guest room' as check, count(*) from d;
-- expect: 1 row (the guest of A-vs-guest must still be able to finish)
with u as (update matchmaking_rooms set status = 'finished', winner_name = 'G2' where id = '00000000-0000-0000-0000-000000000004' returning 1) select 'guest finishes A-vs-guest' as check, count(*) from u;

-- player B
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
-- expect: 1 row
with u as (update matchmaking_rooms set status = 'finished', winner_name = 'B' where id = '00000000-0000-0000-0000-000000000003' returning 1) select 'B finishes own match' as check, count(*) from u;

-- host A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
-- expect: 1 row
with d as (delete from matchmaking_rooms where id = '00000000-0000-0000-0000-000000000001' returning 1) select 'A deletes own room' as check, count(*) from d;
rollback;
