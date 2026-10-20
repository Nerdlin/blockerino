import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GlobalHighScore } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage, TranslateVars } from "@/constants/Localization";
import { getLeaderboardTier } from "@/constants/LeaderboardTiers";
import UiIcon from "./UiIcon";

export default function GlobalScoreRow({ score, rank, highlightTop, hideTime }: { score: GlobalHighScore; rank: number; highlightTop: boolean; hideTime?: boolean }) {
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const { width, height } = useWindowDimensions();
    const isMobile = width < 600 || height < 700;
    const tier = highlightTop ? getLeaderboardTier(rank) : undefined;
    return (
        <View style={[
            styles.scoreRow,
            isMobile && styles.mobileScoreRow,
            tier && {
                backgroundColor: tier.background,
                borderColor: tier.color,
                borderWidth: tier.borderWidth,
                ...(tier.id === "gold" && { shadowColor: tier.color, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }),
            },
        ]}>
            <Text style={[styles.scoreRankText, { color: tier?.color ?? currentTheme.textPrimary }, isMobile && styles.mobileScoreRankText]}>
                {tier?.icon ? <UiIcon name={tier.icon} size={isMobile ? 18 : 27} /> : `#${rank}`}
            </Text>
            <View style={styles.scoreNameColumn}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {score.avatar_url && score.avatar_url.startsWith("http") ? (
                        <Image source={{ uri: score.avatar_url }} style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: 'transparent' }} />
                    ) : score.avatar_url ? (
                        <Text style={{ fontSize: 14, marginRight: 6 }}>{score.avatar_url}</Text>
                    ) : null}
                    <Text style={[styles.scoreNameText, { color: currentTheme.textPrimary }, isMobile && styles.mobileScoreNameText]} numberOfLines={1}>
                        {score.player_name}
                    </Text>
                </View>
                {!hideTime && (
                    <Text style={[styles.scoreTimeText, { color: currentTheme.textSecondary }, isMobile && { fontSize: 10 }]} numberOfLines={1}>
                        {score.created_at ? createTimeAgoString(new Date(score.created_at).getTime(), t) : t("hs.unknownTime")}
                    </Text>
                )}
            </View>
            <Text style={[styles.scoreNumberText, { color: currentTheme.textPrimary }, isMobile && styles.mobileScoreNumberText]} numberOfLines={1} adjustsFontSizeToFit>
                {score.score}
            </Text>
        </View>
    );
}

function createTimeAgoString(date: number, t: (key: string, vars?: TranslateVars) => string): string {
    const now = new Date();
    const seconds = Math.round((now.getTime() - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const months = Math.round(days / 30);
    const years = Math.round(days / 365);

    if (seconds < 60) {
      return seconds <= 0 ? t("hs.timeNow") : t("hs.secondsAgo", { count: seconds });
    } else if (minutes < 60) {
      return t("hs.minutesAgo", { count: minutes });
    } else if (hours < 24) {
      return t("hs.hoursAgo", { count: hours });
    } else if (days < 30) {
      return t("hs.daysAgo", { count: days });
    } else if (months < 12) {
      return t("hs.monthsAgo", { count: months });
    } else {
      return t("hs.yearsAgo", { count: years });
    }
}

const styles = StyleSheet.create({
    scoreTimeText: {
        color: 'rgb(150, 150, 150)',
        fontSize: 11,
        fontFamily: 'Silkscreen'
    },
    scoreRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        minHeight: 48,
    },
    mobileScoreRow: {
        gap: 6,
        paddingHorizontal: 7,
        minHeight: 44,
    },
    scoreRankText: {
        width: 52,
        fontSize: 20,
        fontFamily: 'Silkscreen',
        textAlign: 'left',
    },
    mobileScoreRankText: {
        width: 38,
        fontSize: 15,
    },
    scoreNameColumn: {
        flex: 1,
        minWidth: 0,
    },
    scoreNameText: {
        fontSize: 18,
        fontFamily: 'Silkscreen',
    },
    mobileScoreNameText: {
        fontSize: 14,
    },
    scoreNumberText: {
        width: 110,
        fontSize: 18,
        fontFamily: 'Silkscreen',
        textAlign: 'right',
    },
    mobileScoreNumberText: {
        width: 78,
        fontSize: 14,
    },
});
