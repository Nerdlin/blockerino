import { Chess } from "chess.js";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { LayoutAnimation, View, Text, Pressable } from "react-native";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import StylizedButton from "../StylizedButton";
import { CHESS_BOARD_COLORS, CHESS_PIECE_COLORS, ExtraGameCosmetics } from "./cosmetics";
import { DuelRole, OnlineRole } from "./types";
import { OnlineRoomControls, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";

export const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const CHESS_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
export const UNICODE_PIECES: Record<string, string> = {
	wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
	bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

export function getChessBoardColors(board: ExtraGameCosmetics["chessBoard"], dark: boolean) {
	const colors = CHESS_BOARD_COLORS[board] ?? CHESS_BOARD_COLORS.slate;
	return dark ? colors.dark : colors.light;
}

export function restoreChessGame(fen: string, history: string[]): Chess {
	const replay = new Chess();
	try {
		for (const move of history) replay.move(move);
		if (replay.fen() === fen) return replay;
	} catch {}
	return new Chess(fen);
}

export function ChessOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [fen, setFen] = useState(new Chess().fen());
	const [history, setHistory] = useState<string[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const [showColorChoice, setShowColorChoice] = useState(false);
	const ratingSubmittedRef = useRef<string | null>(null);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			roomRef.current?.send("sync", { fen, history });
			return;
		}
		if (event === "system_left" && senderRole && roomRef.current.role) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setRemoteResult(t("moregames.leftYouWin", { name: roleLabel(senderRole) }));
			return;
		}
		if (event === "sync" && payload.fen) {
			LayoutAnimation.configureNext({ duration: 350, update: { type: 'easeInEaseOut' } });
			setFen(payload.fen);
			setHistory(payload.history || []);
			setOpponentReady(true);
			setSelected(null);
			setRemoteResult(null);
			setShowColorChoice(false);
			return;
		}
		if (event === "move" && payload.fen) {
			LayoutAnimation.configureNext({ duration: 350, update: { type: 'easeInEaseOut' } });
			setFen(payload.fen);
			setHistory(payload.history || []);
			setSelected(null);
			setRemoteResult(null);
		}
		if (event === "playAgain") {
			setShowColorChoice(true);
		}
		if (event === "gameEndLeave") {
			// Оппонент вышел после завершения игры - отключаем и себя
			roomRef.current?.send("leave", {});
		}
	}, [fen, history, t]);

	const room = useMiniGameRoom("chess", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	const game = useMemo(() => restoreChessGame(fen, history), [fen, history]);
	const turnRole: DuelRole = game.turn() === "w" ? "player1" : "player2";
	const status = remoteResult || (game.isCheckmate()
		? t("moregames.checkmate", { color: t(turnRole === "player1" ? "moregames.black" : "moregames.white") })
		: game.isDraw()
			? t("moregames.draw")
			: t("moregames.turn", { name: t(game.turn() === "w" ? "moregames.white" : "moregames.black") }));
	const legalTargets = selected ? game.moves({ square: selected as any, verbose: true }).map((move: any) => move.to) : [];
	const displayRanks = room.role === "player2" ? [...CHESS_RANKS].reverse() : CHESS_RANKS;
	const displayFiles = room.role === "player2" ? [...CHESS_FILES].reverse() : CHESS_FILES;

	const pressSquare = (square: string) => {
		if (game.isGameOver() || remoteResult || (room.role && !room.isConnected)) return;
		const myColor = room.role === "player2" ? "b" : "w";
		if (isDuelRole(room.role) && (room.role !== turnRole || !opponentReady || remoteResult || game.turn() !== myColor)) return;
		if (!room.role && game.isGameOver()) return;
		const piece = game.get(square as any);

		if (!selected || piece?.color === game.turn()) {
			if (piece?.color === game.turn()) setSelected(selected === square ? null : square);
			return;
		}

		try {
			const nextGame = restoreChessGame(fen, history);
			const move = nextGame.move({ from: selected, to: square, promotion: "q" } as any);
			if (move) {
				const nextFen = nextGame.fen();
				const nextHistory = [...history, move.san];
				LayoutAnimation.configureNext({ duration: 350, update: { type: 'easeInEaseOut' } });
				setFen(nextFen);
				setHistory(nextHistory);
				room.send("move", { fen: nextFen, move: `${selected}-${square}`, history: nextHistory });
			}
		} catch {}
		setSelected(null);
	};

	const reset = () => {
		const nextFen = new Chess().fen();
		setFen(nextFen);
		setHistory([]);
		setSelected(null);
		setRemoteResult(null);
		ratingSubmittedRef.current = null;
		room.send("sync", { fen: nextFen, history: [] });
	};

	const handleDisconnect = () => {
		const isGameOver = game.isCheckmate() || game.isDraw() || remoteResult;
		if (isGameOver && isDuelRole(room.role)) {
			// При завершенной игре отправляем событие оппоненту
			room.send("gameEndLeave", {});
		}
		room.disconnect();
	};

	const handleColorChoice = (chooseWhite: boolean) => {
		setShowColorChoice(false);
		const nextFen = new Chess().fen();
		setFen(nextFen);
		setHistory([]);
		setSelected(null);
		setRemoteResult(null);
		ratingSubmittedRef.current = null;

		// Если выбрали белых - становимся player1, иначе player2
		const newRole: DuelRole = chooseWhite ? "player1" : "player2";
		const opponentRole: DuelRole = chooseWhite ? "player2" : "player1";

		room.send("sync", { fen: nextFen, history: [], swapRoles: true, newRole, opponentRole });
	};

	useEffect(() => {
		if (!room.isConnected || !isDuelRole(room.role)) return;
		if (!game.isCheckmate() && !game.isDraw() && !remoteResult) return;

		const result: "player1" | "player2" | "draw" = remoteResult
			? room.role
			: game.isDraw()
				? "draw"
				: turnRole === "player1" ? "player2" : "player1";
		const resultKey = `${room.roomCode}:${result}:${fen}:${remoteResult || ""}`;
		if (ratingSubmittedRef.current === resultKey) return;
		const shouldSubmit = room.role === "player1" || Boolean(remoteResult);
		if (!shouldSubmit) return;

		ratingSubmittedRef.current = resultKey;
		void submitMoreGameMatchResult({
			gameId: "chess",
			player1Name: room.role === "player1" ? playerName : opponentName,
			player2Name: room.role === "player2" ? playerName : opponentName,
			result,
			roomCode: room.roomCode,
			metadata: { fen, source: remoteResult ? "forfeit" : "normal" },
		}).then(() => onRatingChange());
	}, [fen, game, onRatingChange, opponentName, playerName, remoteResult, room.isConnected, room.role, room.roomCode, turnRole]);

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: 'center' }]}>
				<OnlineRoomControls
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					onHost={() => { reset(); setOpponentReady(false); room.connect("player1"); }}
					onJoin={() => { reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
					onDisconnect={room.disconnect}
				/>
			</View>
		);
	}

	const pieceCounts: Record<string, number> = {};
	const animatedPieces = game.board().flatMap((row, r) => row.map((piece, f) => {
		if (!piece) return null;
		const keyPrefix = `${piece.color}${piece.type}`;
		pieceCounts[keyPrefix] = (pieceCounts[keyPrefix] || 0) + 1;
		const rank = CHESS_RANKS[r];
		const file = CHESS_FILES[f];
		const displayR = displayRanks.indexOf(rank);
		const displayF = displayFiles.indexOf(file);
		return {
			...piece,
			id: `${keyPrefix}-${pieceCounts[keyPrefix]}`,
			label: UNICODE_PIECES[`${piece.color}${piece.type}`],
			top: `${displayR * 12.5}%`,
			left: `${displayF * 12.5}%`
		};
	})).filter(Boolean);

	return (
		<View style={styles.onlineGame}>

			<Text style={[styles.gameStatus, { color: game.isCheckmate() || remoteResult ? currentTheme.accent : currentTheme.textPrimary }]}>{room.role && !opponentReady ? t("moregames.waitingOpponent") : status}</Text>
			<View style={styles.chessBoard}>
				{displayRanks.map((rank) => displayFiles.map((file) => {
					const square = `${file}${rank}`;
					const dark = (CHESS_FILES.indexOf(file) + Number(rank)) % 2 === 0;
					const legal = legalTargets.includes(square);
					const boardColor = getChessBoardColors(cosmetics.chessBoard, dark);

					return (
						<Pressable
							key={square}
							onPress={() => pressSquare(square)}
							style={[
								styles.chessCell,
								{ backgroundColor: selected === square ? "#FACC15" : boardColor },
							]}
						>
							{legal && <View style={styles.legalDot} />}
						</Pressable>
					);
				}))}

				{animatedPieces.map((p) => (
					<View 
						key={p!.id} 
						pointerEvents="none"
						style={{
							position: 'absolute',
							width: '12.5%',
							height: '12.5%',
							top: p!.top as any,
							left: p!.left as any,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Text
							style={[
								styles.chessPiece,
								CHESS_PIECE_COLORS[cosmetics.chessPieces].heavy && styles.chessPieceClub,
								{ color: p!.color === "b" ? CHESS_PIECE_COLORS[cosmetics.chessPieces].black : CHESS_PIECE_COLORS[cosmetics.chessPieces].white },
							]}
						>
							{p!.label}
						</Text>
					</View>
				))}
			</View>
			
			{history.length > 0 && (
				<View style={{ width: "100%", maxWidth: 400, marginTop: 12, paddingHorizontal: 8, alignItems: 'center' }}>
					{(() => {
						const lastMoveIndex = history.length - 1;
						const isWhiteMove = lastMoveIndex % 2 === 0;
						const lastMove = history[lastMoveIndex];
						const colorText = isWhiteMove ? "White" : "Black";
						return (
							<View style={{ flexDirection: 'row' }}>
								<Text style={{ fontFamily: 'Silkscreen', fontSize: 10, color: currentTheme.textSecondary, marginRight: 4 }}>
									{colorText}
								</Text>
								<Text style={{ fontFamily: 'SilkscreenBold', fontSize: 12, color: currentTheme.textPrimary }}>{lastMove}</Text>
							</View>
						);
					})()}
				</View>
			)}

			{(() => {
				const isGameOver = game.isCheckmate() || game.isDraw() || remoteResult;

				if (showColorChoice) {
					return (
						<View style={{ marginTop: 20, alignItems: "center", gap: 10 }}>
							<Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: currentTheme.textPrimary, marginBottom: 8 }}>
								{t("moregames.chooseColor")}
							</Text>
							<View style={{ flexDirection: 'row', gap: 12 }}>
								<StylizedButton
									text={t("moregames.playAsWhite")}
									onClick={() => handleColorChoice(true)}
									backgroundColor={currentTheme.buttonPrimary}
									style={styles.resetButton}
									textStyle={styles.smallButtonText}
								/>
								<StylizedButton
									text={t("moregames.playAsBlack")}
									onClick={() => handleColorChoice(false)}
									backgroundColor={currentTheme.buttonPrimary}
									style={styles.resetButton}
									textStyle={styles.smallButtonText}
								/>
							</View>
						</View>
					);
				}

				return null;
			})()}

			<View style={{ marginTop: 20, alignItems: "center", width: "100%" }}>
				<OnlineRoomControls
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					onHost={() => { reset(); setOpponentReady(false); room.connect("player1"); }}
					onJoin={() => { reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
					onDisconnect={handleDisconnect}
				/>
			</View>
		</View>
	);
}