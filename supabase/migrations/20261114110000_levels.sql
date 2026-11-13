-- Level map (5 chapters x 10 levels, ids "1-1" .. "5-10"). The game reports the stars of a won level; the server
-- keeps the best per level, so progress follows the account to every device. A chapter pays two chests, once each:
--   'complete' (every level of the chapter won)            -> a small chest
--   'perfect'  (every level of the chapter with 3 stars)  -> a big chest
-- Chests come from open_chest (streak_chest migration). Signed-in players only; guests keep progress on the device.

CREATE TABLE IF NOT EXISTS public.level_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id text NOT NULL CHECK (level_id ~ '^[1-5]-([1-9]|10)$'),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE IF NOT EXISTS public.level_chapter_chests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter smallint NOT NULL CHECK (chapter BETWEEN 1 AND 5),
  kind text NOT NULL CHECK (kind IN ('complete', 'perfect')),
  prize jsonb NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter, kind)
);

ALTER TABLE public.level_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_chapter_chests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.level_progress, public.level_chapter_chests FROM anon, authenticated;

-- Records a won level; keeps the best stars. Returns {status, stars} with the stars now kept.
CREATE OR REPLACE FUNCTION public.record_level_result(p_level_id text, p_stars integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stars smallint;
  v_recent integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_level_id IS NULL OR p_level_id !~ '^[1-5]-([1-9]|10)$' OR p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 3 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- a level takes a while to play: more than 60 reports a minute is not a person
  SELECT count(*) INTO v_recent FROM public.level_progress
   WHERE user_id = auth.uid() AND updated_at > now() - interval '1 minute';
  IF v_recent >= 60 THEN RETURN jsonb_build_object('status', 'rate_limited'); END IF;

  INSERT INTO public.level_progress (user_id, level_id, stars)
  VALUES (auth.uid(), p_level_id, p_stars)
  ON CONFLICT (user_id, level_id) DO UPDATE
    SET stars = GREATEST(public.level_progress.stars, EXCLUDED.stars),
        updated_at = CASE WHEN EXCLUDED.stars > public.level_progress.stars THEN now() ELSE public.level_progress.updated_at END
  RETURNING stars INTO v_stars;

  RETURN jsonb_build_object('status', 'ok', 'stars', v_stars);
END;
$$;

-- {status, levels: {level_id: stars}, chests: [{chapter, kind}]}
CREATE OR REPLACE FUNCTION public.get_level_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'levels', COALESCE((SELECT jsonb_object_agg(level_id, stars) FROM public.level_progress WHERE user_id = auth.uid()), '{}'::jsonb),
    'chests', COALESCE((SELECT jsonb_agg(jsonb_build_object('chapter', chapter, 'kind', kind)) FROM public.level_chapter_chests WHERE user_id = auth.uid()), '[]'::jsonb)
  );
END;
$$;

-- Opens a chapter chest once. Returns {status: opened | already | locked | no_profile, chest, coins, owned_item_ids}.
CREATE OR REPLACE FUNCTION public.claim_chapter_chest(p_chapter integer, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_won integer;
  v_perfect integer;
  v_owned text[];
  v_chest jsonb;
  v_item text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_chapter IS NULL OR p_chapter NOT BETWEEN 1 AND 5 OR p_kind NOT IN ('complete', 'perfect') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  IF EXISTS (SELECT 1 FROM public.level_chapter_chests WHERE user_id = auth.uid() AND chapter = p_chapter AND kind = p_kind) THEN
    RETURN jsonb_build_object('status', 'already', 'coins', v_profile.coins);
  END IF;

  SELECT count(*), count(*) FILTER (WHERE stars = 3) INTO v_won, v_perfect
    FROM public.level_progress
   WHERE user_id = auth.uid() AND split_part(level_id, '-', 1) = p_chapter::text;
  IF v_won < 10 OR (p_kind = 'perfect' AND v_perfect < 10) THEN
    RETURN jsonb_build_object('status', 'locked', 'coins', v_profile.coins);
  END IF;

  v_owned := COALESCE(v_profile.owned_item_ids, '{}');
  v_chest := public.open_chest(CASE WHEN p_kind = 'perfect' THEN 'big' ELSE 'small' END, v_owned);
  v_item := v_chest ->> 'item_id';
  IF v_item IS NOT NULL THEN v_owned := array_append(v_owned, v_item); END IF;

  UPDATE public.profiles
     SET coins = coins + COALESCE((v_chest ->> 'coins')::integer, 0),
         owned_item_ids = v_owned
   WHERE id = v_profile.id
  RETURNING coins INTO v_profile.coins;

  INSERT INTO public.level_chapter_chests (user_id, chapter, kind, prize) VALUES (auth.uid(), p_chapter, p_kind, v_chest);

  RETURN jsonb_build_object('status', 'opened', 'chest', v_chest, 'coins', v_profile.coins, 'owned_item_ids', to_jsonb(v_owned));
END;
$$;

REVOKE ALL ON FUNCTION public.record_level_result(text, integer), public.get_level_progress(), public.claim_chapter_chest(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_level_result(text, integer), public.get_level_progress(), public.claim_chapter_chest(integer, text) TO authenticated;
