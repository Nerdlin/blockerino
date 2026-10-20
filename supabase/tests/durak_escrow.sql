-- Manual check for 20261020150000_durak_escrow.sql. Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/durak_escrow.sql
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'a@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'b@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'c@test.local');
insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-000000000001', 'a', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1000),
  ('b0000000-0000-0000-0000-000000000002', 'b', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 1000),
  ('b0000000-0000-0000-0000-000000000003', 'c', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 50);

create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"a0000000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true);
$$;
create or replace function pg_temp.coins() returns text language sql as $$
  select string_agg(player_name || '=' || coins, ' ' order by player_name) from profiles;
$$;

set local role authenticated;

-- 1 winner takes the pot: 3 players, bet 100 -> a pays 100, b pays 100, c has 50 and is refused; 2-player table instead
select pg_temp.as_user(1); select '1 a pays' as check, durak_pay_ante('t1', 100, 2);
select '1 a pays again' as check, durak_pay_ante('t1', 100, 2);
select pg_temp.as_user(2); select '1 b wrong bet' as check, durak_pay_ante('t1', 500, 2);
select '1 b pays' as check, durak_pay_ante('t1', 100, 2);
select pg_temp.as_user(3); select '1 c table full' as check, durak_pay_ante('t1', 100, 2);
reset role; select '1 coins after antes' as check, pg_temp.coins(); set local role authenticated;
-- expect: pending, then won; a=1100 b=900
select pg_temp.as_user(1); select '1 a wins' as check, durak_report('t1', 'win');
select pg_temp.as_user(2); select '1 b loses' as check, durak_report('t1', 'loss');
reset role; select '1 coins' as check, pg_temp.coins(); set local role authenticated;

-- 2 two winners claim: disputed, everybody refunded (a=1100 b=900 unchanged after the refund of the 100 antes)
select pg_temp.as_user(1); select '2 a pays' as check, durak_pay_ante('t2', 100, 2);
select pg_temp.as_user(2); select '2 b pays' as check, durak_pay_ante('t2', 100, 2);
select pg_temp.as_user(1); select '2 a claims win' as check, durak_report('t2', 'win');
select pg_temp.as_user(2); select '2 b claims win' as check, durak_report('t2', 'win');
reset role; select '2 coins' as check, pg_temp.coins(); set local role authenticated;

-- 3 draw: refunded
select pg_temp.as_user(1); select '3 a pays' as check, durak_pay_ante('t3', 200, 2);
select pg_temp.as_user(2); select '3 b pays' as check, durak_pay_ante('t3', 200, 2);
select '3 b draw' as check, durak_report('t3', 'draw');
select pg_temp.as_user(1); select '3 a draw' as check, durak_report('t3', 'draw');
reset role; select '3 coins' as check, pg_temp.coins(); set local role authenticated;

-- 4 not enough coins
select pg_temp.as_user(3); select '4 c broke' as check, durak_pay_ante('t4', 100, 2);

-- 5 a stranger cannot report for a table they did not join
select pg_temp.as_user(3); select '5 stranger' as check, durak_report('t1', 'win');
select '5 unknown table' as check, durak_report('nope', 'win');

-- 6 lone winner claim: pending, cron refuses to settle before 90 s, then pays the pot (a=1300? see coins)
select pg_temp.as_user(1); select '6 a pays' as check, durak_pay_ante('t6', 100, 2);
select pg_temp.as_user(2); select '6 b pays' as check, durak_pay_ante('t6', 100, 2);
select pg_temp.as_user(1); select '6 a wins alone' as check, durak_report('t6', 'win');
reset role;
select '6 settled early' as check, settle_pending_durak();
update durak_tables set first_report_at = now() - interval '2 minutes' where table_id = 't6';
select '6 settled' as check, settle_pending_durak();
select '6 coins' as check, pg_temp.coins();
set local role authenticated;

-- 7 nobody ever reports: refunded after 3 hours
select pg_temp.as_user(1); select '7 a pays' as check, durak_pay_ante('t7', 300, 2);
select pg_temp.as_user(2); select '7 b pays' as check, durak_pay_ante('t7', 300, 2);
reset role;
update durak_tables set created_at = now() - interval '4 hours' where table_id = 't7';
select '7 settled' as check, settle_pending_durak();
select '7 coins' as check, pg_temp.coins();

-- 8 clients cannot touch the tables directly
set local role authenticated;
do $$
begin
  begin
    perform 1 from durak_stakes;
    raise notice '8 direct read: NOT BLOCKED (bad)';
  exception when insufficient_privilege then
    raise notice '8 direct read: blocked (good)';
  end;
end $$;
rollback;
