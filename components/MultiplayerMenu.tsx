import React, { useCallback, useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, TextInput, ActivityIndicator, Clipboard, useWindowDimensions, ScrollView, Pressable } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { supabase, getTopEloRatings, getPlayerElo, EloRating } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Crypto from "expo-crypto";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface MultiplayerMenuProps {
    onStartGame: (roomId: string, role: 'player1' | 'player2' | 'spectator', opponentName: string, gameMode: GameModeType) => void;
}

export function getEloBadge(elo: number): { tier: string; color: string } {
    if (elo < 800) return { tier: "Bronze", color: "#CD7F32" };
    if (elo < 1000) return { tier: "Silver", color: "#C0C0C0" };
    if (elo < 1200) return { tier: "Gold", color: "#FFD700" };
    if (elo < 1400) return { tier: "Diamond", color: "#00BFFF" };
    if (elo < 1600) return { tier: "Master", color: "#DA70D6" };
    return { tier: "Legend", color: "#FF4500" };
}

const ELO_TIERS = [
    { tier: "Bronze", color: "#CD7F32", icon: "🥉", min: 0, max: 800 },
    { tier: "Silver", color: "#C0C0C0", icon: "🥈", min: 800, max: 1000 },
    { tier: "Gold", color: "#FFD700", icon: "🥇", min: 1000, max: 1200 },
    { tier: "Diamond", color: "#00BFFF", icon: "💎", min: 1200, max: 1400 },
    { tier: "Master", color: "#DA70D6", icon: "👑", min: 1400, max: 1600 },
    { tier: "Legend", color: "#FF4500", icon: "🔥", min: 1600, max: 2000 },
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
    
    const [playerName, setPlayerName] = useState("Anonymous");
    const [playerId, setPlayerId] = useState("");
    const [playerElo, setPlayerElo] = useState<number>(1000);
    const [publicRooms, setPublicRooms] = useState<any[]>([]);
    const [selectedMode, setSelectedMode] = useState<GameModeType>(GameModeType.Classic);
    const [lobbyState, setLobbyState] = useState<'idle' | 'searching' | 'hosting' | 'joining'>('idle');
    const [gameMode, setGameMode] = useState<GameModeType>(GameModeType.Classic);
    const [roomCode, setRoomCode] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [matchError, setMatchError] = useState("");
    const [showEloScreen, setShowEloScreen] = useState(false);
    const [showEloLeaderboard, setShowEloLeaderboard] = useState(false);
    const [topEloList, setTopEloList] = useState<EloRating[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
    
    const currentRoomId = useRef<string | null>(null);
    const subscriptionRef = useRef<any>(null);
    const isMounted = useRef(true);
    const playerNameRef = useRef(playerName);

    playerNameRef.current = playerName;

    const syncPlayerElo = useCallback(async (name: string = playerNameRef.current, localFallback?: string | null) => {
        const currentName = name.trim() || 'Anonymous';
        const serverElo = await getPlayerElo(currentName);

        if (!isMounted.current || (playerNameRef.current.trim() || 'Anonymous') !== currentName) {
            return;
        }

        if (serverElo !== null) {
            setPlayerElo(serverElo);
            AsyncStorage.setItem('PLAYER_ELO', serverElo.toString());
            return;
        }

        if (localFallback) {
            const parsed = parseInt(localFallback, 10) || 1000;
            setPlayerElo(parsed);
        } else {
            AsyncStorage.setItem('PLAYER_ELO', '1000');
            setPlayerElo(1000);
        }
    }, []);

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
            const currentName = (nameVal || 'Anonymous').trim() || 'Anonymous';
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
            cleanupLobby();
        };
    }, [syncPlayerElo]);

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

    const fetchPublicRooms = async () => {
        try {
            // Cleanup stale public rooms
            const waitingCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const playingCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

            try {
                await supabase
                    .from('matchmaking_rooms')
                    .delete()
                    .eq('status', 'waiting')
                    .eq('is_private', false)
                    .lt('created_at', waitingCutoff);

                await supabase
                    .from('matchmaking_rooms')
                    .delete()
                    .eq('status', 'playing')
                    .eq('is_private', false)
                    .lt('created_at', playingCutoff);
            } catch (cleanupErr) {
                console.error("Error cleaning up stale rooms:", cleanupErr);
            }

            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .eq('is_private', false)
                .in('status', ['waiting', 'playing'])
                .order('created_at', { ascending: false });
            if (error) throw error;
            if (data && isMounted.current) {
                setPublicRooms(data);
            }
        } catch (e) {
            console.error("Error fetching public rooms:", e);
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
        try {
            const cutoff = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
            await supabase
                .from('matchmaking_rooms')
                .delete()
                .eq('status', 'waiting')
                .eq('is_private', false)
                .lt('created_at', cutoff);
        } catch (e) {
            console.error("Error cleaning up old quick match rooms:", e);
        }

        try {
            const privateCutoff = new Date(Date.now() - 1800000).toISOString(); // 30 minutes ago
            await supabase
                .from('matchmaking_rooms')
                .delete()
                .eq('status', 'waiting')
                .eq('is_private', true)
                .lt('created_at', privateCutoff);
        } catch (e) {
            console.error("Error cleaning up old private rooms:", e);
        }
    };

    const handlePlayerNameChange = (name: string) => {
        setPlayerName(name);
        AsyncStorage.setItem('PLAYER_NAME', name.trim() || 'Anonymous');
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
                        onStartGame(roomId, myRole, opponentName || 'Opponent', room.game_mode as GameModeType);
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
                                onStartGame(roomId, myRole, opponentName || 'Opponent', data.game_mode as GameModeType);
                            }
                        });
                }
            });

        subscriptionRef.current = channel;
    };

    const handleQuickMatch = async (mode: GameModeType) => {
        setLobbyState('searching');
        setGameMode(mode);
        setMatchError("");

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
                    .update({
                        player2_name: playerName.trim() || 'Anonymous',
                        player2_id: activePlayerId,
                        status: 'playing'
                    })
                    .eq('id', room.id)
                    .is('player2_name', null) // Avoid race condition
                    .select();

                if (updateError) throw updateError;

                if (updatedData && updatedData.length > 0) {
                    // Join successful!
                    const finalRoom = updatedData[0];
                    onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, mode);
                } else {
                    // Somebody else joined first. Try again.
                    handleQuickMatch(mode);
                }
            } else {
                // Create a new waiting room
                const { data: newRoom, error: insertError } = await supabase
                    .from('matchmaking_rooms')
                    .insert({
                        player1_name: playerName.trim() || 'Anonymous',
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
        setLobbyState('hosting');
        setGameMode(mode);
        setMatchError("");

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
                    player1_name: playerName.trim() || 'Anonymous',
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
        const code = joinCode.trim().toLowerCase();
        if (code.length < 6) {
            setMatchError("Room code must be 6 characters");
            return;
        }

        setMatchError("");
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
                    .update({
                        player2_name: playerName.trim() || 'Anonymous',
                        player2_id: activePlayerId,
                        status: 'playing'
                    })
                    .eq('id', room.id)
                    .is('player2_name', null)
                    .select();

                if (updateError) throw updateError;

                if (updatedRoom && updatedRoom.length > 0) {
                    const finalRoom = updatedRoom[0];
                    onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, finalRoom.game_mode as GameModeType);
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
        setMatchError("");
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
                .update({
                    player2_name: playerName.trim() || 'Anonymous',
                    player2_id: activePlayerId,
                    status: 'playing'
                })
                .eq('id', room.id)
                .is('player2_name', null)
                .select();

            if (updateError) throw updateError;

            if (updatedRoom && updatedRoom.length > 0) {
                const finalRoom = updatedRoom[0];
                onStartGame(finalRoom.id, 'player2', finalRoom.player1_name, finalRoom.game_mode as GameModeType);
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
        onStartGame(room.id, 'spectator', `${room.player1_name} vs ${room.player2_name || 'Opponent'}`, room.game_mode as GameModeType);
    };

    const copyToClipboard = () => {
        Clipboard.setString(roomCode);
    };

    return (
        <SimplePopupView style={[
            { justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground },
            isMobile && { width: '92%', height: '90%', paddingHorizontal: 10 }
        ]}>
            {lobbyState === 'idle' && !showEloScreen && !showEloLeaderboard && (
                <Animated.View entering={FadeIn} style={styles.contentContainer}>
                    
                    <Text style={[styles.header, { color: currentTheme.textPrimary, marginVertical: 8 }]}>Versus Mode</Text>

                    <View style={styles.inputRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: currentTheme.textSecondary, fontSize: 13 }]}>Nickname:</Text>
                            <TextInput
                                style={[styles.nicknameInput, {
                                    color: currentTheme.textPrimary,
                                    borderColor: currentTheme.textSecondary,
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
                        <Text style={[styles.errorText, { color: cssColors.brightNiceRed }]}>{matchError}</Text>
                    )}

                    <Pressable
                        onPress={() => {
                            setLoadingLeaderboard(true);
                            setShowEloLeaderboard(true);
                            getPlayerElo(playerName).then((serverElo) => {
                                if (serverElo !== null && isMounted.current) {
                                    setPlayerElo(serverElo);
                                    AsyncStorage.setItem('PLAYER_ELO', serverElo.toString());
                                }
                            });
                            getTopEloRatings(100).then((list) => {
                                setTopEloList(list);
                                setLoadingLeaderboard(false);
                            });
                        }}
                        style={({ pressed }) => [
                            styles.eloLeaderboardBtn,
                            { opacity: pressed ? 0.7 : 1 }
                        ]}
                    >
                        <Text style={{ fontSize: 18 }}>🏆</Text>
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
                            textStyle={{ fontSize: 13 }}
                        />
                        <StylizedButton 
                            text="Create Room" 
                            onClick={() => handleCreateRoom(selectedMode)} 
                            backgroundColor={cssColors.pink} 
                            style={{ flex: 1, minWidth: 100, height: 36 }}
                            textStyle={{ fontSize: 13 }}
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

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary, marginTop: 8 }]}>Public Rooms:</Text>
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
                    <Text style={[styles.eloLeaderboardSub, { color: currentTheme.textSecondary }]}>
                        Top 100 Players
                    </Text>

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
                    
                    <View style={styles.codeDisplayContainer}>
                        <Text style={[styles.codeText, { color: currentTheme.accent }]}>{roomCode}</Text>
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
    eloLeaderboardSub: {
        fontSize: 13,
        fontFamily: 'Silkscreen',
        marginBottom: 10,
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
