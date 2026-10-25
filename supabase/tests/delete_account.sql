-- Check for 20261022120000_delete_account.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000d1', 'leaving@example.test'),
  ('a0000000-0000-0000-0000-0000000000d2', 'staying@example.test');

insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000d1', 'Leaver', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1'),
  ('b0000000-0000-0000-0000-0000000000d2', 'Stayer', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d2');

insert into friends (user_id_1, user_id_2, status) values ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d2', 'accepted');
insert into profile_privacy (user_id, visibility) values ('a0000000-0000-0000-0000-0000000000d1', 'friends');
insert into player_game_records (user_id, game_id, wins) values ('a0000000-0000-0000-0000-0000000000d1', 'chess', 3), ('a0000000-0000-0000-0000-0000000000d2', 'chess', 4);
insert into player_presence (user_id) values ('a0000000-0000-0000-0000-0000000000d1');
insert into achievement_claims (user_id, achievement_id, reward) values ('a0000000-0000-0000-0000-0000000000d1', 'first_steps', 25), ('a0000000-0000-0000-0000-0000000000d2', 'first_steps', 25);
insert into daily_quest_claims (user_id, day, quest_id, reward) values ('a0000000-0000-0000-0000-0000000000d1', current_date, 'games_2', 20);
insert into season_scores (season_key, board, profile_id, score) values ('2026-10', 'classic', 'b0000000-0000-0000-0000-0000000000d1', 500);
insert into more_game_ratings (game_id, player_key, player_name, wins, games_played) values ('chess', 'leaver', 'Leaver', 3, 3), ('chess', 'stayer', 'Stayer', 3, 3);
insert into matchmaking_rooms (id, player1_id, player1_name, status, is_private) values ('c0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 'Leaver', 'waiting', true);
insert into match_history (player1_id, player2_id, winner_id) values ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d1');
insert into season_results (season_key, board, profile_id, player_name, rank, score) values ('2026-09', 'classic', 'b0000000-0000-0000-0000-0000000000d1', 'Leaver', 3, 900);

-- A guest cannot delete anything.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform delete_my_account();
    assert false, 'anon must not be able to call it';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Somebody else deleting their own account touches nothing of Leaver; Leaver deletes theirs.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
begin
  assert (delete_my_account())->>'status' = 'ok', 'deletion answers ok';
end $$;

reset role;
do $$
declare v int;
begin
  assert not exists (select 1 from auth.users where id = 'a0000000-0000-0000-0000-0000000000d1'), 'the sign-in is gone';
  assert not exists (select 1 from profiles where player_name = 'Leaver'), 'the profile is gone';
  assert not exists (select 1 from friends where 'a0000000-0000-0000-0000-0000000000d1' in (user_id_1, user_id_2)), 'friendships are gone';
  assert not exists (select 1 from profile_privacy where user_id = 'a0000000-0000-0000-0000-0000000000d1'), 'privacy choice is gone';
  assert not exists (select 1 from player_game_records where user_id = 'a0000000-0000-0000-0000-0000000000d1'), 'records are gone';
  assert not exists (select 1 from player_presence where user_id = 'a0000000-0000-0000-0000-0000000000d1'), 'presence is gone';
  assert not exists (select 1 from achievement_claims where user_id = 'a0000000-0000-0000-0000-0000000000d1'), 'achievement claims are gone';
  assert not exists (select 1 from daily_quest_claims where user_id = 'a0000000-0000-0000-0000-0000000000d1'), 'quest claims are gone';
  assert not exists (select 1 from season_scores where profile_id = 'b0000000-0000-0000-0000-0000000000d1'), 'season scores are gone';
  assert not exists (select 1 from more_game_ratings where lower(player_name) = 'leaver'), 'the rating row is gone';
  assert not exists (select 1 from matchmaking_rooms where id = 'c0000000-0000-0000-0000-0000000000d1'), 'the waiting room is gone';

  select count(*) into v from match_history where player1_id is null and player2_id = 'a0000000-0000-0000-0000-0000000000d2' and winner_id is null;
  assert v = 1, 'match history keeps the row but no longer points to the player';
  assert (select player_name from season_results where season_key = '2026-09' and board = 'classic' and score = 900) = 'Deleted player', 'public season history is anonymised';

  -- The other player is untouched.
  assert exists (select 1 from auth.users where id = 'a0000000-0000-0000-0000-0000000000d2'), 'the other account stays';
  assert exists (select 1 from profiles where player_name = 'Stayer'), 'the other profile stays';
  assert (select wins from player_game_records where user_id = 'a0000000-0000-0000-0000-0000000000d2') = 4, 'the other records stay';
  assert exists (select 1 from more_game_ratings where lower(player_name) = 'stayer'), 'the other rating stays';
  assert exists (select 1 from achievement_claims where user_id = 'a0000000-0000-0000-0000-0000000000d2'), 'the other claims stay';
end $$;

rollback;
select 'delete_account ok' as result;
