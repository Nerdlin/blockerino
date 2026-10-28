-- Check for 20261029120000_chess_friend_ratings.sql (needs the chess_ratings migration). Rolled back at the end.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000e1', 'me@example.test'),
  ('a0000000-0000-0000-0000-0000000000e2', 'friend@example.test'),
  ('a0000000-0000-0000-0000-0000000000e3', 'pending@example.test'),
  ('a0000000-0000-0000-0000-0000000000e4', 'stranger@example.test');

insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-0000000000e1', 'me', 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1', 0),
  ('b0000000-0000-0000-0000-0000000000e2', 'friend', 'a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-0000000000e2', 0),
  ('b0000000-0000-0000-0000-0000000000e3', 'pending', 'a0000000-0000-0000-0000-0000000000e3', 'a0000000-0000-0000-0000-0000000000e3', 0),
  ('b0000000-0000-0000-0000-0000000000e4', 'stranger', 'a0000000-0000-0000-0000-0000000000e4', 'a0000000-0000-0000-0000-0000000000e4', 0);

insert into friends (user_id_1, user_id_2, status) values
  ('a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-0000000000e1', 'accepted'),
  ('a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e3', 'pending');

insert into chess_ratings (profile_id, time_class, rating, games_played) values
  ('b0000000-0000-0000-0000-0000000000e1', 'blitz', 1111, 8),
  ('b0000000-0000-0000-0000-0000000000e2', 'blitz', 1234, 12),
  ('b0000000-0000-0000-0000-0000000000e2', 'rapid', 1400, 20),
  ('b0000000-0000-0000-0000-0000000000e3', 'blitz', 1500, 30),
  ('b0000000-0000-0000-0000-0000000000e4', 'blitz', 1600, 30);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from get_friend_chess_ratings()) = 2, 'only the accepted friend, two classes';
  assert (select rating from get_friend_chess_ratings() where friend_ref = 'a0000000-0000-0000-0000-0000000000e2' and time_class = 'blitz') = 1234, 'friend blitz rating';
  assert (select rating from get_friend_chess_ratings() where time_class = 'rapid') = 1400, 'friend rapid rating';
  assert not exists (select 1 from get_friend_chess_ratings() where friend_ref in ('a0000000-0000-0000-0000-0000000000e3', 'a0000000-0000-0000-0000-0000000000e4', 'a0000000-0000-0000-0000-0000000000e1')), 'no pending request, stranger or self';
end $$;

-- the friend sees the caller the same way
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from get_friend_chess_ratings()) = 1, 'the friend sees one rating row: mine';
  assert (select rating from get_friend_chess_ratings()) = 1111, 'my blitz rating';
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform * from get_friend_chess_ratings();
    assert false, 'anon must not call it';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'chess_friend_ratings ok' as result;
