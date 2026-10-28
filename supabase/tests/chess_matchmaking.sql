-- Check for 20261029110000_chess_matchmaking.sql (needs 20261029100000_chess_ratings.sql). Rolled back at the end.
begin;

insert into profiles (id, player_name, auth_user_id, player_id, coins) values
  ('b0000000-0000-0000-0000-0000000000a2', 'amy', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a2', 0),
  ('b0000000-0000-0000-0000-0000000000b2', 'ben', 'a0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-0000000000b2', 0),
  ('b0000000-0000-0000-0000-0000000000c2', 'cal', 'a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-0000000000c2', 0);

-- Cal is a much stronger blitz player
insert into chess_ratings (profile_id, time_class, rating, games_played) values ('b0000000-0000-0000-0000-0000000000c2', 'blitz', 1500, 40);

set local role authenticated;

do $$
declare a jsonb; b jsonb; a2 jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

  -- guards
  assert (chess_quick_match('nonsense'))->>'status' = 'bad_request', 'bad control refused';
  assert (chess_quick_match('5+0'))->>'status' = 'bad_request', 'base under 30 s refused';

  -- alone in the queue: searching
  a := chess_quick_match('180+2');
  assert a->>'status' = 'searching', 'Amy waits alone';

  -- another control does not pair
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  b := chess_quick_match('300+0');
  assert b->>'status' = 'searching', 'a different control does not match Amy';
  perform chess_cancel_search();

  -- Ben on the same control is paired at once
  b := chess_quick_match('180+2');
  assert b->>'status' = 'matched', 'Ben is paired with Amy';
  assert b->>'opponent' = 'amy', 'Ben sees Amy';
  assert length(b->>'code') = 8, 'room code has eight characters';

  -- Amy's next call returns the same room, the other color, Ben as opponent
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  a2 := chess_quick_match('180+2');
  assert a2->>'status' = 'matched', 'Amy gets her pairing';
  assert a2->>'code' = b->>'code', 'same room for both';
  assert a2->>'color' <> b->>'color', 'opposite colors';
  assert a2->>'opponent' = 'ben', 'Amy sees Ben';

  -- a pairing is delivered once
  a2 := chess_quick_match('180+2');
  assert a2->>'status' = 'searching', 'a pairing is handed over once; Amy is back in the queue';
  perform chess_cancel_search();

  -- far-apart ratings do not pair at first, but do once the wait has widened the window
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  a := chess_quick_match('180+0');
  assert a->>'status' = 'searching', 'Cal (1500) waits';
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  b := chess_quick_match('180+0');
  assert b->>'status' = 'searching', 'Ben (1000) is too far from Cal at first';
end $$;

reset role;
update chess_queue set joined_at = now() - interval '20 seconds' where profile_id = 'b0000000-0000-0000-0000-0000000000b2';
set local role authenticated;

do $$
declare b jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  b := chess_quick_match('180+0');
  assert b->>'status' = 'matched', 'after waiting 20 s the window (150+30*20, capped at 600) reaches Cal';
  assert b->>'opponent' = 'cal', 'Ben is paired with Cal';
end $$;

-- a client cannot touch the tables
do $$
begin
  begin
    perform count(*) from chess_queue;
    assert false, 'chess_queue must not be readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from chess_pairings;
    assert false, 'chess_pairings must not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- a guest has no account to rate
reset role;
set local role anon;
do $$
begin
  begin
    perform chess_quick_match('180+2');
    assert false, 'anon must not call chess_quick_match';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
