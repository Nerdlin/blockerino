-- Check for 20261114120000_push_channel.sql. Everything is rolled back; any failed assert stops the run.
begin;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000f7', 'push@example.test'), ('a0000000-0000-0000-0000-0000000000f8', 'other@example.test');
insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000f7', 'Push', 'a0000000-0000-0000-0000-0000000000f7', 'a0000000-0000-0000-0000-0000000000f7'),
  ('b0000000-0000-0000-0000-0000000000f8', 'Other', 'a0000000-0000-0000-0000-0000000000f8', 'a0000000-0000-0000-0000-0000000000f8');
insert into push_tokens (token, profile_id, platform, language) values
  ('ExponentPushToken[mine]', 'b0000000-0000-0000-0000-0000000000f7', 'android', 'ru'),
  ('ExponentPushToken[theirs]', 'b0000000-0000-0000-0000-0000000000f8', 'android', 'ru');
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f7","role":"authenticated"}', true);
  assert set_push_channel('ExponentPushToken[mine]', 'game'), 'own token marked';
  assert not set_push_channel('ExponentPushToken[theirs]', 'game'), 'not someone else''s token';
  assert not set_push_channel('ExponentPushToken[mine]', 'loud'), 'only the known channel';
end $$;
reset role;
do $$
begin
  assert (select channel from push_tokens where token = 'ExponentPushToken[mine]') = 'game', 'stored';
  assert (select channel from push_tokens where token = 'ExponentPushToken[theirs]') is null, 'untouched';
end $$;
select 'push channel ok';
rollback;
