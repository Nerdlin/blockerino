-- Manual check for 20261020170000_season_rewards_server_grant.sql and 20261020171000_daily_streak.sql.
-- Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/daily_streak.sql
begin;

insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-000000000001', 'a', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 0);

create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"a0000000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true);
$$;

set local role authenticated;
select pg_temp.as_user(1);

-- 1 first claim: streak 1, 50 coins; a second claim the same day changes nothing
select '1 status' as check, daily_reward_status();
select '1 claim' as check, claim_daily_reward();
select '1 again' as check, claim_daily_reward();
select '1 status after' as check, daily_reward_status();

-- 2 a client cannot write the streak columns directly
update profiles set streak_count = 99, streak_best = 99, streak_last_day = null where auth_user_id = 'a0000000-0000-0000-0000-000000000001';
select '2 direct write' as check, streak_count, streak_best, streak_last_day is not null as day_kept from profiles where id = 'b0000000-0000-0000-0000-000000000001';

-- 3 next day continues the streak: 60 coins
reset role;
update profiles set streak_last_day = (now() at time zone 'utc')::date - 1 where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated; select pg_temp.as_user(1);
select '3 day 2' as check, claim_daily_reward();

-- 4 day 7: 110 + 100 coins
reset role;
update profiles set streak_count = 6, streak_last_day = (now() at time zone 'utc')::date - 1 where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated; select pg_temp.as_user(1);
select '4 day 7' as check, claim_daily_reward();

-- 5 a missed day starts again from 1; the best streak is kept; status shows the broken streak as 0
reset role;
update profiles set streak_last_day = (now() at time zone 'utc')::date - 3 where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated; select pg_temp.as_user(1);
select '5 broken status' as check, daily_reward_status();
select '5 restart' as check, claim_daily_reward();

-- 6 a stranger without a profile
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select '6 no profile' as check, claim_daily_reward();

-- 7 reward table: day 1, 6, 7, 14, 30, 60
reset role;
select '7 rewards' as check, streak_reward_coins(1) d1, streak_reward_coins(6) d6, streak_reward_coins(7) d7, streak_reward_coins(14) d14, streak_reward_coins(30) d30, streak_reward_coins(60) d60;

-- 8 season rewards are credited by the server: coins and the podium cosmetic, once
insert into season_rewards (season_key, board, profile_id, rank, coins, item_id) values
  ('2026-09', 'classic', 'b0000000-0000-0000-0000-000000000001', 1, 1000, 'background_season_gold'),
  ('2026-09', 'elo', 'b0000000-0000-0000-0000-000000000001', 4, 300, null);
update profiles set coins = 0, owned_item_ids = array['piece_classic'] where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated; select pg_temp.as_user(1);
select '8 claim' as check, jsonb_array_length(claim_season_rewards() -> 'entries') as entries;
select '8 claim again' as check, jsonb_array_length(claim_season_rewards() -> 'entries') as entries;
reset role;
select '8 wallet (coins 1300, gold item owned)' as check, coins, (select array_agg(i order by i) from unnest(owned_item_ids) i) from profiles where id = 'b0000000-0000-0000-0000-000000000001';
rollback;
