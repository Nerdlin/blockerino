import { View, Text, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";
import { nameFontFamily } from "@/constants/NameFont";
import UiIcon from "@/components/UiIcon";
import PixelGlyphView from "@/components/PixelGlyphView";
import { ACHIEVEMENT_GLYPHS } from "@/constants/AchievementIcons";
import { UI_GLYPHS } from "@/constants/UiGlyphs";
import { useLanguage } from "@/constants/Localization";
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

const GAME_GLYPHS = {
	chess: ACHIEVEMENT_GLYPHS.pawn,
	durak: ACHIEVEMENT_GLYPHS.cards,
	battleship: UI_GLYPHS.wave,
	checkers: ACHIEVEMENT_GLYPHS.stack,
	tictactoe: ACHIEVEMENT_GLYPHS.target,
	sudoku: ACHIEVEMENT_GLYPHS.puzzle,
	mahjong: ACHIEVEMENT_GLYPHS.bricks,
} satisfies Record<RatedMoreGameId, unknown>;

const gameColor = (gameId: RatedMoreGameId) => MORE_GAME_CARDS.find((item) => item.id === gameId)?.color ?? "#FFFFFF";

/** The game picker: four tiles a row, each with the game's icon over its name, in the game's colour. */
export function MoreGameTabs({ selected, onChange }: { selected: RatedMoreGameId; onChange: (game: RatedMoreGameId) => void }) {
	const { t } = useLanguage();
	return (
		<View style={local.tabs}>
			{RATED_MORE_GAME_IDS.map((gameId) => {
				const active = gameId === selected;
				const color = gameColor(gameId);
				return (
					<Pressable
						key={gameId}
						onPress={() => onChange(gameId)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
						style={[local.tab, { borderColor: active ? color : "rgba(255,255,255,0.12)", backgroundColor: active ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)" }]}
					>
						<PixelGlyphView glyph={GAME_GLYPHS[gameId]} size={18} dimmed={!active} />
						<Text style={[local.tabText, { color: active ? color : "#9CA3AF" }]} numberOfLines={2}>
							{t(`moregames.label.${gameId}`)}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
	if (url && url.startsWith("http")) {
		return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.08)" }} />;
	}
	// an emoji avatar, or the first letter of the name
	return (
		<View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
			<Text style={{ fontSize: url ? size * 0.55 : size * 0.42, color: "#FFFFFF", fontFamily: url ? undefined : "SilkscreenBold" }}>{url || name.charAt(0).toUpperCase()}</Text>
		</View>
	);
}

// second place on the left, first in the middle and highest, third on the right
const PODIUM = [
	{ place: 2, medal: "medalSilver" as const, color: "#CBD5E1", height: 46 },
	{ place: 1, medal: "medalGold" as const, color: "#FACC15", height: 64 },
	{ place: 3, medal: "medalBronze" as const, color: "#D97706", height: 34 },
];

function Podium({ top, playerName, onOpen }: { top: MoreGameRating[]; playerName: string; onOpen: (name: string) => void }) {
	const { t } = useLanguage();
	return (
		<View style={local.podium}>
			{PODIUM.map(({ place, medal, color, height }) => {
				const entry = top[place - 1];
				// a free place still gets its step, so the podium keeps its shape with one or two players
				if (!entry) {
					return (
						<View key={place} style={local.podiumColumn}>
							<View style={[local.podiumStep, local.podiumStepEmpty, { height }]}>
								<Text style={[local.podiumPlace, { color: "rgba(255,255,255,0.25)" }]}>{place}</Text>
							</View>
						</View>
					);
				}
				const isMe = entry.player_name.toLowerCase() === playerName.toLowerCase();
				return (
					<Pressable key={place} onPress={() => onOpen(entry.player_name)} style={local.podiumColumn}>
						<View style={[local.podiumAvatar, { borderColor: color }]}>
							<Avatar name={entry.player_name} url={entry.avatar_url} size={place === 1 ? 46 : 38} />
						</View>
						<Text style={[local.podiumName, { color: isMe ? color : "#F3F4F6", fontFamily: nameFontFamily(entry.player_name) }]} numberOfLines={1}>
							{entry.player_name}
						</Text>
						<Text style={local.podiumMeta} numberOfLines={1}>{t("moregames.podiumWins", { wins: entry.wins, rate: winRate(entry) })}</Text>
						<View style={[local.podiumStep, { height, borderColor: color }]}>
							<UiIcon name={medal} size={place === 1 ? 27 : 18} />
							<Text style={[local.podiumPlace, { color }]}>{place}</Text>
						</View>
					</Pressable>
				);
			})}
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
	onPlay,
}: {
	gameId: RatedMoreGameId;
	onGameChange: (game: RatedMoreGameId) => void;
	leaderboard: MoreGameRating[];
	myRating: MoreGameRating | null;
	loading: boolean;
	playerName: string;
	onRefresh: () => void;
	onPlay: (game: RatedMoreGameId) => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const openProfile = useOpenPlayerProfile();
	const color = gameColor(gameId);
	const myIndex = leaderboard.findIndex((entry) => entry.player_name.toLowerCase() === playerName.toLowerCase());
	const myAvatar = myIndex >= 0 ? leaderboard[myIndex].avatar_url : null;
	const myRate = winRate(myRating);
	// under the table (or in place of an empty one): where the player stands and a way straight into the game
	const cta = (
		<View style={[local.cta, { borderColor: color }]}>
			<PixelGlyphView glyph={GAME_GLYPHS[gameId]} size={36} />
			<View style={{ flex: 1, gap: 4 }}>
				<Text style={[local.ctaTitle, { color }]}>
					{myIndex === 0 ? t("moregames.ctaTopTitle") : myIndex > 0 ? t("moregames.ctaPlaceTitle", { place: myIndex + 1 }) : leaderboard.length === 0 ? t("moregames.ctaFirstTitle") : t("moregames.ctaJoinTitle")}
				</Text>
				<Text style={[local.ctaText, { color: currentTheme.textSecondary }]}>
					{myIndex === 0 ? t("moregames.ctaTopText") : myIndex > 0 ? t("moregames.ctaPlaceText") : leaderboard.length === 0 ? t("moregames.ctaFirstText") : t("moregames.ctaJoinText")}
				</Text>
			</View>
			<Pressable onPress={() => onPlay(gameId)} style={[local.ctaButton, { backgroundColor: color }]}>
				<Text style={local.ctaButtonText}>{t("moregames.ctaPlay")}</Text>
			</Pressable>
		</View>
	);

	return (
		<View style={styles.ratingScreen}>
			<MoreGameTabs selected={gameId} onChange={onGameChange} />

			<View style={[local.meCard, { borderColor: color }]}>
				<Avatar name={playerName} url={myAvatar} size={40} />
				<View style={{ flex: 1, gap: 4 }}>
					<Text style={[local.meName, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(playerName) }]} numberOfLines={1}>{playerName}</Text>
					<View style={local.meStats}>
						<Text style={[local.meStat, { color: "#4ADE80" }]}>{t("moregames.statW", { n: myRating?.wins || 0 })}</Text>
						<Text style={[local.meStat, { color: "#F87171" }]}>{t("moregames.statL", { n: myRating?.losses || 0 })}</Text>
						<Text style={[local.meStat, { color: "#9CA3AF" }]}>{t("moregames.statD", { n: myRating?.draws || 0 })}</Text>
					</View>
					<View style={local.rateTrack}>
						<View style={[local.rateFill, { width: `${myRate}%`, backgroundColor: color }]} />
					</View>
				</View>
				<View style={local.mePlace}>
					<Text style={[local.mePlaceNumber, { color }]}>{myIndex >= 0 ? `#${myIndex + 1}` : "—"}</Text>
					<Text style={local.mePlaceLabel}>{t("moregames.winRateShort", { rate: myRate })}</Text>
				</View>
			</View>

			<View style={styles.leaderboardTopRow}>
				<Text style={[styles.leaderboardSub, { color: currentTheme.textSecondary }]}>{t("moregames.top100")}</Text>
				<Pressable onPress={onRefresh} disabled={loading} accessibilityLabel={t("common.refresh")} style={[styles.refreshIconButton, loading && { opacity: 0.5 }]}>
					<UiIcon name="refresh" size={18} />
				</Pressable>
			</View>

			<ScrollView style={styles.leaderboardList} contentContainerStyle={styles.leaderboardListContent}>
				{leaderboard.length === 0 ? (
					loading ? <Text style={[styles.emptyLeaderboardText, { color: currentTheme.textSecondary }]}>{t("moregames.loadingRatings")}</Text> : cta
				) : (
					<>
						<Podium top={leaderboard.slice(0, 3)} playerName={playerName} onOpen={openProfile} />
						{leaderboard.slice(3).map((entry, index) => {
							const isMe = entry.player_name.toLowerCase() === playerName.toLowerCase();
							const rate = winRate(entry);
							return (
								<Pressable
									onPress={() => openProfile(entry.player_name)}
									key={`${entry.game_id}-${entry.player_key || entry.player_name}`}
									style={[local.row, isMe && { borderColor: color, backgroundColor: "rgba(255,255,255,0.07)" }]}
								>
									<Text style={[local.rowRank, { color: currentTheme.textSecondary }]}>{index + 4}</Text>
									<Avatar name={entry.player_name} url={entry.avatar_url} size={26} />
									<View style={{ flex: 1, gap: 3 }}>
										<Text style={[local.rowName, { color: currentTheme.textPrimary, fontFamily: nameFontFamily(entry.player_name) }]} numberOfLines={1}>
											{entry.player_name}{isMe ? ` (${t("moregames.you")})` : ""}
										</Text>
										<View style={local.rateTrackThin}>
											<View style={[local.rateFill, { width: `${rate}%`, backgroundColor: color }]} />
										</View>
									</View>
									<View style={{ alignItems: "flex-end" }}>
										<Text style={[local.rowWins, { color: currentTheme.textPrimary }]}>{entry.wins}</Text>
										<Text style={local.rowMeta}>{t("moregames.rowMeta", { games: entry.games_played, rate })}</Text>
									</View>
								</Pressable>
							);
						})}
						{cta}
					</>
				)}
			</ScrollView>
		</View>
	);
}

const local = StyleSheet.create({
	tabs: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 6 },
	tab: { flexBasis: "23%", flexGrow: 1, minHeight: 52, borderWidth: 2, borderRadius: 8, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 3, paddingVertical: 5 },
	tabText: { fontFamily: "Silkscreen", fontSize: 9, textAlign: "center" },
	meCard: { width: "100%", borderWidth: 2, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)" },
	meName: { fontSize: 14 },
	meStats: { flexDirection: "row", gap: 10 },
	meStat: { fontFamily: "Silkscreen", fontSize: 10 },
	mePlace: { alignItems: "center", minWidth: 54 },
	mePlaceNumber: { fontFamily: "SilkscreenBold", fontSize: 20 },
	mePlaceLabel: { fontFamily: "Silkscreen", fontSize: 9, color: "#9CA3AF" },
	rateTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
	rateTrackThin: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
	rateFill: { height: "100%", borderRadius: 3 },
	podium: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 12, paddingTop: 4, borderBottomWidth: 2, borderColor: "rgba(255,255,255,0.18)" },
	podiumColumn: { flex: 1, alignItems: "center", gap: 3 },
	podiumAvatar: { borderWidth: 2, borderRadius: 999, padding: 2 },
	podiumName: { fontSize: 11, maxWidth: "100%" },
	podiumMeta: { fontFamily: "Silkscreen", fontSize: 8, color: "#9CA3AF" },
	podiumStep: { width: "100%", borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6, gap: 2, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
	podiumStepEmpty: { borderColor: "rgba(255,255,255,0.12)", borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.02)" },
	podiumPlace: { fontFamily: "SilkscreenBold", fontSize: 12 },
	cta: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderStyle: "dashed", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.03)" },
	ctaTitle: { fontFamily: "SilkscreenBold", fontSize: 12 },
	ctaText: { fontFamily: "Silkscreen", fontSize: 9, lineHeight: 13 },
	ctaButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
	ctaButtonText: { fontFamily: "SilkscreenBold", fontSize: 11, color: "#111111" },
	row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 8, marginBottom: 5, backgroundColor: "rgba(0,0,0,0.2)" },
	rowRank: { fontFamily: "SilkscreenBold", fontSize: 11, width: 24, textAlign: "center" },
	rowName: { fontSize: 12 },
	rowWins: { fontFamily: "SilkscreenBold", fontSize: 13 },
	rowMeta: { fontFamily: "Silkscreen", fontSize: 8, color: "#9CA3AF" },
});
