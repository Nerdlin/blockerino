-- Manual check for 20261020180000_notifications.sql. Everything is rolled back.
--   npx supabase db reset --local --no-seed
--   docker exec -i supabase_db_blockerino psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/notifications.sql
begin;

insert into auth.users (id, email)
select ('a0000000-0000-0000-0000-00000000000' || n)::uuid, 'u' || n || '@test.local' from generate_series(1, 6) n;
insert into profiles (id, player_name, auth_user_id, player_id)
select ('b0000000-0000-0000-0000-00000000000' || n)::uuid, 'p' || n,
       ('a0000000-0000-0000-0000-00000000000' || n)::uuid, ('a0000000-0000-0000-0000-00000000000' || n)::text
  from generate_series(1, 6) n;

-- p1 = the player who climbs; p2 300, p3 200, p4 900 (above), p5 50 (below p1's old score); p1 starts at 100
insert into season_scores (season_key, board, profile_id, score) values
  (current_season_key(), 'classic', 'b0000000-0000-0000-0000-000000000001', 100),
  (current_season_key(), 'classic', 'b0000000-0000-0000-0000-000000000002', 300),
  (current_season_key(), 'classic', 'b0000000-0000-0000-0000-000000000003', 200),
  (current_season_key(), 'classic', 'b0000000-0000-0000-0000-000000000004', 900),
  (current_season_key(), 'classic', 'b0000000-0000-0000-0000-000000000005', 50);

create or replace function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"a0000000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true);
$$;
create or replace function pg_temp.notified() returns text language sql as $$
  select coalesce(string_agg(p.player_name, ',' order by p.player_name), '-') from user_notifications n join profiles p on p.id = n.profile_id where n.kind = 'overtaken';
$$;

set local role authenticated;
select pg_temp.as_user(1);

-- 1 p1 jumps to 500: p2 and p3 are overtaken, p4 (above) and p5 (already below) are not
select '1 submit' as check, submit_season_score('classic', 500);
reset role; select '1 notified (p2,p3)' as check, pg_temp.notified(); set local role authenticated; select pg_temp.as_user(1);

-- 2 another climb within 6 hours creates no duplicates
select '2 submit' as check, submit_season_score('classic', 600);
reset role; select '2 notifications still 2' as check, count(*) from user_notifications where kind = 'overtaken'; set local role authenticated; select pg_temp.as_user(1);

-- 3 a lower score changes nothing
select '3 lower' as check, submit_season_score('classic', 400);
reset role; select '3 notifications still 2' as check, count(*) from user_notifications where kind = 'overtaken'; set local role authenticated;

-- 4 p2 reads and clears the notification
select pg_temp.as_user(2);
select '4 inbox' as check, jsonb_array_length(get_my_notifications()) as n, get_my_notifications() -> 0 -> 'payload' ->> 'by' as by, get_my_notifications() -> 0 -> 'payload' ->> 'by_score' as by_score;
select '4 mark read' as check, mark_notifications_read(array(select (x ->> 'id')::bigint from jsonb_array_elements(get_my_notifications()) x));
select '4 inbox after' as check, jsonb_array_length(get_my_notifications()) as n;
select pg_temp.as_user(4);
select '4 p4 inbox empty' as check, jsonb_array_length(get_my_notifications()) as n;

-- 5 push tokens: valid, invalid, other player cannot remove mine
select pg_temp.as_user(1);
select '5 valid token' as check, register_push_token('ExponentPushToken[abcdefghij1234567890]', 'android', 'ru');
select '5 invalid token' as check, register_push_token('not-a-token', 'android');
select '5 invalid platform' as check, register_push_token('ExponentPushToken[abcdefghij1234567890]', 'web');
select pg_temp.as_user(2);
select '5 other removes' as check, unregister_push_token('ExponentPushToken[abcdefghij1234567890]');
reset role; select '5 token kept' as check, count(*) from push_tokens; set local role authenticated; select pg_temp.as_user(1);
select '5 owner removes' as check, unregister_push_token('ExponentPushToken[abcdefghij1234567890]');
reset role; select '5 token gone' as check, count(*) from push_tokens; set local role authenticated; select pg_temp.as_user(1);
-- more than 5 devices: the oldest go
select '5 device ' || i as check, register_push_token('ExponentPushToken[device' || lpad(i::text, 12, '0') || ']', 'android') from generate_series(1, 7) i;
reset role; select '5 devices capped at 5' as check, count(*) from push_tokens;

-- 6 streak reminders: p1 streak 5 not claimed today, p2 streak 5 claimed today, p3 streak 2
update profiles set streak_count = 5, streak_last_day = (now() at time zone 'utc')::date - 1 where id = 'b0000000-0000-0000-0000-000000000001';
update profiles set streak_count = 5, streak_last_day = (now() at time zone 'utc')::date where id = 'b0000000-0000-0000-0000-000000000002';
update profiles set streak_count = 2, streak_last_day = (now() at time zone 'utc')::date - 1 where id = 'b0000000-0000-0000-0000-000000000003';
select '6 reminders (1)' as check, generate_streak_reminders();
select '6 again today (0)' as check, generate_streak_reminders();
select '6 payload' as check, payload from user_notifications where kind = 'streak_risk';

-- 7 season ending: nothing today, forced run notifies the ranked players with the gap to the top 10
select '7 not the last day (0)' as check, generate_season_ending_reminders();
select '7 forced' as check, generate_season_ending_reminders(true);
select '7 payload' as check, p.player_name, n.payload ->> 'rank' as rank, n.payload ->> 'to_top10' as to_top10
  from user_notifications n join profiles p on p.id = n.profile_id where n.kind = 'season_ending' order by (n.payload ->> 'rank')::int;

-- 8 friends leaderboard: p1 is friends with p3 (accepted) and p5 (pending), not with p2 / p4
insert into friends (user_id_1, user_id_2, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'accepted'),
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'pending');
set local role authenticated; select pg_temp.as_user(1);
select '8 friends board (p1 600, p3 200)' as check, get_friends_season_leaderboard('classic');
select '8 bad board' as check, get_friends_season_leaderboard('nope');

-- 9 clients cannot read the queue or the tokens directly
do $$
begin
  begin perform 1 from user_notifications; raise notice '9 read notifications: NOT BLOCKED (bad)';
  exception when insufficient_privilege then raise notice '9 read notifications: blocked (good)'; end;
  begin perform 1 from push_tokens; raise notice '9 read tokens: NOT BLOCKED (bad)';
  exception when insufficient_privilege then raise notice '9 read tokens: blocked (good)'; end;
end $$;
rollback;
