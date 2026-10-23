-- Check for 20261021120000_daily_quests.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-0000000000d1', 'q', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

do $$
declare r jsonb;
begin
  -- a quest pays once; again changes nothing
  r := claim_daily_quests(current_date, array['lines_15']);
  assert r->>'status' = 'ok', 'first claim ok';
  assert (r->>'coins')::int = 20, 'first claim pays 20';
  r := claim_daily_quests(current_date, array['lines_15']);
  assert (r->>'coins')::int = 20 and jsonb_array_length(r->'granted') = 0, 'second claim pays nothing';

  -- the bonus needs three quests
  r := claim_daily_quests(current_date, array['bonus']);
  assert jsonb_array_length(r->'granted') = 0, 'bonus before three quests pays nothing';

  -- unknown ids pay nothing
  r := claim_daily_quests(current_date, array['hacked_9999']);
  assert jsonb_array_length(r->'granted') = 0, 'unknown id pays nothing';

  -- at most three quests a day, even with more ids
  r := claim_daily_quests(current_date, array['games_2', 'moreWin_1', 'pieces_40', 'versus_1']);
  assert jsonb_array_length(r->'granted') = 2, 'only up to three quests a day (two more allowed)';
  assert (r->>'coins')::int = 20 + 20 + 30, 'three quests paid (ids are taken in sorted order)';

  -- now the bonus works, once
  r := claim_daily_quests(current_date, array['bonus']);
  assert (r->'granted') = '["bonus"]'::jsonb, 'bonus granted';
  assert (r->>'coins')::int = 120, 'bonus paid';
  r := claim_daily_quests(current_date, array['bonus']);
  assert jsonb_array_length(r->'granted') = 0, 'bonus once';

  -- a day far from today is refused
  r := claim_daily_quests(current_date - 5, array['lines_40']);
  assert r->>'status' = 'bad_day', 'old day refused';
  r := claim_daily_quests(null, array['lines_40']);
  assert r->>'status' = 'bad_day', 'null day refused';

  -- another day pays again
  r := claim_daily_quests(current_date + 1, array['lines_40']);
  assert (r->>'coins')::int = 160, 'next day pays';
end $$;

-- a client cannot touch the claims table
do $$
begin
  begin
    perform count(*) from daily_quest_claims;
    assert false, 'table must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'daily_quests ok' as result;
