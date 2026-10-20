-- Manual check for 20261020140000_shop_catalog.sql. Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/shop_catalog.sql
begin;
insert into profiles (id, player_name, auth_user_id, player_id, coins, owned_item_ids)
values ('11111111-1111-1111-1111-111111111111', 'tester', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 100, array['piece_classic']);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- expect: only the old item and the free / client_secret ones survive; paid and server_only are dropped
update profiles set owned_item_ids = array['piece_classic', 'chess_piece_royal', 'music_custom', 'background_season_gold', 'sfx_classic']
  where id = '11111111-1111-1111-1111-111111111111';
select 'self grant' as check, (select array_agg(i order by i) from unnest(owned_item_ids) i) from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: an owned item is never lost by a stale client
update profiles set owned_item_ids = array['sfx_classic'] where id = '11111111-1111-1111-1111-111111111111';
select 'stale client' as check, (select array_agg(i order by i) from unnest(owned_item_ids) i) from profiles where id = '11111111-1111-1111-1111-111111111111';

-- expect: not_enough_coins (100 < 500), coins stay 100
select 'broke' as check, purchase_shop_item('chess_piece_royal');

-- expect: purchased, coins 600 - 500 = 100, item owned (admin tops the balance up first)
reset role;
update profiles set coins = 600 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select 'buy' as check, purchase_shop_item('chess_piece_royal') - 'owned_item_ids' as result;
select 'buy again' as check, purchase_shop_item('chess_piece_royal') - 'owned_item_ids' as result;

-- expect: not_for_sale x2, unknown_item
select 'client secret' as check, purchase_shop_item('sfx_custom') - 'owned_item_ids' as result;
select 'season item' as check, purchase_shop_item('background_season_gold') - 'owned_item_ids' as result;
select 'unknown' as check, purchase_shop_item('does_not_exist');

-- expect: stranger without a profile gets no_profile
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select 'no profile' as check, purchase_shop_item('chess_board_violet');

-- expect: a new profile inserted by a client keeps only free / client_secret items
insert into profiles (player_name, auth_user_id, player_id, owned_item_ids)
values ('tester3', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', array['chess_piece_royal', 'sfx_classic']);
select 'insert grant' as check, owned_item_ids from profiles where player_name = 'tester3';

-- expect: the dashboard / SQL editor can grant anything
reset role;
update profiles set owned_item_ids = array['chess_piece_royal', 'background_season_gold'] where id = '11111111-1111-1111-1111-111111111111';
select 'admin' as check, owned_item_ids from profiles where id = '11111111-1111-1111-1111-111111111111';
rollback;
