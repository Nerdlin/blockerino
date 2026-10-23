-- Daily quests (Blockerino 2.0). The device picks three small tasks per day and counts progress itself, so the
-- server cannot verify them; instead it pays a small fixed reward once per (account, day, quest) and at most
-- three quests plus one bonus per day, which caps the most an account can earn at 200 coins a day.
-- Clients cannot read or write the table; they call claim_daily_quests(day, ids) and read the answer.

CREATE TABLE IF NOT EXISTS public.daily_quest_claims (
  user_id uuid NOT NULL,
  day date NOT NULL,
  quest_id text NOT NULL,
  reward integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, quest_id)
);

ALTER TABLE public.daily_quest_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_quest_claims FROM anon, authenticated;

-- Coins per quest id (kept in step with constants/DailyQuests.ts; a jest test compares both).
CREATE OR REPLACE FUNCTION public.daily_quest_reward(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'lines_15' THEN 20
    WHEN 'lines_40' THEN 40
    WHEN 'games_2' THEN 20
    WHEN 'games_4' THEN 40
    WHEN 'pieces_40' THEN 20
    WHEN 'pieces_100' THEN 40
    WHEN 'botWin_1' THEN 30
    WHEN 'botWin_2' THEN 50
    WHEN 'versus_1' THEN 40
    WHEN 'moreWin_1' THEN 30
    WHEN 'moreWin_2' THEN 50
    WHEN 'bonus' THEN 50
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_quests(p_day date, p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_id text;
  v_reward integer;
  v_total integer := 0;
  v_granted text[] := ARRAY[]::text[];
  v_inserted integer;
  v_quest_claims integer;
  v_wants_bonus boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  -- The device's calendar day may be a day ahead or behind the server's (time zones); nothing older or newer pays.
  IF p_day IS NULL OR p_day < current_date - 1 OR p_day > current_date + 1 THEN
    RETURN jsonb_build_object('status', 'bad_day');
  END IF;

  v_wants_bonus := 'bonus' = ANY (coalesce(p_ids, ARRAY[]::text[]));

  FOR v_id IN SELECT DISTINCT unnest(coalesce(p_ids, ARRAY[]::text[])) LIMIT 10 LOOP
    CONTINUE WHEN v_id = 'bonus';
    v_reward := public.daily_quest_reward(v_id);
    CONTINUE WHEN v_reward IS NULL;

    SELECT count(*) INTO v_quest_claims FROM public.daily_quest_claims
      WHERE user_id = auth.uid() AND day = p_day AND quest_id <> 'bonus';
    CONTINUE WHEN v_quest_claims >= 3;

    INSERT INTO public.daily_quest_claims (user_id, day, quest_id, reward)
    VALUES (auth.uid(), p_day, v_id, v_reward)
    ON CONFLICT (user_id, day, quest_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      v_total := v_total + v_reward;
      v_granted := v_granted || v_id;
    END IF;
  END LOOP;

  -- The bonus needs all three quests of the day to be claimed already (or in this very call).
  IF v_wants_bonus THEN
    SELECT count(*) INTO v_quest_claims FROM public.daily_quest_claims
      WHERE user_id = auth.uid() AND day = p_day AND quest_id <> 'bonus';
    IF v_quest_claims >= 3 THEN
      INSERT INTO public.daily_quest_claims (user_id, day, quest_id, reward)
      VALUES (auth.uid(), p_day, 'bonus', public.daily_quest_reward('bonus'))
      ON CONFLICT (user_id, day, quest_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        v_total := v_total + public.daily_quest_reward('bonus');
        v_granted := v_granted || 'bonus';
      END IF;
    END IF;
  END IF;

  IF v_total > 0 THEN
    UPDATE public.profiles SET coins = coins + v_total WHERE id = v_profile.id RETURNING coins INTO v_profile.coins;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'coins', v_profile.coins,
    'granted', to_jsonb(v_granted),
    'claimed', coalesce((SELECT jsonb_agg(quest_id ORDER BY quest_id) FROM public.daily_quest_claims WHERE user_id = auth.uid() AND day = p_day), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_quests(date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_quests(date, text[]) TO authenticated;

-- Old claims are only needed for the current day.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-daily-quest-claims', '30 3 * * *', $cron$DELETE FROM public.daily_quest_claims WHERE day < current_date - 30$cron$);
