import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSetAtom } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import FadeInView from "./FadeInView";
import { LevelDef, currentLevelAtom, nextLevel } from "@/constants/Levels";
import { recordLevelWin } from "@/constants/LevelProgress";
import { GameModeType, MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { useLanguage } from "@/constants/Localization";
import { useTheme, opaqueColor } from "@/constants/Theme";
import { useSoundSettings } from "@/constants/Sound";

/** End of a level: won with 1-3 stars (saved) or lost, with Next / Retry / Map. */
export default function LevelResultModal({ level, won, stars, score }: { level: LevelDef; won: boolean; stars: number; score: number }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { playSfx } = useSoundSettings();
	const [setAppState, appendAppState] = useSetAppState();
	const setLevel = useSetAtom(currentLevelAtom);
	const [best, setBest] = useState(stars);
	const next = nextLevel(level);

	useEffect(() => {
		playSfx(won ? "achievement" : "gameOver");
		if (won) void recordLevelWin(level.id, stars).then(setBest);
		// once per finished level
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// restart the game screen: back to the map, then into the level again
	const play = (id: string) => {
		playSfx("menuClick");
		setLevel(id);
		// leave the game screen first so the next level starts from a fresh board
		setAppState(MenuStateType.MENU);
		setTimeout(() => setAppState(GameModeType.Level), 50);
	};
	const toMap = () => {
		playSfx("menuClick");
		setAppState(MenuStateType.MENU);
		setTimeout(() => appendAppState(MenuStateType.DAILY_CHALLENGES), 50);
	};

	return (
		<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground) }]}>
			<Text style={[styles.title, { color: won ? "#FFD700" : "#FF5A66" }]}>{t(won ? "levels.won" : "levels.lost")}</Text>
			<Text style={[styles.sub, { color: currentTheme.textSecondary }]}>{t("levels.levelN", { id: level.id })}</Text>
			{won && (
				<View style={styles.stars}>
					{[1, 2, 3].map((n) => (
						<FadeInView key={n} pop delay={250 * n}>
							<Text style={[styles.star, { color: n <= stars ? "#FFD700" : "rgba(255,255,255,0.18)" }]}>★</Text>
						</FadeInView>
					))}
				</View>
			)}
			<Text style={[styles.sub, { color: currentTheme.textPrimary }]}>{t("levels.score", { score })}</Text>
			{won && best > stars && <Text style={[styles.sub, { color: currentTheme.textSecondary }]}>{t("levels.bestStars", { stars: best })}</Text>}
			{!won && <Text style={[styles.sub, { color: currentTheme.textSecondary }]}>{t("levels.lostHint")}</Text>}
			<View style={styles.buttons}>
				{won && next && <StylizedButton text={t("levels.next")} onClick={() => play(next.id)} backgroundColor={currentTheme.buttonPrimary} />}
				<StylizedButton text={t("levels.retry")} onClick={() => play(level.id)} backgroundColor={won ? currentTheme.buttonSecondary : currentTheme.buttonPrimary} />
				<StylizedButton text={t("levels.map")} onClick={toMap} backgroundColor={currentTheme.buttonSecondary} />
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	title: {
		fontFamily: "Silkscreen",
		fontSize: 28,
		textAlign: "center",
		marginBottom: 6,
	},
	sub: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		textAlign: "center",
		marginBottom: 6,
	},
	stars: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 10,
		marginVertical: 10,
	},
	star: {
		fontSize: 48,
	},
	buttons: {
		gap: 8,
		alignItems: "center",
		marginTop: 12,
	},
});
