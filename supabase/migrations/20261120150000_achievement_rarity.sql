-- How rare an achievement is: the share of players that have it. The app reports the achievement tiers a signed-in
-- player has completed (sync_achievement_unlocks); get_achievement_rarity() answers with how many players reported at
-- all (the base for the percentage) and how many have each tier. Nothing here pays coins: claim_achievements still
-- does that; this table only counts.
--   * Only known tiers count (achievement_reward() knows every tier id), at most 200 per call.
--   * Guests do not count and are not in the base.
--   * The players who already collected rewards are seeded from achievement_claims.

CREATE TABLE IF NOT EXISTS public.achievement_unlocks (
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS achievement_unlocks_by_id ON public.achievement_unlocks (achievement_id);

-- One row per player that has reported at least once: the base of the percentage.
CREATE TABLE IF NOT EXISTS public.achievement_sync (
  user_id uuid PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.achievement_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.achievement_unlocks FROM anon, authenticated;
REVOKE ALL ON public.achievement_sync FROM anon, authenticated;

INSERT INTO public.achievement_unlocks (user_id, achievement_id, unlocked_at)
SELECT user_id, achievement_id, claimed_at FROM public.achievement_claims
ON CONFLICT DO NOTHING;

INSERT INTO public.achievement_sync (user_id)
SELECT DISTINCT user_id FROM public.achievement_claims
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_achievement_unlocks(p_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text;
BEGIN
  IF auth.uid() IS NULL OR public.is_anonymous_caller() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid()) THEN RETURN; END IF;

  INSERT INTO public.achievement_sync (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET synced_at = now();

  FOR v_id IN SELECT DISTINCT unnest(coalesce(p_ids, ARRAY[]::text[])) LIMIT 200 LOOP
    CONTINUE WHEN public.achievement_reward(v_id) IS NULL;
    INSERT INTO public.achievement_unlocks (user_id, achievement_id) VALUES (auth.uid(), v_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_achievement_rarity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.achievement_sync),
    'counts', coalesce((
      SELECT jsonb_object_agg(achievement_id, n)
      FROM (SELECT achievement_id, count(*) AS n FROM public.achievement_unlocks GROUP BY achievement_id) c
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.sync_achievement_unlocks(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_achievement_unlocks(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_achievement_rarity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_achievement_rarity() TO anon, authenticated;
