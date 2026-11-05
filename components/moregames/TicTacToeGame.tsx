import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import { Animated, Easing, View, Text, Pressable, useWindowDimensions } from "react-native";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { chooseTicTacToeMove } from "@/constants/bots/TicTacToeBot";
import { BotPanel, useBotSettings } from "./BotPanel";
import { HintButton } from "./HintButton";
import { OnlineRole, TicMark } from "./types";
import { OnlineRoomControls, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";
import { useIncomingGameInvite } from "@/constants/GameInvite";
import { buzz, useGameSfx, useOutcomeSound } from "./feedback";

/** A mark pops in when it is placed; the marks of the winning line pulse. */
function TicMarkView({ value, winning, size }: { value: TicMark; winning: boolean; size: number }) {
	const pop = useRef(new Animated.Value(0)).current;
	const pulse = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
	}, [pop]);
	useEffect(() => {
		if (!winning) return;
		const loop = Animated.loop(Animated.sequence([
			Animated.timing(pulse, { toValue: 1.18, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
			Animated.timing(pulse, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
		]));
		loop.start();
		return () => {
			loop.stop();
			pulse.setValue(1);
		};
	}, [winning, pulse]);
	return (
		<Animated.Text style={[styles.ticText, { fontSize: size, lineHeight: Math.round(size * 1.15), color: value === "X" ? "#38BDF8" : "#F472B6", transform: [{ scale: Animated.multiply(pop, pulse) }] }]}>
			{value}
		</Animated.Text>
	);
}

export function TicTacToeGame({ playerName, onRatingChange }: { playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [board, setBoard] = useState<(TicMark | null)[]>(Array(9).fill(null));
	const [turn, setTurn] = useState<TicMark>("X");
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const { difficulty, setDifficulty, vsBot, setVsBot } = useBotSettings("tictactoe");
	const winner = getTicTacToeWinner(board);
	const isDraw = !winner && board.every(Boolean);
	const gameFinished = Boolean(winner) || isDraw || Boolean(remoteResult);
	// the game is full screen on a phone: the board takes most of the width, and still leaves the controls in view
	const window = useWindowDimensions();
	const boardSize = Math.round(Math.max(216, Math.min(420, window.width - 48, window.height * 0.46)));

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			if (remoteResult) {
				const nextBoard = Array(9).fill(null);
				setBoard(nextBoard);
				setTurn("X");
				setRemoteResult(null);
				ratingSubmittedRef.current = null;
				roomRef.current?.send("sync", { board: nextBoard, turn: "X" });
			} else {
				roomRef.current?.send("sync", { board, turn });
			}
			return;
		}
		if (event === "system_left" && senderRole && roomRef.current.role) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setRemoteResult(t("moregames.leftYouWin", { name: roleLabel(senderRole) }));
			return;
		}
		if (event === "sync" && Array.isArray(payload.board)) {
			setBoard(payload.board);
			setTurn(payload.turn === "O" ? "O" : "X");
			setOpponentReady(true);
			setRemoteResult(null);
			return;
		}
		if (event === "move" && Array.isArray(payload.board)) {
			setBoard(payload.board);
			setTurn(payload.turn === "O" ? "O" : "X");
			setRemoteResult(null);
		}
	}, [board, turn, remoteResult, t]);

	const room = useMiniGameRoom("tictactoe", handleEvent, playerName);
	// an accepted invitation from a friend: join their room right away
	useIncomingGameInvite("tictactoe", (code) => { setVsBot(false); reset(); setOpponentReady(false); room.setRoomCode(code); room.connect("player2", code); });
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	// Against the computer the player is X and the computer answers as O after a short pause.
	const botActive = vsBot && !room.role;
	useEffect(() => {
		if (!botActive || turn !== "O" || winner || isDraw) return;
		const timer = setTimeout(() => {
			const index = chooseTicTacToeMove(board, "O", difficulty);
			if (index < 0) return;
			const nextBoard = [...board];
			nextBoard[index] = "O";
			setBoard(nextBoard);
			setTurn("X");
		}, 450);
		return () => clearTimeout(timer);
	}, [botActive, board, turn, winner, isDraw, difficulty]);

	// Count the win for achievements once per finished game (online, left by the opponent, or against the computer).
	const winRecordedRef = useRef<string | null>(null);
	useEffect(() => {
		const online = room.isConnected && isDuelRole(room.role);
		const myMark: TicMark = room.role === "player2" ? "O" : "X";
		const iWon = (online && (Boolean(remoteResult) || winner === myMark)) || (botActive && winner === "X");
		const iLost = !iWon && !remoteResult && Boolean(winner) && (online || botActive);
		const drawn = !winner && isDraw && (online || botActive);
		if (!iWon && !iLost && !drawn) {
			if (!winner && !remoteResult) winRecordedRef.current = null;
			return;
		}
		const key = `${room.roomCode}:${board.join("")}:${remoteResult ?? ""}`;
		if (winRecordedRef.current === key) return;
		winRecordedRef.current = key;
		if (iWon) recordMoreGameWin("tictactoe", { vsBot: botActive, difficulty });
		else recordGameOutcome("tictactoe", iLost ? "loss" : "draw", { vsBot: botActive });
	}, [board, botActive, difficulty, isDraw, remoteResult, room.isConnected, room.role, room.roomCode, winner]);

	// A paid hint marks the best cell for X; it goes away with the next move.
	const [hintCell, setHintCell] = useState<number | null>(null);
	useEffect(() => setHintCell(null), [board]);
	const showHint = () => {
		const index = chooseTicTacToeMove(board, "X", "hard");
		if (index >= 0) setHintCell(index);
	};

	// a sound for every new mark, whoever placed it
	const sfx = useGameSfx();
	const shownBoard = useRef(board);
	useEffect(() => {
		const before = shownBoard.current;
		shownBoard.current = board;
		const placed = board.findIndex((value, index) => value && !before[index]);
		if (placed < 0 || board.filter(Boolean).length !== before.filter(Boolean).length + 1) return;
		sfx(board[placed] === "X" ? "ticX" : "ticO");
		buzz("light");
	}, [board, sfx]);
	const winningLine = useMemo(() => new Set(getTicTacToeWinningLine(board) ?? []), [board]);
	const myMark: TicMark | null = room.isConnected && isDuelRole(room.role) ? (room.role === "player2" ? "O" : "X") : botActive ? "X" : null;
	useOutcomeSound(
		remoteResult ? "win" : winner ? (myMark && winner !== myMark ? "loss" : "win") : isDraw ? "draw" : null,
		`${room.roomCode}:${board.join(",")}`,
	);

	const reset = () => {
		const nextBoard = Array(9).fill(null);
		setBoard(nextBoard);
		setTurn("X");
		setRemoteResult(null);
		ratingSubmittedRef.current = null;
		room.send("sync", { board: nextBoard, turn: "X" });
	};

	const play = (index: number) => {
		if (winner || isDraw || remoteResult || board[index]) return;
		if (botActive && turn !== "X") return;
		if (room.role && !room.isConnected) return;
		const online = room.isConnected && isDuelRole(room.role);
		const myMark: TicMark = room.role === "player2" ? "O" : "X";
		if (online && (!opponentReady || turn !== myMark)) return;

		const nextBoard = [...board];
		nextBoard[index] = online ? myMark : turn;
		const nextTurn = (online ? myMark : turn) === "X" ? "O" : "X";
		setBoard(nextBoard);
		setTurn(nextTurn);
		room.send("move", { board: nextBoard, turn: nextTurn });
	};

	const status = remoteResult || (winner ? t("moregames.wins", { name: winner }) : isDraw ? t("moregames.draw") : room.role && !opponentReady ? t("moregames.waitingOpponent") : botActive && turn === "O" ? t("bot.thinking") : t("moregames.turn", { name: turn }));

	useEffect(() => {
		if (!room.isConnected || !isDuelRole(room.role)) return;
		if (!winner && !isDraw && !remoteResult) return;

		const result: "player1" | "player2" | "draw" = remoteResult
			? room.role
			: isDraw
				? "draw"
				: winner === "X" ? "player1" : "player2";
		const resultKey = `${room.roomCode}:${result}:${remoteResult || winner || "draw"}`;
		if (ratingSubmittedRef.current === resultKey) return;

		const shouldSubmit = room.role === "player1" || Boolean(remoteResult);
		if (!shouldSubmit) return;

		ratingSubmittedRef.current = resultKey;
		void submitMoreGameMatchResult({
			gameId: "tictactoe",
			player1Name: room.role === "player1" ? playerName : opponentName,
			player2Name: room.role === "player2" ? playerName : opponentName,
			result,
			roomCode: room.roomCode,
			metadata: { board },
		}).then(() => onRatingChange());
	}, [board, isDraw, onRatingChange, opponentName, playerName, remoteResult, room.isConnected, room.role, room.roomCode, winner]);

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: 'center' }]}>
				<OnlineRoomControls inviteGame="tictactoe" inviteHostName={playerName}
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

	return (
		<View style={styles.onlineGame}>
			<Text style={[styles.gameStatus, { color: winner || remoteResult ? currentTheme.accent : currentTheme.textPrimary }]}>{status}</Text>
			<View style={[styles.ticBoard, { width: boardSize, height: boardSize, maxWidth: boardSize }]}>
				{board.map((value, index) => (
					<Pressable
						key={index}
						testID={`ttt-cell-${index}`}
						onPress={() => play(index)}
						style={[styles.ticCell, { borderColor: currentTheme.gridBorder, backgroundColor: hintCell === index ? "rgba(74, 222, 128, 0.35)" : currentTheme.emptyBlockBorder }]}
					>
						{value ? <TicMarkView value={value} winning={winningLine.has(index)} size={Math.round(boardSize / 4)} /> : null}
					</Pressable>
				))}
			</View>
			<View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
				<StylizedButton text={gameFinished ? t(room.role ? "moregames.rematch" : "bot.newGame") : t("moregames.reset")} onClick={reset} backgroundColor={gameFinished ? "#16A34A" : currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
				{!room.role && botActive && <HintButton disabled={gameFinished || turn !== "X"} onHint={showHint} />}
			</View>
			{!room.role && (
				<>
					<BotPanel compact vsBot={vsBot} onVsBotChange={(next) => { setVsBot(next); reset(); }} difficulty={difficulty} onDifficultyChange={(next) => { setDifficulty(next); reset(); }} />
				</>
			)}
			<View style={{ alignItems: "center", width: "100%" }}>
				<Collapsible visible={!vsBot || Boolean(room.role)}>
<OnlineRoomControls inviteGame="tictactoe" inviteHostName={playerName}
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

/** The three cells of the completed line, or null. */
export function getTicTacToeWinningLine(board: (TicMark | null)[]): number[] | null {
	const lines = [
		[0, 1, 2], [3, 4, 5], [6, 7, 8],
		[0, 3, 6], [1, 4, 7], [2, 5, 8],
		[0, 4, 8], [2, 4, 6],
	];
	return lines.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null;
}

export function getTicTacToeWinner(board: (TicMark | null)[]) {
	const lines = [
		[0, 1, 2], [3, 4, 5], [6, 7, 8],
		[0, 3, 6], [1, 4, 7], [2, 5, 8],
		[0, 4, 8], [2, 4, 6],
	];

	for (const [a, b, c] of lines) {
		if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
	}
	return null;
}