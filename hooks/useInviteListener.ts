import { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Alert } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useAppState, MenuStateType, GameModeType } from '@/hooks/useAppState';
import { useLanguage } from '@/constants/Localization';
import { incomingInviteAtom } from '@/components/InviteModeHost';

export function useInviteListener(
    setMultiplayerRoomId: (id: string) => void,
    setMultiplayerRole: (role: "player1" | "player2") => void,
    setMultiplayerGameMode: (mode: GameModeType) => void,
    setMultiplayerOpponentName: (name: string) => void,
    setMultiplayerPlayerElo: (elo: number) => void,
) {
    const [, setAppState] = useAppState();
    const { t } = useLanguage();
    const setIncomingInvite = useSetAtom(incomingInviteAtom);
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
                const nextGameMode = Object.values(GameModeType).includes(gameMode) ? gameMode : GameModeType.Classic;
                
                setIncomingInvite({
                    hostName: hostName || 'Player 1',
                    mode: nextGameMode,
                    accept: async () => {
                            // First check if the room still exists and is waiting
                            const { data: room } = await supabase.from('matchmaking_rooms').select('status').eq('id', roomId).single();
                            if (!room || room.status !== 'waiting') {
                                Alert.alert(t("invite.expiredTitle"), t("invite.expired"));
                                return;
                            }
    
                            // Update room to playing with current user
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('player_name, elo')
                                .or(`auth_user_id.eq.${userId},player_id.eq.${userId}`)
                                .limit(1)
                                .maybeSingle();
                            const myName = profile?.player_name || 'Player 2';
                            
                            const { error } = await supabase.from('matchmaking_rooms').update({
                                status: 'playing',
                                player2_id: userId,
                                player2_name: myName
                            }).eq('id', roomId);
    
                            if (error) {
                                Alert.alert(t("invite.errorTitle"), t("invite.joinFailed"));
                                return;
                            }
    
                            setMultiplayerRoomId(roomId);
                            setMultiplayerRole("player2");
                            setMultiplayerGameMode(nextGameMode);
                            setMultiplayerOpponentName(hostName || 'Player 1');
                            setMultiplayerPlayerElo(typeof profile?.elo === 'number' ? profile.elo : 0);
                            setAppState(MenuStateType.MULTIPLAYER_GAME);
                    },
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, t, setIncomingInvite, setAppState, setMultiplayerRoomId, setMultiplayerRole, setMultiplayerGameMode, setMultiplayerOpponentName, setMultiplayerPlayerElo]);
}
