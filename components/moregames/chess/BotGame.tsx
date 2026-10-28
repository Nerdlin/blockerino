import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, View } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { chooseChessMoveByElo } from "@/constants/bots/ChessBot";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { ADAPTIVE_BOT_ID, CHESS_BOTS, ChessBotProfile, botQuip, QuipKind } from "@/constants/chess/BotRoster";
import { Color } from "@/constants/chess/ChessClock";
import { ChessGameState, abort, newGame, playMove, resign, turnOf } from "@/constants/chess/ChessGameState";
import { buildPgn, resultFromWinner } from "@/constants/chess/ChessPgn";
import { FormResult, recordBotGame } from "@/constants/chess/ChessProgress";
import StylizedButton from "../../StylizedButton";
import { ExtraGameCosmetics } from "../cosmetics";
import { HintButton } from "../HintButton";
import { ChessGameView } from "./ChessGameView";
import { ChessResultCard } from "./ChessScreens";

/**
 * A game against one bot. No clock; hint (paid, like the other games) and undo are allowed because nothing is rated.
 * The bot talks: a line when the game starts, now and then after moves, and when the game ends.
 */
export function BotGame({
	bot,
	color,
	playerName,
	cosmetics,
	beatenBefore,
	onExit,
	onProgress,
}: {
	bot: ChessBotProfile;
	color: Color;
	playerName: string;
	cosmetics: ExtraGameCosmetics;
	/** Whether this bot was already beaten when the game started: only a first win opens the next bot. */
	beatenBefore: boolean;
	onExit: () => void;
	/** Called after a result was saved, so the picker can show a freshly unlocked bot. */
	onProgress: () => void;
}) {
	const { t, language } = useLanguage();
	const { currentTheme } = useTheme();
	const lang = language === "ru" ? "ru" : "en";
	const [state, setState] = useState<ChessGameState>(() => newGame(null, Date.now()));
	const [bubble, setBubble] = useState<string | null>(() => botQuip(bot, "greeting", lang));
	const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
	const [unlockedLine, setUnlockedLine] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const botColor: Color = color === "w" ? "b" : "w";
	const savedRef = useRef<string | null>(null);
	const startedRef = useRef(Date.now());

	const say = useCallback((kind: QuipKind) => setBubble(botQuip(bot, kind, lang)), [bot, lang]);

	// The bot answers after a short pause (and moves first when the player has Black).
	const botToMove = !state.result && turnOf(state) === botColor;
	useEffect(() => {
		if (!botToMove) return;
		const timer = setTimeout(() => {
			const reply = chooseChessMoveByElo(state.fen, bot.elo);
			if (!reply) return;
			const outcome = playMove(state, reply, Date.now());
			if (!outcome.ok) return;
			setState(outcome.state);
			const last = outcome.state.moves[outcome.state.moves.length - 1];
			if (outcome.state.result) return;
			if (last.san.includes("+")) say("check");
			else if (last.san.includes("x") && Math.random() < 0.6) say("capture");
		}, 600);
		return () => clearTimeout(timer);
	}, [botToMove, state, bot.elo, say]);

	const onMove = (from: string, to: string, promotion?: string) => {
		const outcome = playMove(state, { from, to, promotion }, Date.now());
		if (!outcome.ok) return;
		setHint(null);
		setState(outcome.state);
		const last = outcome.state.moves[outcome.state.moves.length - 1];
		if (!outcome.state.result && Math.random() < 0.3) say(last.san.includes("x") ? "capture" : "playerMove");
	};

	// Save the result once: achievements, the beaten-bots list and the adaptive bot's form.
	useEffect(() => {
		const result = state.result;
		if (!result || result.winner === null) return;
		const key = `${startedRef.current}:${state.history.length}`;
		if (savedRef.current === key) return;
		savedRef.current = key;
		const outcome: FormResult = result.winner === "draw" ? "D" : result.winner === color ? "W" : "L";
		say(outcome === "W" ? "botLoses" : outcome === "L" ? "botWins" : "draw");
		if (outcome === "W") recordMoreGameWin("chess", { vsBot: true, difficulty: bot.elo >= 1200 ? "hard" : bot.elo >= 800 ? "medium" : "easy" });
		else recordGameOutcome("chess", outcome === "L" ? "loss" : "draw", { vsBot: true });
		void recordBotGame(bot.id, outcome).then(() => {
			const unlocked = CHESS_BOTS[CHESS_BOTS.findIndex((entry) => entry.id === bot.id) + 1];
			if (outcome === "W" && bot.id !== ADAPTIVE_BOT_ID && !beatenBefore) {
				setUnlockedLine(unlocked ? t("chess.botUnlocked", { name: unlocked.name }) : t("chess.botBeaten", { name: bot.name }));
			}
			onProgress();
		});
	}, [state.result, state.history.length, color, bot.id, bot.name, bot.elo, beatenBefore, say, onProgress, t]);

	const pgn = useMemo(
		() =>
			buildPgn({
				history: state.history,
				white: color === "w" ? playerName : bot.name,
				black: color === "w" ? bot.name : playerName,
				result: resultFromWinner(state.result?.winner ?? null),
				blackElo: color === "w" ? bot.elo : undefined,
				whiteElo: color === "b" ? bot.elo : undefined,
				termination: state.result?.reason,
				event: "Blockerino bot game",
			}),
		[state.history, state.result, color, playerName, bot.name, bot.elo]
	);
	const copyPgn = () => {
		Clipboard.setString(pgn);
		setCopied(true);
		setTimeout(() => setCopied(false), 1800);
	};

	// Undo takes back the bot's last reply and the player's move before it, so it is the player's turn again.
	const canUndo = !state.result && !botToMove && state.history.length >= (color === "w" ? 2 : 3);
	const undo = () => {
		const keep = state.history.length - 2;
		const replay = new Chess();
		for (let i = 0; i < keep; i++) replay.move(state.history[i]);
		setHint(null);
		setState({ ...state, fen: replay.fen(), history: state.history.slice(0, keep), moves: state.moves.slice(0, keep), drawOfferFrom: null });
	};

	const showHint = () => {
		const move = chooseChessMoveByElo(state.fen, 1500, Math.random, { timeBudgetMs: 1200 });
		if (move) setHint({ from: move.from, to: move.to });
	};

	const rematch = () => {
		savedRef.current = null;
		startedRef.current = Date.now();
		setUnlockedLine(null);
		setHint(null);
		setBubble(botQuip(bot, "greeting", lang));
		setState(newGame(null, Date.now()));
	};

	return (
		<View style={{ width: "100%", alignItems: "center" }}>
			<ChessGameView
				state={state}
				myColor={color}
				me={{ name: playerName, color: currentTheme.accent }}
				opponent={{ name: bot.name, rating: String(bot.elo), color: bot.color }}
				cosmetics={cosmetics}
				now={Date.now()}
				bubble={bubble}
				hint={hint}
				statusText={copied ? t("chess.pgnCopied") : botToMove ? t("chess.theirTurn", { name: bot.name }) : undefined}
				friendGame={false}
				onMove={onMove}
				onResign={() => setState(resign(state, color))}
				onAbort={() => { setState(abort(state)); onExit(); }}
				onOfferDraw={() => {}}
				onAnswerDraw={() => {}}
				onCopyPgn={copyPgn}
			/>
			{!state.result ? (
				<View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
					<HintButton disabled={botToMove || Boolean(state.result)} onHint={showHint} />
					{canUndo ? <UndoButton label={t("chess.undo")} onPress={undo} /> : null}
				</View>
			) : null}
			{state.result ? (
				<ChessResultCard
					result={state.result}
					myColor={color}
					opponentName={bot.name}
					ratingLine={t("chess.unrated")}
					extraLines={unlockedLine ? [unlockedLine] : undefined}
					onRematch={rematch}
					onNewGame={onExit}
					newGameLabel={t("chess.backToBots")}
					onCopyPgn={copyPgn}
				/>
			) : null}
		</View>
	);
}

function UndoButton({ label, onPress }: { label: string; onPress: () => void }) {
	const { currentTheme } = useTheme();
	return <StylizedButton text={label} onClick={onPress} backgroundColor={currentTheme.buttonSecondary} style={{ height: 36, minWidth: 0, paddingHorizontal: 12, marginTop: 6 }} textStyle={{ fontSize: 11 }} />;
}
