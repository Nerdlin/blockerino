-- Migration: Create Social Tables (friends, match_history)

-- 1. Create match_history table
CREATE TABLE IF NOT EXISTS public.match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID, -- Can be null if room was deleted, or keep it for reference
    player1_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    player2_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    player1_elo_change INTEGER DEFAULT 0,
    player2_elo_change INTEGER DEFAULT 0,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for match_history
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- Everyone can read match history
CREATE POLICY "Anyone can read match history" ON public.match_history
    FOR SELECT
    USING (true);

-- Only authenticated users can insert match history (in a real app, this should be restricted to the server/admin or validated tightly)
CREATE POLICY "Authenticated users can insert match history" ON public.match_history
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');


-- 2. Create friends table
CREATE TABLE IF NOT EXISTS public.friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id_1, user_id_2)
);

-- Ensure a user doesn't friend themselves
ALTER TABLE public.friends ADD CONSTRAINT cannot_friend_self CHECK (user_id_1 != user_id_2);

-- Function to ensure user_id_1 < user_id_2 to avoid duplicate friendship rows (e.g. A->B and B->A)
-- Actually, for pending requests, user_id_1 could be the requester, and user_id_2 the receiver.
-- So we won't force order, but we will add a trigger to update updated_at.

CREATE OR REPLACE FUNCTION update_friends_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER friends_updated_at_trigger
    BEFORE UPDATE ON public.friends
    FOR EACH ROW
    EXECUTE FUNCTION update_friends_updated_at();

-- Enable RLS for friends
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Users can read their own friends
CREATE POLICY "Users can read their own friends" ON public.friends
    FOR SELECT
    USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Users can insert a friend request if they are user_id_1
CREATE POLICY "Users can create friend requests" ON public.friends
    FOR INSERT
    WITH CHECK (auth.uid() = user_id_1 AND status = 'pending');

-- Users can update a friend request (accept it) if they are user_id_2
CREATE POLICY "Users can update their friend requests" ON public.friends
    FOR UPDATE
    USING (auth.uid() = user_id_2 OR auth.uid() = user_id_1)
    WITH CHECK (
        (auth.uid() = user_id_2 AND status = 'accepted') OR 
        (auth.uid() = user_id_1 AND status = 'pending')
    );

-- Users can delete a friendship if they are part of it
CREATE POLICY "Users can delete their friends" ON public.friends
    FOR DELETE
    USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
