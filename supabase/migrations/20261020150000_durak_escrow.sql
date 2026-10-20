-- Durak stakes held by the server (Blockerino 2.0).
-- Until now every client took its own ante and credited its own prize, so a modified client could pay
-- itself any pot. Now, for tables with a bet:
--   * durak_pay_ante(): the server takes the ante from the player's coins (balance checked server side);
--   * durak_report(): each player reports how the table ended for them (win / loss / draw / cancelled);
--   * the table settles when every staked player has reported, or 90 s after the first report (cron):
--       exactly one 'win' -> that player takes the whole pot, the others keep their loss
--       no 'win'          -> everybody gets their ante back (draw, cancelled, winner never reported)
--       two or more 'win' -> disputed, everybody gets their ante back (nobody can steal a pot)
--     a table nobody settled for 3 hours is refunded the same way.
--   Coins only move between players, they are never created. Tables without a bet need no server.
-- Guests have no server profile, so betting tables are for signed-in players.

CREATE TABLE IF NOT EXISTS public.durak_tables (
  table_id text PRIMARY KEY,
  bet integer NOT NULL CHECK (bet BETWEEN 1 AND 10000000),
  player_count integer NOT NULL CHECK (player_count BETWEEN 2 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  first_report_at timestamptz,
  settled_at timestamptz,
  outcome text CHECK (outcome IN ('won', 'refunded', 'disputed'))
);

CREATE TABLE IF NOT EXISTS public.durak_stakes (
  table_id text NOT NULL REFERENCES public.durak_tables (table_id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  result text CHECK (result IN ('win', 'loss', 'draw', 'cancelled')),
  reported_at timestamptz,
  PRIMARY KEY (table_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_durak_tables_unsettled ON public.durak_tables (created_at) WHERE settled_at IS NULL;

ALTER TABLE public.durak_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.durak_stakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.durak_tables FROM anon, authenticated;
REVOKE ALL ON public.durak_stakes FROM anon, authenticated;

-- Pays the pot out (or refunds the antes) and closes the table. Internal.
CREATE OR REPLACE FUNCTION public._settle_durak_table(p_table_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wins integer;
  v_pot integer;
  v_outcome text;
BEGIN
  SELECT count(*) FILTER (WHERE result = 'win'), COALESCE(sum(amount), 0)
    INTO v_wins, v_pot
    FROM public.durak_stakes WHERE table_id = p_table_id;

  IF v_wins = 1 THEN
    UPDATE public.profiles p SET coins = p.coins + v_pot
      FROM public.durak_stakes s
     WHERE s.table_id = p_table_id AND s.result = 'win' AND p.id = s.profile_id;
    v_outcome := 'won';
  ELSE
    UPDATE public.profiles p SET coins = p.coins + s.amount
      FROM public.durak_stakes s
     WHERE s.table_id = p_table_id AND p.id = s.profile_id;
    v_outcome := CASE WHEN v_wins = 0 THEN 'refunded' ELSE 'disputed' END;
  END IF;

  UPDATE public.durak_tables SET settled_at = now(), outcome = v_outcome WHERE table_id = p_table_id;
  RETURN v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public._settle_durak_table(text) FROM PUBLIC, anon, authenticated;

-- Takes the ante. Returns {status, coins}; status: paid | already | not_enough_coins | table_mismatch | table_full | table_closed | ...
CREATE OR REPLACE FUNCTION public.durak_pay_ante(p_table_id text, p_bet integer, p_player_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_table public.durak_tables%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_table_id IS NULL OR length(p_table_id) NOT BETWEEN 1 AND 80
     OR p_bet IS NULL OR p_bet NOT BETWEEN 1 AND 10000000
     OR p_player_count IS NULL OR p_player_count NOT BETWEEN 2 AND 6 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  INSERT INTO public.durak_tables (table_id, bet, player_count)
  VALUES (p_table_id, p_bet, p_player_count)
  ON CONFLICT (table_id) DO NOTHING;
  SELECT * INTO v_table FROM public.durak_tables WHERE table_id = p_table_id FOR UPDATE;

  IF v_table.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'table_closed', 'coins', v_profile.coins);
  END IF;
  IF v_table.bet <> p_bet OR v_table.player_count <> p_player_count THEN
    RETURN jsonb_build_object('status', 'table_mismatch', 'coins', v_profile.coins);
  END IF;
  IF EXISTS (SELECT 1 FROM public.durak_stakes WHERE table_id = p_table_id AND profile_id = v_profile.id) THEN
    RETURN jsonb_build_object('status', 'already', 'coins', v_profile.coins);
  END IF;
  IF (SELECT count(*) FROM public.durak_stakes WHERE table_id = p_table_id) >= v_table.player_count THEN
    RETURN jsonb_build_object('status', 'table_full', 'coins', v_profile.coins);
  END IF;
  IF v_profile.coins < p_bet THEN
    RETURN jsonb_build_object('status', 'not_enough_coins', 'coins', v_profile.coins);
  END IF;

  UPDATE public.profiles SET coins = coins - p_bet WHERE id = v_profile.id RETURNING coins INTO v_profile.coins;
  INSERT INTO public.durak_stakes (table_id, profile_id, amount) VALUES (p_table_id, v_profile.id, p_bet);

  RETURN jsonb_build_object('status', 'paid', 'coins', v_profile.coins);
END;
$$;

REVOKE ALL ON FUNCTION public.durak_pay_ante(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.durak_pay_ante(text, integer, integer) TO authenticated;

-- A player reports their own result. Returns {status, coins}; status: pending | won | refunded | disputed | already | ...
CREATE OR REPLACE FUNCTION public.durak_report(p_table_id text, p_result text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_table public.durak_tables%ROWTYPE;
  v_stake public.durak_stakes%ROWTYPE;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_result IS NULL OR p_result NOT IN ('win', 'loss', 'draw', 'cancelled') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_table FROM public.durak_tables WHERE table_id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unknown_table'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  SELECT * INTO v_stake FROM public.durak_stakes WHERE table_id = p_table_id AND profile_id = v_profile.id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_stake', 'coins', v_profile.coins); END IF;

  IF v_table.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already', 'outcome', v_table.outcome, 'coins', v_profile.coins);
  END IF;
  IF v_stake.result IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already', 'coins', v_profile.coins);
  END IF;

  UPDATE public.durak_stakes SET result = p_result, reported_at = now()
   WHERE table_id = p_table_id AND profile_id = v_profile.id;
  UPDATE public.durak_tables SET first_report_at = COALESCE(first_report_at, now()) WHERE table_id = p_table_id;

  v_status := 'pending';
  IF NOT EXISTS (SELECT 1 FROM public.durak_stakes WHERE table_id = p_table_id AND result IS NULL) THEN
    v_status := public._settle_durak_table(p_table_id);
  END IF;

  SELECT coins INTO v_profile.coins FROM public.profiles WHERE id = v_profile.id;
  RETURN jsonb_build_object('status', v_status, 'coins', v_profile.coins);
END;
$$;

REVOKE ALL ON FUNCTION public.durak_report(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.durak_report(text, text) TO authenticated;

-- Settles tables whose players stopped answering: 90 s after the first report, or 3 hours after the deal.
CREATE OR REPLACE FUNCTION public.settle_pending_durak()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_table_id text;
  v_count integer := 0;
BEGIN
  FOR v_table_id IN
    SELECT table_id FROM public.durak_tables
     WHERE settled_at IS NULL
       AND (first_report_at < now() - interval '90 seconds' OR created_at < now() - interval '3 hours')
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public._settle_durak_table(v_table_id);
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.durak_tables WHERE settled_at < now() - interval '30 days';
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_pending_durak() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('settle-durak', '* * * * *', 'SELECT public.settle_pending_durak()');
