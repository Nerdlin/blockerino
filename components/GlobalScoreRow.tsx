import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";
import { nameFontFamily } from "@/constants/NameFont";
import { GlobalHighScore } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage, TranslateVars } from "@/constants/Localization";
import { getLeaderboardTier } from "@/constants/LeaderboardTiers";
import { LeaderboardAvatar } from "./LeaderboardPodium";
import UiIcon from "./UiIcon";

/** One row of a score table, in the same card style as the Versus and More Games tables. */
export default function GlobalScoreRow({ score, rank, highlightTop, hideTime, isMe, accent }: { score: GlobalHighScore; rank: number; highlightTop: boolean; hideTime?: boolean; isMe?: boolean; accent?: string }) {
    const { t } = useLanguage();
    const { currentTheme } = useTheme();
    const tier = highlightTop ? getLeaderboardTier(rank) : undefined;
    const openProfile = useOpenPlayerProfile();
    return (
        <Pressable onPress={() => openProfile(score.player_name)} style={[
            styles.row,
            tier && tier.borderWidth > 0 && { backgroundColor: tier.background, borderColor: tier.color },
            isMe && { borderColor: accent ?? currentTheme.accent, backgroundColor: 'rgba(255,255,255,0.08)' },
        ]}>
            <View style={styles.rank}>
                {tier?.icon ? <UiIcon name={tier.icon} size={18} /> : <Text style={[styles.rankText, { color: tier?.color ?? currentTheme.textSecondary }]}>{rank}</Text>}
            </View>
            <LeaderboardAvatar name={score.player_name} url={score.avatar_url} size={28} />
            <View style={styles.nameColumn}>
                <Text style={[styles.name, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(score.player_name, isMe ? 'SilkscreenBold' : 'Silkscreen') }]} numberOfLines={1}>
                    {score.player_name}
                </Text>
                {!hideTime && (
                    <Text style={[styles.time, { color: currentTheme.textSecondary }]} numberOfLines={1}>
                        {score.created_at ? createTimeAgoString(new Date(score.created_at).getTime(), t) : t("hs.unknownTime")}
                    </Text>
                )}
            </View>
            <Text style={[styles.score, { color: tier?.color && tier.borderWidth > 0 ? tier.color : currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {score.score}
            </Text>
        </Pressable>
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
    row: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 8,
        backgroundColor: "rgba(0,0,0,0.2)",
        minHeight: 46,
    },
    rank: {
        width: 26,
        alignItems: "center",
    },
    rankText: {
        fontSize: 12,
        fontFamily: "SilkscreenBold",
    },
    nameColumn: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    name: {
        fontSize: 13,
    },
    time: {
        fontSize: 9,
        fontFamily: "Silkscreen",
    },
    score: {
        minWidth: 64,
        fontSize: 14,
        fontFamily: "SilkscreenBold",
        textAlign: "right",
    },
});
