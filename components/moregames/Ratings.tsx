import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";
import UiIcon from "@/components/UiIcon";
import { useLanguage } from "@/constants/Localization";
import SegmentedControl from "../SegmentedControl";
import { MoreGameRating } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { MORE_GAME_CARDS, RATED_MORE_GAME_IDS } from "./shared";
import { styles } from "./styles";
import { RatedMoreGameId } from "./types";

/** Share of games won, rounded; 0 for someone who has not played. */
export function winRate(rating: { wins?: number; games_played?: number } | null | undefined): number {
	const games = rating?.games_played || 0;
	return games > 0 ? Math.round(((rating?.wins || 0) / games) * 100) : 0;
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
	const openProfile = useOpenPlayerProfile();

	return (
		<View style={styles.ratingScreen}>
			<MoreGameTabs selected={gameId} onChange={onGameChange} />
			<View style={[styles.ratingSummaryCard, { borderColor: currentTheme.buttonPrimary }]}>
				<UiIcon name="medalGold" size={27} />
				<View style={styles.myRatingTextBlock}>
					<Text style={[styles.myRatingTitle, { color: currentTheme.buttonPrimary }]}>{playerName}</Text>
					<Text style={[styles.myRatingMeta, { color: currentTheme.textSecondary }]}>
						{t("moregames.myRecord", { wins: myRating?.wins || 0, losses: myRating?.losses || 0, draws: myRating?.draws || 0, rate: winRate(myRating) })}
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
				<Text style={[styles.leaderboardHeaderText, { flex: 0.7, textAlign: "right" }]}>{t("moregames.colWins")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.7, textAlign: "right" }]}>{t("moregames.colGames")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.7, textAlign: "right" }]}>{t("moregames.colRate")}</Text>
			</View>
			<ScrollView style={styles.leaderboardList} contentContainerStyle={styles.leaderboardListContent}>
				{leaderboard.length === 0 ? (
					<Text style={[styles.emptyLeaderboardText, { color: currentTheme.textSecondary }]}>
						{loading ? t("moregames.loadingRatings") : t("moregames.noRatings")}
					</Text>
				) : leaderboard.map((entry, index) => {
					const isMe = entry.player_name.toLowerCase() === playerName.toLowerCase();
					return (
						<Pressable onPress={() => openProfile(entry.player_name)} key={`${entry.game_id}-${entry.player_key || entry.player_name}`} style={[styles.leaderboardRow, isMe && { borderColor: currentTheme.buttonPrimary, backgroundColor: "rgba(255,255,255,0.06)" }]}>
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
							<Text style={[styles.leaderboardElo, { flex: 0.7, color: currentTheme.textPrimary }]}>{entry.wins}</Text>
							<Text style={[styles.leaderboardElo, { flex: 0.7, color: currentTheme.textSecondary }]}>{entry.games_played}</Text>
							<Text style={[styles.leaderboardElo, { flex: 0.7, color: currentTheme.textSecondary }]}>{winRate(entry)}%</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
}