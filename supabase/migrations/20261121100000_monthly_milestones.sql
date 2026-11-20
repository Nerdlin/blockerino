-- Monthly quest, second version: three milestones instead of one so that striving for the month pays more than the
-- dailies alone. Finish the daily bonus (all three quests) on 10 days: 500 coins and 2 keys; on 20 days: 1 500 coins,
-- 4 keys and the month's medal; on EVERY day of the month (28 to 31): 2 500 coins and 6 keys. The dailies bring about
-- 165 coins and a key a day; the steps add 4 500 coins and 12 keys over a perfect month, each claimed on its own.
--   * Progress counts the 'bonus' claims of daily_quest_claims (one per day, so it cannot be farmed).
--   * Players who took the old one-step reward keep their medal and have their 10-day step counted as taken.
-- Client: constants/MonthlyQuest.ts mirrors the table below (a jest test compares both).

CREATE TABLE IF NOT EXISTS public.monthly_quest_claims (
  user_id uuid NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  milestone smallint NOT NULL CHECK (milestone IN (1, 2, 3)),
  reward integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_key, milestone)
);

ALTER TABLE public.monthly_quest_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_quest_claims FROM anon, authenticated;

INSERT INTO public.monthly_quest_claims (user_id, month_key, milestone, reward, claimed_at)
SELECT user_id, month_key, 1, reward, claimed_at FROM public.monthly_quest_medals
ON CONFLICT DO NOTHING;

-- the third step is every day of the current month
CREATE OR REPLACE FUNCTION public.monthly_milestone_days(p_i integer) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE p_i WHEN 1 THEN 10 WHEN 2 THEN 20
    WHEN 3 THEN EXTRACT(day FROM (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month' - interval '1 day'))::integer
    ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.monthly_milestone_coins(p_i integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_i WHEN 1 THEN 500 WHEN 2 THEN 1500 WHEN 3 THEN 2500 ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.monthly_milestone_keys(p_i integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_i WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 6 ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.monthly_milestone_days(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monthly_milestone_coins(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monthly_milestone_keys(integer) FROM PUBLIC, anon, authenticated;

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
    'done', (SELECT count(DISTINCT q.day) FROM public.daily_quest_claims q
             WHERE q.user_id = p_user AND q.quest_id = 'bonus' AND to_char(q.day, 'YYYY-MM') = public.current_season_key()),
    'milestones', (
      SELECT jsonb_agg(jsonb_build_object(
        'i', i,
        'days', public.monthly_milestone_days(i),
        'coins', public.monthly_milestone_coins(i),
        'keys', public.monthly_milestone_keys(i),
        'medal', i = 2,
        'claimed', EXISTS (SELECT 1 FROM public.monthly_quest_claims c WHERE c.user_id = p_user AND c.month_key = public.current_season_key() AND c.milestone = i)
      ) ORDER BY i) FROM generate_series(1, 3) AS i),
    'medals', coalesce((SELECT jsonb_agg(month_key ORDER BY month_key DESC) FROM (
                SELECT month_key FROM public.monthly_quest_medals WHERE user_id = p_user ORDER BY month_key DESC LIMIT 36) x), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public._monthly_quest_state(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.claim_monthly_quest();

-- Pays one milestone (p_milestone 1, 2 or 3; null = the first one that is reached and not taken yet).
CREATE OR REPLACE FUNCTION public.claim_monthly_quest(p_milestone integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_month text := public.current_season_key();
  v_done integer;
  v_i integer;
  v_wallet integer;
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF public.is_anonymous_caller() THEN RETURN jsonb_build_object('status', 'guest'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  SELECT (public._monthly_quest_state(auth.uid()) ->> 'done')::integer INTO v_done;

  v_i := p_milestone;
  IF v_i IS NULL THEN
    SELECT i INTO v_i FROM generate_series(1, 3) AS i
    WHERE public.monthly_milestone_days(i) <= v_done
      AND NOT EXISTS (SELECT 1 FROM public.monthly_quest_claims c WHERE c.user_id = auth.uid() AND c.month_key = v_month AND c.milestone = i)
    ORDER BY i LIMIT 1;
    IF v_i IS NULL THEN RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object('status', 'locked'); END IF;
  END IF;
  IF v_i NOT IN (1, 2, 3) THEN RETURN jsonb_build_object('status', 'bad_milestone'); END IF;

  IF v_done < public.monthly_milestone_days(v_i) THEN
    RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object('status', 'locked');
  END IF;

  INSERT INTO public.monthly_quest_claims (user_id, month_key, milestone, reward)
  VALUES (auth.uid(), v_month, v_i, public.monthly_milestone_coins(v_i))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object('status', 'already'); END IF;

  UPDATE public.profiles SET coins = coins + public.monthly_milestone_coins(v_i) WHERE id = v_profile.id RETURNING coins INTO v_wallet;
  PERFORM public._grant_keys(v_profile.id, public.monthly_milestone_keys(v_i));
  IF v_i = 2 THEN
    INSERT INTO public.monthly_quest_medals (user_id, month_key, reward)
    VALUES (auth.uid(), v_month, public.monthly_milestone_coins(2))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN public._monthly_quest_state(auth.uid()) || jsonb_build_object(
    'status', 'ok',
    'milestone', v_i,
    'medal', v_i = 2,
    'coins', public.monthly_milestone_coins(v_i),
    'keys', public.monthly_milestone_keys(v_i),
    'wallet', v_wallet
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_monthly_quest(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_monthly_quest(integer) TO authenticated;
