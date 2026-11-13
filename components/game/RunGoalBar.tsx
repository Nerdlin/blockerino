import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { SharedValue, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { GameModeType } from "@/hooks/useAppState";
import { getHighScores } from "@/constants/Storage";
import { getFriendsAllTimeLeaderboard } from "@/constants/SeasonScores";
import { buildRunGoals, getCurrentGoal, FriendBest, RunGoal, RunGoalKind } from "@/constants/RunGoals";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useTheme } from "@/constants/Theme";
import { track } from "@/constants/Analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOAL_COLORS: Record<RunGoalKind, string> = {
	bronze: "#CD7F32",
	silver: "#C9D1D9",
	gold: "#FFD700",
	record: "#F0AF0C",
	friend: "#5AC8FA",
};

/** A small round medal (or a marker for the record / a friend). */
export function MedalBadge({ kind, size = 12 }: { kind: RunGoalKind; size?: number }) {
	const color = GOAL_COLORS[kind];
	return (
		<View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: Math.max(1, Math.round(size / 6)), borderColor: "rgba(0,0,0,0.45)" }} />
	);
}

const FLASH_MS = 1800;

/**
 * The line above the board: the nearest goal of the run ("Bronze — 340 to go") with a progress bar. Passing a goal
 * flashes its name and moves on to the next one.
 */
export default function RunGoalBar({ gameMode, score, initialScore, width }: { gameMode: GameModeType; score: SharedValue<number>; initialScore: number; width: number }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const { playSfx } = useSoundSettings();
	const [previousBest, setPreviousBest] = useState(0);
	const [friends, setFriends] = useState<FriendBest[]>([]);
	const [points, setPoints] = useState(Math.floor(initialScore));
	const [flash, setFlash] = useState<RunGoal | null>(null);
	const passedIndex = useRef<number | null>(null);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pulse = useSharedValue(1);

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				// The list may already hold this run; a continued run that is itself the best has no record to chase.
				const best = (await getHighScores(gameMode, true, true, 1))[0]?.score ?? 0;
				if (active && best > initialScore) setPreviousBest(best);
			} catch {}
			try {
				if (gameMode !== GameModeType.Classic && gameMode !== GameModeType.Chaos) return;
				const [rows, ownName] = await Promise.all([getFriendsAllTimeLeaderboard(gameMode), AsyncStorage.getItem("PLAYER_NAME")]);
				// the list holds the player too
				const others = rows.filter((row) => row.player_name !== (ownName ?? "").trim());
				if (active) setFriends(others.map((row) => ({ name: row.player_name, score: row.score })));
			} catch {}
		})();
		return () => {
			active = false;
			if (flashTimer.current) clearTimeout(flashTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gameMode]);

	useAnimatedReaction(() => Math.floor(score.value), (current, previous) => {
		if (current !== previous) runOnJS(setPoints)(current);
	});

	const goals = useMemo(() => buildRunGoals(gameMode, previousBest, friends), [gameMode, previousBest, friends]);
	const current = getCurrentGoal(goals, points);
	const reachedIndex = current ? current.index : goals.length;
	const goalsRef = useRef(goals);

	useEffect(() => {
		// goals already behind when the list is built (a continued run, the record or friends loading late) are not celebrated
		if (goalsRef.current !== goals || passedIndex.current === null || reachedIndex < passedIndex.current) {
			goalsRef.current = goals;
			passedIndex.current = reachedIndex;
			return;
		}
		if (reachedIndex === passedIndex.current) return;
		const passed = goals[reachedIndex - 1];
		passedIndex.current = reachedIndex;
		if (!passed) return;
		setFlash(passed);
		playSfx("achievement");
		track("run_goal_passed", { mode: gameMode, goal: passed.kind, score: passed.score });
		pulse.value = withSequence(withTiming(1.25, { duration: 160 }), withTiming(1, { duration: 220 }));
		if (flashTimer.current) clearTimeout(flashTimer.current);
		flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reachedIndex, goals]);

	const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

	const goalLabel = (goal: RunGoal) => (goal.kind === "friend" ? t("goals.friend", { name: goal.name ?? "" }) : t(`goals.${goal.kind}`));

	let content: React.ReactNode;
	let progress = 1;
	let barColor = GOAL_COLORS.gold;
	if (flash) {
		barColor = GOAL_COLORS[flash.kind];
		content = (
			<Animated.View style={[styles.row, pulseStyle]}>
				<MedalBadge kind={flash.kind} />
				<Text style={[styles.text, { color: barColor }]} numberOfLines={1}>
					{flash.kind === "friend" ? t("goals.passed.friend", { name: flash.name ?? "" }) : t(`goals.passed.${flash.kind}`)}
				</Text>
			</Animated.View>
		);
	} else if (current) {
		barColor = GOAL_COLORS[current.goal.kind];
		progress = Math.max(0, Math.min(1, (points - current.from) / Math.max(1, current.goal.score - current.from)));
		content = (
			<View style={styles.row}>
				<MedalBadge kind={current.goal.kind} />
				<Text style={[styles.text, { color: currentTheme.textPrimary }]} numberOfLines={1}>
					{goalLabel(current.goal)}
				</Text>
				<Text style={[styles.text, { color: currentTheme.textSecondary }]} numberOfLines={1}>
					{t("goals.left", { points: current.goal.score - points })}
				</Text>
			</View>
		);
	} else {
		content = (
			<View style={styles.row}>
				<MedalBadge kind="gold" />
				<Text style={[styles.text, { color: GOAL_COLORS.gold }]} numberOfLines={1}>{t("goals.done")}</Text>
			</View>
		);
	}

	return (
		<View style={[styles.wrapper, { width }]} testID="run-goal-bar">
			{content}
			<View style={styles.track}>
				<View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barColor }]} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		alignSelf: "center",
		alignItems: "center",
		marginBottom: 4,
		pointerEvents: "none",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		height: 16,
	},
	text: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	track: {
		width: "100%",
		height: 3,
		marginTop: 2,
		backgroundColor: "rgba(255,255,255,0.12)",
	},
	fill: {
		height: 3,
	},
});
