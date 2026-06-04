import React, { useCallback, useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, TextInput, ActivityIndicator, Clipboard, useWindowDimensions, ScrollView, Pressable } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { supabase, getTopEloRatings, getPlayerElo, EloRating, cleanupMatchmakingRooms } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Crypto from "expo-crypto";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { getJoinRoomUpdate, isPlayerNameReady, isVisiblePublicRoom, normalizePlayerName } from "@/constants/Multiplayer";

interface MultiplayerMenuProps {
    onStartGame: (roomId: string, role: 'player1' | 'player2' | 'spectator', opponentName: string, gameMode: GameModeType, playerElo: number) => void;
}

const NAME_REQUIRED_MESSAGE = "Enter a nickname to play multiplayer.";
const NAME_READY_MESSAGE = "Nickname set. You can play now!";

export function getEloBadge(elo: number): { tier: string; color: string } {
    if (elo < 800) return { tier: "Bronze", color: "#CD7F32" };
    if (elo < 1000) return { tier: "Silver", color: "#C0C0C0" };
    if (elo < 1200) return { tier: "Gold", color: "#FFD700" };
    if (elo < 1400) return { tier: "Diamond", color: "#00BFFF" };
    if (elo < 1600) return { tier: "Master", color: "#DA70D6" };
    return { tier: "Legend", color: "#FF4500" };
}

const ELO_TIERS = [
    { tier: "Bronze", color: "#CD7F32", icon: "B", min: 0, max: 800 },
    { tier: "Silver", color: "#C0C0C0", icon: "S", min: 800, max: 1000 },
    { tier: "Gold", color: "#FFD700", icon: "G", min: 1000, max: 1200 },
    { tier: "Diamond", color: "#00BFFF", icon: "D", min: 1200, max: 1400 },
    { tier: "Master", color: "#DA70D6", icon: "M", min: 1400, max: 1600 },
    { tier: "Legend", color: "#FF4500", icon: "L", min: 1600, max: 2000 },
];

function getEloDetails(elo: number) {
    const tierIndex = ELO_TIERS.findIndex(t => elo < t.max);
    const currentTier = tierIndex >= 0 ? ELO_TIERS[tierIndex] : ELO_TIERS[ELO_TIERS.length - 1];
    const nextTier = tierIndex >= 0 && tierIndex < ELO_TIERS.length - 1 ? ELO_TIERS[tierIndex + 1] : null;
    const progress = (elo - currentTier.min) / (currentTier.max - currentTier.min);
    return { currentTier, nextTier, progress: Math.min(1, Math.max(0, progress)), allTiers: ELO_TIERS };
}

export default function MultiplayerMenu({ onStartGame }: MultiplayerMenuProps) {
    const { currentTheme } = useTheme();
    const [, , , popAppState] = useAppState();
    const { width } = useWindowDimensions();
    const isMobile = width < 600;
    
    const [playerName, setPlayerName] = useState("");
    const [playerId, setPlayerId] = useState("");
    const [playerElo, setPlayerElo] = useState<number>(0);
    const [publicRooms, setPublicRooms] = useState<any[]>([]);
    const [selectedMode, setSelectedMode] = useState<GameModeType>(GameModeType.Classic);
    const [lobbyState, setLobbyState] = useState<'idle' | 'searching' | 'hosting' | 'joining'>('idle');
    const [gameMode, setGameMode] = useState<GameModeType>(GameModeType.Classic);
    const [roomCode, setRoomCode] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [matchError, setMatchError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [showEloScreen, setShowEloScreen] = useState(false);
    const [showEloLeaderboard, setShowEloLeaderboard] = useState(false);
    const [topEloList, setTopEloList] = useState<EloRating[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
    const [refreshingPublicRooms, setRefreshingPublicRooms] = useState(false);
    
    const currentRoomId = useRef<string | null>(null);
    const subscriptionRef = useRef<any>(null);
    const isMounted = useRef(true);
    const playerNameRef = useRef(playerName);
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lobbyScrollRef = useRef<ScrollView>(null);
    const lastRoomCleanupAt = useRef(0);

    playerNameRef.current = playerName;
    const nicknameInputRef = useRef<TextInput>(null);

    const syncPlayerElo = useCallback(async (name: string = playerNameRef.current, localFallback?: string | null) => {
        const currentName = name.trim();
        if (!currentName) {
            setPlayerElo(0);
            return;
        }
        
        const serverElo = await getPlayerElo(currentName);

        if (!isMounted.current || playerNameRef.current.trim() !== currentName) {
            return;
        }

        if (serverElo !== null) {
            setPlayerElo(serverElo);
            AsyncStorage.setItem('PLAYER_ELO', serverElo.toString());
            return;
        }

        if (localFallback) {
            const parsed = parseInt(localFallback, 10);
            setPlayerElo(isNaN(parsed) ? 0 : parsed);
        } else {
            AsyncStorage.setItem('PLAYER_ELO', '0');
            setPlayerElo(0);
        }
    }, []);

    const cleanupRoomsIfNeeded = useCallback(async (force: boolean = false) => {
        const now = Date.now();
        if (!force && now - lastRoomCleanupAt.current < 30000) {
            return;
        }

        lastRoomCleanupAt.current = now;
        await cleanupMatchmakingRooms();
    }, []);

    const loadEloLeaderboard = useCallback(async () => {
        setLoadingLeaderboard(true);

        try {
            const currentName = playerNameRef.current;
            const [serverElo, list] = await Promise.all([
                getPlayerElo(currentName),
                getTopEloRatings(100),
            ]);

            if (!isMounted.current) return;

            if (serverElo !== null) {
                setPlayerElo(serverElo);
                AsyncStorage.setItem('PLAYER_ELO', serverElo.toString());
            }
            setTopEloList(list);
        } finally {
            if (isMounted.current) {
                setLoadingLeaderboard(false);
            }
        }
    }, []);

    const fetchPublicRooms = useCallback(async () => {
        try {
            await cleanupRoomsIfNeeded();

            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .eq('is_private', false)
                .in('status', ['waiting', 'playing'])
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            if (data && isMounted.current) {
                setPublicRooms(data.filter((room) => isVisiblePublicRoom(room)).slice(0, 50));
            }
        } catch (e) {
            console.error("Error fetching public rooms:", e);
        }
    }, [cleanupRoomsIfNeeded]);

    useEscapeKey(() => {
        if (showEloLeaderboard) {
            setShowEloLeaderboard(false);
        } else if (showEloScreen) {
            setShowEloScreen(false);
        } else if (lobbyState === 'searching' || lobbyState === 'hosting') {
            cleanupLobby();
        } else {
            popAppState();
        }
    });

    useEffect(() => {
        isMounted.current = true;
        // Load player name from storage
        AsyncStorage.getItem('PLAYER_NAME').then((val) => {
            if (val && isMounted.current) {
                setPlayerName(val);
            }
        });

        // Load or generate player ID from storage
        AsyncStorage.getItem('PLAYER_ID').then((val) => {
            if (isMounted.current) {
                if (val) {
                    setPlayerId(val);
                } else {
                    const newId = Crypto.randomUUID();
                    AsyncStorage.setItem('PLAYER_ID', newId);
                    setPlayerId(newId);
                }
            }
        });

        // Load player ELO — sync from Supabase first, fallback to local
        Promise.all([
            AsyncStorage.getItem('PLAYER_NAME'),
            AsyncStorage.getItem('PLAYER_ELO')
        ]).then(([nameVal, localEloVal]) => {
            if (!isMounted.current) return;
            const currentName = (nameVal || '').trim();
            syncPlayerElo(currentName, localEloVal);
        });

        // Initial fetch of public rooms
        fetchPublicRooms();

        // 5-second polling interval
        const timer = setInterval(() => {
            fetchPublicRooms();
        }, 5000);

        return () => {
            isMounted.current = false;
            clearInterval(timer);
            if (feedbackTimerRef.current) {
                clearTimeout(feedbackTimerRef.current);
            }
            cleanupLobby();
        };
    }, [fetchPublicRooms, syncPlayerElo]);

    useEffect(() => {
        const timer = setInterval(() => {
            syncPlayerElo();
        }, 10000);

        return () => {
            clearInterval(timer);
        };
    }, [syncPlayerElo]);

    useEffect(() => {
        const timer = setTimeout(() => {
            syncPlayerElo();
        }, 500);

        return () => {
            clearTimeout(timer);
        };
    }, [playerName, syncPlayerElo]);

    const handleRefreshPublicRooms = async () => {
        if (refreshingPublicRooms) return;

        setRefreshingPublicRooms(true);
        try {
            await cleanupRoomsIfNeeded(true);
            await fetchPublicRooms();
        } finally {
            if (isMounted.current) {
                setRefreshingPublicRooms(false);
            }
        }
    };

    const cleanupLobby = async () => {
        if (isMounted.current) {
            setLobbyState('idle');
        }
        
        if (subscriptionRef.current) {
            supabase.removeChannel(subscriptionRef.current);
            subscriptionRef.current = null;
        }
        
        if (currentRoomId.current) {
            const roomId = currentRoomId.current;
            currentRoomId.current = null;
            
            // Delete the room if we cancel/exit and it's still waiting
            try {
                await supabase
                    .from('matchmaking_rooms')
                    .delete()
                    .eq('id', roomId)
                    .eq('status', 'waiting');
            } catch (e) {
                console.error("Error deleting room on exit:", e);
            }
        }
    };

    const cleanupOldQuickMatchRooms = async () => {
        await cleanupRoomsIfNeeded(true);
    };

    const clearFeedbackTimer = () => {
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = null;
        }
    };

    const showTemporarySuccess = (message: string) => {
        clearFeedbackTimer();
        setSuccessMessage(message);
        feedbackTimerRef.current = setTimeout(() => {
            if (isMounted.current) setSuccessMessage("");
            feedbackTimerRef.current = null;
        }, 3000);
    };

    const promptForPlayerName = () => {
        clearFeedbackTimer();
        setMatchError(NAME_REQUIRED_MESSAGE);
        setSuccessMessage("");
        lobbyScrollRef.current?.scrollTo({ y: 0, animated: true });
        setTimeout(() => nicknameInputRef.current?.focus(), 120);
    };

    const getRequiredPlayerName = () => {
        const normalizedName = normalizePlayerName(playerName);
        if (!isPlayerNameReady(normalizedName)) {
            promptForPlayerName();
            return null;
        }
        return normalizedName;
    };

    const handlePlayerNameChange = (name: string) => {
        setPlayerName(name);
        const normalizedName = normalizePlayerName(name);
        if (normalizedName) {
            AsyncStorage.setItem('PLAYER_NAME', normalizedName);
        } else {
            AsyncStorage.removeItem('PLAYER_NAME');
            AsyncStorage.setItem('PLAYER_ELO', '0');
            setPlayerElo(0);
        }
        if (normalizedName && matchError === NAME_REQUIRED_MESSAGE) {
            setMatchError("");
            showTemporarySuccess(NAME_READY_MESSAGE);
        }
    };

    const subscribeToRoom = (roomId: string, myRole: 'player1' | 'player2') => {
        if (subscriptionRef.current) {
            supabase.removeChannel(subscriptionRef.current);
        }

        const channel = supabase
            .channel(`room-updates-${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'matchmaking_rooms',
                    filter: `id=eq.${roomId}`
                },
                (payload) => {
                    const room = payload.new;
                    if (room.status === 'playing') {
                        // Game starts!
                        cleanupLobby();
                        const opponentName = myRole === 'player1' ? room.player2_name : room.player1_name;
                        onStartGame(roomId, myRole, opponentName || 'Opponent', room.game_mode as GameModeType, playerElo);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // Check if room was updated while we were subscribing
                    supabase
                        .from('matchmaking_rooms')
                        .select('*')
                        .eq('id', roomId)
                        .single()
                        .then(({ data }) => {
                            if (data && data.status === 'playing') {
                                cleanupLobby();
                                const opponentName = myRole === 'player1' ? data.player2_name : data.player1_name;
                                onStartGame(roomId, myRole, opponentName || 'Opponent', data.game_mode as GameModeType, playerElo);
                            }
                        });
                }
            });

        subscriptionRef.current = channel;
    };

    const handleQuickMatch = async (mode: GameModeType) => {
        const normalizedName = getRequiredPlayerName();
        if (!normalizedName) {
            return;
        }

        setLobbyState('searching');
        setGameMode(mode);
        setMatchError("");
        setSuccessMessage("");

        let activePlayerId = playerId;
        if (!activePlayerId) {
            activePlayerId = Crypto.randomUUID();
            AsyncStorage.setItem('PLAYER_ID', activePlayerId);
            setPlayerId(activePlayerId);
        }
        
        try {
            // Clean up old dead rooms first
            await cleanupOldQuickMatchRooms();

            // Find a room waiting for an opponent
            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .eq('status', 'waiting')
                .eq('game_mode', mode)
                .eq('is_private', false)
                .neq('player1_id', activePlayerId)
                .order('created_at', { ascending: true })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                // Try to join this room (optimistic lock)
                const room = data[0];
                const { data: updatedData, error: updateError } = await supabase
                    .from('matchmaking_rooms')
                    .update(getJoinRoomUpdate(normalizedName, activePlayerId))
                    .eq('id', room.id)
                    .is('player2_name', null) // Avoid race condition
                    .select();

                if (updateError) throw updateError;

                if (updatedData && updatedData.length > 0) {
                    // Join successful!
                    const finalRoom = updatedData[0];
                    onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, mode, playerElo);
                } else {
                    // Somebody else joined first. Try again.
                    handleQuickMatch(mode);
                }
            } else {
                // Create a new waiting room
                const { data: newRoom, error: insertError } = await supabase
                    .from('matchmaking_rooms')
                    .insert({
                        player1_name: normalizedName,
                        player1_id: activePlayerId,
                        game_mode: mode,
                        status: 'waiting',
                        is_private: false
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;

                if (newRoom) {
                    currentRoomId.current = newRoom.id;
                    subscribeToRoom(newRoom.id, 'player1');
                }
            }
        } catch (e) {
            console.error("Matchmaking error:", e);
            setMatchError("Connection error. Please try again.");
            setLobbyState('idle');
        }
    };

    const handleCreateRoom = async (mode: GameModeType) => {
        const normalizedName = getRequiredPlayerName();
        if (!normalizedName) {
            return;
        }

        setLobbyState('hosting');
        setGameMode(mode);
        setMatchError("");
        setSuccessMessage("");

        let activePlayerId = playerId;
        if (!activePlayerId) {
            activePlayerId = Crypto.randomUUID();
            AsyncStorage.setItem('PLAYER_ID', activePlayerId);
            setPlayerId(activePlayerId);
        }

        try {
            const { data: newRoom, error } = await supabase
                .from('matchmaking_rooms')
                .insert({
                    player1_name: normalizedName,
                    player1_id: activePlayerId,
                    game_mode: mode,
                    status: 'waiting',
                    is_private: true
                })
                .select()
                .single();

            if (error) throw error;

            if (newRoom) {
                currentRoomId.current = newRoom.id;
                // Use the first 6 chars of the UUID as room code
                setRoomCode(newRoom.id.substring(0, 6).toUpperCase());
                subscribeToRoom(newRoom.id, 'player1');
            }
        } catch (e) {
            console.error("Create room error:", e);
            setMatchError("Failed to create room.");
            setLobbyState('idle');
        }
    };

    const handleJoinRoom = async () => {
        const normalizedName = getRequiredPlayerName();
        if (!normalizedName) {
            return;
        }

        const code = joinCode.trim().toLowerCase();
        if (code.length < 6) {
            setMatchError("Room code must be 6 characters");
            return;
        }

        setMatchError("");
        setSuccessMessage("");
        setLobbyState('joining');

        let activePlayerId = playerId;
        if (!activePlayerId) {
            activePlayerId = Crypto.randomUUID();
            AsyncStorage.setItem('PLAYER_ID', activePlayerId);
            setPlayerId(activePlayerId);
        }

        try {
            // Find room by ID prefix (since id is UUID, we fetch waiting private rooms and filter client-side)
            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .eq('status', 'waiting')
                .eq('is_private', true);

            if (error) throw error;

            const room = data?.find(r => r.id.substring(0, 6).toLowerCase() === code);

            if (room) {
                if (room.player1_id === activePlayerId) {
                    setMatchError("You cannot join your own room!");
                    setLobbyState('idle');
                    return;
                }

                // Join room
                const { data: updatedRoom, error: updateError } = await supabase
                    .from('matchmaking_rooms')
                    .update(getJoinRoomUpdate(normalizedName, activePlayerId))
                    .eq('id', room.id)
                    .is('player2_name', null)
                    .select();

                if (updateError) throw updateError;

                if (updatedRoom && updatedRoom.length > 0) {
                    const finalRoom = updatedRoom[0];
                    onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, finalRoom.game_mode as GameModeType, playerElo);
                } else {
                    setMatchError("Room is already full or closed");
                    setLobbyState('idle');
                }
            } else {
                setMatchError("Room not found or not waiting for players");
                setLobbyState('idle');
            }
        } catch (e) {
            console.error("Join room error:", e);
            setMatchError("Failed to join room.");
            setLobbyState('idle');
        }
    };

    const handleJoinSpecificRoom = async (room: any) => {
        const normalizedName = getRequiredPlayerName();
        if (!normalizedName) {
            return;
        }

        setMatchError("");
        setSuccessMessage("");
        setLobbyState('joining');

        let activePlayerId = playerId;
        if (!activePlayerId) {
            activePlayerId = Crypto.randomUUID();
            AsyncStorage.setItem('PLAYER_ID', activePlayerId);
            setPlayerId(activePlayerId);
        }

        try {
            // Join room
            const { data: updatedRoom, error: updateError } = await supabase
                .from('matchmaking_rooms')
                .update(getJoinRoomUpdate(normalizedName, activePlayerId))
                .eq('id', room.id)
                .is('player2_name', null)
                .select();

            if (updateError) throw updateError;

            if (updatedRoom && updatedRoom.length > 0) {
                const finalRoom = updatedRoom[0];
                onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, finalRoom.game_mode as GameModeType, playerElo);
            } else {
                setMatchError("Room is already full or closed");
                setLobbyState('idle');
            }
        } catch (e) {
            console.error("Join room error:", e);
            setMatchError("Failed to join room.");
            setLobbyState('idle');
        }
    };

    const handleSpectateRoom = (room: any) => {
        cleanupLobby();
        onStartGame(room.id, 'spectator', `${room.player1_name} vs ${room.player2_name || 'Opponent'}`, room.game_mode as GameModeType, playerElo);
    };

    const copyToClipboard = () => {
        Clipboard.setString(roomCode);
    };

    return (
        <SimplePopupView
            scrollRef={lobbyScrollRef}
            style={[
                { justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground },
                isMobile && { width: '92%', height: '90%', paddingHorizontal: 10 }
            ]}
        >
            {lobbyState === 'idle' && !showEloScreen && !showEloLeaderboard && (
                <Animated.View entering={FadeIn} style={styles.contentContainer}>
                    
                    <Text style={[styles.header, { color: currentTheme.textPrimary, marginVertical: 8 }]}>Versus Mode</Text>

                    <View style={styles.inputRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: currentTheme.textSecondary, fontSize: 13 }]}>Nickname:</Text>
                            <TextInput
                                ref={nicknameInputRef}
                                style={[styles.nicknameInput, {
                                    color: currentTheme.textPrimary,
                                    borderColor: matchError === NAME_REQUIRED_MESSAGE ? cssColors.brightNiceRed : currentTheme.textSecondary,
                                    borderWidth: matchError === NAME_REQUIRED_MESSAGE ? 2 : 1,
                                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                    fontSize: 16,
                                    padding: 6
                                }]}
                                value={playerName}
                                onChangeText={handlePlayerNameChange}
                                maxLength={20}
                                placeholder="Your Nickname"
                                placeholderTextColor={currentTheme.textSecondary}
                            />
                        </View>
                        <View style={styles.eloBadgeContainer}>
                            <Text style={[styles.eloLabel, { color: currentTheme.textSecondary }]}>ELO Rating:</Text>
                            <View style={[styles.eloBadge, { backgroundColor: getEloBadge(playerElo).color }]}>
                                <Text style={styles.eloBadgeText}>{getEloBadge(playerElo).tier}</Text>
                            </View>
                            <Text style={[styles.eloText, { color: currentTheme.textPrimary }]}>{playerElo} ELO</Text>
                        </View>
                    </View>

                    {matchError !== "" && (
                        <Text style={[styles.errorText, { color: cssColors.brightNiceRed, marginTop: 4 }]}>{matchError}</Text>
                    )}
                    {successMessage !== "" && (
                        <Text style={[styles.errorText, { color: currentTheme.accent, marginTop: 4 }]}>{successMessage}</Text>
                    )}

                    <Pressable
                        onPress={() => {
                            setShowEloLeaderboard(true);
                            loadEloLeaderboard();
                        }}
                        style={({ pressed }) => [
                            styles.eloLeaderboardBtn,
                            { opacity: pressed ? 0.7 : 1 }
                        ]}
                    >
                        <Text style={styles.eloLeaderboardIcon}>TOP</Text>
                        <Text style={[styles.eloLeaderboardBtnText, { color: currentTheme.accent }]}>
                            ELO Leaderboard
                        </Text>
                        <Text style={styles.eloCardArrow}>▸</Text>
                    </Pressable>

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary, alignSelf: 'center', marginLeft: 0, marginTop: 4 }]}>Select Mode:</Text>
                    <View style={styles.row}>
                        <StylizedButton 
                            text="Classic" 
                            onClick={() => setSelectedMode(GameModeType.Classic)} 
                            backgroundColor={selectedMode === GameModeType.Classic ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
                            borderColor={selectedMode === GameModeType.Classic ? currentTheme.accent : undefined}
                            style={{ flex: 1, minWidth: 100, height: 36 }}
                            textStyle={{ fontSize: 13 }}
                        />
                        <StylizedButton 
                            text="Chaos" 
                            onClick={() => setSelectedMode(GameModeType.Chaos)} 
                            backgroundColor={selectedMode === GameModeType.Chaos ? currentTheme.buttonPrimary : currentTheme.buttonSecondary}
                            borderColor={selectedMode === GameModeType.Chaos ? currentTheme.accent : undefined}
                            style={{ flex: 1, minWidth: 100, height: 36 }}
                            textStyle={{ fontSize: 13 }}
                        />
                    </View>

                    <View style={styles.row}>
                        <StylizedButton 
                            text="Quick Match" 
                            onClick={() => handleQuickMatch(selectedMode)} 
                            backgroundColor={selectedMode === GameModeType.Chaos ? cssColors.pitchBlack : currentTheme.buttonPrimary} 
                            borderColor={selectedMode === GameModeType.Chaos ? "white" : undefined}
                            style={{ flex: 1, minWidth: 100, height: 36 }}
                            textStyle={{ fontSize: isMobile ? 11 : 13 }}
                        />
                        <StylizedButton 
                            text="Create Room" 
                            onClick={() => handleCreateRoom(selectedMode)} 
                            backgroundColor={cssColors.pink} 
                            style={{ flex: 1, minWidth: 100, height: 36 }}
                            textStyle={{ fontSize: isMobile ? 11 : 13 }}
                        />
                    </View>

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary, marginTop: 10, alignSelf: 'center' }]}>Join with Code:</Text>
                    <View style={[styles.joinContainer, { borderColor: currentTheme.textSecondary, borderTopWidth: 0, paddingTop: 0, marginTop: 4, paddingBottom: 8 }]}>
                        <TextInput
                            style={[styles.codeInput, {
                                color: currentTheme.textPrimary,
                                borderColor: currentTheme.textSecondary,
                                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                height: 32,
                                fontSize: 14
                            }]}
                            value={joinCode}
                            onChangeText={setJoinCode}
                            placeholder="ROOM CODE"
                            placeholderTextColor={currentTheme.textSecondary}
                            autoCapitalize="characters"
                            maxLength={6}
                        />
                        <StylizedButton text="Join" onClick={handleJoinRoom} backgroundColor={currentTheme.buttonPrimary} style={{ minWidth: 100, height: 32 }} textStyle={{ fontSize: 13 }} />
                    </View>

                    <View style={styles.publicRoomsHeaderRow}>
                        <Text style={[
                            styles.subHeader,
                            styles.publicRoomsHeaderText,
                            { color: currentTheme.textSecondary }
                        ]}>
                            Public Rooms:
                        </Text>
                        <StylizedButton
                            text={refreshingPublicRooms ? "..." : "Refresh"}
                            onClick={handleRefreshPublicRooms}
                            backgroundColor={currentTheme.buttonSecondary}
                            disabled={refreshingPublicRooms}
                            style={styles.refreshRoomsButton}
                            textStyle={styles.refreshRoomsButtonText}
                        />
                    </View>
                    <ScrollView style={[styles.publicRoomsList, { borderColor: currentTheme.textSecondary }]} nestedScrollEnabled={true}>
                        {publicRooms.length === 0 ? (
                            <Text style={[styles.noRoomsText, { color: currentTheme.textSecondary }]}>No public rooms active.</Text>
                        ) : (
                            publicRooms.map((room) => {
                                const isMyRoom = room.player1_id === playerId;
                                return (
                                    <View key={room.id} style={[styles.roomRow, { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.roomNameText, { color: currentTheme.textPrimary }]}>
                                                {room.player1_name}'s Room
                                            </Text>
                                            <Text style={[styles.roomSubText, { color: currentTheme.textSecondary }]}>
                                                Mode: {room.game_mode.toUpperCase()} | Status: {room.status}
                                            </Text>
                                        </View>
                                        <View>
                                            {room.status === 'waiting' ? (
                                                <StylizedButton 
                                                    text={isMyRoom ? "Host" : "Join"} 
                                                    onClick={() => !isMyRoom && handleJoinSpecificRoom(room)} 
                                                    backgroundColor={isMyRoom ? cssColors.spaceGray : currentTheme.buttonPrimary} 
                                                    disabled={isMyRoom}
                                                    style={{ minWidth: 80, height: 32 }}
                                                    textStyle={{ fontSize: 11 }}
                                                />
                                            ) : (
                                                <StylizedButton 
                                                    text="Spectate" 
                                                    onClick={() => handleSpectateRoom(room)} 
                                                    backgroundColor={cssColors.pink} 
                                                    style={{ minWidth: 80, height: 32 }}
                                                    textStyle={{ fontSize: 11 }}
                                                />
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>

                    {/* ELO Rating Card Button — above Back */}
                    <View style={{ width: '90%', marginTop: 12, marginBottom: 6 }}>
                        <Pressable 
                            onPress={() => setShowEloScreen(true)}
                            style={({ pressed }) => [
                                styles.eloCardButton,
                                { 
                                    borderColor: getEloBadge(playerElo).color,
                                    opacity: pressed ? 0.7 : 1,
                                }
                            ]}
                        >
                            {(() => {
                                const details = getEloDetails(playerElo);
                                return (
                                    <>
                                        <View style={styles.eloCardRow}>
                                            <Text style={{ fontSize: 20 }}>{details.currentTier.icon}</Text>
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <Text style={[styles.eloCardTier, { color: details.currentTier.color }]}>
                                                    {details.currentTier.tier}
                                                </Text>
                                                <Text style={styles.eloCardValue}>{playerElo} ELO</Text>
                                            </View>
                                            <Text style={styles.eloCardArrow}>▸</Text>
                                        </View>
                                        <View style={styles.eloProgressBarBg}>
                                            <View style={[styles.eloProgressBarFill, { 
                                                width: `${Math.round(details.progress * 100)}%`,
                                                backgroundColor: details.currentTier.color 
                                            }]} />
                                        </View>
                                        {details.nextTier && (
                                            <Text style={styles.eloCardNext}>
                                                {details.nextTier.min - playerElo} to {details.nextTier.tier} {details.nextTier.icon}
                                            </Text>
                                        )}
                                    </>
                                );
                            })()}
                        </Pressable>
                    </View>

                    <StylizedButton text="Back" onClick={popAppState} backgroundColor={cssColors.spaceGray} />
                </Animated.View>
            )}

            {lobbyState === 'idle' && showEloScreen && (
                <Animated.View entering={FadeIn} style={styles.contentContainer}>
                    <View style={styles.eloScreenHeader}>
                        <Text style={[styles.header, { color: currentTheme.textPrimary, marginBottom: 5 }]}>My Rating</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 40 }}>{getEloDetails(playerElo).currentTier.icon}</Text>
                            <View>
                                <Text style={[styles.eloDetailTier, { color: getEloBadge(playerElo).color }]}>
                                    {getEloBadge(playerElo).tier}
                                </Text>
                                <Text style={[styles.eloDetailValue, { color: currentTheme.textPrimary }]}>
                                    {playerElo} ELO
                                </Text>
                            </View>
                        </View>
                        <View style={styles.eloProgressBarBgWide}>
                            <View style={[styles.eloProgressBarFillWide, { 
                                width: `${Math.round(getEloDetails(playerElo).progress * 100)}%`,
                                backgroundColor: getEloBadge(playerElo).color 
                            }]} />
                        </View>
                        {getEloDetails(playerElo).nextTier && (
                            <Text style={[styles.eloDetailNext, { color: currentTheme.textSecondary }]}>
                                {getEloDetails(playerElo).nextTier!.min - playerElo} points to {getEloDetails(playerElo).nextTier!.tier}
                            </Text>
                        )}
                    </View>

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary, marginTop: 16, marginBottom: 8, alignSelf: 'center', marginLeft: 0 }]}>
                        Rating Tiers
                    </Text>
                    <ScrollView style={styles.eloTierList} nestedScrollEnabled={true}>
                        {ELO_TIERS.map((tierInfo) => {
                            const isCurrent = getEloBadge(playerElo).tier === tierInfo.tier;
                            return (
                                <View key={tierInfo.tier} style={[
                                    styles.eloTierRow,
                                    isCurrent && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: tierInfo.color }
                                ]}>
                                    <Text style={{ fontSize: 24 }}>{tierInfo.icon}</Text>
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={[styles.eloTierName, { color: isCurrent ? tierInfo.color : currentTheme.textPrimary }]}>
                                            {tierInfo.tier}{isCurrent ? ' (You are here)' : ''}
                                        </Text>
                                        <Text style={[styles.eloTierRange, { color: currentTheme.textSecondary }]}>
                                            {tierInfo.min} – {tierInfo.max === 2000 ? '2000+' : tierInfo.max} ELO
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.eloInfoBox}>
                        <Text style={[styles.eloInfoTitle, { color: currentTheme.accent }]}>How ELO Works</Text>
                        <Text style={[styles.eloInfoText, { color: currentTheme.textSecondary }]}>
                            Win a match to gain ELO. Lose and you lose ELO. Your skill tier is determined by your rating. Climb the ranks from Bronze to Legend!
                        </Text>
                    </View>

                    <StylizedButton text="Back" onClick={() => setShowEloScreen(false)} backgroundColor={cssColors.spaceGray} />
                </Animated.View>
            )}

            {lobbyState === 'idle' && showEloLeaderboard && (
                <Animated.View entering={FadeIn} style={styles.contentContainer}>
                    <Text style={[styles.header, { color: currentTheme.textPrimary, marginBottom: 8 }]}>ELO Leaderboard</Text>
                    <View style={styles.eloLeaderboardTopRow}>
                        <Text style={[styles.eloLeaderboardSub, { color: currentTheme.textSecondary }]}>
                            Top 100 Players
                        </Text>
                        <StylizedButton
                            text={loadingLeaderboard ? "..." : "Refresh"}
                            onClick={loadEloLeaderboard}
                            backgroundColor={currentTheme.buttonSecondary}
                            disabled={loadingLeaderboard}
                            style={styles.refreshEloButton}
                            textStyle={styles.refreshEloButtonText}
                        />
                    </View>

                    <View style={styles.eloLeaderboardHeader}>
                        <Text style={[styles.eloLBHText, { color: currentTheme.textSecondary, flex: 0.4 }]}>#</Text>
                        <Text style={[styles.eloLBHText, { color: currentTheme.textSecondary, flex: 2 }]}>Player</Text>
                        <Text style={[styles.eloLBHText, { color: currentTheme.textSecondary, flex: 0.8, textAlign: 'right' }]}>Tier</Text>
                        <Text style={[styles.eloLBHText, { color: currentTheme.textSecondary, flex: 0.8, textAlign: 'right' }]}>ELO</Text>
                    </View>

                    {loadingLeaderboard ? (
                        <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 40 }} />
                    ) : (
                        <ScrollView style={styles.eloLeaderboardList} nestedScrollEnabled={true}>
                            {topEloList.length === 0 ? (
                                <Text style={[styles.noRoomsText, { color: currentTheme.textSecondary }]}>
                                    No ratings yet. Play multiplayer matches!
                                </Text>
                            ) : (
                                topEloList.map((entry, index) => {
                                    const isMe = entry.player_name === playerName;
                                    const badge = getEloBadge(entry.elo);
                                    return (
                                        <View key={entry.id || index} style={[
                                            styles.eloLBRow,
                                            isMe && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: badge.color }
                                        ]}>
                                            <Text style={[styles.eloLBRank, { color: currentTheme.textPrimary, flex: 0.4 }]}>
                                                {index + 1}
                                            </Text>
                                            <Text style={[styles.eloLBName, { 
                                                color: currentTheme.textPrimary, 
                                                flex: 2,
                                                fontWeight: isMe ? 'bold' : 'normal'
                                            }]} numberOfLines={1}>
                                                {entry.player_name}{isMe ? ' (You)' : ''}
                                            </Text>
                                            <View style={[styles.eloLBBadge, { backgroundColor: badge.color, flex: 0.8, alignSelf: 'center' }]}>
                                                <Text style={styles.eloLBBadgeText}>{badge.tier}</Text>
                                            </View>
                                            <Text style={[styles.eloLBValue, { color: currentTheme.textPrimary, flex: 0.8, textAlign: 'right' }]}>
                                                {entry.elo}
                                            </Text>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}

                    <StylizedButton text="Back" onClick={() => setShowEloLeaderboard(false)} backgroundColor={cssColors.spaceGray} />
                </Animated.View>
            )}

            {lobbyState === 'searching' && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.waitingContainer}>
                    <Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>Searching Match</Text>
                    <Text style={[styles.waitingSub, { color: currentTheme.textSecondary }]}>Mode: {gameMode.toUpperCase()}</Text>
                    <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 30 }} />
                    <StylizedButton text="Cancel" onClick={cleanupLobby} backgroundColor={cssColors.spaceGray} />
                </Animated.View>
            )}

            {lobbyState === 'hosting' && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.waitingContainer}>
                    <Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>Room Created</Text>
                    <Text style={[styles.waitingSub, { color: currentTheme.textSecondary }]}>Share code with a friend:</Text>
                    
                    <View style={[styles.codeDisplayContainer, isMobile && { width: '95%' }]}>
                        <Text style={[styles.codeText, { color: currentTheme.accent }, isMobile && { fontSize: 24 }]} adjustsFontSizeToFit numberOfLines={1}>{roomCode}</Text>
                        <StylizedButton text="Copy" onClick={copyToClipboard} backgroundColor={currentTheme.buttonPrimary} style={{ width: 100 }} />
                    </View>

                    <Text style={[styles.waitingStatus, { color: currentTheme.textSecondary }]}>Waiting for friend to join...</Text>
                    <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 20 }} />
                    
                    <StylizedButton text="Cancel" onClick={cleanupLobby} backgroundColor={cssColors.spaceGray} />
                </Animated.View>
            )}

            {lobbyState === 'joining' && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.waitingContainer}>
                    <Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>Connecting...</Text>
                    <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 30 }} />
                </Animated.View>
            )}
        </SimplePopupView>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        width: '100%',
        alignItems: 'center',
    },
    header: {
        fontSize: 30,
        fontFamily: 'Silkscreen',
        marginVertical: 15
    },
    subHeader: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        alignSelf: 'flex-start',
        marginLeft: '10%',
        marginTop: 10,
        marginBottom: 5
    },
    label: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
        marginBottom: 5
    },
    inputContainer: {
        width: '90%',
        alignItems: 'center',
        marginVertical: 15,
        gap: 5
    },
    inputRow: {
        flexDirection: 'row',
        width: '90%',
        alignItems: 'center',
        marginVertical: 8,
        gap: 15
    },
    eloBadgeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    eloLabel: {
        fontSize: 10,
        fontFamily: 'Silkscreen',
        marginBottom: 2
    },
    eloBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 2
    },
    eloBadgeText: {
        color: '#000',
        fontSize: 10,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold'
    },
    eloText: {
        fontSize: 11,
        fontFamily: 'Silkscreen',
    },
    publicRoomsList: {
        width: '95%',
        maxHeight: 120,
        borderWidth: 2,
        borderRadius: 5,
        padding: 5,
        marginTop: 5,
    },
    publicRoomsHeaderRow: {
        width: '95%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 8,
        marginBottom: 2,
    },
    publicRoomsHeaderText: {
        alignSelf: 'center',
        marginLeft: 0,
        marginTop: 0,
        marginBottom: 0,
        flex: 1,
    },
    refreshRoomsButton: {
        minWidth: 84,
        minHeight: 32,
        height: 32,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 0,
    },
    refreshRoomsButtonText: {
        fontSize: 10,
    },
    noRoomsText: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
        textAlign: 'center',
        marginVertical: 15
    },
    roomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 6,
        borderRadius: 4,
        marginVertical: 3,
        gap: 8
    },
    roomNameText: {
        fontFamily: 'Silkscreen',
        fontSize: 11,
    },
    roomSubText: {
        fontFamily: 'Silkscreen',
        fontSize: 9,
        marginTop: 1
    },
    nicknameInput: {
        width: '100%',
        fontSize: 20,
        fontFamily: 'Silkscreen',
        padding: 10,
        borderWidth: 2,
        borderRadius: 5,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        width: '90%',
        marginVertical: 5
    },
    joinContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '90%',
        marginTop: 15,
        gap: 10,
        borderTopWidth: 1,
        paddingTop: 15
    },
    codeInput: {
        width: 140,
        height: 38,
        fontSize: 16,
        fontFamily: 'Silkscreen',
        borderWidth: 2,
        borderRadius: 5,
        textAlign: 'center',
    },
    errorText: {
        fontFamily: 'Silkscreen',
        fontSize: 14,
        marginBottom: 10,
    },
    waitingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '80%',
        paddingHorizontal: 20
    },
    waitingTitle: {
        fontSize: 26,
        fontFamily: 'Silkscreen',
        marginBottom: 10
    },
    waitingSub: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
        marginBottom: 20
    },
    waitingStatus: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        marginTop: 10
    },
    codeDisplayContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 15,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#555',
        marginVertical: 15
    },
    codeText: {
        fontSize: 32,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
        letterSpacing: 2
    },
    eloCardButton: {
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 8,
        borderWidth: 2,
        padding: 10,
    },
    eloCardRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    eloCardTier: {
        fontSize: 16,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    eloCardValue: {
        fontSize: 13,
        fontFamily: 'Silkscreen',
        color: '#aaa',
        marginTop: 2,
    },
    eloCardArrow: {
        fontSize: 20,
        color: '#888',
        marginLeft: 8,
    },
    eloProgressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 3,
        marginTop: 8,
        overflow: 'hidden',
    },
    eloProgressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    eloCardNext: {
        fontSize: 10,
        fontFamily: 'Silkscreen',
        color: '#888',
        marginTop: 6,
    },
    eloScreenHeader: {
        width: '90%',
        alignItems: 'center',
        marginVertical: 10,
    },
    eloDetailTier: {
        fontSize: 22,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    eloDetailValue: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
        marginTop: 2,
    },
    eloProgressBarBgWide: {
        width: '100%',
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 5,
        marginTop: 12,
        overflow: 'hidden',
    },
    eloProgressBarFillWide: {
        height: '100%',
        borderRadius: 5,
    },
    eloDetailNext: {
        fontSize: 12,
        fontFamily: 'Silkscreen',
        marginTop: 6,
    },
    eloTierList: {
        width: '90%',
        maxHeight: 220,
        marginBottom: 10,
    },
    eloTierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'transparent',
        marginVertical: 3,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    eloTierName: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    eloTierRange: {
        fontSize: 11,
        fontFamily: 'Silkscreen',
        marginTop: 2,
    },
    eloInfoBox: {
        width: '90%',
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#444',
    },
    eloInfoTitle: {
        fontSize: 14,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
        marginBottom: 6,
    },
    eloInfoText: {
        fontSize: 12,
        fontFamily: 'Silkscreen',
        lineHeight: 18,
    },
    eloLeaderboardBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '90%',
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#555',
        padding: 10,
        marginTop: 6,
        marginBottom: 4,
    },
    eloLeaderboardBtnText: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
        marginLeft: 10,
    },
    eloLeaderboardIcon: {
        minWidth: 34,
        fontSize: 11,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
        color: '#FFD700',
        textAlign: 'center',
    },
    eloLeaderboardSub: {
        fontSize: 13,
        fontFamily: 'Silkscreen',
        flex: 1,
        marginBottom: 0,
    },
    eloLeaderboardTopRow: {
        width: '92%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 10,
    },
    refreshEloButton: {
        minWidth: 92,
        minHeight: 32,
        height: 32,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 0,
    },
    refreshEloButtonText: {
        fontSize: 10,
    },
    eloLeaderboardHeader: {
        flexDirection: 'row',
        width: '92%',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#555',
    },
    eloLBHText: {
        fontSize: 11,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    eloLeaderboardList: {
        width: '95%',
        maxHeight: 300,
        marginBottom: 10,
    },
    eloLBRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        borderRadius: 4,
    },
    eloLBRank: {
        fontSize: 13,
        fontFamily: 'Silkscreen',
    },
    eloLBName: {
        fontSize: 12,
        fontFamily: 'Silkscreen',
    },
    eloLBBadge: {
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 3,
        alignItems: 'center',
    },
    eloLBBadgeText: {
        color: '#000',
        fontSize: 9,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    },
    eloLBValue: {
        fontSize: 13,
        fontFamily: 'Silkscreen',
        fontWeight: 'bold',
    }
});
