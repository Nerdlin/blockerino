import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useTheme } from '@/constants/Theme';
import StylizedButton from './StylizedButton';
import { colorToHex } from '@/constants/Color';
import { useSetAtom } from 'jotai';
import { multiplayerRoomIdAtom, multiplayerRoleAtom, multiplayerGameModeAtom, MenuStateType, useAppState, GameModeType } from '@/hooks/useAppState';

interface FriendRecord {
    id: string;
    user_id_1: string;
    user_id_2: string;
    status: 'pending' | 'accepted';
    created_at: string;
    // We will join profiles to get names
    profiles?: { player_name: string } | { player_name: string }[];
}

interface FriendProfile {
    id: string;
    auth_user_id: string | null;
    player_id: string | null;
    player_name: string;
}

export default function FriendsList({ userId }: { userId: string }) {
    const { currentTheme } = useTheme();
    const [friends, setFriends] = useState<FriendRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);

    const fetchFriends = async () => {
        setLoading(true);
        // Supabase foreign key join on profiles to get friend's name.
        // Since we don't know if userId is user_id_1 or user_id_2, we fetch all rows where user is involved.
        const { data, error } = await supabase
            .from('friends')
            .select(`
                id, user_id_1, user_id_2, status, created_at
            `)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (!error && data) {
            // We need to fetch the profile names manually if the join doesn't work out of the box with dynamic relations.
            // For simplicity and robustness, let's fetch all relevant profiles
            const otherUserIds = data.map(f => f.user_id_1 === userId ? f.user_id_2 : f.user_id_1);
            if (otherUserIds.length > 0) {
                const [{ data: authProfiles }, { data: playerProfiles }] = await Promise.all([
                    supabase
                    .from('profiles')
                    .select('id, auth_user_id, player_id, player_name')
                    .in('auth_user_id', otherUserIds),
                    supabase
                    .from('profiles')
                    .select('id, auth_user_id, player_id, player_name')
                    .in('player_id', otherUserIds),
                ]);
                
                const profileMap = new Map<string, string>();
                ([...(authProfiles || []), ...(playerProfiles || [])] as FriendProfile[]).forEach((profile) => {
                    if (profile.auth_user_id) profileMap.set(profile.auth_user_id, profile.player_name);
                    if (profile.player_id) profileMap.set(profile.player_id, profile.player_name);
                    profileMap.set(profile.id, profile.player_name);
                });
                
                const enriched = data.map(f => ({
                    ...f,
                    profiles: { player_name: profileMap.get(f.user_id_1 === userId ? f.user_id_2 : f.user_id_1) || 'Unknown' }
                }));
                setFriends(enriched as FriendRecord[]);
            } else {
                setFriends([]);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchFriends();
        
        // Subscription for real-time updates
        const channel = supabase.channel('friends_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, payload => {
                fetchFriends();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

    const handleSearchAndAdd = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        
        const cleanQuery = searchQuery.trim();
        
        // 1. Find user by name
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, auth_user_id, player_id, player_name')
            .ilike('player_name', cleanQuery)
            .limit(1);
            
        if (profileError || !profiles || profiles.length === 0) {
            Alert.alert("Player not found", `Could not find a player named ${cleanQuery}`);
            setSearchLoading(false);
            return;
        }
        
        const targetProfile = profiles[0] as FriendProfile;
        const targetId = targetProfile.auth_user_id || targetProfile.player_id;
        if (!targetId) {
            Alert.alert("Error", "This player does not have a login-backed profile yet.");
            setSearchLoading(false);
            return;
        }
        
        if (targetId === userId) {
            Alert.alert("Oops", "You can't add yourself as a friend!");
            setSearchLoading(false);
            return;
        }

        // 2. Check if already friends or pending
        const { data: existing } = await supabase
            .from('friends')
            .select('id, status')
            .or(`and(user_id_1.eq.${userId},user_id_2.eq.${targetId}),and(user_id_1.eq.${targetId},user_id_2.eq.${userId})`);
            
        if (existing && existing.length > 0) {
            Alert.alert("Info", `Friendship status is already: ${existing[0].status}`);
            setSearchLoading(false);
            return;
        }

        // 3. Send Request
        const { error: insertError } = await supabase
            .from('friends')
            .insert({
                user_id_1: userId,
                user_id_2: targetId,
                status: 'pending'
            });

        if (insertError) {
            console.error("Could not send friend request:", insertError);
            Alert.alert("Error", insertError.message || "Could not send friend request.");
        } else {
            Alert.alert("Success", "Friend request sent!");
            setSearchQuery('');
            fetchFriends();
        }
        setSearchLoading(false);
    };

    const handleAcceptRequest = async (friendId: string) => {
        await supabase.from('friends').update({ status: 'accepted' }).eq('id', friendId);
        fetchFriends();
    };

    const handleDeleteOrCancel = async (friendId: string) => {
        await supabase.from('friends').delete().eq('id', friendId);
        fetchFriends();
    };

    const setMultiplayerRoomId = useSetAtom(multiplayerRoomIdAtom);
    const setMultiplayerRole = useSetAtom(multiplayerRoleAtom);
    const setMultiplayerGameMode = useSetAtom(multiplayerGameModeAtom);
    const [appState, setAppState] = useAppState();

    const handleInvite1v1 = async (friendId: string, friendName: string) => {
        Alert.alert(
            "Game Mode",
            "Choose a game mode for 1v1",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Casual", 
                    onPress: () => sendInvite(friendId, friendName, GameModeType.Classic) 
                },
                { 
                    text: "Ranked", 
                    onPress: () => sendInvite(friendId, friendName, GameModeType.Classic) // Using Classic as Ranked for now
                }
            ]
        );
    };

    const sendInvite = async (friendId: string, friendName: string, gameMode: GameModeType) => {
        setSearchLoading(true); // Reusing search loader for simplicity

        // 1. Create a private room
        const { data: profile } = await supabase
            .from('profiles')
            .select('player_name')
            .or(`auth_user_id.eq.${userId},player_id.eq.${userId}`)
            .limit(1)
            .maybeSingle();
        const myName = profile?.player_name || 'Player 1';

        const { data: room, error } = await supabase.from('matchmaking_rooms').insert({
            player1_id: userId,
            player1_name: myName,
            status: 'waiting',
            is_private: true,
            game_mode: gameMode,
        }).select().single();

        if (error || !room) {
            Alert.alert("Error", "Could not create private room.");
            setSearchLoading(false);
            return;
        }

        // 2. Broadcast invite to the friend
        await supabase.channel(`invites:${friendId}`).send({
            type: 'broadcast',
            event: '1v1_invite',
            payload: {
                roomId: room.id,
                hostName: myName,
                gameMode: gameMode
            }
        });

        // 3. Join the room as player1
        setMultiplayerRoomId(room.id);
        setMultiplayerRole('player1');
        setMultiplayerGameMode(gameMode);
        setAppState(MenuStateType.MULTIPLAYER_GAME);

        setSearchLoading(false);
    };

    if (loading) {
        return <ActivityIndicator size="small" color={currentTheme.accent} />;
    }

    const acceptedFriends = friends.filter(f => f.status === 'accepted');
    const incomingRequests = friends.filter(f => f.status === 'pending' && f.user_id_2 === userId);
    const outgoingRequests = friends.filter(f => f.status === 'pending' && f.user_id_1 === userId);

    const getFriendName = (f: FriendRecord) => {
        return Array.isArray(f.profiles) ? f.profiles[0]?.player_name : f.profiles?.player_name || 'Unknown';
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Search Bar */}
            <View style={styles.searchRow}>
                <TextInput
                    style={[styles.input, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
                    placeholder="Search by nickname..."
                    placeholderTextColor={currentTheme.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearchAndAdd}
                />
                <StylizedButton 
                    text={searchLoading ? "..." : "Add"} 
                    onClick={handleSearchAndAdd} 
                    backgroundColor={currentTheme.buttonPrimary} 
                    style={styles.addButton}
                />
            </View>

            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: currentTheme.textSecondary }]}>Friend Requests</Text>
                    {incomingRequests.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <Text style={[styles.friendName, { color: currentTheme.textPrimary }]}>{getFriendName(f)}</Text>
                            <View style={styles.actionsRow}>
                                <StylizedButton text="V" onClick={() => handleAcceptRequest(f.id)} backgroundColor="rgb(50,200,50)" style={styles.actionBtn} textStyle={styles.actionBtnText}/>
                                <StylizedButton text="X" onClick={() => handleDeleteOrCancel(f.id)} backgroundColor="rgb(200,50,50)" style={styles.actionBtn} textStyle={styles.actionBtnText}/>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Outgoing Requests */}
            {outgoingRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: currentTheme.textSecondary }]}>Sent Requests</Text>
                    {outgoingRequests.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <Text style={[styles.friendName, { color: currentTheme.textSecondary }]}>{getFriendName(f)} (Pending)</Text>
                            <StylizedButton text="Cancel" onClick={() => handleDeleteOrCancel(f.id)} backgroundColor="rgb(150,150,150)" style={styles.cancelBtn} textStyle={styles.actionBtnText}/>
                        </View>
                    ))}
                </View>
            )}

            {/* Friends List */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>My Friends ({acceptedFriends.length})</Text>
                {acceptedFriends.length === 0 ? (
                    <Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>No friends yet.</Text>
                ) : (
                    acceptedFriends.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <Text style={[styles.friendName, { color: currentTheme.textPrimary }]}>{getFriendName(f)}</Text>
                            <View style={styles.actionsRow}>
                                <StylizedButton text="1v1" onClick={() => handleInvite1v1(f.user_id_1 === userId ? f.user_id_2 : f.user_id_1, getFriendName(f))} backgroundColor={currentTheme.accent} style={styles.inviteBtn} textStyle={styles.actionBtnText}/>
                                <StylizedButton text="Remove" onClick={() => handleDeleteOrCancel(f.id)} backgroundColor="rgb(200,50,50)" style={styles.cancelBtn} textStyle={styles.actionBtnText}/>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginTop: 10,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    input: {
        flex: 1,
        height: 40,
        borderWidth: 2,
        borderRadius: 4,
        paddingHorizontal: 10,
        fontFamily: 'Silkscreen',
    },
    addButton: {
        minWidth: 70,
        height: 40,
        margin: 0,
        padding: 0,
    },
    section: {
        marginBottom: 20,
        width: '100%',
    },
    sectionTitle: {
        fontFamily: 'SilkscreenBold',
        fontSize: 16,
        marginBottom: 10,
    },
    friendRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        borderRadius: 6,
        marginBottom: 6,
    },
    friendName: {
        fontFamily: 'Silkscreen',
        fontSize: 14,
        flex: 1,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 5,
    },
    actionBtn: {
        minWidth: 36,
        height: 36,
        margin: 0,
        padding: 0,
    },
    cancelBtn: {
        minWidth: 60,
        height: 30,
        margin: 0,
        padding: 0,
    },
    inviteBtn: {
        minWidth: 50,
        height: 30,
        margin: 0,
        padding: 0,
    },
    actionBtnText: {
        fontSize: 10,
    },
    emptyText: {
        fontFamily: 'Silkscreen',
        fontSize: 12,
        fontStyle: 'italic',
    }
});
