import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { Color, remainingMs, autoAbortLeftMs } from "@/constants/chess/ChessClock";
import { ChessGameState, boardOf, canAbort, fenAfter, isPromotionMove, turnOf } from "@/constants/chess/ChessGameState";
import { formatClock } from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";
import { BotLook } from "@/constants/chess/BotSprites";
import { ExtraGameCosmetics } from "../cosmetics";
import { BotAvatar } from "./BotAvatar";
import { ChessBoard, MoveStrip, PlayerBar, PromotionPicker } from "./ChessParts";

export interface PlayerInfo {
	name: string;
	rating?: string;
	color: string;
	look?: BotLook;
}

/**
 * The playing screen, shared by bot games and friend games: both players' bars with clocks, the board, the move list
 * with back/forward, a speech bubble for bots and the menu (draw, resign, flip, PGN). It owns only what is on screen
 * (selection, the pending promotion, the viewed move); the game itself lives in `state` and changes through callbacks.
 */
export function ChessGameView({
	state,
	myColor,
	me,
	opponent,
	cosmetics,
	now,
	bubble,
	hint,
	statusText,
	friendGame,
	onMove,
	onResign,
	onAbort,
	onOfferDraw,
	onAnswerDraw,
	onCopyPgn,
	extraActions,
}: {
	state: ChessGameState;
	myColor: Color;
	me: PlayerInfo;
	opponent: PlayerInfo;
	cosmetics: ExtraGameCosmetics;
	/** A ticking timestamp: the parent re-renders about ten times a second while a clock runs. */
	now: number;
	bubble?: string | null;
	hint?: { from: string; to: string } | null;
	statusText?: string;
	/** Draw offers only make sense against a person. */
	friendGame: boolean;
	onMove: (from: string, to: string, promotion?: string) => void;
	onResign: () => void;
	onAbort: () => void;
	onOfferDraw: () => void;
	onAnswerDraw: (accept: boolean) => void;
	onCopyPgn: () => void;
	extraActions?: React.ReactNode;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [selected, setSelected] = useState<string | null>(null);
	const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [flipped, setFlipped] = useState(myColor === "b");
	const [viewPly, setViewPly] = useState<number | null>(null);

	const plies = state.history.length;
	const live = viewPly === null || viewPly >= plies;
	const shownPly = live ? plies : Math.max(0, viewPly);
	const shownFen = live ? state.fen : fenAfter(state, shownPly);

	// A new move snaps the view back to the live position and drops any half-made selection.
	useEffect(() => {
		setViewPly(null);
		setSelected(null);
		setPending(null);
	}, [plies]);
	useEffect(() => setFlipped(myColor === "b"), [myColor]);

	const game = useMemo(() => boardOf(state), [state]);
	const myTurn = !state.result && turnOf(state) === myColor;
	const targets = selected && live ? (game.moves({ square: selected as never, verbose: true }) as unknown as { to: string }[]).map((move) => move.to) : [];
	const lastMove = shownPly > 0 ? state.moves[shownPly - 1] ?? null : null;

	const press = (square: string) => {
		if (!live || !myTurn || pending) return;
		const piece = new Chess(state.fen).get(square as never);
		if (!selected || piece?.color === myColor) {
			if (piece?.color === myColor) setSelected(selected === square ? null : square);
			return;
		}
		if (isPromotionMove(state, selected, square)) {
			setPending({ from: selected, to: square });
			return;
		}
		onMove(selected, square);
		setSelected(null);
	};

	const left = state.clock ? remainingMs(state.clock, now) : null;
	const topColor: Color = myColor === "w" ? "b" : "w";
	const clockOf = (color: Color) => (left ? formatClock(color === "w" ? left.whiteMs : left.blackMs) : undefined);
	const lowOf = (color: Color) => (left ? (color === "w" ? left.whiteMs : left.blackMs) < 15000 : false);
	const abortLeft = state.clock ? autoAbortLeftMs(state.clock, state.startedAt, now) : null;
	const running = state.clock?.running ? state.clock.turn : null;

	const offerIncoming = state.drawOfferFrom !== null && state.drawOfferFrom !== myColor;
	const offerSent = state.drawOfferFrom === myColor;

	return (
		<View style={local.root}>
			{bubble ? (
				<View style={local.bubbleRow}>
					{opponent.look ? <BotAvatar look={opponent.look} color={opponent.color} size={44} /> : <View style={[local.bubbleAvatar, { backgroundColor: opponent.color }]} />}
					<View style={local.bubble}><Text style={local.bubbleText}>{bubble}</Text></View>
				</View>
			) : null}

			<PlayerBar name={opponent.name} rating={opponent.rating} color={opponent.color} look={opponent.look} clock={clockOf(topColor)} active={running === topColor} low={lowOf(topColor)} />
			<ChessBoard fen={shownFen} flipped={flipped} selected={live ? selected : null} legalTargets={targets} lastMove={lastMove} hint={live ? hint ?? null : null} cosmetics={cosmetics} onPressSquare={press} />
			<PlayerBar name={me.name} rating={me.rating} color={me.color} clock={clockOf(myColor)} active={running === myColor} low={lowOf(myColor)} />

			{pending ? (
				<PromotionPicker
					color={myColor}
					cosmetics={cosmetics}
					label={t("chess.promote")}
					onPick={(piece) => {
						onMove(pending.from, pending.to, piece);
						setPending(null);
						setSelected(null);
					}}
				/>
			) : null}

			{abortLeft !== null && state.history.length === 0 ? (
				<Text style={[local.notice, { color: currentTheme.accent }]}>{t("chess.autoAbort", { s: Math.ceil(abortLeft / 1000) })}</Text>
			) : null}
			{statusText ? <Text style={[local.notice, { color: currentTheme.textSecondary }]}>{statusText}</Text> : null}

			<View style={local.stepRow}>
				<Pressable testID="chess-step-back" accessibilityRole="button" accessibilityLabel="back" onPress={() => setViewPly(Math.max(0, shownPly - 1))} disabled={shownPly === 0} style={local.step}>
					<Text style={[local.stepText, { color: shownPly === 0 ? currentTheme.textSecondary : currentTheme.textPrimary }]}>{"<"}</Text>
				</Pressable>
				<View style={{ flex: 1 }}><MoveStrip history={state.history} viewPly={shownPly} /></View>
				<Pressable testID="chess-step-forward" accessibilityRole="button" accessibilityLabel="forward" onPress={() => setViewPly(shownPly + 1 >= plies ? null : shownPly + 1)} disabled={live} style={local.step}>
					<Text style={[local.stepText, { color: live ? currentTheme.textSecondary : currentTheme.textPrimary }]}>{">"}</Text>
				</Pressable>
			</View>

			{offerIncoming && !state.result ? (
				<View style={local.offer}>
					<Text style={[local.offerText, { color: currentTheme.textPrimary }]}>{t("chess.drawOffered", { name: opponent.name })}</Text>
					<View style={local.row}>
						<StylizedButton text={t("chess.accept")} onClick={() => onAnswerDraw(true)} backgroundColor="#2E9E4F" style={local.smallButton} textStyle={local.smallText} />
						<StylizedButton text={t("chess.decline")} onClick={() => onAnswerDraw(false)} backgroundColor={currentTheme.buttonSecondary} style={local.smallButton} textStyle={local.smallText} />
					</View>
				</View>
			) : null}
			{offerSent && !state.result ? <Text style={[local.notice, { color: currentTheme.textSecondary }]}>{t("chess.drawSent")}</Text> : null}

			{!state.result ? (
				<View style={local.row}>
					<StylizedButton text={t("chess.menu")} onClick={() => setMenuOpen((open) => !open)} backgroundColor={currentTheme.buttonSecondary} style={local.smallButton} textStyle={local.smallText} />
					{canAbort(state) ? (
						<StylizedButton text={t("chess.abort")} onClick={onAbort} backgroundColor="#B91C1C" style={local.smallButton} textStyle={local.smallText} />
					) : (
						<StylizedButton text={t("chess.resign")} onClick={onResign} backgroundColor="#B91C1C" style={local.smallButton} textStyle={local.smallText} />
					)}
					{extraActions}
				</View>
			) : null}

			{menuOpen && !state.result ? (
				<View style={[local.menu, { borderColor: currentTheme.textSecondary }]}>
					{friendGame && !offerSent && !offerIncoming && !canAbort(state) ? (
						<MenuItem testID="chess-menu-draw" label={t("chess.offerDraw")} onPress={() => { onOfferDraw(); setMenuOpen(false); }} />
					) : null}
					<MenuItem testID="chess-menu-flip" label={t("chess.flip")} onPress={() => { setFlipped((value) => !value); setMenuOpen(false); }} />
					<MenuItem testID="chess-menu-pgn" label={t("chess.pgn")} onPress={() => { onCopyPgn(); setMenuOpen(false); }} />
				</View>
			) : null}
		</View>
	);
}

function MenuItem({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
	const { currentTheme } = useTheme();
	return (
		<Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.menuItem}>
			<Text style={[local.menuText, { color: currentTheme.textPrimary }]}>{label}</Text>
		</Pressable>
	);
}

const local = StyleSheet.create({
	root: { width: "100%", alignItems: "center" },
	bubbleRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 336, marginBottom: 4 },
	bubbleAvatar: { width: 34, height: 34, borderRadius: 4 },
	bubble: { flex: 1, backgroundColor: "#E8E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
	bubbleText: { fontFamily: "Silkscreen", fontSize: 10, color: "#101018", lineHeight: 14 },
	notice: { fontFamily: "Silkscreen", fontSize: 10, marginTop: 6, textAlign: "center" },
	stepRow: { flexDirection: "row", alignItems: "center", width: "100%", maxWidth: 336, marginTop: 4 },
	step: { paddingHorizontal: 12, paddingVertical: 6 },
	stepText: { fontFamily: "SilkscreenBold", fontSize: 16 },
	row: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" },
	smallButton: { minWidth: 88, height: 34, minHeight: 34, margin: 0, paddingHorizontal: 10 },
	smallText: { fontSize: 11 },
	offer: { alignItems: "center", marginTop: 8, gap: 2 },
	offerText: { fontFamily: "SilkscreenBold", fontSize: 11 },
	menu: { marginTop: 8, borderWidth: 1.5, borderRadius: 8, width: "100%", maxWidth: 260, backgroundColor: "rgba(5,5,16,0.92)" },
	menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
	menuText: { fontFamily: "Silkscreen", fontSize: 11 },
});
