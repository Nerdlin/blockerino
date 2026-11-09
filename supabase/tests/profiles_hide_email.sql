-- Manual check for 20261109120000_profiles_hide_email.sql. Everything is rolled back.
-- Run against the LOCAL database only:
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/profiles_hide_email.sql
begin;

-- expect: email empty after a client insert
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into profiles (id, player_name, auth_user_id, player_id, email)
values ('44444444-4444-4444-4444-444444444444', 'mailtester', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'someone@example.com');
select 'client insert' as check, email from profiles where id = '44444444-4444-4444-4444-444444444444';

-- expect: email empty after a client update
update profiles set email = 'someone@example.com' where id = '44444444-4444-4444-4444-444444444444';
select 'client update' as check, email from profiles where id = '44444444-4444-4444-4444-444444444444';

-- expect: email empty after a service-role write too (edge functions)
reset role;
update profiles set email = 'someone@example.com' where id = '44444444-4444-4444-4444-444444444444';
select 'server update' as check, email from profiles where id = '44444444-4444-4444-4444-444444444444';

-- expect: anon still reads the leaderboard columns; email comes back empty
set local role anon;
select 'anon read' as check, player_name, email from profiles where id = '44444444-4444-4444-4444-444444444444';

rollback;
