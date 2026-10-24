import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import FadeInView from "./FadeInView";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { GameRecords, RECORDED_GAME_IDS, emptyGameRecord, gamesPlayed, getGameRecords } from "@/constants/GameStats";

// "My record": wins, losses and draws per game, people and bots counted apart. Only games that were played show up.
export default function GameRecordsCard() {
	const [records, setRecords] = useState<GameRecords | null>(null);

	useEffect(() => {
		let active = true;
		void getGameRecords().then((next) => {
			if (active) setRecords(next);
		});
		return () => {
			active = false;
		};
	}, []);

	if (!records) return null;
	return <GameRecordsView records={records} />;
}

/** The record table for any set of records (mine, or another player's on their profile). */
export function GameRecordsView({ records, title, emptyText }: { records: GameRecords; title?: string; emptyText?: string }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const played = RECORDED_GAME_IDS.filter((id) => gamesPlayed(records[id] ?? emptyGameRecord()) > 0);

	return (
		<View style={[styles.card, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
			<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{title ?? t("record.title")}</Text>
			{played.length === 0 ? (
				<Text style={[styles.empty, { color: currentTheme.textSecondary }]}>{emptyText ?? t("record.empty")}</Text>
			) : (
				<>
					<View style={styles.row}>
						<Text style={[styles.game, styles.head, { color: currentTheme.textSecondary }]} />
						<Text style={[styles.cell, styles.head, { color: currentTheme.textSecondary }]}>{t("record.people")}</Text>
						<Text style={[styles.cell, styles.head, { color: currentTheme.textSecondary }]}>{t("record.bots")}</Text>
					</View>
					{played.map((id, index) => {
						const record = records[id] ?? emptyGameRecord();
						return (
							<FadeInView key={id} index={index} style={styles.row}>
								<Text style={[styles.game, { color: currentTheme.textPrimary }]} numberOfLines={1}>
									{id === "versus" ? t("record.versus") : t(`moregames.label.${id}`)}
								</Text>
								<Text style={[styles.cell, { color: currentTheme.accent }]}>
									{record.wins}-{record.losses}-{record.draws}
								</Text>
								<Text style={[styles.cell, { color: currentTheme.accent }]}>
									{record.botWins}-{record.botLosses}-{record.botDraws}
								</Text>
							</FadeInView>
						);
					})}
					<Text style={[styles.legend, { color: currentTheme.textSecondary }]}>{t("record.legend")}</Text>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: 10,
		borderWidth: 2,
		borderRadius: 10,
		marginTop: 10,
		gap: 6,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 13,
	},
	empty: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
	},
	game: {
		flex: 1.4,
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	cell: {
		flex: 1,
		textAlign: "right",
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	head: {
		fontSize: 9,
	},
	legend: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
		marginTop: 2,
	},
});
