import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { Color } from "@/constants/chess/ChessClock";
import { cancelQuickMatch, quickMatchStep } from "@/constants/chess/ChessRatingsApi";
import { TimeControl, formatTimeControl, parseTimeControl } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";

export interface FoundMatch {
	code: string;
	color: Color;
	opponent: string;
	control: TimeControl;
}

const STEP_MS = 2000;
const GIVE_UP_AFTER_FAILURES = 3;

/**
 * Looks for a random opponent for the chosen time control: asks the server every two seconds (which also keeps the
 * player in the queue) and hands the match over as soon as there is one. Leaving the screen leaves the queue.
 */
export function ChessSearch({ control, onMatched, onCancel }: { control: TimeControl; onMatched: (match: FoundMatch) => void; onCancel: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [waited, setWaited] = useState(0);
	const [problem, setProblem] = useState<"signIn" | "unavailable" | null>(null);
	const matchedRef = useRef(false);
	const onMatchedRef = useRef(onMatched);
	useEffect(() => { onMatchedRef.current = onMatched; }, [onMatched]);

	useEffect(() => {
		let active = true;
		let failures = 0;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const step = async () => {
			const result = await quickMatchStep(control.id);
			if (!active) return;
			if (result.status === "matched") {
				const matchControl = parseTimeControl(result.control) ?? control;
				matchedRef.current = true;
				active = false;
				onMatchedRef.current({ code: result.code, color: result.color, opponent: result.opponent, control: matchControl });
				return;
			}
			if (result.status === "unauthenticated" || result.status === "no_profile") {
				setProblem("signIn");
				return;
			}
			if (result.status === "searching") {
				failures = 0;
				setWaited(result.waited);
			} else {
				failures += 1;
				if (failures >= GIVE_UP_AFTER_FAILURES) {
					setProblem("unavailable");
					return;
				}
			}
			timer = setTimeout(() => void step(), STEP_MS);
		};
		void step();
		return () => {
			active = false;
			if (timer) clearTimeout(timer);
			if (!matchedRef.current) void cancelQuickMatch();
		};
	}, [control]);

	return (
		<View style={local.box} testID="chess-search">
			<Text style={[local.title, { color: currentTheme.textPrimary }]}>{problem ? t(problem === "signIn" ? "chess.signInToPlay" : "chess.searchUnavailable") : t("chess.searching")}</Text>
			{!problem ? (
				<>
					<Text style={[local.hint, { color: currentTheme.textSecondary }]}>{t("chess.searchHint", { control: formatTimeControl(control) })}</Text>
					<Text style={[local.timer, { color: currentTheme.accent }]}>{`${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, "0")}`}</Text>
				</>
			) : null}
			<StylizedButton text={problem ? t("chess.back") : t("chess.cancel")} onClick={onCancel} backgroundColor={currentTheme.buttonSecondary} style={local.button} textStyle={{ fontSize: 12 }} />
		</View>
	);
}

const local = StyleSheet.create({
	box: { width: "100%", maxWidth: 336, alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 12 },
	title: { fontFamily: "SilkscreenBold", fontSize: 13, textAlign: "center", lineHeight: 20 },
	hint: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center" },
	timer: { fontFamily: "SilkscreenBold", fontSize: 22, marginTop: 6 },
	button: { minWidth: 120, height: 38, minHeight: 38, margin: 0, marginTop: 14 },
});
