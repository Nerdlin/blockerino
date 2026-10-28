import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { ADAPTIVE_BOT, ADAPTIVE_BOT_ID, BotTier, CHESS_BOTS, ChessBotProfile, adaptiveBotElo, isBotUnlocked, nextBotToUnlock } from "@/constants/chess/BotRoster";
import { ChessProgress } from "@/constants/chess/ChessProgress";
import { ChessRatings } from "@/constants/chess/ChessRatingsApi";
import { isProvisional, PROVISIONAL_GAMES } from "@/constants/chess/ChessElo";
import { GameResult } from "@/constants/chess/ChessGameState";
import { Color } from "@/constants/chess/ChessClock";
import { TIME_CLASSES, TIME_CONTROLS, TimeControl, formatTimeControl } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";

export function ChessLobby({
	ratings,
	selected,
	onSelect,
	onPlayFriend,
	onPlayBots,
}: {
	ratings: ChessRatings;
	selected: TimeControl;
	onSelect: (control: TimeControl) => void;
	onPlayFriend: () => void;
	onPlayBots: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	return (
		<View style={local.screen}>
			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("chess.ratings")}</Text>
			<View style={local.row}>
				{TIME_CLASSES.map((timeClass) => {
					const entry = ratings[timeClass];
					const provisional = !entry || isProvisional(entry.games);
					return (
						<View key={timeClass} testID={`chess-rating-${timeClass}`} style={[local.card, { borderColor: selected.timeClass === timeClass ? currentTheme.accent : "rgba(255,255,255,0.18)" }]}>
							<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t(`chess.${timeClass}`)}</Text>
							<Text style={[local.big, { color: currentTheme.textPrimary }]}>{provisional ? "?" : entry!.rating}</Text>
							{provisional ? <Text style={[local.tiny, { color: currentTheme.textSecondary }]}>{t("chess.provisional", { n: Math.min(PROVISIONAL_GAMES, entry?.games ?? 0) })}</Text> : null}
						</View>
					);
				})}
			</View>

			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("chess.timeControl")}</Text>
			{TIME_CLASSES.map((timeClass) => (
				<View key={timeClass} style={local.row}>
					{TIME_CONTROLS.filter((control) => control.timeClass === timeClass).map((control) => {
						const on = control.id === selected.id;
						return (
							<Pressable
								key={control.id}
								testID={`chess-tc-${control.id}`}
								accessibilityRole="button"
								accessibilityState={{ selected: on }}
								accessibilityLabel={formatTimeControl(control)}
								onPress={() => onSelect(control)}
								style={[local.chip, { borderColor: on ? currentTheme.accent : "rgba(255,255,255,0.18)" }]}
							>
								<Text style={[local.chipText, { color: on ? currentTheme.accent : currentTheme.textPrimary }]}>{formatTimeControl(control)}</Text>
							</Pressable>
						);
					})}
				</View>
			))}

			<StylizedButton text={t("chess.playFriend")} onClick={onPlayFriend} backgroundColor="#1E88E5" style={local.button} textStyle={local.buttonText} />
			<StylizedButton text={t("chess.playBots")} onClick={onPlayBots} backgroundColor="#7B3FE4" style={local.button} textStyle={local.buttonText} />
		</View>
	);
}

const TIER_ORDER: BotTier[] = ["new", "beginner", "intermediate", "strong"];

export function BotPicker({
	progress,
	playerRating,
	onPick,
	onBack,
}: {
	progress: ChessProgress;
	playerRating: number;
	onPick: (bot: ChessBotProfile, color: Color | "random") => void;
	onBack: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const next = nextBotToUnlock(progress.beatenBots);
	const echoElo = adaptiveBotElo(playerRating, progress.form);
	const [choice, setChoice] = useState<Color | "random">("random");
	return (
		<View style={local.screen}>
			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("chess.color")}</Text>
			<View style={local.row}>
				{(["w", "random", "b"] as const).map((option) => (
					<Pressable
						key={option}
						testID={`chess-color-${option}`}
						accessibilityRole="button"
						accessibilityState={{ selected: choice === option }}
						onPress={() => setChoice(option)}
						style={[local.chip, { borderColor: choice === option ? currentTheme.accent : "rgba(255,255,255,0.18)" }]}
					>
						<Text style={[local.chipText, { color: choice === option ? currentTheme.accent : currentTheme.textPrimary }]}>
							{t(option === "w" ? "chess.white" : option === "b" ? "chess.black" : "chess.random")}
						</Text>
					</Pressable>
				))}
			</View>
			<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t("chess.chooseBot")}</Text>

			<Pressable
				testID="chess-bot-echo"
				accessibilityRole="button"
				onPress={() => onPick({ ...ADAPTIVE_BOT, elo: echoElo }, choice)}
				style={[local.botRow, { borderColor: currentTheme.accent }]}
			>
				<View style={[local.avatar, { backgroundColor: ADAPTIVE_BOT.color }]} />
				<View style={{ flex: 1 }}>
					<Text style={[local.botName, { color: currentTheme.textPrimary }]}>{ADAPTIVE_BOT.name} · {t("chess.adaptive")}</Text>
					<Text style={[local.tiny, { color: currentTheme.textSecondary }]}>{t("chess.eloValue", { elo: echoElo })} · {t("chess.adaptiveHint")}</Text>
				</View>
			</Pressable>

			{TIER_ORDER.map((tier) => (
				<View key={tier} style={{ width: "100%" }}>
					<Text style={[local.label, { color: currentTheme.textSecondary }]}>{t(`chess.tier.${tier}`)}</Text>
					{CHESS_BOTS.filter((bot) => bot.tier === tier).map((bot) => {
						const open = isBotUnlocked(bot.id, progress.beatenBots);
						return (
							<Pressable
								key={bot.id}
								testID={`chess-bot-${bot.id}`}
								accessibilityRole="button"
								accessibilityState={{ disabled: !open }}
								disabled={!open}
								onPress={() => onPick(bot, choice)}
								style={[local.botRow, { opacity: open ? 1 : 0.45, borderColor: "rgba(255,255,255,0.18)" }]}
							>
								<View style={[local.avatar, { backgroundColor: open ? bot.color : "#2A2A3C" }]} />
								<View style={{ flex: 1 }}>
									<Text style={[local.botName, { color: currentTheme.textPrimary }]}>{bot.name}</Text>
									<Text style={[local.tiny, { color: currentTheme.textSecondary }]}>
										{open ? t("chess.eloValue", { elo: bot.elo }) : t("chess.locked")}
									</Text>
								</View>
								{progress.beatenBots.includes(bot.id) ? <Text style={[local.tiny, { color: "#2E9E4F" }]}>OK</Text> : null}
							</Pressable>
						);
					})}
				</View>
			))}

			<Text style={[local.tiny, { color: currentTheme.textSecondary, marginTop: 10, textAlign: "center" }]}>
				{next ? t("chess.unlockHint", { name: next.mustBeat.name }) : t("chess.allUnlocked")}
			</Text>
			<Text style={[local.tiny, { color: currentTheme.textSecondary, textAlign: "center", marginTop: 4 }]}>{t("chess.botsUnrated")}</Text>
			<StylizedButton text={t("chess.back")} onClick={onBack} backgroundColor={currentTheme.buttonSecondary} style={local.button} textStyle={local.buttonText} />
		</View>
	);
}

export function ChessResultCard({
	result,
	myColor,
	opponentName,
	extraLines,
	ratingLine,
	onRematch,
	onNewGame,
	onCopyPgn,
	newGameLabel,
}: {
	result: GameResult;
	myColor: Color;
	opponentName: string;
	extraLines?: string[];
	/** "Blitz rating  1196 (+16)" or the unrated note. */
	ratingLine?: string;
	onRematch?: () => void;
	onNewGame: () => void;
	onCopyPgn: () => void;
	newGameLabel?: string;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const title =
		result.winner === null ? t("chess.aborted")
		: result.winner === "draw" ? t("chess.drawn")
		: result.winner === myColor ? t("chess.won")
		: t("chess.lost");
	const tone = result.winner === null || result.winner === "draw" ? currentTheme.textPrimary : result.winner === myColor ? "#2E9E4F" : "#F87171";
	return (
		<View testID="chess-result" style={[local.result, { borderColor: tone }]}>
			<Text style={[local.resultTitle, { color: tone }]}>{title}</Text>
			<Text style={[local.small, { color: currentTheme.textSecondary }]}>{t(`chess.reason.${result.reason}`)} · {opponentName}</Text>
			{ratingLine ? <Text style={[local.big, { color: currentTheme.textPrimary, marginTop: 8 }]}>{ratingLine}</Text> : null}
			{(extraLines ?? []).map((line) => (
				<Text key={line} style={[local.small, { color: currentTheme.accent, marginTop: 4 }]}>{line}</Text>
			))}
			<View style={local.row}>
				{onRematch ? <StylizedButton text={t("chess.rematch")} onClick={onRematch} backgroundColor="#2E9E4F" style={local.button} textStyle={local.buttonText} /> : null}
				<StylizedButton text={newGameLabel ?? t("chess.newGame")} onClick={onNewGame} backgroundColor="#1E88E5" style={local.button} textStyle={local.buttonText} />
				<StylizedButton text={t("chess.pgn")} onClick={onCopyPgn} backgroundColor={currentTheme.buttonSecondary} style={local.button} textStyle={local.buttonText} />
			</View>
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", maxWidth: 360, alignItems: "stretch", gap: 6 },
	label: { fontFamily: "Silkscreen", fontSize: 10, marginTop: 8, marginBottom: 2 },
	row: { flexDirection: "row", gap: 6, justifyContent: "center", flexWrap: "wrap" },
	card: { flex: 1, borderWidth: 2, borderRadius: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center" },
	small: { fontFamily: "Silkscreen", fontSize: 10, textAlign: "center" },
	big: { fontFamily: "SilkscreenBold", fontSize: 16, textAlign: "center" },
	tiny: { fontFamily: "Silkscreen", fontSize: 9 },
	chip: { flex: 1, borderWidth: 2, borderRadius: 6, paddingVertical: 8, alignItems: "center" },
	chipText: { fontFamily: "SilkscreenBold", fontSize: 11 },
	button: { minWidth: 110, height: 38, minHeight: 38, margin: 0, marginTop: 8, paddingHorizontal: 12 },
	buttonText: { fontSize: 12 },
	botRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderRadius: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.04)", marginBottom: 4 },
	avatar: { width: 30, height: 30, borderRadius: 4 },
	botName: { fontFamily: "SilkscreenBold", fontSize: 12 },
	result: { width: "100%", maxWidth: 336, borderWidth: 2, borderRadius: 10, padding: 14, marginTop: 10, alignItems: "center", backgroundColor: "rgba(5,5,16,0.9)" },
	resultTitle: { fontFamily: "SilkscreenBold", fontSize: 18, marginBottom: 2 },
});
