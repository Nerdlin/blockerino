-- Check for 20261118130000_season_pass.sql. Everything is rolled back; any failed assert stops the run.
-- Not run yet: the migration is not applied anywhere (no Docker for a local database). Run it on a branch database first.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000d1', 'pass1@example.test'),
  ('a0000000-0000-0000-0000-0000000000d2', 'pass2@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins, owned_item_ids) values
  ('b0000000-0000-0000-0000-0000000000d1', 'PassOne', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 0, '{}'),
  ('b0000000-0000-0000-0000-0000000000d2', 'PassTwo', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d2', 0, '{}');

-- a test helper (rolled back with everything else): pretends the last reports were an hour ago, so the 30 second
-- spacing does not stop a loop of calls
create function public._test_age_reports() returns void language sql security definer set search_path = public as
  $$ update public.season_pass_daily set last_at = now() - interval '1 hour' $$;
grant execute on function public._test_age_reports() to authenticated;

-- the rules and the seasons' cosmetics ---------------------------------------------------------------------------------
do $$
begin
  assert season_pass_tier_xp(1) = 150 and season_pass_tier_xp(30) = 8850 and season_pass_tier_xp(0) = 0, 'tier xp';
  assert season_pass_tier(0) = 0 and season_pass_tier(149) = 0 and season_pass_tier(150) = 1 and season_pass_tier(8850) = 30
     and season_pass_tier(1000000) = 30, 'tier of an xp total';
  assert season_pass_min_gap_seconds() = 30, 'the spacing of reports';
  assert season_pass_event_xp('level') = 10 and season_pass_event_max('level') = 5, 'the level map pays 10 xp, 5 a day';
  assert season_pass_reward(1) = '{"coins":25}'::jsonb and season_pass_reward(10) = '{"cosmetic":true}'::jsonb
     and season_pass_reward(30) = '{"coins":100,"chest":"big","cosmetic":true}'::jsonb and season_pass_reward(31) is null, 'rewards';
  assert (select count(*) from generate_series(1, 30) n where season_pass_reward(n) is not null) = 30, 'a reward for each tier';
  assert (select sum(coalesce((season_pass_reward(n) ->> 'coins')::int, 0)) from generate_series(1, 30) n) = 1015, 'a pass pays 1 015 coins';
  assert (select sum(coalesce((season_pass_reward(n) ->> 'keys')::int, 0)) from generate_series(1, 30) n) = 5, 'a pass pays 5 keys';
  assert (select count(*) from generate_series(1, 30) n where season_pass_reward(n) ->> 'chest' = 'small') = 2, 'two small chests';
  assert (select count(*) from generate_series(1, 30) n where season_pass_reward(n) ->> 'chest' = 'big') = 1, 'one big chest';
  assert season_pass_cosmetic_coins(10) = 100 and season_pass_cosmetic_coins(18) = 150 and season_pass_cosmetic_coins(25) = 200
     and season_pass_cosmetic_coins(30) = 300 and season_pass_cosmetic_coins(5) = 0, 'replacement coins';

  -- four seasons with four skins each, all distinct, all server-only and unpriced
  assert (select count(*) from season_pass_cosmetics where season_key in ('2026-11', '2026-12', '2027-01', '2027-02')) = 16, 'sixteen skins in four seasons';
  assert (select count(distinct item_id) from season_pass_cosmetics where season_key in ('2026-11', '2026-12', '2027-01', '2027-02')) = 16, 'all different';
  assert (select count(*) from season_pass_cosmetics c join shop_catalog s on s.item_id = c.item_id
           where c.season_key in ('2026-11', '2026-12', '2027-01', '2027-02') and s.kind = 'server_only' and s.price = 0) = 16, 'server-only and unpriced';
  assert (select count(*) from season_pass_cosmetics where season_key in ('2026-11', '2026-12', '2027-01', '2027-02') and tier not in (10, 18, 25, 30)) = 0, 'skins sit on tiers 10, 18, 25, 30';
  assert season_pass_cosmetic('2026-12', 10) = 'piece_season_snowfall' and season_pass_cosmetic('2027-02', 30) = 'background_season_blizzard'
     and season_pass_cosmetic('2030-01', 10) is null, 'the set of a season';
end $$;

-- the current season gets a known set for the claims below (whatever month this runs in)
insert into season_pass_cosmetics (season_key, tier, item_id) values
  (current_season_key(), 10, 'piece_season_dawn'),
  (current_season_key(), 18, 'background_season_horizon'),
  (current_season_key(), 25, 'piece_season_nova'),
  (current_season_key(), 30, 'background_season_zenith')
on conflict (season_key, tier) do update set item_id = excluded.item_id;

-- a signed-in player earns XP, within the limits ----------------------------------------------------------------------
set local role authenticated;

do $$
declare r jsonb; i int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

  r := season_pass_sync();
  assert r ->> 'status' = 'ok' and (r ->> 'xp')::int = 0 and (r ->> 'tier')::int = 0 and r ->> 'season' = current_season_key(), format('fresh pass: %s', r);
  assert r -> 'cosmetics' ->> '10' = 'piece_season_dawn' and r -> 'cosmetics' ->> '30' = 'background_season_zenith', format('the answer names the season''s skins: %s', r);

  assert season_pass_add_xp('versus') ->> 'status' = 'bad_source', 'the client cannot report Versus';
  assert season_pass_add_xp('quest_task') ->> 'status' = 'bad_source', 'the client cannot report tasks';
  assert season_pass_add_xp('nonsense') ->> 'status' = 'bad_source', 'unknown source';

  -- the first report pays, a second one at once is too fast, other sources are not held up by it
  r := season_pass_add_xp('classic');
  assert r ->> 'status' = 'ok' and (r ->> 'gained')::int = 20 and (r ->> 'xp')::int = 20, format('a classic game: %s', r);
  r := season_pass_add_xp('classic');
  assert r ->> 'status' = 'too_fast' and (r ->> 'retry_after')::int between 1 and 30, format('too fast: %s', r);
  r := season_pass_add_xp('chaos');
  assert r ->> 'status' = 'ok' and (r ->> 'gained')::int = 20 and (r ->> 'xp')::int = 40, format('spacing is per source: %s', r);

  -- only 5 classic games a day count
  for i in 1..4 loop
    perform _test_age_reports();
    r := season_pass_add_xp('classic');
    assert (r ->> 'gained')::int = 20, format('classic game %s: %s', i + 1, r);
  end loop;
  perform _test_age_reports();
  r := season_pass_add_xp('classic');
  assert r ->> 'status' = 'ok' and (r ->> 'gained')::int = 0 and (r ->> 'xp')::int = 120, format('the sixth classic game pays nothing: %s', r);

  -- the day's limit: 120 so far; chaos 4 more (80), challenge 4 (60), more_win 4 (80) reach 340, more_play is cut to the last 10
  for i in 1..4 loop perform _test_age_reports(); perform season_pass_add_xp('chaos'); end loop;
  for i in 1..4 loop perform _test_age_reports(); perform season_pass_add_xp('challenge'); end loop;
  for i in 1..4 loop perform _test_age_reports(); perform season_pass_add_xp('more_win'); end loop;
  perform _test_age_reports();
  r := season_pass_add_xp('more_play');
  assert (r ->> 'gained')::int = 8, format('first more_play: %s', r);
  perform _test_age_reports();
  r := season_pass_add_xp('more_play');
  assert (r ->> 'gained')::int = 2 and (r ->> 'xp')::int = 350 and (r ->> 'today_xp')::int = 350, format('the daily limit: %s', r);
  perform _test_age_reports();
  r := season_pass_add_xp('level');
  assert (r ->> 'gained')::int = 0 and (r ->> 'xp')::int = 350, 'nothing after the limit';
end $$;

-- tiers: claimed once, in the current season, once reached -----------------------------------------------------------
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

  assert (season_pass_sync() ->> 'tier')::int = 2, '350 xp is tier 2';
  assert season_pass_claim(3) ->> 'status' = 'locked', 'tier 3 is not reached';
  assert season_pass_claim(0) ->> 'status' = 'bad_tier' and season_pass_claim(31) ->> 'status' = 'bad_tier', 'bad tiers';

  r := season_pass_claim(1);
  assert r ->> 'status' = 'ok' and (r ->> 'coins')::int = 25 and (r ->> 'wallet')::int = 25 and (r ->> 'claimed_tier')::int = 1, format('tier 1: %s', r);
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
  begin
    perform 1 from season_pass_cosmetics;
    assert false, 'season_pass_cosmetics must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform season_pass_cosmetic(current_season_key(), 10);
    assert false, 'the helper must not be callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- a guest (anonymous account) earns and claims nothing ---------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated","is_anonymous":true}', true);
  assert season_pass_sync() ->> 'status' = 'guest', 'guest sync';
  assert season_pass_add_xp('classic') ->> 'status' = 'guest', 'guest xp';
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
  r := season_pass_add_xp('classic');
  assert (r ->> 'gained')::int = 20 and (r ->> 'xp')::int = 175, 'reported and verified xp share the day';
  r := season_pass_add_xp('level');
  assert (r ->> 'gained')::int = 10 and (r ->> 'xp')::int = 185 and (r ->> 'today_xp')::int = 185, format('a first level clear: %s', r);
end $$;
reset role;

-- rewards: the season's skin, a skin already owned, a season without a set, chests -------------------------------------
update season_pass_progress set xp = 8850 where profile_id = 'b0000000-0000-0000-0000-0000000000d2' and season_key = current_season_key();

set local role authenticated;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

  r := season_pass_claim(10);
  assert r ->> 'status' = 'ok' and r ->> 'item_id' = 'piece_season_dawn' and (r ->> 'duplicate')::boolean = false and (r ->> 'coins')::int = 0, format('tier 10: %s', r);
  assert 'piece_season_dawn' = any (select jsonb_array_elements_text(r -> 'owned_item_ids')), 'the skin is owned';

  r := season_pass_claim(5);
  assert r ->> 'status' = 'ok' and r -> 'chest' ->> 'size' = 'small', format('tier 5 opens a small chest: %s', r);
  assert r -> 'chest' ->> 'item_id' is distinct from 'piece_season_dawn', 'a chest never gives the season skins';
end $$;
reset role;

-- a skin already owned pays the replacement coins instead
update season_pass_progress set claimed_tiers = array_remove(claimed_tiers, 10) where profile_id = 'b0000000-0000-0000-0000-0000000000d2';
set local role authenticated;
do $$
declare r jsonb; v_before int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
  select coins into v_before from profiles where id = 'b0000000-0000-0000-0000-0000000000d2';
  r := season_pass_claim(10);
  assert r ->> 'status' = 'ok' and (r ->> 'duplicate')::boolean and (r ->> 'coins')::int = 100 and r ->> 'item_id' = 'piece_season_dawn', format('duplicate: %s', r);
  assert (r ->> 'wallet')::int = v_before + 100, 'the replacement coins are paid';
end $$;
reset role;

-- a season without a set pays coins for the cosmetic tiers
delete from season_pass_cosmetics where season_key = current_season_key();
set local role authenticated;
do $$
declare r jsonb; v_before int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
  assert season_pass_sync() -> 'cosmetics' = '{}'::jsonb, 'no set, no skins in the answer';

  select coins into v_before from profiles where id = 'b0000000-0000-0000-0000-0000000000d2';
  r := season_pass_claim(18);
  assert r ->> 'status' = 'ok' and r ->> 'item_id' is null and (r ->> 'coins')::int = 150 and not (r ->> 'duplicate')::boolean, format('tier 18 without a set: %s', r);
  assert (r ->> 'wallet')::int = v_before + 150, 'coins instead of the skin';

  r := season_pass_claim(30);
  assert r ->> 'status' = 'ok' and r -> 'chest' ->> 'size' = 'big' and r ->> 'item_id' is null and (r ->> 'coins')::int = 400,
    format('tier 30 without a set pays 100 + 300 coins and the big chest: %s', r);
end $$;
reset role;

rollback;
