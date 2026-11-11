-- Guests get an invisible anonymous account (supabase.auth.signInAnonymously) so their room slots and match
-- channels can be checked like anyone else's. An anonymous account is still a guest:
-- * through the API it may do exactly what a signed-out visitor may do (the `anon` role's functions) plus
--   take part in matchmaking rooms; everything else (coins, records, ratings, profile, friends) is refused;
-- * it has no profile and cannot upload an avatar;
-- * it never counts as an account for ratings (is_real_account_id).

CREATE OR REPLACE FUNCTION public.is_anonymous_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean, false);
$$;

-- An account of a real (signed-in) player, not a guest's anonymous one.
CREATE OR REPLACE FUNCTION public.is_real_account_id(p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_id::uuid AND NOT coalesce(is_anonymous, false))
    ELSE FALSE
  END;
$$;
REVOKE ALL ON FUNCTION public.is_real_account_id(text) FROM PUBLIC, anon, authenticated;

-- Runs before every API request (PostgREST db_pre_request).
CREATE OR REPLACE FUNCTION public.guard_anonymous_request()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text := coalesce(current_setting('request.path', true), '');
  v_method text := upper(coalesce(current_setting('request.method', true), 'GET'));
  v_fn text;
BEGIN
  IF NOT public.is_anonymous_caller() THEN
    RETURN;
  END IF;

  IF v_path LIKE '/rpc/%' THEN
    v_fn := split_part(substr(v_path, 6), '?', 1);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
        AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Sign in to do this' USING ERRCODE = '42501', HINT = 'guest_account';
  END IF;

  IF v_method IN ('GET', 'HEAD', 'OPTIONS') THEN
    RETURN;
  END IF;

  IF split_part(split_part(v_path, '?', 1), '/', 2) = 'matchmaking_rooms' THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Sign in to do this' USING ERRCODE = '42501', HINT = 'guest_account';
END;
$$;
GRANT EXECUTE ON FUNCTION public.guard_anonymous_request() TO anon, authenticated;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.guard_anonymous_request';
NOTIFY pgrst, 'reload config';

-- The same rules again in the tables themselves, in case a request reaches them some other way.
DROP POLICY IF EXISTS "Guests have no profile" ON public.profiles;
CREATE POLICY "Guests have no profile" ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_anonymous_caller());
DROP POLICY IF EXISTS "Guests do not change profiles" ON public.profiles;
CREATE POLICY "Guests do not change profiles" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_anonymous_caller());
DROP POLICY IF EXISTS "Guests have no friends" ON public.friends;
CREATE POLICY "Guests have no friends" ON public.friends AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_anonymous_caller());
DROP POLICY IF EXISTS "Guests keep no match history" ON public.match_history;
CREATE POLICY "Guests keep no match history" ON public.match_history AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_anonymous_caller());
DROP POLICY IF EXISTS "Guests upload no avatars" ON storage.objects;
CREATE POLICY "Guests upload no avatars" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_anonymous_caller());
DROP POLICY IF EXISTS "Guests change no files" ON storage.objects;
CREATE POLICY "Guests change no files" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_anonymous_caller());

-- Versus Elo: a guest's anonymous account is a guest, so the guest ration applies to it.
CREATE OR REPLACE FUNCTION public._settle_versus_match(p_room_id uuid, p_outcome text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_delta CONSTANT integer := 10;
  c_pair_cap CONSTANT integer := 10;
  c_guest_cap CONSTANT integer := 5;
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
  v_m public.versus_matches%ROWTYPE;
  v_winner text;
  v_loser text;
  v_outcome text := p_outcome;
  v_acct text;
BEGIN
  SELECT * INTO v_m FROM public.versus_matches WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_m.settled_at IS NOT NULL THEN RETURN COALESCE(v_m.outcome, 'void'); END IF;

  IF v_outcome IN ('p1_win', 'p2_win') THEN
    v_winner := CASE WHEN v_outcome = 'p1_win' THEN v_m.player1_id ELSE v_m.player2_id END;
    v_loser := CASE WHEN v_outcome = 'p1_win' THEN v_m.player2_id ELSE v_m.player1_id END;

    IF (SELECT count(*) FROM public.versus_matches
         WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win')
           AND ((player1_id = v_m.player1_id AND player2_id = v_m.player2_id)
             OR (player1_id = v_m.player2_id AND player2_id = v_m.player1_id))) >= c_pair_cap THEN
      v_outcome := 'capped';
    END IF;

    -- Against a guest the opponent cannot be verified, so such matches are rationed per account.
    IF v_outcome <> 'capped' THEN
      FOREACH v_acct IN ARRAY ARRAY[v_m.player1_id, v_m.player2_id] LOOP
        IF public.is_real_account_id(v_acct)
           AND NOT public.is_real_account_id(CASE WHEN v_acct = v_m.player1_id THEN v_m.player2_id ELSE v_m.player1_id END)
           AND (SELECT count(*) FROM public.versus_matches
                 WHERE settled_at >= v_day_start AND outcome IN ('p1_win', 'p2_win')
                   AND (player1_id = v_acct OR player2_id = v_acct)
                   AND NOT public.is_real_account_id(CASE WHEN player1_id = v_acct THEN player2_id ELSE player1_id END)) >= c_guest_cap THEN
          v_outcome := 'capped';
        END IF;
      END LOOP;
    END IF;

    IF v_outcome <> 'capped' THEN
      IF public.is_real_account_id(v_winner) THEN
        UPDATE public.profiles SET elo = elo + c_delta WHERE auth_user_id = v_winner::uuid;
      END IF;
      IF public.is_real_account_id(v_loser) THEN
        UPDATE public.profiles SET elo = GREATEST(0, elo - c_delta) WHERE auth_user_id = v_loser::uuid;
      END IF;
    END IF;
  END IF;

  UPDATE public.versus_matches SET outcome = v_outcome, settled_at = now() WHERE room_id = p_room_id;
  RETURN v_outcome;
END;
$$;
REVOKE ALL ON FUNCTION public._settle_versus_match(uuid, text) FROM PUBLIC, anon, authenticated;

-- A guest's anonymous account is thrown away after a month without use (a new one is made on the next online game).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('purge-idle-guest-accounts', '20 4 * * *',
  $cron$DELETE FROM auth.users WHERE is_anonymous AND coalesce(last_sign_in_at, updated_at, created_at) < now() - interval '30 days'$cron$);
