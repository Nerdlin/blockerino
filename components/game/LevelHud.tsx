import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SharedValue, runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { LevelDef, levelGoalProgress } from "@/constants/Levels";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";

/** Above the board in a level: the goal with its progress, and the moves or seconds left. */
export default function LevelHud({ level, score, lines, bestCombo, gemsLeft, movesRemaining, timeRemaining, width }: {
	level: LevelDef;
	score: SharedValue<number>;
	lines: SharedValue<number>;
	bestCombo: SharedValue<number>;
	gemsLeft: SharedValue<number>;
	movesRemaining: SharedValue<number>;
	timeRemaining: SharedValue<number>;
	width: number;
}) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const [run, setRun] = useState({ score: 0, lines: 0, bestCombo: 0, gemsLeft: level.gems, left: level.moves ?? level.time ?? 0 });

	useAnimatedReaction(
		() => ({
			score: Math.floor(score.value),
			lines: lines.value,
			bestCombo: bestCombo.value,
			gemsLeft: gemsLeft.value,
			left: Math.ceil(level.moves !== undefined ? movesRemaining.value : timeRemaining.value),
		}),
		(now, before) => {
			if (!before || now.score !== before.score || now.lines !== before.lines || now.bestCombo !== before.bestCombo || now.gemsLeft !== before.gemsLeft || now.left !== before.left) {
				runOnJS(setRun)(now);
			}
		},
	);

	const [done, needed] = levelGoalProgress(level, run);
	const goalText = t(`levels.goal.${level.goal.kind}`, { target: needed });
	const limitText = level.moves !== undefined ? t("levels.movesLeft", { count: run.left }) : t("levels.timeLeft", { seconds: run.left });
	const lowLimit = run.left <= Math.max(3, Math.round((level.moves ?? level.time ?? 0) * 0.2));

	return (
		<View style={[styles.wrap, { width }]} testID="level-hud">
			<View style={styles.row}>
				<Text style={[styles.level, { color: currentTheme.accent }]}>{t("levels.levelN", { id: level.id })}</Text>
				<Text style={[styles.limit, { color: lowLimit ? "#FF5A66" : currentTheme.textPrimary }]}>{limitText}</Text>
			</View>
			<View style={styles.row}>
				<Text style={[styles.goal, { color: currentTheme.textPrimary }]} numberOfLines={1}>{goalText}</Text>
				<Text style={[styles.goal, { color: "#FFD700" }]}>{done}/{needed}</Text>
			</View>
			<View style={styles.track}>
				<View style={[styles.fill, { width: `${Math.round((done / Math.max(1, needed)) * 100)}%` }]} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignSelf: "center",
		marginBottom: 4,
		gap: 2,
		pointerEvents: "none",
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	level: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
	limit: {
		fontFamily: "Silkscreen",
		fontSize: 12,
	},
	goal: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	track: {
		height: 4,
		backgroundColor: "rgba(255,255,255,0.12)",
	},
	fill: {
		height: 4,
		backgroundColor: "#FFD700",
	},
});
