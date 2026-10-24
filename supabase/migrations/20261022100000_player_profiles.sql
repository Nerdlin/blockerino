-- Player profiles (Blockerino 2.0): look at another player's profile from friends, leaderboards and rankings.
--   * profile_privacy: who may open the details of a profile (everyone | friends | nobody). Nickname and avatar
--     stay visible because leaderboards show them anyway; only the details are hidden.
--   * player_game_records: per-game wins / losses / draws, pushed by the client after each result so the record
--     survives a new phone. Counters only grow, so a merge keeps the larger value of server and device.
--   * get_public_profile(name): the one door to a profile. It answers with safe fields only (never coins, items,
--     equipment or e-mail) and applies the privacy rule of the player.
-- Clients cannot read or write the two tables; they call the functions below.

CREATE TABLE IF NOT EXISTS public.profile_privacy (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'friends', 'nobody')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_privacy FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.player_game_records (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id IN ('versus', 'chess', 'battleship', 'durak', 'tictactoe', 'sudoku', 'mahjong')),
  wins integer NOT NULL DEFAULT 0 CHECK (wins BETWEEN 0 AND 1000000),
  losses integer NOT NULL DEFAULT 0 CHECK (losses BETWEEN 0 AND 1000000),
  draws integer NOT NULL DEFAULT 0 CHECK (draws BETWEEN 0 AND 1000000),
  bot_wins integer NOT NULL DEFAULT 0 CHECK (bot_wins BETWEEN 0 AND 1000000),
  bot_losses integer NOT NULL DEFAULT 0 CHECK (bot_losses BETWEEN 0 AND 1000000),
  bot_draws integer NOT NULL DEFAULT 0 CHECK (bot_draws BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

ALTER TABLE public.player_game_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_game_records FROM anon, authenticated;

-- The player's own choice. Returns {status: ok | unauthenticated, visibility}.
CREATE OR REPLACE FUNCTION public.get_profile_visibility()
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
    'visibility', coalesce((SELECT visibility FROM public.profile_privacy WHERE user_id = auth.uid()), 'everyone')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_visibility(p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_value IS NULL OR p_value NOT IN ('everyone', 'friends', 'nobody') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  INSERT INTO public.profile_privacy (user_id, visibility) VALUES (auth.uid(), p_value)
  ON CONFLICT (user_id) DO UPDATE SET visibility = excluded.visibility, updated_at = now();
  RETURN jsonb_build_object('status', 'ok', 'visibility', p_value);
END;
$$;

-- The device sends {game_id: {wins, losses, draws, botWins, botLosses, botDraws}}. Each counter becomes the larger
-- of the stored and the sent value (counters only grow, so two phones of one account merge without losing games),
-- and the merged records come back for the device to adopt.
CREATE OR REPLACE FUNCTION public.sync_game_records(p_records jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game text;
  v_row jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid()) THEN
    RETURN jsonb_build_object('status', 'no_profile');
  END IF;

  IF p_records IS NOT NULL AND jsonb_typeof(p_records) = 'object' THEN
    FOR v_game, v_row IN SELECT key, value FROM jsonb_each(p_records) LOOP
      CONTINUE WHEN v_game NOT IN ('versus', 'chess', 'battleship', 'durak', 'tictactoe', 'sudoku', 'mahjong');
      CONTINUE WHEN jsonb_typeof(v_row) <> 'object';

      INSERT INTO public.player_game_records AS r (user_id, game_id, wins, losses, draws, bot_wins, bot_losses, bot_draws)
      VALUES (
        auth.uid(), v_game,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'wins') = 'number' THEN (v_row->>'wins')::numeric END, 0)))::int,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'losses') = 'number' THEN (v_row->>'losses')::numeric END, 0)))::int,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'draws') = 'number' THEN (v_row->>'draws')::numeric END, 0)))::int,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'botWins') = 'number' THEN (v_row->>'botWins')::numeric END, 0)))::int,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'botLosses') = 'number' THEN (v_row->>'botLosses')::numeric END, 0)))::int,
        least(1000000, greatest(0, coalesce(CASE WHEN jsonb_typeof(v_row->'botDraws') = 'number' THEN (v_row->>'botDraws')::numeric END, 0)))::int
      )
      ON CONFLICT (user_id, game_id) DO UPDATE SET
        wins = greatest(r.wins, excluded.wins),
        losses = greatest(r.losses, excluded.losses),
        draws = greatest(r.draws, excluded.draws),
        bot_wins = greatest(r.bot_wins, excluded.bot_wins),
        bot_losses = greatest(r.bot_losses, excluded.bot_losses),
        bot_draws = greatest(r.bot_draws, excluded.bot_draws),
        updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'records', coalesce((
      SELECT jsonb_object_agg(game_id, jsonb_build_object(
        'wins', wins, 'losses', losses, 'draws', draws,
        'botWins', bot_wins, 'botLosses', bot_losses, 'botDraws', bot_draws))
      FROM public.player_game_records WHERE user_id = auth.uid()
    ), '{}'::jsonb)
  );
END;
$$;

-- Profile by nickname (nicknames are unique, case-insensitive). Returns
--   {status: not_found | hidden | ok, user_id, friend_row_id, name, avatar_url, relation, visibility (own only), ...}
-- relation is how the caller stands to the player: self | friend | pending_out | pending_in | none.
-- Details (elo, scores, records, the three best achievements) come only when the privacy rule lets the caller in.
CREATE OR REPLACE FUNCTION public.get_public_profile(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_p public.profiles%ROWTYPE;
  v_uid uuid := auth.uid();
  v_target uuid;
  v_relation text := 'none';
  v_friend public.friends%ROWTYPE;
  v_visibility text := 'everyone';
  v_visible boolean;
  v_result jsonb;
BEGIN
  IF v_name = '' THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  SELECT * INTO v_p FROM public.profiles WHERE lower(player_name) = v_name ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  v_target := v_p.auth_user_id;

  IF v_uid IS NOT NULL AND v_target IS NOT NULL THEN
    IF v_uid = v_target THEN
      v_relation := 'self';
    ELSE
      SELECT * INTO v_friend FROM public.friends
      WHERE (user_id_1 = v_uid AND user_id_2 = v_target) OR (user_id_1 = v_target AND user_id_2 = v_uid)
      LIMIT 1;
      IF FOUND THEN
        v_relation := CASE
          WHEN v_friend.status = 'accepted' THEN 'friend'
          WHEN v_friend.user_id_1 = v_uid THEN 'pending_out'
          ELSE 'pending_in'
        END;
      END IF;
    END IF;
  END IF;

  IF v_target IS NOT NULL THEN
    v_visibility := coalesce((SELECT visibility FROM public.profile_privacy WHERE user_id = v_target), 'everyone');
  END IF;
  v_visible := v_relation = 'self' OR v_visibility = 'everyone' OR (v_visibility = 'friends' AND v_relation = 'friend');

  v_result := jsonb_build_object(
    'status', CASE WHEN v_visible THEN 'ok' ELSE 'hidden' END,
    'user_id', v_target,
    'friend_row_id', CASE WHEN v_relation IN ('friend', 'pending_out', 'pending_in') THEN v_friend.id ELSE NULL END,
    'name', v_p.player_name,
    'avatar_url', v_p.avatar_url,
    'relation', v_relation,
    'visibility', CASE WHEN v_relation = 'self' THEN v_visibility ELSE NULL END
  );

  IF v_visible THEN
    v_result := v_result || jsonb_build_object(
      'elo', v_p.elo,
      'member_since', v_p.created_at,
      'highscores', jsonb_build_object(
        'classic', coalesce(v_p.highscore_classic, 0),
        'chaos', coalesce(v_p.highscore_chaos, 0),
        'time_attack', coalesce(v_p.highscore_time_attack, 0),
        'daily', coalesce(v_p.highscore_daily, 0),
        'move_limit', coalesce(v_p.highscore_move_limit, 0)
      ),
      'records', coalesce((
        SELECT jsonb_object_agg(game_id, jsonb_build_object(
          'wins', wins, 'losses', losses, 'draws', draws,
          'botWins', bot_wins, 'botLosses', bot_losses, 'botDraws', bot_draws))
        FROM public.player_game_records WHERE user_id = v_target
      ), '{}'::jsonb),
      -- The three highest-paying tiers collected: the rarest ones to reach.
      'achievements', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', achievement_id, 'reward', reward) ORDER BY reward DESC, claimed_at ASC)
        FROM (
          SELECT achievement_id, reward, claimed_at FROM public.achievement_claims
          WHERE user_id = v_target ORDER BY reward DESC, claimed_at ASC LIMIT 3
        ) top
      ), '[]'::jsonb)
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_visibility() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_profile_visibility(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_game_records(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_visibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_visibility(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_game_records(jsonb) TO authenticated;
-- Guests may open profiles that are open to everyone, like they can read the leaderboards.
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;
