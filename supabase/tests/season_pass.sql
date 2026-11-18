-- Check for 20261118130000_season_pass.sql. Everything is rolled back; any failed assert stops the run.
-- Not run yet: the migration is not applied anywhere (no Docker for a local database). Run it on a branch database first.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000d1', 'pass1@example.test'),
  ('a0000000-0000-0000-0000-0000000000d2', 'pass2@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins, owned_item_ids) values
  ('b0000000-0000-0000-0000-0000000000d1', 'PassOne', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 0, '{}'),
  ('b0000000-0000-0000-0000-0000000000d2', 'PassTwo', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d2', 0, '{}');

-- the rules ------------------------------------------------------------------------------------------------------------
do $$
begin
  assert season_pass_tier_xp(1) = 150 and season_pass_tier_xp(30) = 8850 and season_pass_tier_xp(0) = 0, 'tier xp';
  assert season_pass_tier(0) = 0 and season_pass_tier(149) = 0 and season_pass_tier(150) = 1 and season_pass_tier(8850) = 30
     and season_pass_tier(1000000) = 30, 'tier of an xp total';
  assert season_pass_reward(1) = '{"coins":75}'::jsonb and season_pass_reward(30) ? 'chest' and season_pass_reward(31) is null, 'rewards';
  assert (select count(*) from generate_series(1, 30) n where season_pass_reward(n) is not null) = 30, 'a reward for each tier';
  assert (select count(*) from shop_catalog where item_id in ('piece_season_dawn', 'piece_season_nova', 'background_season_horizon', 'background_season_zenith')
             and kind = 'server_only' and price = 0) = 4, 'the cosmetics are server-only and unpriced';
end $$;

-- a signed-in player earns XP, within the limits ----------------------------------------------------------------------
set local role authenticated;

do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

  r := season_pass_sync();
  assert r ->> 'status' = 'ok' and (r ->> 'xp')::int = 0 and (r ->> 'tier')::int = 0 and r ->> 'season' = current_season_key(), format('fresh pass: %s', r);

  r := season_pass_add_xp('classic', 3);
  assert (r ->> 'gained')::int = 60 and (r ->> 'xp')::int = 60, format('3 classic games: %s', r);
  r := season_pass_add_xp('classic', 10);
  assert (r ->> 'gained')::int = 40 and (r ->> 'xp')::int = 100, format('only 5 classic games a day count: %s', r);
  r := season_pass_add_xp('classic', 1);
  assert (r ->> 'gained')::int = 0, 'the sixth classic game pays nothing';

  assert season_pass_add_xp('versus', 1) ->> 'status' = 'bad_source', 'the client cannot report Versus';
  assert season_pass_add_xp('quest_task', 1) ->> 'status' = 'bad_source', 'the client cannot report tasks';
  assert season_pass_add_xp('nonsense', 1) ->> 'status' = 'bad_source', 'unknown source';

  -- the day's limit: 100 so far; chaos 100, challenge 60, more_win 80 reach 340, more_play is cut to the last 10
  perform season_pass_add_xp('chaos', 5);
  perform season_pass_add_xp('challenge', 4);
  perform season_pass_add_xp('more_win', 4);
  r := season_pass_add_xp('more_play', 4);
  assert (r ->> 'gained')::int = 10 and (r ->> 'xp')::int = 350 and (r ->> 'today_xp')::int = 350, format('the daily limit: %s', r);
  r := season_pass_add_xp('challenge', 1);
  assert (r ->> 'gained')::int = 0 and (r ->> 'xp')::int = 350, 'nothing after the limit';
end $$;

-- tiers: claimed once, in the current season, once reached -----------------------------------------------------------
do $$
declare r jsonb; v_coins int; v_keys int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

  assert (season_pass_sync() ->> 'tier')::int = 2, '350 xp is tier 2';
  assert season_pass_claim(3) ->> 'status' = 'locked', 'tier 3 is not reached';
  assert season_pass_claim(0) ->> 'status' = 'bad_tier' and season_pass_claim(31) ->> 'status' = 'bad_tier', 'bad tiers';

  r := season_pass_claim(1);
  assert r ->> 'status' = 'ok' and (r ->> 'coins')::int = 75 and (r ->> 'wallet')::int = 75 and (r ->> 'claimed_tier')::int = 1, format('tier 1: %s', r);
  assert r -> 'claimed' = '[1]'::jsonb and (r ->> 'tier')::int = 2, 'the answer carries the pass';
  assert season_pass_claim(1) ->> 'status' = 'already', 'a tier pays once';

  r := season_pass_claim(2);
  assert r ->> 'status' = 'ok' and (r ->> 'keys')::int = 1 and (r -> 'state' ->> 'keys')::int = 1, format('tier 2 pays a key: %s', r);
end $$;

-- a client cannot read or write the tables -----------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
  begin
    perform 1 from season_pass_progress;
    assert false, 'season_pass_progress must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into season_pass_progress (profile_id, season_key, xp) values ('b0000000-0000-0000-0000-0000000000d1', '2099-01', 9999);
    assert false, 'season_pass_progress must not be writable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from season_pass_daily;
    assert false, 'season_pass_daily must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- a guest (anonymous account) earns and claims nothing ---------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated","is_anonymous":true}', true);
  assert season_pass_sync() ->> 'status' = 'guest', 'guest sync';
  assert season_pass_add_xp('classic', 1) ->> 'status' = 'guest', 'guest xp';
  assert season_pass_claim(1) ->> 'status' = 'guest', 'guest claim';
end $$;

reset role;
do $$
begin
  assert (select xp from season_pass_progress where profile_id = 'b0000000-0000-0000-0000-0000000000d1' and season_key = current_season_key()) = 350,
    'the guest calls changed nothing';
end $$;

-- Versus matches and daily tasks are counted from the server's own tables ----------------------------------------------
insert into versus_matches (room_id, player1_id, player2_id, game_mode, outcome, settled_at) values
  (gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d1', 'classic', 'p1_win', now()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d2', 'classic', 'p1_win', now()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d1', 'classic', 'capped', now()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d1', 'classic', 'p2_win', now() - interval '3 days');
insert into daily_quest_claims (user_id, day, quest_id, reward) values
  ('a0000000-0000-0000-0000-0000000000d2', current_date, 'lines_15', 20),
  ('a0000000-0000-0000-0000-0000000000d2', current_date, 'games_2', 20),
  ('a0000000-0000-0000-0000-0000000000d2', current_date, 'pieces_40', 20),
  ('a0000000-0000-0000-0000-0000000000d2', current_date, 'bonus', 50);

set local role authenticated;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
  r := season_pass_sync();
  -- 2 settled matches today (the capped one and the old one pay nothing) = 80; 3 tasks = 45; the bonus = 30
  assert (r ->> 'xp')::int = 155, format('verified xp: %s', r);
  r := season_pass_sync();
  assert (r ->> 'xp')::int = 155, 'a second sync pays nothing more';
  r := season_pass_add_xp('classic', 5);
  assert (r ->> 'gained')::int = 100 and (r ->> 'xp')::int = 255, 'reported and verified xp share the day';
  r := season_pass_add_xp('chaos', 5);
  assert (r ->> 'gained')::int = 95 and (r ->> 'today_xp')::int = 350, 'the daily limit counts both';
end $$;
reset role;

-- rewards: cosmetics, duplicates, chests -------------------------------------------------------------------------------
update season_pass_progress set xp = 8850 where profile_id = 'b0000000-0000-0000-0000-0000000000d2' and season_key = current_season_key();

set local role authenticated;
do $$
declare r jsonb; v_owned text[]; v_coins int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

  r := season_pass_claim(10);
  assert r ->> 'status' = 'ok' and r ->> 'item_id' = 'piece_season_dawn' and (r ->> 'duplicate')::boolean = false, format('tier 10: %s', r);
  assert 'piece_season_dawn' = any (select jsonb_array_elements_text(r -> 'owned_item_ids')), 'the cosmetic is owned';

  r := season_pass_claim(5);
  assert r ->> 'status' = 'ok' and r -> 'chest' ->> 'size' = 'small', format('tier 5 opens a small chest: %s', r);
  assert r -> 'chest' ->> 'item_id' is distinct from 'piece_season_dawn', 'a chest never gives the season cosmetics';

  r := season_pass_claim(30);
  assert r ->> 'status' = 'ok' and r -> 'chest' ->> 'size' = 'big' and r ->> 'item_id' = 'background_season_zenith' and (r ->> 'coins')::int = 400,
    format('tier 30: %s', r);
end $$;
reset role;

-- a cosmetic already owned pays 500 coins instead
update season_pass_progress set claimed_tiers = array_remove(claimed_tiers, 10) where profile_id = 'b0000000-0000-0000-0000-0000000000d2';
set local role authenticated;
do $$
declare r jsonb; v_before int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
  select coins into v_before from profiles where id = 'b0000000-0000-0000-0000-0000000000d2';
  r := season_pass_claim(10);
  assert r ->> 'status' = 'ok' and (r ->> 'duplicate')::boolean and (r ->> 'coins')::int = 500, format('duplicate: %s', r);
  assert (r ->> 'wallet')::int = v_before + 500, 'the replacement coins are paid';
end $$;
reset role;

rollback;
