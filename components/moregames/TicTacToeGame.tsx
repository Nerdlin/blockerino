import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useCallback, useEffect } from "react";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import { View, Text, Pressable } from "react-native";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import { recordMoreGameWin } from "@/constants/Achievements";
import { chooseTicTacToeMove } from "@/constants/bots/TicTacToeBot";
import { BotPanel, useBotSettings } from "./BotPanel";
import { OnlineRole, TicMark } from "./types";
import { OnlineRoomControls, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";

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
		if (!iWon) {
			if (!winner && !remoteResult) winRecordedRef.current = null;
			return;
		}
		const key = `${room.roomCode}:${board.join("")}:${remoteResult ?? ""}`;
		if (winRecordedRef.current === key) return;
		winRecordedRef.current = key;
		recordMoreGameWin("tictactoe", { vsBot: botActive, difficulty });
	}, [board, botActive, difficulty, remoteResult, room.isConnected, room.role, room.roomCode, winner]);

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
				<OnlineRoomControls
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
			<Text style={[styles.gameStatus, { color: winner || remoteResult ? currentTheme.accent : currentTheme.textPrimary, marginTop: 10 }]}>{status}</Text>
			<View style={styles.ticBoard}>
				{board.map((value, index) => (
					<Pressable
						key={index}
						onPress={() => play(index)}
						style={[styles.ticCell, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}
					>
						<Text style={[styles.ticText, { color: value === "X" ? "#38BDF8" : "#F472B6" }]}>{value}</Text>
					</Pressable>
				))}
			</View>
			<StylizedButton text={t("moregames.reset")} onClick={reset} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
			{!room.role && (
				<BotPanel vsBot={vsBot} onVsBotChange={(next) => { setVsBot(next); reset(); }} difficulty={difficulty} onDifficultyChange={(next) => { setDifficulty(next); reset(); }} />
			)}
			<View style={{ marginTop: 20, alignItems: "center", width: "100%" }}>
				<Collapsible visible={!vsBot || Boolean(room.role)}>
<OnlineRoomControls
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