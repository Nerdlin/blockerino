-- Multiplayer rooms use app/player ids as text, not auth.users UUIDs.
-- Keep the table readable through RLS, but allow anonymous multiplayer clients to
-- save completed match summaries.

ALTER TABLE public.match_history
    DROP CONSTRAINT IF EXISTS match_history_player1_id_fkey,
    DROP CONSTRAINT IF EXISTS match_history_player2_id_fkey,
    DROP CONSTRAINT IF EXISTS match_history_winner_id_fkey;

ALTER TABLE public.match_history
    ALTER COLUMN player1_id TYPE TEXT USING player1_id::TEXT,
    ALTER COLUMN player2_id TYPE TEXT USING player2_id::TEXT,
    ALTER COLUMN winner_id TYPE TEXT USING winner_id::TEXT;

DROP POLICY IF EXISTS "Authenticated users can insert match history" ON public.match_history;
DROP POLICY IF EXISTS "Anyone can insert match history" ON public.match_history;

CREATE POLICY "Anyone can insert match history" ON public.match_history
    FOR INSERT
    WITH CHECK (true);
