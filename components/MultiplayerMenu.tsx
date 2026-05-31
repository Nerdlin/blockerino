import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, TextInput, ActivityIndicator, Clipboard } from "react-native";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { GameModeType, MenuStateType, useAppState } from "@/hooks/useAppState";
import { useTheme } from "@/constants/Theme";
import { supabase } from "@/constants/Supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cssColors } from "@/constants/Color";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface MultiplayerMenuProps {
    onStartGame: (roomId: string, role: 'player1' | 'player2', opponentName: string, gameMode: GameModeType) => void;
}

export default function MultiplayerMenu({ onStartGame }: MultiplayerMenuProps) {
    const { currentTheme } = useTheme();
    const [, setAppState, , popAppState] = useAppState();
    
    const [playerName, setPlayerName] = useState("Anonymous");
    const [lobbyState, setLobbyState] = useState<'idle' | 'searching' | 'hosting' | 'joining'>('idle');
    const [gameMode, setGameMode] = useState<GameModeType>(GameModeType.Classic);
    const [roomCode, setRoomCode] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [matchError, setMatchError] = useState("");
    
    const currentRoomId = useRef<string | null>(null);
    const subscriptionRef = useRef<any>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        // Load player name from storage
        AsyncStorage.getItem('PLAYER_NAME').then((val) => {
            if (val && isMounted.current) {
                setPlayerName(val);
            }
        });

        return () => {
            isMounted.current = false;
            cleanupLobby();
        };
    }, []);

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
        
        try {
            // Find a room waiting for an opponent
            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .eq('status', 'waiting')
                .eq('game_mode', mode)
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
                        game_mode: mode,
                        status: 'waiting'
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

        try {
            const { data: newRoom, error } = await supabase
                .from('matchmaking_rooms')
                .insert({
                    player1_name: playerName.trim() || 'Anonymous',
                    game_mode: mode,
                    status: 'waiting'
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

        try {
            // Find room by ID prefix
            const { data, error } = await supabase
                .from('matchmaking_rooms')
                .select('*')
                .ilike('id', `${code}%`)
                .eq('status', 'waiting')
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                const room = data[0];
                
                // Join room
                const { data: updatedRoom, error: updateError } = await supabase
                    .from('matchmaking_rooms')
                    .update({
                        player2_name: playerName.trim() || 'Anonymous',
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

    const copyToClipboard = () => {
        Clipboard.setString(roomCode);
    };

    return (
        <SimplePopupView style={[{ justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground }]}>
            {lobbyState === 'idle' && (
                <Animated.View entering={FadeIn} style={styles.contentContainer}>
                    <StylizedButton text="Back" onClick={popAppState} backgroundColor={cssColors.spaceGray} />
                    
                    <Text style={[styles.header, { color: currentTheme.textPrimary }]}>Versus Mode</Text>

                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: currentTheme.textSecondary }]}>Enter Nickname:</Text>
                        <TextInput
                            style={[styles.nicknameInput, {
                                color: currentTheme.textPrimary,
                                borderColor: currentTheme.textSecondary,
                                backgroundColor: 'rgba(0, 0, 0, 0.4)'
                            }]}
                            value={playerName}
                            onChangeText={handlePlayerNameChange}
                            maxLength={20}
                            placeholder="Your Nickname"
                            placeholderTextColor={currentTheme.textSecondary}
                        />
                    </View>

                    {matchError !== "" && (
                        <Text style={[styles.errorText, { color: cssColors.brightNiceRed }]}>{matchError}</Text>
                    )}

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>Quick Match:</Text>
                    <View style={styles.row}>
                        <StylizedButton text="Classic 1v1" onClick={() => handleQuickMatch(GameModeType.Classic)} backgroundColor={currentTheme.buttonPrimary} />
                        <StylizedButton text="Chaos 1v1" onClick={() => handleQuickMatch(GameModeType.Chaos)} backgroundColor={cssColors.pitchBlack} borderColor="white" />
                    </View>

                    <Text style={[styles.subHeader, { color: currentTheme.textSecondary, marginTop: 20 }]}>Play with Friend:</Text>
                    <View style={styles.row}>
                        <StylizedButton text="Create Room" onClick={() => handleCreateRoom(GameModeType.Classic)} backgroundColor={cssColors.pink} />
                    </View>

                    <View style={[styles.joinContainer, { borderColor: currentTheme.textSecondary }]}>
                        <TextInput
                            style={[styles.codeInput, {
                                color: currentTheme.textPrimary,
                                borderColor: currentTheme.textSecondary,
                                backgroundColor: 'rgba(0, 0, 0, 0.4)'
                            }]}
                            value={joinCode}
                            onChangeText={setJoinCode}
                            placeholder="ROOM CODE"
                            placeholderTextColor={currentTheme.textSecondary}
                            autoCapitalize="characters"
                            maxLength={6}
                        />
                        <StylizedButton text="Join" onClick={handleJoinRoom} backgroundColor={currentTheme.buttonPrimary} />
                    </View>
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
        width: '80%',
        alignItems: 'center',
        marginVertical: 15,
        gap: 5
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
        width: '80%',
        marginVertical: 5
    },
    joinContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '80%',
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
    }
});
