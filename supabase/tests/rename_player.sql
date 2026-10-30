-- Check for 20261031100000_rename_player.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000d1', 'renamer@example.test'),
  ('a0000000-0000-0000-0000-0000000000d2', 'taken@example.test');

insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000d1', 'OldNick', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1'),
  ('b0000000-0000-0000-0000-0000000000d2', 'TakenNick', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d2');

insert into more_game_ratings (game_id, player_key, player_name, elo, wins, losses, draws, games_played)
  values ('durak', 'oldnick', 'OldNick', 1234, 3, 1, 0, 4);
insert into more_game_match_history (game_id, room_code, player1_key, player1_name, player2_key, player2_name, result, winner_key,
    player1_elo_before, player1_elo_after, player1_elo_change, player2_elo_before, player2_elo_after, player2_elo_change)
  values ('durak', 'ROOM1', 'oldnick', 'OldNick', 'takennick', 'TakenNick', 'player1', 'oldnick', 1200, 1216, 16, 1200, 1184, -16);

-- anonymous callers cannot rename
set local role anon;
do $$
begin
  perform rename_player('Whatever');
  assert false, 'anon must not call rename_player';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := rename_player('ab');
  assert r->>'status' = 'invalid', 'too short';
  r := rename_player('name<script>');
  assert r->>'status' = 'invalid', 'bad characters';
  r := rename_player('Player');
  assert r->>'status' = 'invalid', 'reserved name';
  r := rename_player('takennick');
  assert r->>'status' = 'taken', 'another profile has it in any letter case';

  -- a direct write cannot change the name any more
  update profiles set player_name = 'Sneaky' where auth_user_id = 'a0000000-0000-0000-0000-0000000000d1';
  assert (select player_name from profiles where id = 'b0000000-0000-0000-0000-0000000000d1') = 'OldNick', 'the guard keeps the name on a client update';

  r := rename_player('  Новый   Ник  ');
  assert r->>'status' = 'ok' and r->>'name' = 'Новый Ник', 'trimmed, inner spaces collapsed, Cyrillic allowed';
  r := rename_player('Another Nick');
  assert r->>'status' = 'cooldown', 'one rename per 30 days';
end $$;
reset role;

do $$
begin
  assert (select player_name from profiles where id = 'b0000000-0000-0000-0000-0000000000d1') = 'Новый Ник', 'profile renamed';
  assert (select elo from more_game_ratings where player_key = 'новый ник' and game_id = 'durak') = 1234, 'the rating moved with the name';
  assert not exists (select 1 from more_game_ratings where player_key = 'oldnick'), 'nothing left under the old key';
  assert (select player1_key || '|' || winner_key from more_game_match_history where room_code = 'ROOM1') = 'новый ник|новый ник', 'history moved';
  assert (select count(*) from player_name_changes where profile_id = 'b0000000-0000-0000-0000-0000000000d1') = 1, 'the rename is logged';
end $$;

rollback;
select 'rename_player ok' as result;
