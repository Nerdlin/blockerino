-- Discord activity players never got a profile: discord-activity-auth upserts profiles ON CONFLICT (auth_user_id), and
-- the only unique index on auth_user_id was partial (WHERE auth_user_id IS NOT NULL), which ON CONFLICT cannot use
-- (42P10). The function logged it as non-critical, so 152 of 225 Discord accounts have no profile and never show up.

-- A plain unique constraint backs ON CONFLICT and still allows any number of NULLs.
drop index if exists public.idx_profiles_auth_user_id;
alter table public.profiles add constraint profiles_auth_user_id_key unique (auth_user_id);

-- Give every Discord activity account without a profile the profile it should have had: its Discord name (made
-- unique like the function does), avatar and Discord id.
do $$
declare
	u record;
	base text;
	pick text;
	tries int;
	did text;
begin
	for u in
		select au.id, au.raw_user_meta_data as m, au.last_sign_in_at
		from auth.users au
		where au.email like 'discord\_%'
			and not exists (select 1 from public.profiles p where p.auth_user_id = au.id)
		order by au.created_at
	loop
		base := left(coalesce(nullif(btrim(u.m->>'player_name'), ''), 'Player'), 16);
		pick := base;
		tries := 0;
		while exists (select 1 from public.profiles where player_name = pick) and tries < 30 loop
			pick := left(base, 12) || '_' || (1000 + floor(random() * 9000))::int;
			tries := tries + 1;
		end loop;
		did := nullif(u.m->>'discord_id', '');
		if did is not null and exists (select 1 from public.profiles where discord_id = did) then
			did := null;
		end if;
		insert into public.profiles (auth_user_id, player_id, player_name, avatar_url, discord_id, last_login_at)
		values (u.id, u.id::text, pick, nullif(u.m->>'avatar_url', ''), did, u.last_sign_in_at);
	end loop;
end $$;
