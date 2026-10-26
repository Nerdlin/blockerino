import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, Pressable } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import { supabase } from '@/constants/Supabase';
import { useTheme } from '@/constants/Theme';
import { useLanguage } from '@/constants/Localization';
import StylizedButton from './StylizedButton';
import { rankFriendSuggestions } from '@/constants/FriendSearch';
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";
import { useFriendInvite } from "@/hooks/useFriendInvite";
import { fetchFriendsOnline } from "@/constants/Invites";
import { nameFontFamily } from "@/constants/NameFont";

function escapeIlikePattern(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
}

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
    const { t } = useLanguage();
    const [friends, setFriends] = useState<FriendRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<FriendProfile[]>([]);
    const openProfile = useOpenPlayerProfile();
    const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

    // Friends seen in the last two minutes get a green dot; asked again every 30 seconds while this list is open.
    useEffect(() => {
        let active = true;
        const refresh = () => void fetchFriendsOnline().then((ids) => { if (active) setOnlineIds(ids); });
        refresh();
        const timer = setInterval(refresh, 30000);
        return () => { active = false; clearInterval(timer); };
    }, []);

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

    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setSuggestions([]);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, auth_user_id, player_id, player_name')
                .not('auth_user_id', 'is', null)
                .neq('auth_user_id', userId)
                .ilike('player_name', `%${escapeIlikePattern(query)}%`)
                .limit(20);
            if (cancelled) return;
            if (error || !data) {
                setSuggestions([]);
                return;
            }
            setSuggestions(rankFriendSuggestions(data as FriendProfile[], query).slice(0, 6));
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [searchQuery, userId]);

    const handleSearchAndAdd = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);

        const cleanQuery = searchQuery.trim();

        // 1. Find user by name
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, auth_user_id, player_id, player_name')
            .not('auth_user_id', 'is', null)
            .ilike('player_name', `%${escapeIlikePattern(cleanQuery)}%`)
            .order('updated_at', { ascending: false })
            .limit(20);

        if (profileError || !profiles || profiles.length === 0) {
            Alert.alert(t("friends.notFoundTitle"), t("friends.notFoundMessage", { name: cleanQuery }));
            setSearchLoading(false);
            return;
        }

        const ranked = rankFriendSuggestions(profiles as FriendProfile[], cleanQuery);
        const exactMatch = ranked.find((profile) => profile.player_name.toLowerCase() === cleanQuery.toLowerCase());
        if (!exactMatch && ranked.length > 1) {
            // Several partial matches: let the player pick from the list instead of guessing.
            setSuggestions(ranked.filter((profile) => profile.auth_user_id !== userId).slice(0, 6));
            setSearchLoading(false);
            return;
        }

        await sendFriendRequest(exactMatch || ranked[0]);
    };

    const sendFriendRequest = async (targetProfile: FriendProfile) => {
        setSearchLoading(true);
        const targetId = targetProfile.auth_user_id;
        if (!targetId) {
            Alert.alert(t("friends.errorTitle"), t("friends.mustLogin"));
            setSearchLoading(false);
            return;
        }

        if (targetId === userId) {
            Alert.alert(t("friends.oopsTitle"), t("friends.cantAddSelf"));
            setSearchLoading(false);
            return;
        }

        // 2. Check if already friends or pending
        const { data: existing } = await supabase
            .from('friends')
            .select('id, status')
            .or(`and(user_id_1.eq.${userId},user_id_2.eq.${targetId}),and(user_id_1.eq.${targetId},user_id_2.eq.${userId})`);
            
        if (existing && existing.length > 0) {
            Alert.alert(t("friends.infoTitle"), t("friends.alreadyStatus", { status: existing[0].status }));
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
            Alert.alert(t("friends.errorTitle"), insertError.message || t("friends.requestFailed"));
        } else {
            Alert.alert(t("friends.successTitle"), t("friends.requestSent"));
            setSearchQuery('');
            setSuggestions([]);
            fetchFriends();
        }
        setSearchLoading(false);
    };

    const handleAcceptRequest = async (friendId: string) => {
        const { error } = await supabase
            .from('friends')
            .update({ status: 'accepted' })
            .eq('id', friendId)
            .eq('user_id_2', userId);

        if (error) {
            Alert.alert(t("friends.errorTitle"), error.message || t("friends.acceptFailed"));
            return;
        }
        fetchFriends();
    };

    const handleDeleteOrCancel = async (friendId: string) => {
        const { error } = await supabase.from('friends').delete().eq('id', friendId);
        if (error) {
            Alert.alert(t("friends.errorTitle"), error.message || t("friends.updateFailed"));
            return;
        }
        fetchFriends();
    };

    const { inviteFriend: handleInvite1v1 } = useFriendInvite(userId);

    if (loading) {
        return <PixelLoader size="small" color={currentTheme.accent} />;
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
                    placeholder={t("friends.searchPlaceholder")}
                    placeholderTextColor={currentTheme.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearchAndAdd}
                />
                <StylizedButton 
                    text={searchLoading ? "..." : t("friends.add")}
                    onClick={handleSearchAndAdd} 
                    backgroundColor={currentTheme.buttonPrimary} 
                    style={styles.addButton}
                />
            </View>

            {suggestions.length > 0 && (
                <View style={[styles.suggestionList, { borderColor: currentTheme.gridBorder }]}>
                    {suggestions.map((profile) => (
                        <Pressable
                            key={profile.id}
                            onPress={() => sendFriendRequest(profile)}
                            style={({ pressed }) => [styles.suggestionRow, pressed && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                        >
                            <Text style={[styles.suggestionName, { color: currentTheme.textPrimary }]} numberOfLines={1}>{profile.player_name}</Text>
                            <Text style={[styles.suggestionAdd, { color: currentTheme.textSecondary }]}>+ {t("friends.add")}</Text>
                        </Pressable>
                    ))}
                </View>
            )}

            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: currentTheme.textSecondary }]}>{t("friends.requestsTitle")}</Text>
                    {incomingRequests.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <Text style={[styles.friendName, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(getFriendName(f)) }]} onPress={() => openProfile(getFriendName(f))}>{getFriendName(f)}</Text>
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
                    <Text style={[styles.sectionTitle, { color: currentTheme.textSecondary }]}>{t("friends.sentTitle")}</Text>
                    {outgoingRequests.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <Text style={[styles.friendName, { color: currentTheme.textSecondary }]}>{t("friends.pending", { name: getFriendName(f) })}</Text>
                            <StylizedButton text={t("friends.cancel")} onClick={() => handleDeleteOrCancel(f.id)} backgroundColor="rgb(150,150,150)" style={styles.cancelBtn} textStyle={styles.actionBtnText}/>
                        </View>
                    ))}
                </View>
            )}

            {/* Friends List */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: currentTheme.textPrimary }]}>{t("friends.myFriends", { count: acceptedFriends.length })}</Text>
                {acceptedFriends.length === 0 ? (
                    <Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>{t("friends.empty")}</Text>
                ) : (
                    acceptedFriends.map(f => (
                        <View key={f.id} style={[styles.friendRow, { backgroundColor: currentTheme.emptyBlockBorder }]}>
                            <View style={styles.nameWithDot}>
                                <View style={[styles.onlineDot, onlineIds.has(f.user_id_1 === userId ? f.user_id_2 : f.user_id_1) ? styles.onlineDotOn : styles.onlineDotOff]} />
                                <Text style={[styles.friendName, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(getFriendName(f)) }]} onPress={() => openProfile(getFriendName(f))}>{getFriendName(f)}</Text>
                            </View>
                            <View style={styles.actionsRow}>
                                <StylizedButton text={t("friends.invite1v1")} onClick={() => handleInvite1v1(f.user_id_1 === userId ? f.user_id_2 : f.user_id_1, getFriendName(f))} backgroundColor={currentTheme.accent} style={styles.inviteBtn} textStyle={styles.actionBtnText}/>
                                <StylizedButton text={t("friends.remove")} onClick={() => handleDeleteOrCancel(f.id)} backgroundColor="rgb(200,50,50)" style={styles.cancelBtn} textStyle={styles.actionBtnText}/>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    nameWithDot: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
    },
    onlineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    onlineDotOn: {
        backgroundColor: '#4ADE80',
    },
    onlineDotOff: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    container: {
        width: '100%',
        marginTop: 10,
    },
    suggestionList: {
        marginTop: -12,
        marginBottom: 16,
        borderWidth: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 8,
    },
    suggestionName: {
        flex: 1,
        fontFamily: 'Silkscreen',
        fontSize: 12,
    },
    suggestionAdd: {
        fontFamily: 'Silkscreen',
        fontSize: 10,
    },
    searchRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    input: {
        flex: 1,
        minWidth: 0,
        height: 40,
        borderWidth: 2,
        borderRadius: 4,
        paddingHorizontal: 10,
        fontFamily: 'Silkscreen',
    },
    addButton: {
        flexShrink: 0,
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
