-- 2.0.9 has its own notification sound on a new Android channel ("game"). A channel's sound cannot change once made,
-- so older builds keep the default channel; a token says which channel it has (set by the app after registering).

ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS channel text CHECK (channel IS NULL OR channel IN ('game'));

-- Marks the caller's own token with the channel its app made. Returns true when a token was marked.
CREATE OR REPLACE FUNCTION public.set_push_channel(p_token text, p_channel text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_channel IS DISTINCT FROM 'game' THEN RETURN false; END IF;
  UPDATE public.push_tokens t
     SET channel = p_channel
    FROM public.profiles p
   WHERE t.token = p_token AND t.profile_id = p.id AND p.auth_user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.set_push_channel(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_push_channel(text, text) TO authenticated;
