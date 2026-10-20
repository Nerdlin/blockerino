import { View, Text, Pressable, ScrollView, Image } from "react-native";
import UiIcon from "@/components/UiIcon";
import { useLanguage } from "@/constants/Localization";
import SegmentedControl from "../SegmentedControl";
import { MoreGameRating } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { MORE_GAME_CARDS, RATED_MORE_GAME_IDS, getMoreGameEloBadge } from "./shared";
import { styles } from "./styles";
import { RatedMoreGameId } from "./types";

export function RatingBadge({ elo, small = false }: { elo: number; small?: boolean }) {
	const badge = getMoreGameEloBadge(elo);
	return (
		<View style={[styles.ratingBadgeCircle, small && styles.ratingBadgeCircleSmall, { backgroundColor: badge.color }]}>
			<UiIcon name={badge.icon} size={small ? 18 : 27} />
		</View>
	);
}

export function MoreGameTabs({ selected, onChange }: { selected: RatedMoreGameId; onChange: (game: RatedMoreGameId) => void }) {
	const { t } = useLanguage();
	const toItem = (gameId: RatedMoreGameId) => ({
		key: gameId,
		label: t(`moregames.label.${gameId}`),
		color: MORE_GAME_CARDS.find((item) => item.id === gameId)?.color,
	});
	const half = Math.ceil(RATED_MORE_GAME_IDS.length / 2);
	return (
		<View style={styles.ratingTabsWrapper}>
			<SegmentedControl small items={RATED_MORE_GAME_IDS.slice(0, half).map(toItem)} value={selected} onChange={onChange} />
			<SegmentedControl small items={RATED_MORE_GAME_IDS.slice(half).map(toItem)} value={selected} onChange={onChange} />
		</View>
	);
}

export function MoreGameLeaderboardPanel({
	gameId,
	onGameChange,
	leaderboard,
	myRating,
	loading,
	playerName,
	onRefresh,
}: {
	gameId: RatedMoreGameId;
	onGameChange: (game: RatedMoreGameId) => void;
	leaderboard: MoreGameRating[];
	myRating: MoreGameRating | null;
	loading: boolean;
	playerName: string;
	onRefresh: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<View style={styles.ratingScreen}>
			<MoreGameTabs selected={gameId} onChange={onGameChange} />
			<View style={[styles.ratingSummaryCard, { borderColor: currentTheme.buttonPrimary }]}>
				<RatingBadge elo={myRating?.elo || 0} small />
				<View style={styles.myRatingTextBlock}>
					<Text style={[styles.myRatingTitle, { color: currentTheme.buttonPrimary }]}>{playerName}</Text>
					<Text style={[styles.myRatingMeta, { color: currentTheme.textSecondary }]}>
						{myRating?.elo || 0} ELO | W {myRating?.wins || 0} / L {myRating?.losses || 0} / D {myRating?.draws || 0}
					</Text>
				</View>
			</View>
			<View style={styles.leaderboardTopRow}>
				<Text style={[styles.leaderboardSub, { color: currentTheme.textSecondary }]}>{t("moregames.top100")}</Text>
				<Pressable onPress={onRefresh} disabled={loading} accessibilityLabel={t("common.refresh")} style={[styles.refreshIconButton, loading && { opacity: 0.5 }]}>
						<UiIcon name="refresh" size={18} />
					</Pressable>
			</View>
			<View style={styles.leaderboardHeaderRow}>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.35 }]}>#</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 1.75 }]}>{t("moregames.colPlayer")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 1 }]}>{t("moregames.colTier")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.65, textAlign: "right" }]}>{t("moregames.colElo")}</Text>
			</View>
			<ScrollView style={styles.leaderboardList} contentContainerStyle={styles.leaderboardListContent}>
				{leaderboard.length === 0 ? (
					<Text style={[styles.emptyLeaderboardText, { color: currentTheme.textSecondary }]}>
						{loading ? t("moregames.loadingRatings") : t("moregames.noRatings")}
					</Text>
				) : leaderboard.map((entry, index) => {
					const badge = getMoreGameEloBadge(entry.elo);
					const isMe = entry.player_name.toLowerCase() === playerName.toLowerCase();
					return (
						<View key={`${entry.game_id}-${entry.player_key || entry.player_name}`} style={[styles.leaderboardRow, isMe && { borderColor: badge.color, backgroundColor: "rgba(255,255,255,0.06)" }]}>
							<Text style={[styles.leaderboardRank, { flex: 0.35, color: currentTheme.textPrimary }]}>{index + 1}</Text>
							<View style={{ flex: 1.75, flexDirection: 'row', alignItems: 'center' }}>
								{entry.avatar_url && entry.avatar_url.startsWith("http") ? (
									<Image source={{ uri: entry.avatar_url }} style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: 'transparent' }} />
								) : entry.avatar_url ? (
									<Text style={{ fontSize: 14, marginRight: 6 }}>{entry.avatar_url}</Text>
								) : (
									<View style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
										<Text style={{ fontSize: 10, color: '#fff' }}>{entry.player_name.charAt(0).toUpperCase()}</Text>
									</View>
								)}
								<Text style={[styles.leaderboardName, { flexShrink: 1, color: currentTheme.textPrimary }]} numberOfLines={1}>
									{entry.player_name}{isMe ? ` (${t("moregames.you")})` : ""}
								</Text>
							</View>
							<View style={[styles.leaderboardTier, { flex: 1, backgroundColor: badge.color }]}>
								<UiIcon name={badge.icon} size={9} />
								<Text style={styles.leaderboardTierText}>{t(`moregames.tier.${badge.tier}`)}</Text>
							</View>
							<Text style={[styles.leaderboardElo, { flex: 0.65, color: currentTheme.textPrimary }]}>{entry.elo}</Text>
						</View>
					);
				})}
			</ScrollView>
		</View>
	);
}