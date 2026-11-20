-- Monthly quest: finish all three daily quests (the daily bonus) on 10 different days of a month and take the month's
-- medal, 600 coins and 2 chest keys. The medals stay on the profile for good (a collection, one per month).
--   * Progress is counted from daily_quest_claims (the 'bonus' claim exists once per account and day, so it cannot be
--     farmed beyond the daily limits already there).
--   * The reward is paid once per month (monthly_quest_medals primary key), by the server.
--   * Guests have no quests: they get status 'guest'.
-- Client: constants/MonthlyQuest.ts (the target and the reward are mirrored there; a jest test compares both).

CREATE TABLE IF NOT EXISTS public.monthly_quest_medals (
  user_id uuid NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  reward integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_key)
);

ALTER TABLE public.monthly_quest_medals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_quest_medals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.monthly_quest_target() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 10; $$;
CREATE OR REPLACE FUNCTION public.monthly_quest_reward() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 600; $$;
CREATE OR REPLACE FUNCTION public.monthly_quest_keys() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2; $$;
REVOKE ALL ON FUNCTION public.monthly_quest_target() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monthly_quest_reward() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monthly_quest_keys() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._monthly_quest_state(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'status', 'ok',
    'month', public.current_season_key(),
    'ends_at', (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month') AT TIME ZONE 'utc',
    'target', public.monthly_quest_target(),
    'reward', public.monthly_quest_reward(),
    'done', (SELECT count(DISTINCT q.day) FROM public.daily_quest_claims q
             WHERE q.user_id = p_user AND q.quest_id = 'bonus' AND to_char(q.day, 'YYYY-MM') = public.current_season_key()),
    'claimed', EXISTS (SELECT 1 FROM public.monthly_quest_medals m WHERE m.user_id = p_user AND m.month_key = public.current_season_key()),
    'medals', coalesce((SELECT jsonb_agg(month_key ORDER BY month_key DESC) FROM (
                SELECT month_key FROM public.monthly_quest_medals WHERE user_id = p_user ORDER BY month_key DESC LIMIT 36) x), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public._monthly_quest_state(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_quest()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;
  RETURN public._monthly_quest_state(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_monthly_quest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_state jsonb;
  v_wallet integer;
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_state := public._monthly_quest_state(auth.uid());
  IF (v_state ->> 'claimed')::boolean THEN RETURN v_state || jsonb_build_object('status', 'already'); END IF;
  IF (v_state ->> 'done')::integer < public.monthly_quest_target() THEN RETURN v_state || jsonb_build_object('status', 'locked'); END IF;

  INSERT INTO public.monthly_quest_medals (user_id, month_key, reward)
  VALUES (auth.uid(), public.current_season_key(), public.monthly_quest_reward())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object('status', 'already'); END IF;

  UPDATE public.profiles SET coins = coins + public.monthly_quest_reward() WHERE id = v_profile.id RETURNING coins INTO v_wallet;
  PERFORM public._grant_keys(v_profile.id, public.monthly_quest_keys());

  RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object('status', 'ok', 'coins', public.monthly_quest_reward(), 'keys', public.monthly_quest_keys(), 'wallet', v_wallet);
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_quest() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_monthly_quest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_quest() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monthly_quest() TO authenticated;
