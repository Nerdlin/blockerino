-- Check for 20261021110000_achievement_rewards.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into profiles (id, player_name, auth_user_id, player_id, coins, streak_best) values
  ('b0000000-0000-0000-0000-0000000000e1', 'ach', 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1', 0, 8);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

do $$
declare r jsonb;
begin
  r := claim_achievements(array['first_steps', 'regular_player']);
  assert r->>'status' = 'ok', 'ok';
  assert (r->>'coins')::int = 75, 'pays 25 + 50';
  r := claim_achievements(array['first_steps']);
  assert jsonb_array_length(r->'granted') = 0 and (r->>'coins')::int = 75, 'no double pay';

  r := claim_achievements(array['week_warrior']);
  assert (r->'granted') = '["week_warrior"]'::jsonb, 'streak 7 is within the best of 8';
  r := claim_achievements(array['centurion']);
  assert jsonb_array_length(r->'granted') = 0, 'streak 100 is not reachable with a best of 8';

  r := claim_achievements(array['not_an_achievement']);
  assert jsonb_array_length(r->'granted') = 0, 'unknown ids pay nothing';

  r := claim_achievements(array[]::text[]);
  assert jsonb_array_length(r->'claimed') = 3, 'an empty list only reads the state';
end $$;

rollback;
select 'achievement_rewards ok' as result;
