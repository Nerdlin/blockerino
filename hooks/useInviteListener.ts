import { gameAlert } from "@/constants/GameDialog";
import { sendInviteBroadcast } from '@/constants/InviteChannel';
import { isInOnlineRoom, outgoingInviteAtom } from '@/constants/OutgoingInvite';
import { openInviteInbox } from '@/constants/InviteChannel';
import { loadRealtimeBackend, realtime } from '@/constants/RoomSocket';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useAppState, MenuStateType, GameModeType } from '@/hooks/useAppState';
import { useLanguage } from '@/constants/Localization';
import { incomingInviteAtom } from '@/components/InviteModeHost';
import { fetchPendingInvites, markInvitesRead } from '@/constants/Invites';
import { chessInviteAtom, parseChessInvite } from '@/constants/chess/ChessInvite';
import { formatTimeControl } from '@/constants/chess/TimeControls';
import { gameInviteAtom, parseGameInvite } from '@/constants/GameInvite';
import { getAccountSession, accountSessionOf } from '@/constants/AccountSession';
import { getDiscordInstanceId, isDiscordSdkAvailable } from '@/hooks/useDiscordSDK';
import { getDiscordSelfId } from '@/constants/DiscordParticipants';
import { startDiscordDuelChannel, sendDiscordDuelEvent } from '@/constants/DiscordDuelChannel';
import { DISCORD_DUEL_BUSY, DISCORD_DUEL_DECLINED } from '@/constants/DiscordDuel';

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
    const setOutgoingInvite = useSetAtom(outgoingInviteAtom);
    const [userId, setUserId] = useState<string | null>(null);
    const shownRooms = useRef(new Set<string>());

    useEffect(() => {
        getAccountSession().then(({ data }) => setUserId(data.session?.user.id || null));
        const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => setUserId(accountSessionOf(session)?.user.id || null));
        return () => authListener.subscription.unsubscribe();
    }, []);

    const presentInvite = useCallback((roomId: string, hostName: string, mode: GameModeType, answerVia?: (event: 'invite_declined' | 'invite_busy') => void) => {
        if (!userId || shownRooms.current.has(roomId)) return;
        shownRooms.current.add(roomId);
        // The host waits for an answer; tell them "no" or "busy" (the room row names the host). A challenge that came over the
        // Discord Activity channel is answered on that channel, the host is not necessarily a friend.
        const answer = (event: 'invite_declined' | 'invite_busy') => {
            if (answerVia) {
                answerVia(event);
                return;
            }
            void supabase.from('matchmaking_rooms').select('player1_id').eq('id', roomId).maybeSingle().then(({ data }) => {
                const hostId = typeof data?.player1_id === 'string' ? data.player1_id : null;
                if (hostId) void sendInviteBroadcast(hostId, event, { roomId });
            });
        };
        // A player in an online game is not interrupted: the host hears "busy" at once.
        if (isInOnlineRoom()) {
            answer('invite_busy');
            return;
        }
        setIncomingInvite({
            decline: () => answer('invite_declined'),
            hostName,
            mode,
            accept: async () => {
                // First check if the room still exists and is waiting
                const { data: room } = await supabase.from('matchmaking_rooms').select('status').eq('id', roomId).single();
                if (!room || room.status !== 'waiting') {
                    gameAlert(t("invite.expiredTitle"), t("invite.expired"));
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
                    gameAlert(t("invite.errorTitle"), t("invite.joinFailed"));
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

    // On a phone the inbox is open only while the app is in the foreground; in the background invites come as push
    // notifications (and are asked for again when the app comes back, below). The web keeps it open.
    const [foreground, setForeground] = useState(AppState.currentState !== 'background');
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
        return () => sub.remove();
    }, []);

    // Live invites while the app is open.
    useEffect(() => {
        if (!userId || !foreground) return;

        // Private inbox: only this player can listen to it and only friends can send to it.
        const listen = (inbox: ReturnType<typeof openInviteInbox>) => inbox
            .on('broadcast', { event: '1v1_invite' }, (payload) => {
                const { roomId, hostName, gameMode } = payload.payload;
                const nextGameMode = Object.values(GameModeType).includes(gameMode) ? gameMode : GameModeType.Classic;
                presentInvite(roomId, hostName || 'Player 1', nextGameMode);
            })
            .on('broadcast', { event: 'invite_declined' }, (payload) => {
                const roomId = payload.payload?.roomId;
                setOutgoingInvite((current) => (current && current.roomId === roomId && current.status === 'waiting' ? { ...current, status: 'declined' } : current));
            })
            .on('broadcast', { event: 'invite_busy' }, (payload) => {
                const roomId = payload.payload?.roomId;
                setOutgoingInvite((current) => {
                    if (!current || current.roomId !== roomId || current.status !== 'waiting') return current;
                    void supabase.from('matchmaking_rooms').delete().eq('id', roomId).eq('status', 'waiting');
                    return { ...current, status: 'busy' };
                });
            })
            .on('broadcast', { event: 'chess_invite' }, (payload) => {
                const invite = parseChessInvite(payload.payload);
                if (!invite || shownRooms.current.has(invite.code)) return;
                if (isInOnlineRoom()) return;
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
                if (isInOnlineRoom()) return;
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
        // The backend flag decides where the inbox lives, so it is opened once the flag is known.
        let inbox: ReturnType<typeof openInviteInbox> | null = null;
        let cancelled = false;
        void loadRealtimeBackend().then(() => {
            if (!cancelled) inbox = listen(openInviteInbox(userId));
        });

        return () => {
            cancelled = true;
            if (inbox) realtime.removeChannel(inbox);
        };
    }, [userId, foreground, presentInvite, setIncomingInvite, setChessInvite, setGameInvite, setAppState, setOutgoingInvite, t]);

    // Duel challenges from the others in this Discord Activity (voice channel), see constants/DiscordDuel.ts.
    useEffect(() => {
        if (!userId || !isDiscordSdkAvailable()) return;
        const selfId = getDiscordSelfId();
        return startDiscordDuelChannel(getDiscordInstanceId(), selfId, {
            onInvite: (invite) => presentInvite(invite.roomId, invite.hostName, invite.mode, (event) => {
                void sendDiscordDuelEvent(event === 'invite_busy' ? DISCORD_DUEL_BUSY : DISCORD_DUEL_DECLINED, { to: invite.fromId, roomId: invite.roomId });
            }),
            onDeclined: (roomId) => setOutgoingInvite((current) => (current && current.roomId === roomId && current.status === 'waiting' ? { ...current, status: 'declined' } : current)),
            onBusy: (roomId) => setOutgoingInvite((current) => {
                if (!current || current.roomId !== roomId || current.status !== 'waiting') return current;
                void supabase.from('matchmaking_rooms').delete().eq('id', roomId).eq('status', 'waiting');
                return { ...current, status: 'busy' };
            }),
        });
    }, [userId, presentInvite, setOutgoingInvite]);

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
