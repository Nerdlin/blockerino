-- A chest a friend gives is kept in the receiver's profile until they open it (it used to turn into a key at once,
-- which nobody noticed). The profile button shows how many gift chests wait, together with friend requests.
--   * send_gift(chest) records the gift; no key any more.
--   * my_gift_chests(): the unopened ones, with the sender's name.
--   * open_gift_chest(gift): opens it as a small chest (pity counts, like a key chest) and marks it opened.
-- Item gifts are unchanged (the item is added at once). Client: constants/Gifts.ts, components/GiftChestsPanel.tsx.

ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS opened_at timestamptz;
-- gift chests sent before this already gave a key
UPDATE public.gifts SET opened_at = created_at WHERE kind = 'chest' AND opened_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gifts_unopened_chests ON public.gifts (to_user) WHERE kind = 'chest' AND opened_at IS NULL;

-- As in 20261116120000, except that a chest is stored instead of becoming a key.
CREATE OR REPLACE FUNCTION public.send_gift(p_friend uuid, p_kind text, p_item_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_daily_limit CONSTANT integer := 5;
  v_me public.profiles%ROWTYPE;
  v_friend public.profiles%ROWTYPE;
  v_price integer;
  v_item public.shop_catalog%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_friend IS NULL OR p_friend = auth.uid() OR p_kind NOT IN ('item', 'chest') THEN
    RETURN jsonb_build_object('status', 'bad_request');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friends
                  WHERE status = 'accepted'
                    AND ((user_id_1 = auth.uid() AND user_id_2 = p_friend) OR (user_id_1 = p_friend AND user_id_2 = auth.uid()))) THEN
    RETURN jsonb_build_object('status', 'not_friends');
  END IF;
  IF NOT public.is_real_account_id(p_friend::text) THEN RETURN jsonb_build_object('status', 'not_friends'); END IF;

  PERFORM 1 FROM public.profiles WHERE auth_user_id IN (auth.uid(), p_friend) ORDER BY id FOR UPDATE;
  SELECT * INTO v_me FROM public.profiles WHERE auth_user_id = auth.uid();
  SELECT * INTO v_friend FROM public.profiles WHERE auth_user_id = p_friend;
  IF v_me.id IS NULL OR v_friend.id IS NULL THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF (SELECT count(*) FROM public.gifts WHERE from_user = auth.uid() AND created_at > now() - interval '1 day') >= c_daily_limit THEN
    RETURN jsonb_build_object('status', 'limit', 'coins', v_me.coins);
  END IF;

  IF p_kind = 'chest' THEN
    v_price := public.chest_price('small');
  ELSE
    SELECT * INTO v_item FROM public.shop_catalog WHERE item_id = p_item_id;
    IF NOT FOUND OR v_item.kind <> 'paid' THEN RETURN jsonb_build_object('status', 'not_for_sale', 'coins', v_me.coins); END IF;
    IF p_item_id = ANY (COALESCE(v_friend.owned_item_ids, '{}')) THEN
      RETURN jsonb_build_object('status', 'owned', 'coins', v_me.coins);
    END IF;
    v_price := v_item.price;
  END IF;

  IF v_me.coins < v_price THEN RETURN jsonb_build_object('status', 'no_coins', 'coins', v_me.coins); END IF;

  UPDATE public.profiles SET coins = coins - v_price WHERE id = v_me.id RETURNING coins INTO v_me.coins;
  IF p_kind = 'item' THEN
    UPDATE public.profiles SET owned_item_ids = array_append(COALESCE(owned_item_ids, '{}'), p_item_id) WHERE id = v_friend.id;
  END IF;
  INSERT INTO public.gifts (from_user, to_user, kind, item_id, price)
  VALUES (auth.uid(), p_friend, p_kind, CASE WHEN p_kind = 'item' THEN p_item_id END, v_price);

  RETURN jsonb_build_object('status', 'ok', 'coins', v_me.coins);
END;
$$;
REVOKE ALL ON FUNCTION public.send_gift(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_gift(uuid, text, text) TO authenticated;

-- The caller's unopened gift chests, oldest first: [{id, from_name, created_at}].
CREATE OR REPLACE FUNCTION public.my_gift_chests()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', g.id, 'from_name', COALESCE(p.player_name, '?'), 'created_at', g.created_at)
           ORDER BY g.created_at), '[]'::jsonb)
    FROM public.gifts g LEFT JOIN public.profiles p ON p.auth_user_id = g.from_user
   WHERE g.to_user = auth.uid() AND g.kind = 'chest' AND g.opened_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.my_gift_chests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_gift_chests() TO authenticated;

-- Opens one of the caller's gift chests. Returns as buy_chest, or {status: not_found}.
CREATE OR REPLACE FUNCTION public.open_gift_chest(p_gift uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_found integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  UPDATE public.gifts SET opened_at = now(), seen_at = COALESCE(seen_at, now())
   WHERE id = p_gift AND to_user = auth.uid() AND kind = 'chest' AND opened_at IS NULL;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  RETURN public._open_paid_chest(v_profile, 'small');
END;
$$;
REVOKE ALL ON FUNCTION public.open_gift_chest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_gift_chest(uuid) TO authenticated;
