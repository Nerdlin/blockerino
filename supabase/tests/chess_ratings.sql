-- Check for 20261029100000_chess_ratings.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-0000000000a1', 'ann', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 0),
  ('b0000000-0000-0000-0000-0000000000b1', 'bob', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', 0);

-- the Elo formula: equal ratings, new player: +-20; an upset pays more
do $$
begin
  assert chess_elo_change(1000, 1000, 1, 0) = 20, 'win at equal rating, K 40';
  assert chess_elo_change(1000, 1000, 0, 0) = -20, 'loss at equal rating, K 40';
  assert chess_elo_change(1200, 1200, 1, 30) = 10, 'K 20 after ten games';
  assert chess_elo_change(1000, 1400, 1, 30) > chess_elo_change(1400, 1000, 1, 30), 'an upset pays more';
  assert chess_elo_change(2400, 2400, 1, 99) = 5, 'K 10 for masters';
end $$;

set local role authenticated;

do $$
declare r jsonb;
begin
  -- Ann (white) wins: her report alone is pending, nothing changes yet
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  r := report_chess_match('ROOM-1', 'blitz', 'w', 'bob', '1-0', 30);
  assert r->>'status' = 'pending', 'a lone win report stays pending';
  assert (select count(*) from get_my_chess_ratings()) = 0, 'no rating before the result counts';

  -- Bob (black) confirms: applied, +20 / -20 from 1000
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  r := report_chess_match('ROOM-1', 'blitz', 'b', 'ann', '1-0', 30);
  assert r->>'status' = 'applied', 'matching reports apply the result';
  assert (r->>'before')::int = 1000 and (r->>'after')::int = 980, 'Bob lost 20';
  assert (select rating from get_my_chess_ratings() where time_class = 'blitz') = 980, 'Bob rating 980';

  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  assert (select rating from get_my_chess_ratings() where time_class = 'blitz') = 1020, 'Ann rating 1020';
  assert (select games_played from get_my_chess_ratings() where time_class = 'blitz') = 1, 'one game played';
  assert (select count(*) from get_my_chess_ratings() where time_class = 'rapid') = 0, 'other classes untouched';

  -- reporting again changes nothing
  r := report_chess_match('ROOM-1', 'blitz', 'w', 'bob', '1-0', 30);
  assert r->>'status' = 'applied' and (r->>'after')::int = 1020, 'a second report is only a read';
  assert (select rating from get_my_chess_ratings() where time_class = 'blitz') = 1020, 'still 1020';

  -- a player who reports their own loss is counted at once
  r := report_chess_match('ROOM-2', 'rapid', 'w', 'bob', '0-1', 40);
  assert r->>'status' = 'applied', 'own loss counts at once';
  assert (select rating from get_my_chess_ratings() where time_class = 'rapid') = 980, 'Ann lost 20 in rapid';

  -- disagreement: both claim to have won -> disputed, nobody changes
  r := report_chess_match('ROOM-3', 'blitz', 'w', 'bob', '1-0', 30);
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  r := report_chess_match('ROOM-3', 'blitz', 'b', 'ann', '0-1', 30);
  assert r->>'status' = 'disputed', 'conflicting reports are disputed';
  assert (select rating from get_my_chess_ratings() where time_class = 'blitz') = 980, 'a dispute changes nothing';

  -- guards
  r := report_chess_match('ROOM-4', 'blitz', 'b', 'ann', '0-1', 2);
  assert r->>'status' = 'too_short', 'under four half-moves is not rated';
  r := report_chess_match('ROOM-5', 'blitz', 'b', 'nobody', '0-1', 20);
  assert r->>'status' = 'opponent_unknown', 'the opponent must be an account';
  r := report_chess_match('ROOM-6', 'bogus', 'b', 'ann', '0-1', 20);
  assert r->>'status' = 'bad_request', 'unknown class refused';
  r := report_chess_match('R', 'blitz', 'b', 'ann', '0-1', 20);
  assert r->>'status' = 'bad_request', 'short room code refused';
end $$;

-- a client cannot touch the tables or the internal functions
do $$
begin
  begin
    perform count(*) from chess_ratings;
    assert false, 'chess_ratings must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform chess_apply_match('X-ROOM', 'blitz', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1', '1-0');
    assert false, 'chess_apply_match must not be callable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform settle_chess_reports();
    assert false, 'settle_chess_reports must not be callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the settle job counts a win nobody answered, but not a fresh one
reset role;
do $$
declare n integer;
begin
  insert into chess_match_reports (room_code, reporter_id, opponent_id, time_class, reporter_color, result, plies, created_at) values
    ('ROOM-OLD', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1', 'bullet', 'w', '1-0', 20, now() - interval '3 minutes'),
    ('ROOM-FRESH', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1', 'bullet', 'w', '1-0', 20, now()),
    ('ROOM-SHORT', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1', 'bullet', 'w', '1-0', 6, now() - interval '3 minutes');
  n := settle_chess_reports();
  assert n = 1, 'only the old, long, unanswered win is settled';
  assert (select count(*) from chess_matches where room_code = 'ROOM-OLD' and status = 'applied') = 1, 'old win applied';
  assert (select count(*) from chess_matches where room_code in ('ROOM-FRESH', 'ROOM-SHORT')) = 0, 'fresh and short ones wait';
  assert settle_chess_reports() = 0, 'settling twice applies nothing more';
end $$;

rollback;
select 'chess_ratings ok' as result;
