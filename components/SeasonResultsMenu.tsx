import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import SegmentedControl from "./SegmentedControl";
import GlobalScoreRow from "./GlobalScoreRow";
import UiIcon from "./UiIcon";
import { LeaderboardMeCard, LeaderboardPodium } from "./LeaderboardPodium";
import { formatSeasonKey } from "./SeasonTitleBadges";
import { cssColors } from "@/constants/Color";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { supabase } from "@/constants/Supabase";
import { useLanguage } from "@/constants/Localization";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useSetAppState } from "@/hooks/useAppState";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { useOpenPlayerProfile } from "@/constants/PlayerProfile";
import {
	getLatestSeasonResults,
	SEASON_RESULT_BOARDS,
	toLeaderboardRows,
	type SeasonResultBoard,
	type SeasonResultsSnapshot,
} from "@/constants/SeasonResults";

const BOARD_COLORS: Record<SeasonResultBoard, string> = { classic: "#EF4444", chaos: "#7C3AED", elo: "#FACC15" };

// Final top 10 of the most recently closed season, one tab per board, in the style of the high scores: the player's
// own place (when they made it), a podium for the top three and rows from fourth place.
export default function SeasonResultsMenu() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const [, , popAppState] = useSetAppState();
	const { signedIn, name: accountName } = useAccountIdentity();
	const openProfile = useOpenPlayerProfile();
	const [board, setBoard] = useState<SeasonResultBoard>("classic");
	const [snapshot, setSnapshot] = useState<SeasonResultsSnapshot | null>(null);
	const [loading, setLoading] = useState(true);
	const [avatars, setAvatars] = useState<Record<string, string>>({});

	const handleBack = useCallback(() => popAppState(), [popAppState]);
	useEscapeKey(handleBack);

	useEffect(() => {
		let cancelled = false;
		getLatestSeasonResults().then((result) => {
			if (cancelled) return;
			setSnapshot(result);
			setLoading(false);
			// the snapshot keeps names and scores; the pictures come from the profiles as they are now
			const ids = result ? [...new Set(Object.values(result.boards).flat().map((row) => row.profileId).filter((id): id is string => Boolean(id)))] : [];
			if (ids.length === 0) return;
			void supabase.from("profiles").select("id, avatar_url").in("id", ids).then(({ data }) => {
				if (cancelled || !data) return;
				setAvatars(Object.fromEntries((data as { id: string; avatar_url: string | null }[]).filter((row) => row.avatar_url).map((row) => [row.id, row.avatar_url as string])));
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const rows = snapshot
		? toLeaderboardRows(snapshot.boards[board], board).map((row, index) => ({ ...row, avatar_url: avatars[snapshot.boards[board][index]?.profileId ?? ""] }))
		: [];
	const color = BOARD_COLORS[board];
	const isMe = (name: string) => signedIn && Boolean(accountName) && name.toLowerCase() === accountName!.toLowerCase();
	const myIndex = rows.findIndex((row) => isMe(row.player_name));

	return (
		<SimplePopupView style={[{ justifyContent: "flex-start", backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<View style={styles.topBar}>
				<StylizedButton text={t("hs.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.backButton} textStyle={styles.backText} />
			</View>

			<View style={styles.titleRow}>
				<UiIcon name="crown" size={20} />
				<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
					{snapshot ? t("season.resultsTitle", { season: formatSeasonKey(snapshot.seasonKey, t) }) : t("hs.pastSeason")}
				</Text>
			</View>

			<SegmentedControl
				items={SEASON_RESULT_BOARDS.map((id) => ({ key: id, label: t(`perk.board.${id}`), color: BOARD_COLORS[id] }))}
				value={board}
				onChange={setBoard}
			/>

			{loading && <PixelLoader size="large" color={currentTheme.textPrimary} />}

			{!loading && !snapshot && (
				<Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>{t("season.noResults")}</Text>
			)}

			{!loading && snapshot && myIndex >= 0 && (
				<View style={styles.meWrap}>
					<LeaderboardMeCard
						name={rows[myIndex].player_name}
						avatarUrl={rows[myIndex].avatar_url}
						hint={t("season.resultsTitle", { season: formatSeasonKey(snapshot.seasonKey, t) })}
						place={myIndex + 1}
						placeHint={String(rows[myIndex].score)}
						color={color}
					/>
				</View>
			)}

			{!loading && snapshot && (
				<View style={styles.list}>
					{rows.length > 0 && (
						<LeaderboardPodium
							onOpen={openProfile}
							metaColor="#E5E7EB"
							top={rows.slice(0, 3).map((row, idx) => ({
								key: `${board}-${idx}`,
								name: row.player_name,
								avatarUrl: row.avatar_url,
								meta: String(row.score),
								isMe: isMe(row.player_name),
							}))}
						/>
					)}
					{rows.slice(3).map((row, idx) => (
						<GlobalScoreRow key={`${board}-${idx + 3}`} rank={idx + 4} score={row} highlightTop hideTime isMe={isMe(row.player_name)} accent={color} />
					))}
					{rows.length === 0 && (
						<Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>{t("hs.noGlobalScores")}</Text>
					)}
				</View>
			)}
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	topBar: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
	},
	backButton: {
		width: 88,
		minWidth: 88,
		height: 40,
		minHeight: 40,
		margin: 0,
		paddingHorizontal: 8,
	},
	backText: {
		fontSize: 12,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 10,
		marginBottom: 10,
		maxWidth: "92%",
	},
	header: {
		fontFamily: "Silkscreen",
		fontSize: 20,
		textAlign: "center",
	},
	meWrap: {
		width: "100%",
		alignItems: "center",
		marginTop: 10,
	},
	list: {
		width: "94%",
		gap: 6,
		marginTop: 10,
	},
	emptyText: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
		marginTop: 20,
		paddingHorizontal: 10,
	},
});
