-- Changing the nickname of a signed-in player (the profile screen). Before this, an account kept the name it got at
-- sign-up: there was no way to change it in the app, and the profiles policy let a client write any name directly.
--
-- * rename_player(new_name): the only way to change a name. Checks the form (3-20 Latin or Cyrillic letters, digits, space, _ . -),
--   that no other profile uses it (any letter case), allows one change per 30 days, and moves the More Games ratings
--   and match history (keyed by the lower-case name) to the new name, so a rename keeps the player's Elo and record.
-- * player_name_changes: a log of renames (old and new name), readable by the player who made them.
-- * profiles_integrity_guard keeps player_name on client updates, so the function above cannot be bypassed.
--   Inserts still take the client's name (a new account picks it at sign-up).

create table if not exists public.player_name_changes (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  old_name text not null,
  new_name text not null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_player_name_changes_profile on public.player_name_changes (profile_id, changed_at desc);
alter table public.player_name_changes enable row level security;

drop policy if exists "Players read their own renames" on public.player_name_changes;
create policy "Players read their own renames" on public.player_name_changes
  for select to authenticated
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

grant select on public.player_name_changes to authenticated;

create or replace function public.rename_player(p_new_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cooldown constant interval := interval '30 days';
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name text;
  v_old_key text;
  v_new_key text;
  v_last timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid for update;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;

  -- trim and collapse inner runs of spaces
  v_name := regexp_replace(btrim(coalesce(p_new_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 3 or char_length(v_name) > 20
     or v_name !~ '^[A-Za-z0-9À-ÖØ-öø-ÿА-Яа-яЁё_. -]+$'
     or lower(v_name) in ('player', 'bot', 'admin', 'moderator', 'blockerino') then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_name = v_profile.player_name then
    return jsonb_build_object('status', 'ok', 'name', v_name);
  end if;

  v_old_key := lower(v_profile.player_name);
  v_new_key := lower(v_name);

  -- the same name in another letter case is still this player's own name
  if v_new_key <> v_old_key and (
       exists (select 1 from public.profiles where lower(player_name) = v_new_key and id <> v_profile.id)
       or exists (select 1 from public.more_game_ratings where player_key = v_new_key)
     ) then
    return jsonb_build_object('status', 'taken');
  end if;

  select max(changed_at) into v_last from public.player_name_changes where profile_id = v_profile.id;
  if v_last is not null and v_last > now() - c_cooldown then
    return jsonb_build_object('status', 'cooldown', 'next_at', v_last + c_cooldown);
  end if;

  update public.profiles set player_name = v_name where id = v_profile.id;

  update public.more_game_ratings set player_key = v_new_key, player_name = v_name where player_key = v_old_key;
  update public.more_game_match_history set player1_key = v_new_key, player1_name = v_name where player1_key = v_old_key;
  update public.more_game_match_history set player2_key = v_new_key, player2_name = v_name where player2_key = v_old_key;
  update public.more_game_match_history set winner_key = v_new_key where winner_key = v_old_key;

  insert into public.player_name_changes (profile_id, old_name, new_name) values (v_profile.id, v_profile.player_name, v_name);

  return jsonb_build_object('status', 'ok', 'name', v_name);
end;
$$;

revoke all on function public.rename_player(text) from public, anon;
grant execute on function public.rename_player(text) to authenticated;

-- The guard as before, plus: a client update keeps the name (renames go through rename_player).
create or replace function public.profiles_integrity_guard()
 returns trigger
 language plpgsql
as $function$
DECLARE
  c_max_gain_per_write CONSTANT integer := 100000;
  c_max_gain_per_day CONSTANT integer := 300000;
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_used integer;
  v_gain integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.highscore_classic := 0;
    NEW.highscore_chaos := 0;
    NEW.highscore_time_attack := 0;
    NEW.highscore_daily := 0;
    NEW.highscore_move_limit := 0;
    NEW.highscore_rescue := 0;
    NEW.highscore_combo_trial := 0;
    NEW.coins := 0;
    NEW.coins_gain_day := NULL;
    NEW.coins_gained_today := 0;
    NEW.discord_id := NULL;
    NEW.elo := 0;
    NEW.previous_elo := NULL;
    NEW.elo_reset_at := NULL;
    RETURN NEW;
  END IF;

  NEW.player_name := OLD.player_name;
  NEW.elo := OLD.elo;
  NEW.previous_elo := OLD.previous_elo;
  NEW.elo_reset_at := OLD.elo_reset_at;
  NEW.highscore_classic := OLD.highscore_classic;
  NEW.highscore_chaos := OLD.highscore_chaos;
  NEW.highscore_time_attack := OLD.highscore_time_attack;
  NEW.highscore_daily := OLD.highscore_daily;
  NEW.highscore_move_limit := OLD.highscore_move_limit;
  NEW.highscore_rescue := OLD.highscore_rescue;
  NEW.highscore_combo_trial := OLD.highscore_combo_trial;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.player_id := OLD.player_id;
  NEW.discord_id := OLD.discord_id;

  IF NEW.coins IS NULL OR NEW.coins < 0 THEN
    NEW.coins := OLD.coins;
  END IF;

  IF NEW.coins > OLD.coins THEN
    v_used := CASE WHEN OLD.coins_gain_day = v_today THEN OLD.coins_gained_today ELSE 0 END;
    v_gain := LEAST(NEW.coins - OLD.coins, c_max_gain_per_write, GREATEST(c_max_gain_per_day - v_used, 0));
    NEW.coins := OLD.coins + v_gain;
    NEW.coins_gain_day := v_today;
    NEW.coins_gained_today := v_used + v_gain;
  ELSE
    NEW.coins_gain_day := OLD.coins_gain_day;
    NEW.coins_gained_today := OLD.coins_gained_today;
  END IF;

  RETURN NEW;
END;
$function$;
