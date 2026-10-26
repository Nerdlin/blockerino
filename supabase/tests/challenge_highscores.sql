-- Check for 20261026100000_challenge_highscores.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e1', 'solver@example.test');
insert into profiles (id, player_name, auth_user_id, player_id) values
  ('b0000000-0000-0000-0000-0000000000e1', 'Solver', 'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

do $$
declare r integer; c integer;
begin
  assert submit_high_score('rescue', 1200), 'rescue score accepted';
  assert submit_high_score('rescue', 800), 'a lower rescue score is still accepted but changes nothing';
  assert submit_high_score('combo_trial', 4500), 'combo trial score accepted';
  assert not submit_high_score('combo_trial', 600000), 'an implausible score is refused';
  assert not submit_high_score('nonsense', 10), 'an unknown mode is refused';

  select highscore_rescue, highscore_combo_trial into r, c from profiles where auth_user_id = 'a0000000-0000-0000-0000-0000000000e1';
  assert r = 1200, 'best rescue score is kept';
  assert c = 4500, 'combo trial score is stored';

  -- clients cannot write the columns directly
  update profiles set highscore_rescue = 999999, highscore_combo_trial = 999999 where auth_user_id = 'a0000000-0000-0000-0000-0000000000e1';
  select highscore_rescue, highscore_combo_trial into r, c from profiles where auth_user_id = 'a0000000-0000-0000-0000-0000000000e1';
  assert r = 1200 and c = 4500, 'direct writes are frozen by the integrity guard';
  raise notice 'challenge highscores ok';
end $$;

rollback;
