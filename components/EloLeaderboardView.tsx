import { Pressable, StyleSheet, Text, View } from "react-native";
import UiIcon from "@/components/UiIcon";
import { LeaderboardAvatar, LeaderboardPodium } from "@/components/LeaderboardPodium";
import { useLanguage } from "@/constants/Localization";
import { nameFontFamily } from "@/constants/NameFont";
import { getSeasonEndsAt } from "@/constants/SeasonScores";
import type { EloRating } from "@/constants/Supabase";
import type { UiGlyphName } from "@/constants/UiGlyphs";

// The Versus (1v1) rating table: the season clock, the player's own card with the way to the next tier, the top
// three on a podium and everyone else below.

export interface EloTier {
	tier: string;
	color: string;
	icon: UiGlyphName;
	min: number;
	max: number;
}

export function EloLeaderboardView({ entries, playerName, playerElo, tiers, onOpen }: {
	entries: EloRating[];
	playerName: string;
	playerElo: number;
	tiers: EloTier[];
	onOpen: (name: string) => void;
}) {
	const { t } = useLanguage();
	const tierOf = (elo: number) => tiers.find((tier) => elo < tier.max) ?? tiers[tiers.length - 1];
	const tierName = (tier: EloTier) => t(`mp.tierName.${tier.tier}`);
	const isMe = (name: string) => name.toLowerCase() === playerName.toLowerCase();

	const myIndex = entries.findIndex((entry) => isMe(entry.player_name));
	const myEntry = myIndex >= 0 ? entries[myIndex] : null;
	const myElo = myEntry?.elo ?? playerElo;
	const myTier = tierOf(myElo);
	const nextTier = tiers[tiers.indexOf(myTier) + 1] ?? null;
	const progress = Math.min(1, Math.max(0, (myElo - myTier.min) / (myTier.max - myTier.min)));
	const daysLeft = Math.ceil((getSeasonEndsAt().getTime() - Date.now()) / 86400000);

	return (
		<View style={styles.screen}>
			<View style={styles.seasonRow}>
				<Text style={styles.seasonText}>
					{daysLeft <= 1 ? t("hs.seasonEndsToday") : t("hs.seasonEndsIn", { days: daysLeft })} · {t("mp.eloSeasonNote")}
				</Text>
			</View>

			<View style={[styles.meCard, { borderColor: myTier.color }]}>
				<LeaderboardAvatar name={playerName} url={myEntry?.avatar_url} size={42} />
				<View style={{ flex: 1, gap: 5 }}>
					<View style={styles.meTop}>
						<Text style={[styles.meName, { fontFamily: nameFontFamily(playerName) }]} numberOfLines={1}>{playerName}</Text>
						<View style={[styles.tierChip, { backgroundColor: myTier.color }]}>
							<UiIcon name={myTier.icon} size={10} />
							<Text style={styles.tierChipText}>{tierName(myTier)}</Text>
						</View>
					</View>
					<View style={styles.track}>
						<View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: myTier.color }]} />
					</View>
					<Text style={styles.meHint} numberOfLines={1}>
						{nextTier ? t("mp.pointsToTier", { points: nextTier.min - myElo, tier: tierName(nextTier) }) : t("mp.topTier")}
					</Text>
				</View>
				<View style={styles.mePlace}>
					<Text style={[styles.meElo, { color: myTier.color }]}>{myElo}</Text>
					<Text style={styles.mePlaceLabel}>{myIndex >= 0 ? `#${myIndex + 1}` : t("mp.unranked")}</Text>
				</View>
			</View>

			{entries.length === 0 ? (
				<Text style={styles.empty}>{t("mp.noRatings")}</Text>
			) : (
				<>
					<LeaderboardPodium
						onOpen={onOpen}
						metaColor="#E5E7EB"
						top={entries.slice(0, 3).map((entry, index) => ({
							key: String(entry.id ?? `${index}-${entry.player_name}`),
							name: entry.player_name,
							avatarUrl: entry.avatar_url,
							meta: `${entry.elo} ELO`,
							isMe: isMe(entry.player_name),
						}))}
					/>
					{entries.slice(3).map((entry, index) => {
						const tier = tierOf(entry.elo);
						const me = isMe(entry.player_name);
						return (
							<Pressable
								key={String(entry.id ?? `${index + 3}-${entry.player_name}`)}
								onPress={() => onOpen(entry.player_name)}
								style={[styles.row, me && { borderColor: tier.color, backgroundColor: "rgba(255,255,255,0.08)" }]}
							>
								<Text style={styles.rowRank}>{index + 4}</Text>
								<LeaderboardAvatar name={entry.player_name} url={entry.avatar_url} size={28} />
								<Text style={[styles.rowName, { fontFamily: nameFontFamily(entry.player_name, me ? "SilkscreenBold" : "Silkscreen") }]} numberOfLines={1}>
									{entry.player_name}{me ? t("mp.you") : ""}
								</Text>
								<View style={[styles.tierDot, { borderColor: tier.color }]}>
									<UiIcon name={tier.icon} size={12} />
								</View>
								<Text style={[styles.rowElo, { color: tier.color }]}>{entry.elo}</Text>
							</Pressable>
						);
					})}
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { width: "100%", gap: 10, paddingBottom: 12 },
	seasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
	seasonText: { fontFamily: "Silkscreen", fontSize: 9, color: "#9CA3AF", textAlign: "center", flexShrink: 1 },
	meCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderRadius: 10, padding: 10, backgroundColor: "rgba(255,255,255,0.04)" },
	meTop: { flexDirection: "row", alignItems: "center", gap: 6 },
	meName: { fontSize: 14, color: "#F3F4F6", flexShrink: 1 },
	tierChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
	tierChipText: { fontFamily: "SilkscreenBold", fontSize: 8, color: "#111111" },
	track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
	fill: { height: "100%", borderRadius: 3 },
	meHint: { fontFamily: "Silkscreen", fontSize: 8, color: "#9CA3AF" },
	mePlace: { alignItems: "center", minWidth: 56 },
	meElo: { fontFamily: "SilkscreenBold", fontSize: 20 },
	mePlaceLabel: { fontFamily: "Silkscreen", fontSize: 9, color: "#9CA3AF" },
	empty: { fontFamily: "Silkscreen", fontSize: 11, color: "#9CA3AF", textAlign: "center", marginVertical: 30 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 8, backgroundColor: "rgba(0,0,0,0.2)" },
	rowRank: { fontFamily: "SilkscreenBold", fontSize: 11, width: 26, textAlign: "center", color: "#9CA3AF" },
	rowName: { flex: 1, fontSize: 12, color: "#F3F4F6" },
	tierDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
	rowElo: { fontFamily: "SilkscreenBold", fontSize: 13, minWidth: 40, textAlign: "right" },
});
