-- Season rewards are now credited by the server (Blockerino 2.0).
-- claim_season_rewards() used to only mark the rewards as claimed and return them; the client then
-- added the coins and the podium cosmetic to its own wallet. Podium items are 'server_only' in
-- shop_catalog (a client can no longer give itself one), so the server has to grant them itself.
-- The function still returns the entries so the client can show what was won.

CREATE OR REPLACE FUNCTION public.claim_season_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_entries jsonb;
  v_coins integer;
  v_items text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF v_profile_id IS NULL THEN RETURN NULL; END IF;

  WITH claimed AS (
    UPDATE public.season_rewards
    SET claimed_at = now()
    WHERE profile_id = v_profile_id AND claimed_at IS NULL
    RETURNING season_key, board, rank, coins, item_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'season_key', season_key, 'board', board, 'rank', rank, 'coins', coins, 'item_id', item_id
         ) ORDER BY season_key, board), '[]'::jsonb),
         COALESCE(sum(coins), 0),
         COALESCE(array_agg(DISTINCT item_id) FILTER (WHERE item_id IS NOT NULL), '{}')
  INTO v_entries, v_coins, v_items
  FROM claimed;

  IF v_coins > 0 OR cardinality(v_items) > 0 THEN
    UPDATE public.profiles
       SET coins = coins + v_coins,
           owned_item_ids = ARRAY(SELECT DISTINCT item FROM unnest(COALESCE(owned_item_ids, '{}') || v_items) AS item)
     WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object('entries', v_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_season_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_season_rewards() TO authenticated;
