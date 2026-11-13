-- Check for 20261114100000_streak_chest.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000c7', 'chest@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins, owned_item_ids, streak_count, streak_best, streak_last_day, streak_season)
values ('b0000000-0000-0000-0000-0000000000c7', 'Chest', 'a0000000-0000-0000-0000-0000000000c7', 'a0000000-0000-0000-0000-0000000000c7',
        1000, '{}', 6, 6, (now() at time zone 'utc')::date - 1, current_season_key());

do $$
declare cal jsonb;
begin
  assert streak_reward_coins(1) = 50 and streak_reward_coins(7) = 110 and streak_reward_coins(8) = 55
     and streak_reward_coins(28) = 125 and streak_reward_coins(29) = 120, 'calendar coins';
  assert streak_chest(7) = 'small' and streak_chest(21) = 'small' and streak_chest(28) = 'big' and streak_chest(8) is null, 'chest days';
  cal := streak_calendar();
  assert jsonb_array_length(cal) = 28 and cal -> 27 ->> 'chest' = 'big' and (cal -> 0 ->> 'coins')::int = 50, 'the calendar the client draws';
end $$;

set local role authenticated;

do $$
declare r jsonb; s jsonb; v_coins int; v_owned text[];
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);

  s := daily_reward_status();
  assert (s ->> 'next_streak')::int = 7 and s ->> 'next_chest' = 'small' and (s ->> 'streak')::int = 6, format('status: %s', s);
  assert jsonb_array_length(s -> 'calendar') = 28, 'the status carries the calendar';

  r := claim_daily_reward();
  assert r ->> 'status' = 'claimed' and (r ->> 'streak')::int = 7, format('day 7 claimed: %s', r);
  assert r -> 'chest' ->> 'size' = 'small', 'day 7 opens a small chest';

  select coins, owned_item_ids into v_coins, v_owned from profiles where id = 'b0000000-0000-0000-0000-0000000000c7';
  if r -> 'chest' ->> 'kind' = 'item' then
    assert v_coins = 1110, format('an item chest pays the daily coins only, got %s', v_coins);
    assert (r -> 'chest' ->> 'item_id') = any (v_owned), 'the item is owned now';
    assert r -> 'chest' ->> 'rarity' in ('common', 'rare', 'epic', 'legendary'), 'the chest names the rarity';
  else
    assert (r -> 'chest' ->> 'coins')::int between 250 and 1500, 'chest coins';
    assert v_coins = 1110 + (r -> 'chest' ->> 'coins')::int, format('coin chest paid, got %s', v_coins);
  end if;

  r := claim_daily_reward();
  assert r ->> 'status' = 'already' and r -> 'chest' = 'null'::jsonb, 'no second chest the same day';
end $$;

reset role;

-- day 28: the big chest gives an item and 300 coins
update profiles set streak_count = 27, streak_last_day = (now() at time zone 'utc')::date - 1, coins = 0
 where id = 'b0000000-0000-0000-0000-0000000000c7';
set local role authenticated;
do $$
declare r jsonb; v_coins int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
  r := claim_daily_reward();
  assert (r ->> 'streak')::int = 28 and r -> 'chest' ->> 'size' = 'big' and r -> 'chest' ->> 'kind' = 'item', format('big chest: %s', r);
  select coins into v_coins from profiles where id = 'b0000000-0000-0000-0000-0000000000c7';
  assert v_coins = 125 + 300, format('big chest coins, got %s', v_coins);
end $$;
reset role;

-- a missed day or a new season starts over at day 1
update profiles set streak_count = 10, streak_last_day = (now() at time zone 'utc')::date - 2
 where id = 'b0000000-0000-0000-0000-0000000000c7';
set local role authenticated;
do $$
declare s jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
  s := daily_reward_status();
  assert (s ->> 'streak')::int = 0 and (s ->> 'next_streak')::int = 1, format('missed a day: %s', s);
end $$;
reset role;
update profiles set streak_count = 10, streak_last_day = (now() at time zone 'utc')::date - 1, streak_season = '2000-01'
 where id = 'b0000000-0000-0000-0000-0000000000c7';
set local role authenticated;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
  r := claim_daily_reward();
  assert (r ->> 'streak')::int = 1, format('a new season starts again: %s', r);
end $$;
reset role;

-- a player who owns every item still gets a chest: coins
update profiles set owned_item_ids = (select array_agg(item_id) from shop_catalog), streak_count = 13,
       streak_last_day = (now() at time zone 'utc')::date - 1, streak_season = current_season_key()
 where id = 'b0000000-0000-0000-0000-0000000000c7';
set local role authenticated;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
  r := claim_daily_reward();
  assert (r ->> 'streak')::int = 14 and r -> 'chest' ->> 'kind' = 'coins', format('nothing left to give: coins, got %s', r);
end $$;

reset role;
-- the roller: odds by roll, no duplicates, nothing left means coins
do $$
declare c jsonb; v_all text[];
begin
  c := open_chest('small', '{}', 0.10);
  assert c ->> 'kind' = 'coins' and (c ->> 'coins')::int between 250 and 600, format('small low roll: coins, got %s', c);
  c := open_chest('small', '{}', 0.97);
  assert c ->> 'kind' = 'item' and c ->> 'rarity' = 'legendary', format('small top roll: legendary, got %s', c);
  c := open_chest('big', '{}', 0.10);
  assert c ->> 'kind' = 'item' and c ->> 'rarity' = 'rare' and (c ->> 'coins')::int = 300, format('big low roll: rare + 300, got %s', c);
  assert item_rarity(300) = 'common' and item_rarity(301) = 'rare' and item_rarity(900) = 'epic' and item_rarity(901) = 'legendary', 'rarity by price';
  select array_agg(item_id) into v_all from shop_catalog where item_rarity(price) = 'legendary';
  c := open_chest('big', v_all, 0.95);
  assert c ->> 'rarity' = 'epic', format('no legendary left: the next lower one, got %s', c);
  select array_agg(item_id) into v_all from shop_catalog;
  c := open_chest('big', v_all, 0.95);
  assert c ->> 'kind' = 'coins' and (c ->> 'coins')::int = 1800, format('nothing left: coins by rarity, got %s', c);
end $$;

select 'streak chest ok';
rollback;
