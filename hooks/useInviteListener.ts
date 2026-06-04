import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useAppState, MenuStateType } from '@/hooks/useAppState';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useInviteListener(
    setMultiplayerRoomId: (id: string) => void,
    setMultiplayerRole: (role: "player1" | "player2") => void,
    setMultiplayerGameMode: (mode: '1v1_casual' | '1v1_ranked') => void
) {
    const [appState, setAppState] = useAppState();
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id || null));
        const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => setUserId(session?.user.id || null));
        return () => authListener.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId) return;

        const channel = supabase.channel(`invites:${userId}`)
            .on('broadcast', { event: '1v1_invite' }, (payload) => {
                const { roomId, hostName, gameMode } = payload.payload;
                
                Alert.alert(
                    "1v1 Invite!",
                    `${hostName} has invited you to a ${gameMode === '1v1_ranked' ? 'Ranked' : 'Casual'} match!`,
                    [
                        { text: "Decline", style: "cancel" },
                        {
                            text: "Accept",
                            onPress: async () => {
                                // First check if the room still exists and is waiting
                                const { data: room } = await supabase.from('matchmaking_rooms').select('status').eq('id', roomId).single();
                                if (!room || room.status !== 'waiting') {
                                    Alert.alert("Expired", "The invite has expired or the room is no longer available.");
                                    return;
                                }

                                // Update room to playing with current user
                                const { data: profile } = await supabase.from('profiles').select('player_name').eq('id', userId).single();
                                const myName = profile?.player_name || 'Player 2';
                                
                                const { error } = await supabase.from('matchmaking_rooms').update({
                                    status: 'playing',
                                    player2_id: userId,
                                    player2_name: myName
                                }).eq('id', roomId);

                                if (error) {
                                    Alert.alert("Error", "Could not join the match.");
                                    return;
                                }

                                setMultiplayerRoomId(roomId);
                                setMultiplayerRole("player2");
                                setMultiplayerGameMode(gameMode);
                                setAppState(MenuStateType.MULTIPLAYER_GAME);
                            }
                        }
                    ]
                );
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, setAppState, setMultiplayerRoomId, setMultiplayerRole, setMultiplayerGameMode]);
}
