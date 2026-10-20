-- Manual check for 20261020120024_profile_integrity.sql. Everything is rolled back.
-- Run against the LOCAL database only:
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/profile_integrity.sql
-- Expected output is written next to each check ("expect").
begin;
insert into profiles (id, player_name, auth_user_id, player_id, coins)
values ('11111111-1111-1111-1111-111111111111', 'tester', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 100);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- expect: highscore 0, coins 25100 (+25000 per write), discord_id empty
update profiles set highscore_classic = 999999, coins = 999999, discord_id = 'hacked'
  where auth_user_id = '22222222-2222-2222-2222-222222222222';
select 'cheat update' as check, highscore_classic, coins, discord_id from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: coins 50 (spending is free)
update profiles set coins = 50 where id = '11111111-1111-1111-1111-111111111111';
select 'spend' as check, coins from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: t, f, f, t, highscore 5000
select 'rpc ok' as check, submit_high_score('classic', 5000);
select 'rpc too big' as check, submit_high_score('classic', 3000000);
select 'rpc bad mode' as check, submit_high_score('nope', 10);
select 'rpc lower' as check, submit_high_score('classic', 100);
select 'rpc result' as check, highscore_classic from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: coins 35050, coins_gained_today 60000 (25000 already used above, 60000 per day in total)
update profiles set coins = 100000 where auth_user_id = '22222222-2222-2222-2222-222222222222';
update profiles set coins = 100000 where auth_user_id = '22222222-2222-2222-2222-222222222222';
update profiles set coins = 100000 where auth_user_id = '22222222-2222-2222-2222-222222222222';
select 'daily cap' as check, coins, coins_gained_today from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: 0 / 0 / empty (a client cannot create a rich profile)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into profiles (player_name, auth_user_id, player_id, coins, highscore_chaos, discord_id)
values ('tester2', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 777, 777, 'x');
select 'insert cheat' as check, coins, highscore_chaos, discord_id from profiles where player_name = 'tester2';

-- expect: name stays 'tester' (another user cannot edit my row)
update profiles set player_name = 'stolen' where id = '11111111-1111-1111-1111-111111111111';
select 'foreign row' as check, player_name from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: coins 1000000, highscore 123456 (dashboard / SQL editor is unrestricted)
reset role;
update profiles set coins = 1000000, highscore_classic = 123456 where id = '11111111-1111-1111-1111-111111111111';
select 'admin' as check, coins, highscore_classic from profiles where id = '11111111-1111-1111-1111-111111111111';
rollback;
