-- Add performance indexes for leaderboard queries to support scaling on Supabase Free Tier
CREATE INDEX IF NOT EXISTS idx_profiles_elo ON public.profiles (elo DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_highscore_classic ON public.profiles (highscore_classic DESC) WHERE highscore_classic > 0;
CREATE INDEX IF NOT EXISTS idx_profiles_highscore_chaos ON public.profiles (highscore_chaos DESC) WHERE highscore_chaos > 0;
CREATE INDEX IF NOT EXISTS idx_profiles_highscore_time_attack ON public.profiles (highscore_time_attack DESC) WHERE highscore_time_attack > 0;
CREATE INDEX IF NOT EXISTS idx_profiles_highscore_daily ON public.profiles (highscore_daily DESC) WHERE highscore_daily > 0;
CREATE INDEX IF NOT EXISTS idx_profiles_lower_player_name ON public.profiles (LOWER(player_name));
