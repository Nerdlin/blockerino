import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import UiIcon from "../UiIcon";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { chooseCheckersMove } from "@/constants/bots/CheckersBot";
import { applyMove, CheckersMove, CheckersState, gameResult, initialState, isDarkSquare, isKing, isValidState, legalMoves, Side, sideOf } from "@/constants/checkers/Rules";
import { BotPanel, useBotSettings } from "./BotPanel";
import { HintButton } from "./HintButton";
import { OnlineRole } from "./types";
import { OnlineRoomControls, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";
import { useIncomingGameInvite } from "@/constants/GameInvite";

const LIGHT_SQUARE = "#E8D2A6";
const DARK_SQUARE = "#8B5A2B";
const WHITE_PIECE = { fill: "#F5F1E6", rim: "#B9AE97" };
const BLACK_PIECE = { fill: "#2B2B2E", rim: "#0E0E10" };

// The host (player1) plays white and moves first; against the computer the player is white.
const sideOfRole = (role: OnlineRole | null): Side => (role === "player2" ? "b" : "w");

export function CheckersGame({ playerName, onRatingChange }: { playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { width } = useWindowDimensions();
	const boardSize = Math.min(360, Math.max(240, width - 64));
	const BOARD_BORDER = 3;
	// whole pixels per square, so eight of them always fit inside the frame
	const cell = Math.floor((boardSize - BOARD_BORDER * 2) / 8);

	const [state, setState] = useState<CheckersState>(initialState);
	const [lastMove, setLastMove] = useState<CheckersMove | null>(null);
	// the piece being moved and the squares already stepped on during a multi-capture
	const [path, setPath] = useState<number[]>([]);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const [hint, setHint] = useState<CheckersMove | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const { difficulty, setDifficulty, vsBot, setVsBot } = useBotSettings("checkers");

	const result = useMemo(() => gameResult(state), [state]);
	const moves = useMemo(() => (result ? [] : legalMoves(state.board, state.turn)), [state, result]);
	const gameFinished = Boolean(result) || Boolean(remoteResult);

	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			// the host brings the newcomer up to date (or starts a fresh game after a finished one)
			if (roomRef.current.role === "player1") {
				const finished = Boolean(gameResult(stateRef.current));
				const next = finished ? initialState() : stateRef.current;
				if (finished) {
					setState(next);
					setLastMove(null);
					setRemoteResult(null);
					ratingSubmittedRef.current = null;
				}
				roomRef.current.send("sync", { state: next });
			}
			return;
		}
		if (event === "system_left" && senderRole && roomRef.current.role) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setRemoteResult(t("moregames.leftYouWin", { name: roleLabel(senderRole) }));
			return;
		}
		if ((event === "sync" || event === "move") && isValidState(payload?.state)) {
			setState(payload.state);
			setLastMove(event === "move" && Array.isArray(payload.last?.path) ? payload.last : null);
			setPath([]);
			setOpponentReady(true);
			setRemoteResult(null);
		}
	}, [t]);

	const room = useMiniGameRoom("checkers", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	const reset = () => {
		const next = initialState();
		setState(next);
		setLastMove(null);
		setPath([]);
		setHint(null);
		setRemoteResult(null);
		ratingSubmittedRef.current = null;
		room.send("sync", { state: next });
	};

	// an accepted invitation from a friend: join their room right away
	useIncomingGameInvite("checkers", (code) => { setVsBot(false); reset(); setOpponentReady(false); room.setRoomCode(code); room.connect("player2", code); });

	const online = room.isConnected && isDuelRole(room.role);
	const botActive = vsBot && !room.role;
	const mySide: Side = online ? sideOfRole(room.role) : "w";
	const myTurn = online ? state.turn === mySide && opponentReady : botActive ? state.turn === "w" : true;

	const play = (move: CheckersMove) => {
		const next = applyMove(state, move);
		setState(next);
		setLastMove(move);
		setPath([]);
		setHint(null);
		room.send("move", { state: next, last: move });
	};

	// The computer answers as black after a short pause.
	useEffect(() => {
		if (!botActive || state.turn !== "b" || result) return;
		const timer = setTimeout(() => {
			const move = chooseCheckersMove(state, difficulty);
			if (move) {
				setState(applyMove(state, move));
				setLastMove(move);
			}
		}, 500);
		return () => clearTimeout(timer);
	}, [botActive, state, result, difficulty]);

	// Moves that still fit what the player has tapped so far.
	const candidates = useMemo(
		() => moves.filter((move) => path.every((square, index) => move.path[index] === square)),
		[moves, path],
	);
	const movable = useMemo(() => new Set(moves.map((move) => move.path[0])), [moves]);
	const targets = useMemo(
		() => new Set(path.length > 0 ? candidates.map((move) => move.path[path.length]).filter((square) => square !== undefined) : []),
		[candidates, path],
	);

	const tap = (square: number) => {
		if (gameFinished || !myTurn) return;
		if (room.role && !room.isConnected) return;
		const piece = state.board[square];
		// picking (or switching to) one of the pieces that can move
		if (piece && sideOf(piece) === state.turn && movable.has(square) && (path.length <= 1 || !targets.has(square))) {
			setPath(path[0] === square ? [] : [square]);
			return;
		}
		if (!targets.has(square)) return;
		const nextPath = [...path, square];
		const remaining = candidates.filter((move) => move.path[nextPath.length - 1] === square);
		const done = remaining.find((move) => move.path.length === nextPath.length);
		// a whole move is chosen when it ends here and no longer capture goes on from this square
		if (done && remaining.every((move) => move.path.length === nextPath.length)) play(done);
		else setPath(nextPath);
	};

	const showHint = () => {
		const move = chooseCheckersMove(state, "hard");
		if (move) setHint(move);
	};

	// Count the outcome for achievements once per finished game.
	const outcomeRecordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!online && !botActive) return;
		const iWon = Boolean(remoteResult) || result === mySide;
		const iLost = !remoteResult && Boolean(result) && result !== "draw" && result !== mySide;
		const drawn = !remoteResult && result === "draw";
		if (!iWon && !iLost && !drawn) {
			outcomeRecordedRef.current = null;
			return;
		}
		const key = `${room.roomCode}:${state.board.join("")}:${remoteResult ?? ""}`;
		if (outcomeRecordedRef.current === key) return;
		outcomeRecordedRef.current = key;
		if (iWon) recordMoreGameWin("checkers", { vsBot: botActive, difficulty });
		else recordGameOutcome("checkers", iLost ? "loss" : "draw", { vsBot: botActive });
	}, [botActive, difficulty, mySide, online, remoteResult, result, room.roomCode, state.board]);

	useEffect(() => {
		if (!online) return;
		if (!result && !remoteResult) return;
		const matchResult: "player1" | "player2" | "draw" = remoteResult
			? (room.role as "player1" | "player2")
			: result === "draw" ? "draw" : result === "w" ? "player1" : "player2";
		const resultKey = `${room.roomCode}:${matchResult}:${remoteResult || result}`;
		if (ratingSubmittedRef.current === resultKey) return;
		if (room.role !== "player1" && !remoteResult) return;
		ratingSubmittedRef.current = resultKey;
		void submitMoreGameMatchResult({
			gameId: "checkers",
			player1Name: room.role === "player1" ? playerName : opponentName,
			player2Name: room.role === "player2" ? playerName : opponentName,
			result: matchResult,
			roomCode: room.roomCode,
			metadata: {},
		}).then(() => onRatingChange());
	}, [onRatingChange, online, opponentName, playerName, remoteResult, result, room.role, room.roomCode]);

	const mustCapture = !gameFinished && myTurn && moves.length > 0 && moves[0].captures.length > 0;
	const status = remoteResult
		|| (result === "draw" ? t("moregames.draw")
			: result ? ((online || botActive) ? t(result === mySide ? "checkers.youWin" : "checkers.youLose") : t(result === "w" ? "checkers.whiteWins" : "checkers.blackWins"))
				: room.role && !opponentReady ? t("moregames.waitingOpponent")
					: botActive && state.turn === "b" ? t("bot.thinking")
						: (online || botActive) ? t(myTurn ? "checkers.yourTurn" : "checkers.theirTurn")
							: t(state.turn === "w" ? "checkers.turnWhite" : "checkers.turnBlack"));

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: "center" }]}>
				<OnlineRoomControls inviteGame="checkers" inviteHostName={playerName}
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					onHost={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player1"); }}
					onJoin={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
					onDisconnect={room.disconnect}
				/>
			</View>
		);
	}

	// black sees the board from its own side
	const flipped = online && mySide === "b";
	const lastSquares = new Set(lastMove?.path ?? []);
	const hintSquares = new Set(hint ? [hint.path[0], hint.path[hint.path.length - 1]] : []);

	return (
		<View style={styles.onlineGame}>
			<Text style={[styles.gameStatus, { color: gameFinished ? currentTheme.accent : currentTheme.textPrimary }]}>{status}</Text>
			{mustCapture ? <Text style={local.mustCapture}>{t("checkers.mustCapture")}</Text> : null}
			<View style={[local.board, { width: cell * 8 + BOARD_BORDER * 2, height: cell * 8 + BOARD_BORDER * 2, borderWidth: BOARD_BORDER }]}>
				{Array.from({ length: 64 }, (_, index) => {
					const square = flipped ? 63 - index : index;
					const dark = isDarkSquare(square);
					const piece = state.board[square];
					const selected = path.includes(square);
					const target = targets.has(square);
					const canMove = !gameFinished && myTurn && path.length === 0 && movable.has(square);
					return (
						<Pressable
							key={square}
							testID={`checkers-${square}`}
							onPress={() => tap(square)}
							disabled={!dark}
							style={[
								local.square,
								{ width: cell, height: cell, backgroundColor: dark ? DARK_SQUARE : LIGHT_SQUARE },
								dark && lastSquares.has(square) && { backgroundColor: "#A0723F" },
								dark && hintSquares.has(square) && { backgroundColor: "#3F8F4F" },
							]}
						>
							{piece ? (
								<View style={[
									local.piece,
									{
										width: cell * 0.78,
										height: cell * 0.78,
										borderRadius: cell * 0.39,
										backgroundColor: sideOf(piece) === "w" ? WHITE_PIECE.fill : BLACK_PIECE.fill,
										borderColor: selected ? "#FACC15" : canMove ? "#4ADE80" : sideOf(piece) === "w" ? WHITE_PIECE.rim : BLACK_PIECE.rim,
										borderWidth: selected || canMove ? 3 : 2,
									},
								]}>
									<View style={[local.pieceInner, { width: cell * 0.5, height: cell * 0.5, borderRadius: cell * 0.25, borderColor: sideOf(piece) === "w" ? WHITE_PIECE.rim : "#3F3F46" }]}>
										{isKing(piece) ? <UiIcon name="crown" size={Math.max(9, Math.floor(cell * 0.4 / 9) * 9)} /> : null}
									</View>
								</View>
							) : selected ? (
								<View style={[local.trail, { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 }]} />
							) : null}
							{target ? <View pointerEvents="none" style={[local.targetDot, { width: cell * 0.34, height: cell * 0.34, borderRadius: cell * 0.17 }]} /> : null}
						</Pressable>
					);
				})}
			</View>
			<View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
				<StylizedButton text={gameFinished ? t(room.role ? "moregames.rematch" : "bot.newGame") : t("moregames.reset")} onClick={reset} backgroundColor={gameFinished ? "#16A34A" : currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
				{!room.role && botActive && <HintButton disabled={gameFinished || state.turn !== "w"} onHint={showHint} />}
			</View>
			{!room.role && (
				<BotPanel compact vsBot={vsBot} onVsBotChange={(next) => { setVsBot(next); reset(); }} difficulty={difficulty} onDifficultyChange={(next) => { setDifficulty(next); reset(); }} />
			)}
			<View style={{ alignItems: "center", width: "100%" }}>
				<Collapsible visible={!vsBot || Boolean(room.role)}>
					<OnlineRoomControls inviteGame="checkers" inviteHostName={playerName}
						roomCode={room.roomCode}
						setRoomCode={room.setRoomCode}
						role={room.role}
						status={room.status}
						opponentReady={opponentReady}
						onHost={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player1"); }}
						onJoin={() => { setVsBot(false); reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
						onDisconnect={room.disconnect}
					/>
				</Collapsible>
			</View>
		</View>
	);
}

const local = StyleSheet.create({
	board: { flexDirection: "row", flexWrap: "wrap", borderColor: "#5C3A1A", borderRadius: 4, overflow: "hidden" },
	square: { alignItems: "center", justifyContent: "center" },
	piece: { alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
	pieceInner: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
	trail: { backgroundColor: "rgba(250, 204, 21, 0.6)" },
	targetDot: { position: "absolute", backgroundColor: "rgba(74, 222, 128, 0.75)" },
	mustCapture: { fontFamily: "Silkscreen", fontSize: 10, color: "#F87171", marginTop: -6 },
});
