-- Check for 20261112090000_anonymous_guests.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-0000000000f1', 'real@example.test', false),
  ('a0000000-0000-0000-0000-0000000000f2', null, true);
insert into profiles (id, player_name, auth_user_id, player_id, coins, elo) values
  ('b0000000-0000-0000-0000-0000000000f1', 'Real', 'a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', 0, 1000);

do $$
begin
  assert is_real_account_id('a0000000-0000-0000-0000-0000000000f1'), 'a signed-in player is a real account';
  assert not is_real_account_id('a0000000-0000-0000-0000-0000000000f2'), 'a guest''s anonymous account is not';
  assert not is_real_account_id('guest_123'), 'an old guest id is not';
  assert is_account_id('a0000000-0000-0000-0000-0000000000f2'), 'room slots of an anonymous guest are still protected';
end $$;

set local role authenticated;

-- the request filter: a guest may do what a signed-out visitor may, plus matchmaking rooms
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f2","role":"authenticated","is_anonymous":true}', true);

  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/matchmaking_rooms', true);
  perform guard_anonymous_request();
  perform set_config('request.method', 'PATCH', true);
  perform guard_anonymous_request();
  perform set_config('request.method', 'GET', true);
  perform set_config('request.path', '/profiles', true);
  perform guard_anonymous_request();
  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/rpc/track_events', true);
  perform guard_anonymous_request();

  begin
    perform set_config('request.path', '/rpc/claim_daily_reward', true);
    perform guard_anonymous_request();
    assert false, 'a guest must not claim the daily reward';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_config('request.path', '/rpc/report_versus_result', true);
    perform guard_anonymous_request();
    assert false, 'a guest must not report rated results';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_config('request.path', '/profiles', true);
    perform guard_anonymous_request();
    assert false, 'a guest must not write profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_config('request.path', '/friends', true);
    perform guard_anonymous_request();
    assert false, 'a guest must not send friend requests';
  exception when insufficient_privilege then null;
  end;

  -- a signed-in player passes untouched
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f1","role":"authenticated","is_anonymous":false}', true);
  perform set_config('request.path', '/rpc/claim_daily_reward', true);
  perform guard_anonymous_request();
end $$;

-- the tables refuse a guest even without the filter
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f2","role":"authenticated","is_anonymous":true}', true);
  begin
    insert into profiles (id, player_name, auth_user_id, player_id)
    values ('b0000000-0000-0000-0000-0000000000f2', 'Guest', 'a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-0000000000f2');
    assert false, 'a guest must not create a profile';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- versus Elo: beating a guest's anonymous account is rationed like beating any guest
do $$
declare i int; v_elo int;
begin
  for i in 1..6 loop
    insert into versus_matches (room_id, player1_id, player2_id, game_mode)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-0000000000f1', 'guest_' || i, 'classic');
  end loop;
  perform _settle_versus_match(room_id, 'p1_win') from versus_matches where player1_id = 'a0000000-0000-0000-0000-0000000000f1' and player2_id like 'guest_%';
  insert into versus_matches (room_id, player1_id, player2_id, game_mode)
  values ('c0000000-0000-0000-0000-0000000000f9', 'a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f2', 'classic');
  assert _settle_versus_match('c0000000-0000-0000-0000-0000000000f9', 'p1_win') = 'capped', 'an anonymous opponent counts toward the guest ration';
  select elo into v_elo from profiles where auth_user_id = 'a0000000-0000-0000-0000-0000000000f1';
  assert v_elo = 1050, format('five guest wins give +50, got %s', v_elo);
end $$;

select 'anonymous guests ok';
rollback;
