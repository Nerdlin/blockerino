import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Alert, AppState } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useAppState, MenuStateType, GameModeType } from '@/hooks/useAppState';
import { useLanguage } from '@/constants/Localization';
import { incomingInviteAtom } from '@/components/InviteModeHost';
import { fetchPendingInvites, markInvitesRead } from '@/constants/Invites';
import { chessInviteAtom, parseChessInvite } from '@/constants/chess/ChessInvite';
import { formatTimeControl } from '@/constants/chess/TimeControls';
import { gameInviteAtom, parseGameInvite } from '@/constants/GameInvite';

// An invite reaches a player in two ways: live (a realtime message, while the app is open) and as a push (the app was
// closed; opening it from the push brings the invite back from the server). Both end in the same popup; a room is
// shown once, whichever way arrives first.
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
    const setChessInvite = useSetAtom(chessInviteAtom);
    const setGameInvite = useSetAtom(gameInviteAtom);
    const [userId, setUserId] = useState<string | null>(null);
    const shownRooms = useRef(new Set<string>());

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id || null));
        const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => setUserId(session?.user.id || null));
        return () => authListener.subscription.unsubscribe();
    }, []);

    const presentInvite = useCallback((roomId: string, hostName: string, mode: GameModeType) => {
        if (!userId || shownRooms.current.has(roomId)) return;
        shownRooms.current.add(roomId);
        setIncomingInvite({
            hostName,
            mode,
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
                setMultiplayerGameMode(mode);
                setMultiplayerOpponentName(hostName);
                setMultiplayerPlayerElo(typeof profile?.elo === 'number' ? profile.elo : 0);
                setAppState(MenuStateType.MULTIPLAYER_GAME);
            },
        });
    }, [userId, t, setIncomingInvite, setAppState, setMultiplayerRoomId, setMultiplayerRole, setMultiplayerGameMode, setMultiplayerOpponentName, setMultiplayerPlayerElo]);

    // Live invites while the app is open.
    useEffect(() => {
        if (!userId) return;

        const channel = supabase.channel(`invites:${userId}`)
            .on('broadcast', { event: '1v1_invite' }, (payload) => {
                const { roomId, hostName, gameMode } = payload.payload;
                const nextGameMode = Object.values(GameModeType).includes(gameMode) ? gameMode : GameModeType.Classic;
                presentInvite(roomId, hostName || 'Player 1', nextGameMode);
            })
            .on('broadcast', { event: 'chess_invite' }, (payload) => {
                const invite = parseChessInvite(payload.payload);
                if (!invite || shownRooms.current.has(invite.code)) return;
                shownRooms.current.add(invite.code);
                setIncomingInvite({
                    hostName: invite.hostName,
                    mode: GameModeType.Classic,
                    bodyText: t("chess.challengeBody", { control: formatTimeControl(invite.control) }),
                    accept: () => {
                        setChessInvite(invite);
                        setAppState(MenuStateType.MORE_GAMES);
                    },
                });
            })
            .on('broadcast', { event: 'game_invite' }, (payload) => {
                const invite = parseGameInvite(payload.payload);
                if (!invite || shownRooms.current.has(`${invite.game}:${invite.code}`)) return;
                shownRooms.current.add(`${invite.game}:${invite.code}`);
                setIncomingInvite({
                    hostName: invite.hostName,
                    mode: GameModeType.Classic,
                    bodyText: t('invite.gameBody', { game: t(`invite.game.${invite.game}`) }),
                    accept: () => {
                        setGameInvite(invite);
                        setAppState(MenuStateType.MORE_GAMES);
                    },
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, presentInvite, setIncomingInvite, setChessInvite, setGameInvite, setAppState, t]);

    // Invites that came as a push while the app was closed: asked at launch and whenever the app comes back.
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const check = async () => {
            const pending = await fetchPendingInvites();
            if (cancelled || pending.length === 0) return;
            const newest = pending[0];
            presentInvite(newest.roomId, newest.from || 'Player 1', newest.mode);
            void markInvitesRead(pending.map((invite) => invite.id));
        };
        const timer = setTimeout(() => void check(), 1500);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void check();
        });
        return () => {
            cancelled = true;
            clearTimeout(timer);
            sub.remove();
        };
    }, [userId, presentInvite]);
}
