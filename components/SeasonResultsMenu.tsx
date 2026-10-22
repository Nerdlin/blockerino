import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import GlobalScoreRow from "./GlobalScoreRow";
import { cssColors } from "@/constants/Color";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useSetAppState } from "@/hooks/useAppState";
import {
	getLatestSeasonResults,
	SEASON_RESULT_BOARDS,
	toLeaderboardRows,
	type SeasonResultBoard,
	type SeasonResultsSnapshot,
} from "@/constants/SeasonResults";

// Final top 10 of the most recently closed season, one tab per board.
export default function SeasonResultsMenu() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const [, , popAppState] = useSetAppState();
	const [board, setBoard] = useState<SeasonResultBoard>("classic");
	const [snapshot, setSnapshot] = useState<SeasonResultsSnapshot | null>(null);
	const [loading, setLoading] = useState(true);

	const handleBack = useCallback(() => popAppState(), [popAppState]);
	useEscapeKey(handleBack);

	useEffect(() => {
		let cancelled = false;
		getLatestSeasonResults().then((result) => {
			if (cancelled) return;
			setSnapshot(result);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const rows = snapshot ? toLeaderboardRows(snapshot.boards[board], board) : [];

	return (
		<SimplePopupView style={[{ justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground }]}>
			<StylizedButton text={t("hs.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} />

			<Text style={[styles.header, { color: currentTheme.textPrimary }]}>
				{snapshot ? t("season.resultsTitle", { season: snapshot.seasonKey }) : t("hs.pastSeason")}
			</Text>

			<View style={styles.tabRow}>
				{SEASON_RESULT_BOARDS.map((id) => (
					<StylizedButton
						key={id}
						text={t(`perk.board.${id}`)}
						onClick={() => setBoard(id)}
						backgroundColor={board === id ? currentTheme.buttonPrimary : cssColors.spaceGray}
						style={styles.tabButton}
						textStyle={styles.tabButtonText}
					/>
				))}
			</View>

			{loading && <PixelLoader size="large" color={currentTheme.textPrimary} />}

			{!loading && !snapshot && (
				<Text style={[styles.emptyText, { color: currentTheme.textSecondary }]}>{t("season.noResults")}</Text>
			)}

			{!loading && snapshot && (
				<View style={styles.list}>
					{rows.map((row, index) => (
						<GlobalScoreRow key={`${board}-${index}`} rank={index + 1} score={row} highlightTop hideTime />
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
	header: {
		fontFamily: "Silkscreen",
		fontSize: 26,
		marginTop: 12,
		textAlign: "center",
	},
	tabRow: {
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		marginTop: 10,
		marginBottom: 6,
	},
	tabButton: {
		minWidth: 92,
		minHeight: 32,
		height: 32,
		paddingHorizontal: 8,
		paddingVertical: 4,
		margin: 0,
	},
	tabButtonText: {
		fontSize: 10,
	},
	list: {
		width: "94%",
		gap: 6,
		marginTop: 4,
	},
	emptyText: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
		marginTop: 20,
		paddingHorizontal: 10,
	},
});
