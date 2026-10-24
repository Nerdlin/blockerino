-- Check for 20261022100000_player_profiles.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000f1', 'open@example.test'),
  ('a0000000-0000-0000-0000-0000000000f2', 'friendsonly@example.test'),
  ('a0000000-0000-0000-0000-0000000000f3', 'private@example.test'),
  ('a0000000-0000-0000-0000-0000000000f4', 'stranger@example.test');

insert into profiles (id, player_name, auth_user_id, player_id, coins, elo, highscore_classic, highscore_chaos) values
  ('b0000000-0000-0000-0000-0000000000f1', 'OpenOne', 'a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', 777, 1100, 4200, 900),
  ('b0000000-0000-0000-0000-0000000000f2', 'FriendsOnly', 'a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-0000000000f2', 0, 1000, 10, 0),
  ('b0000000-0000-0000-0000-0000000000f3', 'PrivateOne', 'a0000000-0000-0000-0000-0000000000f3', 'a0000000-0000-0000-0000-0000000000f3', 0, 1000, 10, 0),
  ('b0000000-0000-0000-0000-0000000000f4', 'Stranger', 'a0000000-0000-0000-0000-0000000000f4', 'a0000000-0000-0000-0000-0000000000f4', 0, 1000, 0, 0);

-- Stranger and FriendsOnly are friends; Stranger asked PrivateOne (pending).
insert into friends (user_id_1, user_id_2, status) values
  ('a0000000-0000-0000-0000-0000000000f4', 'a0000000-0000-0000-0000-0000000000f2', 'accepted'),
  ('a0000000-0000-0000-0000-0000000000f4', 'a0000000-0000-0000-0000-0000000000f3', 'pending');

insert into achievement_claims (user_id, achievement_id, reward) values
  ('a0000000-0000-0000-0000-0000000000f1', 'first_steps', 25),
  ('a0000000-0000-0000-0000-0000000000f1', 'score_myth', 2000),
  ('a0000000-0000-0000-0000-0000000000f1', 'royal_mint', 10000),
  ('a0000000-0000-0000-0000-0000000000f1', 'tycoon', 2500),
  ('a0000000-0000-0000-0000-0000000000f1', 'piggy_bank', 100);

-- Privacy choices and a synced record, set as their owners.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  assert (get_profile_visibility())->>'visibility' = 'everyone', 'default is everyone';
  r := set_profile_visibility('friends');
  assert r->>'status' = 'ok' and r->>'visibility' = 'friends', 'friends accepted';
  assert (set_profile_visibility('public'))->>'status' = 'invalid', 'unknown value refused';
  assert (get_profile_visibility())->>'visibility' = 'friends', 'choice is kept';
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
do $$
begin
  perform set_profile_visibility('nobody');
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := sync_game_records('{"chess": {"wins": 5, "losses": 2, "draws": 1, "botWins": 3, "botLosses": 0, "botDraws": 0}, "unknown": {"wins": 9}, "durak": 7}'::jsonb);
  assert r->>'status' = 'ok', 'sync ok';
  assert (r->'records'->'chess'->>'wins')::int = 5, 'chess stored';
  assert not (r->'records' ? 'unknown'), 'unknown game ignored';
  assert not (r->'records' ? 'durak'), 'malformed row ignored';

  -- A second phone with fewer games never lowers the record, a higher counter raises it.
  r := sync_game_records('{"chess": {"wins": 2, "losses": 9, "draws": 0, "botWins": 0, "botLosses": 0, "botDraws": 0}}'::jsonb);
  assert (r->'records'->'chess'->>'wins')::int = 5 and (r->'records'->'chess'->>'losses')::int = 9, 'counters merge by maximum';

  -- Absurd values are clamped, negatives become zero.
  r := sync_game_records('{"sudoku": {"wins": 99999999999, "losses": -4}}'::jsonb);
  assert (r->'records'->'sudoku'->>'wins')::int = 1000000 and (r->'records'->'sudoku'->>'losses')::int = 0, 'clamped';
end $$;

-- A guest (no session) sees open profiles, nothing of the others, and never the private fields.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare r jsonb;
begin
  r := get_public_profile('openone');
  assert r->>'status' = 'ok', 'open profile is readable by a guest (case-insensitive)';
  assert (r->>'elo')::int = 1100 and (r->'highscores'->>'classic')::int = 4200, 'scores shown';
  assert r->>'relation' = 'none', 'a guest has no relation';
  assert not (r ? 'coins') and not (r ? 'owned_item_ids') and not (r ? 'equipped') and not (r ? 'email'), 'no private fields';
  assert (r->'achievements'->0->>'id') = 'royal_mint' and jsonb_array_length(r->'achievements') = 3, 'three best achievements, highest first';
  assert (r->'achievements'->2->>'id') = 'score_myth', 'third is the next best';
  assert (r->'records'->'chess'->>'wins')::int = 5, 'synced record shown';

  r := get_public_profile('FriendsOnly');
  assert r->>'status' = 'hidden' and not (r ? 'elo') and r->>'name' = 'FriendsOnly', 'friends-only is hidden from a guest, name stays';
  assert get_public_profile('nobody-here')->>'status' = 'not_found', 'unknown name';
  assert get_public_profile('')->>'status' = 'not_found', 'empty name';
end $$;

-- Stranger is a friend of FriendsOnly, has a pending request to PrivateOne.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := get_public_profile('FriendsOnly');
  assert r->>'status' = 'ok' and r->>'relation' = 'friend' and r->>'friend_row_id' is not null, 'a friend sees a friends-only profile';
  r := get_public_profile('PrivateOne');
  assert r->>'status' = 'hidden' and r->>'relation' = 'pending_out', 'nobody stays hidden, the request state is shown';
  r := get_public_profile('OpenOne');
  assert r->>'relation' = 'none' and r->>'visibility' is null, 'visibility setting is not leaked';
end $$;

-- The owner always sees their own profile, whatever the setting.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := get_public_profile('PrivateOne');
  assert r->>'status' = 'ok' and r->>'relation' = 'self' and r->>'visibility' = 'nobody', 'own profile is always open';
  r := get_public_profile('Stranger');
  assert r->>'relation' = 'pending_in', 'the receiver sees the incoming request';
end $$;

-- The tables are closed to clients.
do $$
begin
  begin
    perform 1 from public.player_game_records;
    assert false, 'player_game_records must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.profile_privacy;
    assert false, 'profile_privacy must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'player_profiles ok' as result;
