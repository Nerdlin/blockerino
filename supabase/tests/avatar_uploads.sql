-- Check for 20261030100000_avatar_uploads.sql. Everything is rolled back; any failed assert stops the run.
begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000c1', 'owner@example.test'),
  ('a0000000-0000-0000-0000-0000000000c2', 'reporter@example.test'),
  ('a0000000-0000-0000-0000-0000000000c3', 'other@example.test');

insert into profiles (id, player_name, auth_user_id, player_id, avatar_url) values
  ('b0000000-0000-0000-0000-0000000000c1', 'AvatarOwner', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c1', 'https://example.test/a.jpg'),
  ('b0000000-0000-0000-0000-0000000000c2', 'Reporter', 'a0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-0000000000c2', null),
  ('b0000000-0000-0000-0000-0000000000c3', 'Other', 'a0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-0000000000c3', null);

do $$
declare b record;
begin
  select * into b from storage.buckets where id = 'avatars';
  assert b.id is not null and b.public, 'avatars bucket exists and is public';
  assert b.file_size_limit = 307200, 'bucket is capped at 300 KB';
  assert b.allowed_mime_types @> array['image/jpeg'] and not (b.allowed_mime_types @> array['image/svg+xml']), 'only raster images';
end $$;

-- anonymous callers cannot report
set local role anon;
do $$
begin
  perform report_avatar('a0000000-0000-0000-0000-0000000000c1', 'other');
  assert false, 'anon must not call report_avatar';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := report_avatar('a0000000-0000-0000-0000-0000000000c1', 'inappropriate');
  assert r->>'status' = 'ok', 'a complaint is accepted';
  r := report_avatar('a0000000-0000-0000-0000-0000000000c1', 'weird value');
  assert r->>'status' = 'ok', 'an unknown reason falls back to other';
  assert (report_avatar('a0000000-0000-0000-0000-0000000000c2', 'other'))->>'status' = 'self', 'cannot report yourself';
  assert (report_avatar('a0000000-0000-0000-0000-0000000000ff', 'other'))->>'status' = 'not_found', 'unknown player';

  begin
    perform count(*) from avatar_reports;
    assert false, 'the report table must not be readable by players';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare n integer; r record;
begin
  select count(*) into n from avatar_reports where reporter_id = 'a0000000-0000-0000-0000-0000000000c2';
  assert n = 1, 'one open complaint per reporter and target';
  select * into r from avatar_reports limit 1;
  assert r.reason = 'other' and r.avatar_url = 'https://example.test/a.jpg', 'the latest reason and the picture at that moment are kept';
end $$;

-- a player cannot write into another player's folder
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', 'a0000000-0000-0000-0000-0000000000c1/hack.jpg', 'a0000000-0000-0000-0000-0000000000c3');
    assert false, 'writing into someone elses folder must be refused';
  exception when insufficient_privilege or others then
    if sqlerrm like 'writing into%' then raise; end if;
  end;
  insert into storage.objects (bucket_id, name, owner) values ('avatars', 'a0000000-0000-0000-0000-0000000000c3/mine.jpg', 'a0000000-0000-0000-0000-0000000000c3');
end $$;
reset role;

rollback;
select 'avatar_uploads ok' as result;
