-- The Versus lobby and the friends list listen to row changes through Supabase Realtime. On the live project the tables
-- were added to the supabase_realtime publication by hand in the dashboard, so no earlier migration declares it and a
-- fresh database (local, staging, a restore) never delivered those events. This adds them when they are missing and
-- does nothing where they are already published.
do $$
declare
	t text;
begin
	foreach t in array array['matchmaking_rooms', 'friends'] loop
		if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
			and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t)
		then
			execute format('alter publication supabase_realtime add table public.%I', t);
		end if;
	end loop;
end $$;
