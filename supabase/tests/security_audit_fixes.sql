-- Check for 20261110134159_security_audit_fixes.sql: one player cannot change another player's rating, coins or
-- friendships on their own word. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000d1', 'sec1@example.test'),
  ('a0000000-0000-0000-0000-0000000000d2', 'sec2@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-0000000000d1', 'Mallory', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 1000),
  ('b0000000-0000-0000-0000-0000000000d2', 'Victim', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000d2', 1000);

create or replace function pg_temp.as_user(n text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"a0000000-0000-0000-0000-0000000000%s","role":"authenticated"}', n), true);
$$;

set local role authenticated;

-- C1: the sender of a request cannot swap the sides and accept it
do $$
declare v_id uuid;
begin
  perform pg_temp.as_user('d1');
  insert into friends (user_id_1, user_id_2, status)
  values ('a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d2', 'pending') returning id into v_id;
  update friends set user_id_1 = 'a0000000-0000-0000-0000-0000000000d2', user_id_2 = 'a0000000-0000-0000-0000-0000000000d1', status = 'accepted' where id = v_id;
  assert (select status from friends where id = v_id) = 'pending', 'the sender cannot accept its own request';
  update friends set status = 'accepted' where id = v_id;
  assert (select status from friends where id = v_id) = 'pending', 'only the recipient accepts';
  perform pg_temp.as_user('d2');
  update friends set status = 'accepted' where id = v_id;
  assert (select status from friends where id = v_id) = 'accepted', 'the recipient accepts';
end $$;

-- B2: a win is counted only when the loser reports it
do $$
declare n integer;
begin
  perform pg_temp.as_user('d1');
  select count(*) into n from record_more_game_match('checkers', 'Mallory', 'Victim', 'player1', 'ROOM-X');
  assert n = 0, 'a self-reported win over someone else changes nothing';
  assert not exists (select 1 from more_game_ratings where player_key = more_game_player_key('Victim')), 'the victim gets no rating row';
  select count(*) into n from record_more_game_match('checkers', 'Mallory', 'Ghost', 'player2', 'ROOM-X');
  assert n = 0, 'an opponent without an account is not rated';
  select count(*) into n from record_more_game_match('checkers', 'Mallory', 'Victim', 'player2', 'ROOM-Y');
  assert n = 2, 'a reported loss is applied';
  perform pg_temp.as_user('d2');
  select count(*) into n from record_more_game_match('checkers', 'Mallory', 'Victim', 'draw', 'ROOM-Z');
  assert n = 0, 'one draw report waits for the other player';
  perform pg_temp.as_user('d1');
  select count(*) into n from record_more_game_match('checkers', 'Mallory', 'Victim', 'draw', 'ROOM-Z');
  assert n = 2, 'the second draw report applies it';
end $$;

-- B3: an early "win" at a Durak table does not take the pot while the others have not reported a loss
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('d1'); perform durak_pay_ante('sec-t1', 100, 2);
  perform pg_temp.as_user('d2'); perform durak_pay_ante('sec-t1', 100, 2);
  perform pg_temp.as_user('d1'); r := durak_report('sec-t1', 'win');
  assert r->>'status' = 'pending', 'a lone win waits';
end $$;

reset role;
do $$
begin
  update durak_tables set first_report_at = now() - interval '11 minutes' where table_id = 'sec-t1';
  perform settle_pending_durak();
  assert (select outcome from durak_tables where table_id = 'sec-t1') = 'refunded', 'without the loser''s report every stake goes back';
  assert (select coins from profiles where player_name = 'Victim') = 1000, 'the silent player keeps the stake';
end $$;

-- C2: login details are not stored in public profiles any more
do $$
begin
  update profiles set last_login_at = now(), login_providers = array['google'] where player_name = 'Victim';
  assert (select last_login_at from profiles where player_name = 'Victim') is null, 'profiles keep no login time';
  assert (select login_providers from profile_logins where profile_id = 'b0000000-0000-0000-0000-0000000000d2') = array['google'], 'it lands in profile_logins';
end $$;

rollback;
select 'security_audit_fixes ok' as result;
