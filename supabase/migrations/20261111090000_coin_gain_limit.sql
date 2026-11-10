-- Coins a client may add to its own profile: 5 000 a day (was 300 000), 5 000 per write (was 100 000).
-- Honest play adds about 280 coins a day (the most active players ~400, the record day 2 646, Nov 2026), so the
-- limit never touches real play. It bounds what a modified client can grant itself and what a guest carries into
-- an account at the first sign-in (a guest's coins live only on the device and cannot be checked).
-- Coins granted by the server (rewards, Durak pots, seasons, purchases) do not go through this guard.
CREATE OR REPLACE FUNCTION public.profiles_integrity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_gain_per_write CONSTANT integer := 5000;
  c_max_gain_per_day CONSTANT integer := 5000;
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
