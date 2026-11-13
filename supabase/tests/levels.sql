-- Check for 20261114110000_levels.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000d1', 'levels@example.test');
insert into profiles (id, player_name, auth_user_id, player_id, coins, owned_item_ids)
values ('b0000000-0000-0000-0000-0000000000d1', 'Levels', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d1', 0, '{}');

set local role authenticated;

do $$
declare r jsonb; i int;
begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

  assert record_level_result('9-1', 3) ->> 'status' = 'invalid', 'unknown level';
  assert record_level_result('1-1', 4) ->> 'status' = 'invalid', 'stars 1..3';
  assert (record_level_result('1-1', 2) ->> 'stars')::int = 2, 'first result kept';
  assert (record_level_result('1-1', 1) ->> 'stars')::int = 2, 'a worse result does not lower the stars';
  assert (record_level_result('1-1', 3) ->> 'stars')::int = 3, 'a better result raises them';

  assert claim_chapter_chest(1, 'complete') ->> 'status' = 'locked', 'a chapter with one level won is locked';

  for i in 2..10 loop perform record_level_result('1-' || i, 1); end loop;
  r := get_level_progress();
  assert (select count(*) from jsonb_object_keys(r -> 'levels')) = 10, 'progress lists the levels';

  r := claim_chapter_chest(1, 'complete');
  assert r ->> 'status' = 'opened' and r -> 'chest' ->> 'size' = 'small', format('complete chapter: small chest, got %s', r);
  assert claim_chapter_chest(1, 'complete') ->> 'status' = 'already', 'once';
  assert claim_chapter_chest(1, 'perfect') ->> 'status' = 'locked', 'perfect needs 3 stars everywhere';

  for i in 2..10 loop perform record_level_result('1-' || i, 3); end loop;
  r := claim_chapter_chest(1, 'perfect');
  assert r ->> 'status' = 'opened' and r -> 'chest' ->> 'size' = 'big', format('perfect chapter: big chest, got %s', r);
  assert jsonb_array_length(get_level_progress() -> 'chests') = 2, 'both chests listed';

  begin
    perform count(*) from level_progress;
    assert false, 'the table is private';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'levels ok';
rollback;
