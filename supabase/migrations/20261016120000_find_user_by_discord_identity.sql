-- Lets the discord-activity-auth Edge Function find the auth user that already has this
-- Discord account linked (via normal Discord OAuth), instead of creating a duplicate
-- "discord_<id>@blockerino.app" account with a suffixed nickname.
create or replace function public.find_user_id_by_discord_identity(p_discord_id text)
returns uuid
language sql
security definer
set search_path = auth, public
stable
as $$
  select i.user_id
  from auth.identities i
  where i.provider = 'discord'
    and i.identity_data ->> 'sub' = p_discord_id
  order by i.created_at asc
  limit 1;
$$;

revoke all on function public.find_user_id_by_discord_identity(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_discord_identity(text) to service_role;
