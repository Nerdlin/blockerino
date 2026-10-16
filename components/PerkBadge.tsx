import { StyleSheet, Text, View } from "react-native";
import UiIcon from "./UiIcon";
import { useLanguage } from "@/constants/Localization";
import type { LeaderboardPerk } from "@/constants/LeaderboardPerks";

// "Champion · Classic" / "Top 3 · Versus" with the reward icon, tinted with the perk colour.
export default function PerkBadge({ perk }: { perk: LeaderboardPerk }) {
    const { t } = useLanguage();
    const label = perk.rank === 1 ? t("perk.champion") : t("perk.top", { rank: perk.rank });
    return (
        <View style={styles.row}>
            <UiIcon name={perk.tier.icon ?? "star"} size={18} />
            <Text style={[styles.text, { color: perk.tier.color }]}>
                {label} · {t(`perk.board.${perk.board}`)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    text: {
        fontFamily: "Silkscreen",
        fontSize: 12,
    },
});
