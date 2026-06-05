import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '@/constants/Supabase';
import { useTheme } from '@/constants/Theme';
import { getLocalMatchHistory, StoredMatchHistoryItem } from '@/constants/MatchHistory';

interface MatchHistoryItem extends StoredMatchHistoryItem {
    id: string;
    winner_id: string | null;
    player1_id: string;
    player2_id: string;
    player1_score: number;
    player2_score: number;
    player1_elo_change: number;
    player2_elo_change: number;
    created_at: string;
}

function mergeMatchHistory(remote: MatchHistoryItem[], local: StoredMatchHistoryItem[]): MatchHistoryItem[] {
    const byKey = new Map<string, MatchHistoryItem>();

    [...local, ...remote].forEach((match) => {
        const key = match.room_id || match.id;
        byKey.set(key, match as MatchHistoryItem);
    });

    return [...byKey.values()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);
}

export default function MatchHistoryList({ userId }: { userId: string }) {
    const { currentTheme } = useTheme();
    const [history, setHistory] = useState<MatchHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            const [localHistory, remoteResult] = await Promise.all([
                getLocalMatchHistory(userId),
                supabase
                    .from('match_history')
                    .select('*')
                    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
                    .order('created_at', { ascending: false })
                    .limit(20),
            ]);

            if (isMounted) {
                const remoteHistory = !remoteResult.error && remoteResult.data
                    ? remoteResult.data as MatchHistoryItem[]
                    : [];
                setHistory(mergeMatchHistory(remoteHistory, localHistory));
            }
            if (isMounted) setLoading(false);
        };

        fetchHistory();

        return () => {
            isMounted = false;
        };
    }, [userId]);

    if (loading) {
        return <ActivityIndicator size="small" color={currentTheme.accent} />;
    }

    if (history.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>
                    No matches played yet.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {history.map((match) => {
                const isPlayer1 = match.player1_id === userId;
                const myScore = isPlayer1 ? match.player1_score : match.player2_score;
                const opponentScore = isPlayer1 ? match.player2_score : match.player1_score;
                const eloChange = isPlayer1 ? match.player1_elo_change : match.player2_elo_change;
                const isWin = match.winner_id === userId;
                const isDraw = match.winner_id === null;

                const resultColor = isDraw ? 'rgb(150,150,150)' : isWin ? 'rgb(50,200,50)' : 'rgb(200,50,50)';
                const resultText = isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS';
                const eloStr = eloChange > 0 ? `+${eloChange}` : eloChange < 0 ? `${eloChange}` : '0';

                return (
                    <View key={match.id} style={[styles.matchRow, { backgroundColor: currentTheme.emptyBlockBorder, borderColor: currentTheme.gridBorder }]}>
                        <View style={styles.resultCol}>
                            <Text style={[styles.resultText, { color: resultColor }]}>{resultText}</Text>
                        </View>
                        <View style={styles.scoreCol}>
                            <Text style={[styles.scoreText, { color: currentTheme.textPrimary }]}>
                                {myScore} - {opponentScore}
                            </Text>
                        </View>
                        <View style={styles.eloCol}>
                            <Text style={[styles.eloText, { color: eloChange > 0 ? 'rgb(50,200,50)' : eloChange < 0 ? 'rgb(200,50,50)' : 'rgb(150,150,150)' }]}>
                                {eloStr}
                            </Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 8,
        marginTop: 10,
    },
    emptyText: {
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        padding: 20,
    },
    matchRow: {
        flexDirection: 'row',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    resultCol: {
        width: 60,
    },
    resultText: {
        fontFamily: 'SilkscreenBold',
        fontSize: 14,
    },
    scoreCol: {
        flex: 1,
        alignItems: 'center',
    },
    scoreText: {
        fontFamily: 'Silkscreen',
        fontSize: 16,
    },
    eloCol: {
        width: 40,
        alignItems: 'flex-end',
    },
    eloText: {
        fontFamily: 'SilkscreenBold',
        fontSize: 14,
    },
});
