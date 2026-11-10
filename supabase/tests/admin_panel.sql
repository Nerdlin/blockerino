-- Check for 20261111100000_admin_panel.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000e1', 'boss@example.test'),
  ('a0000000-0000-0000-0000-0000000000e2', 'player@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins, highscore_chaos) values
  ('b0000000-0000-0000-0000-0000000000e1', 'Boss', 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1', 0, 0),
  ('b0000000-0000-0000-0000-0000000000e2', 'Cheater', 'a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-0000000000e2', 100, 1999999);
insert into season_scores (season_key, board, profile_id, score) values
  (current_season_key(), 'chaos', 'b0000000-0000-0000-0000-0000000000e2', 1999999);
insert into admins (user_id) values ('a0000000-0000-0000-0000-0000000000e1');

set local role authenticated;

-- a player cannot use any admin function
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
  assert not is_admin(), 'a player is not an admin';
  begin
    perform admin_adjust_coins('b0000000-0000-0000-0000-0000000000e2', 1000000, 'me');
    assert false, 'a player must not give coins';
  exception when insufficient_privilege then null;
  end;
  begin
    perform admin_overview();
    assert false, 'a player must not read the overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from admins;
    assert false, 'the admins table is private';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the admin can
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
  assert is_admin(), 'the admin is an admin';
  r := admin_overview();
  assert (r->>'players')::int >= 2, 'the overview counts players';
  r := admin_find_players('cheat');
  assert jsonb_array_length(r) = 1 and r->0->>'player_name' = 'Cheater', 'find by part of the nickname';
  r := admin_adjust_coins('b0000000-0000-0000-0000-0000000000e2', 500, 'test');
  assert (r->>'coins')::int = 600, 'coins added';
  r := admin_adjust_coins('b0000000-0000-0000-0000-0000000000e2', -10000, 'test');
  assert (r->>'coins')::int = 0, 'coins never go below zero';
  assert jsonb_array_length(admin_season_top('chaos')) >= 1, 'season top is readable';
  perform admin_reset_record('b0000000-0000-0000-0000-0000000000e2', 'chaos');
  assert jsonb_array_length(admin_recent_log()) = 3, 'every change is logged';
end $$;

reset role;
do $$
begin
  assert (select highscore_chaos from profiles where id = 'b0000000-0000-0000-0000-0000000000e2') = 0, 'the fake record is wiped';
  assert not exists (select 1 from season_scores where profile_id = 'b0000000-0000-0000-0000-0000000000e2'), 'and its season entry';
end $$;

rollback;
select 'admin_panel ok' as result;
