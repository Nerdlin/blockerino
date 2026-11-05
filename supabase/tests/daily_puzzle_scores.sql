-- Check for 20261105100000_achievements_and_daily_board.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000f1', 'daily1@example.test'),
  ('a0000000-0000-0000-0000-0000000000f2', 'daily2@example.test');
insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000f1', 'DailyOne', 'a0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1'),
  ('b0000000-0000-0000-0000-0000000000f2', 'DailyTwo', 'a0000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-0000000000f2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

do $$
declare v_today date := (now() at time zone 'utc')::date; board jsonb;
begin
  assert submit_daily_puzzle_score(v_today, 300), 'today is accepted';
  assert submit_daily_puzzle_score(v_today, 120), 'a lower score is accepted but changes nothing';
  assert submit_daily_puzzle_score(v_today - 1, 90), 'yesterday is accepted (time zones)';
  assert not submit_daily_puzzle_score(v_today - 5, 90), 'an old day is refused';
  assert not submit_daily_puzzle_score(v_today, 999999), 'an implausible score is refused';

  board := get_daily_puzzle_leaderboard(v_today, 10);
  assert jsonb_array_length(board) = 1, 'one player today';
  assert (board->0->>'score')::int = 300, 'the best score of the day is kept';
  assert (board->0->>'is_me')::boolean, 'the caller is marked';
  assert achievement_reward('rank_legend') = 1500, 'new achievement tiers pay';
  assert achievement_reward('first_steps') = 25, 'old tiers keep their reward';
  -- three stars pay once per puzzle day
  update profiles set coins = 0 where auth_user_id = 'a0000000-0000-0000-0000-0000000000f1';
  assert claim_daily_puzzle_reward(v_today)->>'status' = 'ok', 'three stars pay';
  assert claim_daily_puzzle_reward(v_today)->>'status' = 'already', 'only once';
  assert claim_daily_puzzle_reward(v_today - 1)->>'status' = 'not_earned', 'a day under 500 does not pay';
  assert claim_daily_puzzle_reward(v_today - 9)->>'status' = 'too_old', 'an old day does not pay';
  raise notice 'daily puzzle scores ok';
end $$;

-- nobody reads the table directly
do $$
begin
  perform 1 from daily_puzzle_scores;
  raise exception 'the table must not be readable';
exception when insufficient_privilege then
  raise notice 'table is private ok';
end $$;

rollback;
