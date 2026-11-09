-- profiles is readable by everyone (leaderboards, friend search), so it must not hold e-mail addresses.
-- The address already lives in auth.users; the copy in profiles was never read by the app.
-- Older app builds still send `email` on insert/update and select it back, so the column stays
-- (they get NULL) and a trigger drops whatever is written. Drop the column once those builds are gone.

CREATE OR REPLACE FUNCTION public.profiles_strip_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_strip_email ON public.profiles;
CREATE TRIGGER trg_profiles_strip_email
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_strip_email();

UPDATE public.profiles SET email = NULL WHERE email IS NOT NULL;

COMMENT ON COLUMN public.profiles.email IS 'Deprecated: always NULL (profiles is world-readable). Use auth.users.email.';
