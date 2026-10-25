-- Check for 20261022110000_invites_presence.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'host@example.test'),
  ('a0000000-0000-0000-0000-0000000000a2', 'friend@example.test'),
  ('a0000000-0000-0000-0000-0000000000a3', 'hidden@example.test'),
  ('a0000000-0000-0000-0000-0000000000a4', 'stranger@example.test');

insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000a1', 'InvHost', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-0000000000a2', 'InvFriend', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a2'),
  ('b0000000-0000-0000-0000-0000000000a3', 'InvHidden', 'a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a3'),
  ('b0000000-0000-0000-0000-0000000000a4', 'InvStranger', 'a0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-0000000000a4');

insert into friends (user_id_1, user_id_2, status) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2', 'accepted'),
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a3', 'accepted');

insert into profile_privacy (user_id, visibility) values ('a0000000-0000-0000-0000-0000000000a3', 'nobody');

insert into matchmaking_rooms (id, player1_id, player1_name, status, is_private, game_mode) values
  ('c0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'InvHost', 'waiting', true, 'chaos'),
  ('c0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a4', 'InvStranger', 'waiting', true, 'classic');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := notify_invite('c0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'ok', 'an invite to a friend is accepted';
  r := notify_invite('c0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'ok', 'the same room twice is harmless (deduplicated)';

  assert (notify_invite('c0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a4'))->>'status' = 'not_friends', 'a stranger cannot be invited';
  assert (notify_invite('c0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a2'))->>'status' = 'no_room', 'a room of somebody else cannot be used';
  assert (notify_invite('c0000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-0000000000a2'))->>'status' = 'no_room', 'an unknown room';
end $$;

-- The friend finds the invite, does not see it in the news inbox, and it carries the mode and the host's name.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := get_my_pending_invites();
  assert jsonb_array_length(r) = 1, 'one pending invite (the repeat was deduplicated)';
  assert r->0->>'from' = 'InvHost' and r->0->>'mode' = 'chaos' and r->0->>'room_id' = 'c0000000-0000-0000-0000-0000000000a1', 'invite details';
  assert jsonb_array_length(get_my_notifications()) = 0, 'invites stay out of the news inbox';
end $$;

-- Marking it read (the app does this when it shows the popup) removes it from the pending list.
do $$
declare v_id bigint;
begin
  v_id := (get_my_pending_invites()->0->>'id')::bigint;
  assert mark_notifications_read(array[v_id]) = 1, 'marked read';
  assert jsonb_array_length(get_my_pending_invites()) = 0, 'no longer pending';
end $$;

-- Old invites are not offered any more.
reset role;
update user_notifications set read_at = null, created_at = now() - interval '5 minutes' where kind = 'invite';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
begin
  assert jsonb_array_length(get_my_pending_invites()) = 0, 'an invite older than 3 minutes is gone';
end $$;

-- Spam guard: at most 5 invites from one player to one friend within 10 minutes.
reset role;
delete from user_notifications where kind = 'invite';
insert into matchmaking_rooms (id, player1_id, player1_name, status, is_private, game_mode)
select ('c0000000-0000-0000-0000-00000000b' || lpad(i::text, 3, '0'))::uuid, 'a0000000-0000-0000-0000-0000000000a1', 'InvHost', 'waiting', true, 'classic'
  from generate_series(1, 7) as i;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare i int; r jsonb; ok int := 0; throttled int := 0;
begin
  for i in 1..7 loop
    r := notify_invite(('c0000000-0000-0000-0000-00000000b' || lpad(i::text, 3, '0'))::uuid, 'a0000000-0000-0000-0000-0000000000a2');
    if r->>'status' = 'ok' then ok := ok + 1; elsif r->>'status' = 'throttled' then throttled := throttled + 1; end if;
  end loop;
  assert ok = 5 and throttled = 2, 'five invites pass, the rest are throttled';
end $$;

-- Presence: friends see each other, a hidden profile and strangers stay out, old marks expire.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
begin
  assert touch_presence() = true, 'friend reports presence';
end $$;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$ begin perform touch_presence(); end $$;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
do $$ begin perform touch_presence(); end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := get_friends_online();
  assert jsonb_array_length(r) = 1 and r->>0 = 'a0000000-0000-0000-0000-0000000000a2', 'only the visible friend is online (not the hidden one, not the stranger)';
end $$;

reset role;
update player_presence set seen_at = now() - interval '5 minutes' where user_id = 'a0000000-0000-0000-0000-0000000000a2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  assert jsonb_array_length(get_friends_online()) = 0, 'a mark older than 2 minutes means offline';
end $$;

-- A guest has nothing to ask.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  assert jsonb_array_length(get_friends_online()) = 0, 'a guest sees nobody online';
exception when insufficient_privilege then null;
end $$;

rollback;
select 'invites_presence ok' as result;
