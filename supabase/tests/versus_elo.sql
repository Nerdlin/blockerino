-- Manual check for 20261020122158_versus_elo.sql. Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/versus_elo.sql
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'p1@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'p2@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'p3@test.local');
insert into profiles (id, player_name, auth_user_id, player_id, elo) values
  ('b0000000-0000-0000-0000-000000000001', 'p1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 50),
  ('b0000000-0000-0000-0000-000000000002', 'p2', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 50),
  ('b0000000-0000-0000-0000-000000000003', 'p3', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 50);

create or replace function pg_temp.room(p_id uuid, p1 text, p2 text) returns void language sql as $$
  insert into matchmaking_rooms (id, player1_id, player1_name, player2_id, player2_name, game_mode, status, is_private)
  values (p_id, p1, 'n1', p2, 'n2', 'classic', 'playing', false);
$$;
create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"a0000000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true);
$$;
create or replace function pg_temp.elos() returns text language sql as $$
  select string_agg(player_name || '=' || elo, ' ' order by player_name) from profiles;
$$;

select pg_temp.room('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.room('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.room('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.room('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
select pg_temp.room('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'device-guest-id');

set local role authenticated;

-- 1 win + loss: expect pending, then recorded; p1=60 p2=40
select pg_temp.as_user(1);
select '1 p1 win' as check, report_versus_result('c0000000-0000-0000-0000-000000000001', 'win');
select pg_temp.as_user(2);
select '1 p2 loss' as check, report_versus_result('c0000000-0000-0000-0000-000000000001', 'loss');
reset role; select '1 elos' as check, pg_temp.elos(); set local role authenticated;

-- 2 a repeated report changes nothing: expect already
select pg_temp.as_user(1);
select '2 repeat' as check, report_versus_result('c0000000-0000-0000-0000-000000000001', 'win');

-- 3 a lone loss counts at once: p1 loses -> p1=50 p2=50
select '3 lone loss' as check, report_versus_result('c0000000-0000-0000-0000-000000000002', 'loss');
reset role; select '3 elos' as check, pg_temp.elos(); set local role authenticated;

-- 4 both claim a win: disputed, no change
select pg_temp.as_user(1);
select '4 p1 win' as check, report_versus_result('c0000000-0000-0000-0000-000000000003', 'win');
select pg_temp.as_user(2);
select '4 p2 win' as check, report_versus_result('c0000000-0000-0000-0000-000000000003', 'win');
reset role; select '4 elos' as check, pg_temp.elos(); set local role authenticated;

-- 5 a stranger cannot report for someone else's room: not_participant
select pg_temp.as_user(3);
select '5 stranger' as check, report_versus_result('c0000000-0000-0000-0000-000000000004', 'win');

-- 6 lone win waits, then the cron settles it after 90 s: pending, then p1=60 p2=40
select pg_temp.as_user(1);
select '6 lone win' as check, report_versus_result('c0000000-0000-0000-0000-000000000004', 'win');
reset role;
select '6 settled too early' as check, settle_pending_versus();
update versus_matches set p1_reported_at = now() - interval '2 minutes' where room_id = 'c0000000-0000-0000-0000-000000000004';
select '6 settled' as check, settle_pending_versus();
select '6 elos' as check, pg_temp.elos();
set local role authenticated;

-- 7 identity: p3 cannot open a room as p1's account, may open one with a guest id
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  begin
    insert into matchmaking_rooms (player1_id, player1_name, game_mode, status, is_private)
    values ('a0000000-0000-0000-0000-000000000001', 'x', 'classic', 'waiting', false);
    raise notice '7 hijack: NOT BLOCKED (bad)';
  exception when others then
    raise notice '7 hijack: %', case when sqlerrm like 'A room slot of a signed-in account%' then 'blocked (good)' else 'WRONG ERROR: ' || sqlerrm end;
  end;
  insert into matchmaking_rooms (player1_id, player1_name, game_mode, status, is_private)
  values ('some-random-device-id', 'x', 'classic', 'waiting', false);
  raise notice '7 guest room: allowed (good)';
end $$;

-- 8 pair cap: a win against a guest counts at most 5 times a day; the 6th is capped
reset role;
do $$
declare i int; r jsonb; rid uuid;
begin
  for i in 1..6 loop
    rid := gen_random_uuid();
    perform pg_temp.room(rid, 'a0000000-0000-0000-0000-000000000003', 'guest-' || i);
    perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    set local role authenticated;
    r := report_versus_result(rid, 'win');
    reset role;
    update versus_matches set p1_reported_at = now() - interval '2 minutes' where room_id = rid;
    perform settle_pending_versus();
    raise notice '8 guest win % -> outcome %', i, (select outcome from versus_matches where room_id = rid);
  end loop;
end $$;
select '8 p3 elo' as check, elo from profiles where player_name = 'p3';

rollback;
