import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Chess } from "chess.js";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { useTheme } from "@/constants/Theme";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { supabase } from "@/constants/Supabase";

type MoreGameId = "battleship" | "durak" | "chess" | "sudoku" | "tictactoe" | "mahjong";
type OnlineRole = "player1" | "player2";
type RoomStatus = "offline" | "connecting" | "connected" | "error";

interface MoreGameCard {
	id: MoreGameId;
	title: string;
	color: string;
	description: string;
	tags: string[];
}

const MORE_GAME_CARDS: MoreGameCard[] = [
	{
		id: "battleship",
		title: "Sea Battle Online",
		color: "#38BDF8",
		description: "5x5 naval duel with realtime room codes.",
		tags: ["online", "turns", "ships"],
	},
	{
		id: "durak",
		title: "Durak Online",
		color: "#F97316",
		description: "Fast two-player attack and defend card rounds.",
		tags: ["online", "cards", "trump"],
	},
	{
		id: "chess",
		title: "Chess Online",
		color: "#E5E7EB",
		description: "Realtime chess board with legal moves.",
		tags: ["online", "rules", "1v1"],
	},
	{
		id: "sudoku",
		title: "Sudoku",
		color: "#A3E635",
		description: "Classic 9x9 logic puzzle with validation.",
		tags: ["solo", "logic", "9x9"],
	},
	{
		id: "tictactoe",
		title: "Tic-Tac-Toe",
		color: "#F472B6",
		description: "Local quick match for two players.",
		tags: ["local", "quick", "3x3"],
	},
	{
		id: "mahjong",
		title: "Mahjong Match",
		color: "#C084FC",
		description: "Clear all paired tiles from the board.",
		tags: ["solo", "pairs", "tiles"],
	},
];

function createRoomCode() {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 5; i += 1) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

function getReadableButtonTextColor(backgroundColor: string) {
	const hex = backgroundColor.replace("#", "");
	if (hex.length !== 6) return "white";
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.72 ? "#111111" : "white";
}

function getOtherRole(role: OnlineRole): OnlineRole {
	return role === "player1" ? "player2" : "player1";
}

function useMiniGameRoom(gameId: MoreGameId, onEvent: (event: string, payload: any, senderRole?: OnlineRole) => void) {
	const [roomCode, setRoomCode] = useState("");
	const [role, setRole] = useState<OnlineRole | null>(null);
	const [status, setStatus] = useState<RoomStatus>("offline");
	const channelRef = useRef<any>(null);
	const roleRef = useRef<OnlineRole | null>(null);
	const onEventRef = useRef(onEvent);
	const clientIdRef = useRef(createRoomCode());

	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	const disconnect = useCallback(() => {
		if (channelRef.current) {
			supabase.removeChannel(channelRef.current);
			channelRef.current = null;
		}
		setStatus("offline");
		setRole(null);
		roleRef.current = null;
	}, []);

	const connect = useCallback((nextRole: OnlineRole, requestedCode?: string) => {
		const cleanedCode = requestedCode?.trim().toUpperCase() || "";
		if (nextRole === "player2" && !cleanedCode) {
			setStatus("error");
			return;
		}
		const nextCode = cleanedCode || createRoomCode();
		if (!nextCode) return;

		disconnect();
		setRoomCode(nextCode);
		setRole(nextRole);
		roleRef.current = nextRole;
		setStatus("connecting");

		const channel = supabase.channel(`more-games:${gameId}:${nextCode}`, {
			config: {
				broadcast: {
					self: false,
				},
			},
		});

		channel.on("broadcast", { event: "mini_game" }, ({ payload }: { payload: any }) => {
			if (!payload || payload.senderId === clientIdRef.current) return;
			onEventRef.current(payload.event, payload.payload, payload.role);
		});

		channel.subscribe((nextStatus: string) => {
			if (nextStatus === "SUBSCRIBED") {
				setStatus("connected");
				void channel.send({
					type: "broadcast",
					event: "mini_game",
					payload: {
						event: "system_joined",
						payload: { role: nextRole },
						role: nextRole,
						senderId: clientIdRef.current,
					},
				});
			} else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT" || nextStatus === "CLOSED") {
				setStatus("error");
			}
		});

		channelRef.current = channel;
	}, [disconnect, gameId]);

	const send = useCallback((event: string, payload: any) => {
		const channel = channelRef.current;
		const currentRole = roleRef.current;
		if (!channel || !currentRole) return;

		void channel.send({
			type: "broadcast",
			event: "mini_game",
			payload: {
				event,
				payload,
				role: currentRole,
				senderId: clientIdRef.current,
			},
		});
	}, []);

	useEffect(() => disconnect, [disconnect]);

	return {
		roomCode,
		setRoomCode,
		role,
		status,
		isConnected: status === "connected",
		connect,
		disconnect,
		send,
	};
}

function OnlineRoomControls({
	roomCode,
	setRoomCode,
	role,
	status,
	onHost,
	onJoin,
	onDisconnect,
}: {
	roomCode: string;
	setRoomCode: (value: string) => void;
	role: OnlineRole | null;
	status: RoomStatus;
	onHost: () => void;
	onJoin: () => void;
	onDisconnect: () => void;
}) {
	const { currentTheme } = useTheme();

	return (
		<View style={styles.roomPanel}>
			<View style={styles.roomRow}>
				<StylizedButton text="Host" onClick={onHost} backgroundColor={currentTheme.buttonPrimary} style={styles.roomButton} textStyle={styles.smallButtonText} />
				<TextInput
					value={roomCode}
					onChangeText={(value) => setRoomCode(value.toUpperCase())}
					placeholder="CODE"
					placeholderTextColor={currentTheme.textSecondary}
					autoCapitalize="characters"
					maxLength={5}
					style={[styles.roomInput, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
				/>
				<StylizedButton text="Join" onClick={onJoin} backgroundColor={currentTheme.buttonSecondary} style={styles.roomButton} textStyle={styles.smallButtonText} />
			</View>
			<View style={styles.roomMetaRow}>
				<Text style={[styles.roomMeta, { color: currentTheme.textSecondary }]}>
					{role ? `${role.toUpperCase()} | ${status.toUpperCase()} | ${roomCode || "NO CODE"}` : "Create or join a room"}
				</Text>
				{role && (
					<StylizedButton text="Leave" onClick={onDisconnect} backgroundColor={cssColors.spaceGray} style={styles.leaveRoomButton} textStyle={styles.tinyButtonText} />
				)}
			</View>
		</View>
	);
}

export default function MoreGamesMenu() {
	const { currentTheme } = useTheme();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [activeGame, setActiveGame] = useState<MoreGameId | null>(null);

	const handleBack = useCallback(() => {
		if (activeGame) {
			setActiveGame(null);
			return;
		}
		popAppState();
	}, [activeGame, popAppState]);

	useEscapeKey(handleBack);

	const activeCard = MORE_GAME_CARDS.find((card) => card.id === activeGame);

	return (
		<SimplePopupView style={[
			{ justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground, height: "90%" },
			isMobile && { width: "92%", height: "90%", paddingHorizontal: 8 },
		]}>
			<View style={styles.moreHeaderRow}>
				<StylizedButton text="Back" onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.topBackButton} textStyle={styles.smallButtonText} />
				<View style={styles.moreHeaderTextBlock}>
					<Text style={[styles.header, { color: currentTheme.textPrimary }]}>{activeCard?.title || "More Games"}</Text>
					<Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>
						{activeCard ? "Playable extra mode" : "Extra modes and quick games"}
					</Text>
				</View>
				<View style={styles.topBackSpacer} />
			</View>

			{!activeGame ? (
				<ScrollView style={styles.moreList} contentContainerStyle={styles.moreListContent}>
					{MORE_GAME_CARDS.map((card) => (
						<View
							key={card.id}
							style={[
								styles.moreGameRow,
								{
									borderColor: currentTheme.textSecondary,
									backgroundColor: "rgba(0, 0, 0, 0.24)",
								},
							]}
						>
							<View style={styles.cardMain}>
								<Text style={[styles.cardTitle, { color: card.color }]} numberOfLines={2} adjustsFontSizeToFit>
									{card.title}
								</Text>
								<Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={2}>
									{card.description}
								</Text>
								<View style={styles.tagRow}>
									{card.tags.map((tag) => (
										<View key={tag} style={[styles.tag, { borderColor: card.color }]}>
											<Text style={[styles.tagText, { color: card.color }]}>{tag}</Text>
										</View>
									))}
								</View>
							</View>
							<StylizedButton
								text="Play"
								onClick={() => setActiveGame(card.id)}
								backgroundColor={card.color}
								style={styles.playButton}
								textStyle={[styles.smallButtonText, { color: getReadableButtonTextColor(card.color) }]}
							/>
						</View>
					))}
				</ScrollView>
			) : (
				<View style={styles.gameSurface}>
					{activeGame === "tictactoe" && <TicTacToeGame />}
					{activeGame === "sudoku" && <SudokuGame />}
					{activeGame === "mahjong" && <MahjongGame />}
					{activeGame === "battleship" && <BattleshipGame />}
					{activeGame === "chess" && <ChessOnlineGame />}
					{activeGame === "durak" && <DurakOnlineGame />}
				</View>
			)}
		</SimplePopupView>
	);
}

function TicTacToeGame() {
	const { currentTheme } = useTheme();
	const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
	const [turn, setTurn] = useState<"X" | "O">("X");
	const winner = getTicTacToeWinner(board);
	const isDraw = !winner && board.every(Boolean);

	const play = (index: number) => {
		if (winner || board[index]) return;
		const nextBoard = [...board];
		nextBoard[index] = turn;
		setBoard(nextBoard);
		setTurn(turn === "X" ? "O" : "X");
	};

	const reset = () => {
		setBoard(Array(9).fill(null));
		setTurn("X");
	};

	return (
		<View style={styles.centerGame}>
			<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>
				{winner ? `${winner} wins` : isDraw ? "Draw" : `${turn} turn`}
			</Text>
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
			<StylizedButton text="Reset" onClick={reset} backgroundColor={currentTheme.buttonPrimary} />
		</View>
	);
}

function getTicTacToeWinner(board: (string | null)[]) {
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

const SUDOKU_PUZZLE = [
	[5, 3, 0, 0, 7, 0, 0, 0, 0],
	[6, 0, 0, 1, 9, 5, 0, 0, 0],
	[0, 9, 8, 0, 0, 0, 0, 6, 0],
	[8, 0, 0, 0, 6, 0, 0, 0, 3],
	[4, 0, 0, 8, 0, 3, 0, 0, 1],
	[7, 0, 0, 0, 2, 0, 0, 0, 6],
	[0, 6, 0, 0, 0, 0, 2, 8, 0],
	[0, 0, 0, 4, 1, 9, 0, 0, 5],
	[0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const SUDOKU_SOLUTION = [
	[5, 3, 4, 6, 7, 8, 9, 1, 2],
	[6, 7, 2, 1, 9, 5, 3, 4, 8],
	[1, 9, 8, 3, 4, 2, 5, 6, 7],
	[8, 5, 9, 7, 6, 1, 4, 2, 3],
	[4, 2, 6, 8, 5, 3, 7, 9, 1],
	[7, 1, 3, 9, 2, 4, 8, 5, 6],
	[9, 6, 1, 5, 3, 7, 2, 8, 4],
	[2, 8, 7, 4, 1, 9, 6, 3, 5],
	[3, 4, 5, 2, 8, 6, 1, 7, 9],
];

function cloneSudokuGrid() {
	return SUDOKU_PUZZLE.map((row) => [...row]);
}

function SudokuGame() {
	const { currentTheme } = useTheme();
	const [grid, setGrid] = useState(cloneSudokuGrid);
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const complete = grid.every((row, y) => row.every((value, x) => value === SUDOKU_SOLUTION[y][x]));

	const setNumber = (value: number) => {
		if (!selected) return;
		const [y, x] = selected;
		if (SUDOKU_PUZZLE[y][x] !== 0) return;
		setGrid((current) => current.map((row, rowIndex) => (
			row.map((cell, colIndex) => rowIndex === y && colIndex === x ? value : cell)
		)));
	};

	return (
		<View style={styles.centerGame}>
			<Text style={[styles.gameStatus, { color: complete ? currentTheme.accent : currentTheme.textPrimary }]}>
				{complete ? "Solved" : "Select a cell"}
			</Text>
			<View style={styles.sudokuBoard}>
				{grid.map((row, y) => row.map((value, x) => {
					const fixed = SUDOKU_PUZZLE[y][x] !== 0;
					const isSelected = selected?.[0] === y && selected?.[1] === x;
					const wrong = value !== 0 && value !== SUDOKU_SOLUTION[y][x];

					return (
						<Pressable
							key={`${y}-${x}`}
							onPress={() => setSelected([y, x])}
							style={[
								styles.sudokuCell,
								{
									borderColor: isSelected ? currentTheme.accent : currentTheme.gridBorder,
									backgroundColor: fixed ? "rgba(255,255,255,0.12)" : currentTheme.emptyBlockBorder,
								},
								(y + 1) % 3 === 0 && y < 8 && styles.sudokuCellBottom,
								(x + 1) % 3 === 0 && x < 8 && styles.sudokuCellRight,
							]}
						>
							<Text style={[
								styles.sudokuText,
								{ color: wrong ? "#FF5A66" : fixed ? currentTheme.textPrimary : currentTheme.accent },
							]}>
								{value || ""}
							</Text>
						</Pressable>
					);
				}))}
			</View>
			<View style={styles.numberPad}>
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
					<StylizedButton key={number} text={String(number)} onClick={() => setNumber(number)} backgroundColor={currentTheme.buttonSecondary} style={styles.numberButton} textStyle={styles.tinyButtonText} />
				))}
				<StylizedButton text="Clear" onClick={() => setNumber(0)} backgroundColor={cssColors.spaceGray} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
				<StylizedButton text="Reset" onClick={() => setGrid(cloneSudokuGrid())} backgroundColor={currentTheme.buttonPrimary} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
			</View>
		</View>
	);
}

const MAHJONG_SEED = ["A", "A", "B", "B", "C", "C", "D", "D", "E", "E", "F", "F", "G", "G", "H", "H"];

function shuffleTiles() {
	return MAHJONG_SEED
		.map((tile, index) => ({ id: `${tile}-${index}`, tile, removed: false }))
		.sort(() => Math.random() - 0.5);
}

function MahjongGame() {
	const { currentTheme } = useTheme();
	const [tiles, setTiles] = useState(shuffleTiles);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const remaining = tiles.filter((tile) => !tile.removed).length;

	const pickTile = (id: string) => {
		const picked = tiles.find((tile) => tile.id === id);
		if (!picked || picked.removed) return;
		if (!selectedId) {
			setSelectedId(id);
			return;
		}

		if (selectedId === id) {
			setSelectedId(null);
			return;
		}

		const selected = tiles.find((tile) => tile.id === selectedId);
		if (selected?.tile === picked.tile) {
			setTiles((current) => current.map((tile) => (
				tile.id === id || tile.id === selectedId ? { ...tile, removed: true } : tile
			)));
		}
		setSelectedId(null);
	};

	return (
		<View style={styles.centerGame}>
			<Text style={[styles.gameStatus, { color: remaining === 0 ? currentTheme.accent : currentTheme.textPrimary }]}>
				{remaining === 0 ? "Board cleared" : `${remaining} tiles left`}
			</Text>
			<View style={styles.mahjongBoard}>
				{tiles.map((tile) => (
					<Pressable
						key={tile.id}
						onPress={() => pickTile(tile.id)}
						style={[
							styles.mahjongTile,
							{
								opacity: tile.removed ? 0.12 : 1,
								borderColor: selectedId === tile.id ? currentTheme.accent : currentTheme.gridBorder,
								backgroundColor: currentTheme.emptyBlockBorder,
							},
						]}
					>
						<Text style={[styles.mahjongText, { color: currentTheme.textPrimary }]}>{tile.removed ? "" : tile.tile}</Text>
					</Pressable>
				))}
			</View>
			<StylizedButton text="New Board" onClick={() => { setTiles(shuffleTiles()); setSelectedId(null); }} backgroundColor={currentTheme.buttonPrimary} />
		</View>
	);
}

function createShips() {
	const ships = new Set<string>();
	while (ships.size < 5) {
		ships.add(`${Math.floor(Math.random() * 5)},${Math.floor(Math.random() * 5)}`);
	}
	return ships;
}

function BattleshipGame() {
	const { currentTheme } = useTheme();
	const [ships, setShips] = useState(createShips);
	const [incomingShots, setIncomingShots] = useState<Record<string, "hit" | "miss">>({});
	const [targetShots, setTargetShots] = useState<Record<string, "pending" | "hit" | "miss">>({});
	const [turn, setTurn] = useState<OnlineRole | null>("player1");
	const [winner, setWinner] = useState<OnlineRole | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			roomRef.current?.send("ready", { to: senderRole });
			return;
		}
		if (event === "ready") {
			setOpponentReady(true);
			return;
		}
		if (event === "shot") {
			const currentRole = roomRef.current?.role;
			if (!currentRole || payload.to !== currentRole) return;
			const hit = ships.has(payload.cell);
			setIncomingShots((current) => ({ ...current, [payload.cell]: hit ? "hit" : "miss" }));
			const nextIncoming: Record<string, "hit" | "miss"> = { ...incomingShots, [payload.cell]: hit ? "hit" : "miss" };
			const lost = [...ships].every((ship) => nextIncoming[ship] === "hit");
			if (lost) setWinner(payload.from);
			roomRef.current?.send("shot_result", {
				to: payload.from,
				cell: payload.cell,
				result: hit ? "hit" : "miss",
				winner: lost ? payload.from : null,
			});
			if (!lost) setTurn(currentRole);
			return;
		}
		if (event === "shot_result") {
			const currentRole = roomRef.current?.role;
			if (!currentRole || payload.to !== currentRole) return;
			setTargetShots((current) => ({ ...current, [payload.cell]: payload.result }));
			if (payload.winner) {
				setWinner(payload.winner);
			} else {
				setTurn(getOtherRole(currentRole));
			}
		}
	}, [incomingShots, ships]);

	const room = useMiniGameRoom("battleship", handleEvent);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	const resetLocal = () => {
		setShips(createShips());
		setIncomingShots({});
		setTargetShots({});
		setTurn("player1");
		setWinner(null);
		setOpponentReady(false);
	};

	const fire = (cell: string) => {
		if (!room.role || !room.isConnected || !opponentReady || winner || turn !== room.role || targetShots[cell]) return;
		setTargetShots((current) => ({ ...current, [cell]: "pending" }));
		setTurn(null);
		room.send("shot", { from: room.role, to: getOtherRole(room.role), cell });
	};

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={() => { resetLocal(); room.connect("player1"); }}
				onJoin={() => { resetLocal(); room.connect("player2", room.roomCode); }}
				onDisconnect={room.disconnect}
			/>
			<Text style={[styles.gameStatus, { color: winner ? currentTheme.accent : currentTheme.textPrimary }]}>
				{winner ? `${winner.toUpperCase()} wins` : opponentReady ? `${turn?.toUpperCase() || "WAIT"} turn` : "Waiting for opponent"}
			</Text>
			<View style={styles.battleBoards}>
				<BattleGrid title="Target" cells={targetShots} onPress={fire} />
				<BattleGrid title="My Waters" cells={incomingShots} ships={ships} />
			</View>
		</View>
	);
}

function BattleGrid({ title, cells, ships, onPress }: { title: string; cells: Record<string, string>; ships?: Set<string>; onPress?: (cell: string) => void }) {
	const { currentTheme } = useTheme();
	return (
		<View style={styles.battleGridWrap}>
			<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>{title}</Text>
			<View style={styles.battleGrid}>
				{Array.from({ length: 25 }).map((_, index) => {
					const cell = `${index % 5},${Math.floor(index / 5)}`;
					const status = cells[cell];
					const hasShip = ships?.has(cell);
					const backgroundColor = status === "hit"
						? "#FF5A66"
						: status === "miss"
							? "#64748B"
							: status === "pending"
								? "#FFD700"
								: hasShip
									? "#38BDF8"
									: currentTheme.emptyBlockBorder;
					return (
						<Pressable key={cell} onPress={() => onPress?.(cell)} style={[styles.battleCell, { backgroundColor, borderColor: currentTheme.gridBorder }]}>
							<Text style={styles.battleCellText}>{status === "hit" ? "X" : status === "miss" ? "." : hasShip ? "S" : ""}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const CHESS_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const PIECE_LABELS: Record<string, string> = {
	wp: "P", wn: "N", wb: "B", wr: "R", wq: "Q", wk: "K",
	bp: "p", bn: "n", bb: "b", br: "r", bq: "q", bk: "k",
};

function ChessOnlineGame() {
	const { currentTheme } = useTheme();
	const [fen, setFen] = useState(new Chess().fen());
	const [selected, setSelected] = useState<string | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			roomRef.current?.send("sync", { fen });
			return;
		}
		if (event === "sync" && payload.fen) {
			setFen(payload.fen);
			setOpponentReady(true);
			return;
		}
		if (event === "move" && payload.fen) {
			setFen(payload.fen);
			setSelected(null);
		}
	}, [fen]);

	const room = useMiniGameRoom("chess", handleEvent);
	const roomRef = useRef({ send: room.send });
	useEffect(() => {
		roomRef.current = { send: room.send };
	}, [room.send]);

	const game = useMemo(() => new Chess(fen), [fen]);
	const turnRole: OnlineRole = game.turn() === "w" ? "player1" : "player2";
	const status = game.isCheckmate()
		? `Checkmate: ${turnRole === "player1" ? "Black" : "White"} wins`
		: game.isDraw()
			? "Draw"
			: `${game.turn() === "w" ? "White" : "Black"} turn`;

	const pressSquare = (square: string) => {
		if (!room.role || room.role !== turnRole || !opponentReady) return;
		const piece = game.get(square as any);
		const myColor = room.role === "player1" ? "w" : "b";

		if (!selected) {
			if (piece?.color === myColor) setSelected(square);
			return;
		}

		try {
			const nextGame = new Chess(fen);
			const move = nextGame.move({ from: selected, to: square, promotion: "q" } as any);
			if (move) {
				const nextFen = nextGame.fen();
				setFen(nextFen);
				room.send("move", { fen: nextFen, move: `${selected}-${square}` });
			}
		} catch {}
		setSelected(null);
	};

	const reset = () => {
		const nextFen = new Chess().fen();
		setFen(nextFen);
		room.send("sync", { fen: nextFen });
	};

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={() => { setFen(new Chess().fen()); setOpponentReady(false); room.connect("player1"); }}
				onJoin={() => { setOpponentReady(false); room.connect("player2", room.roomCode); }}
				onDisconnect={room.disconnect}
			/>
			<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>{opponentReady ? status : "Waiting for opponent"}</Text>
			<View style={styles.chessBoard}>
				{CHESS_RANKS.map((rank) => CHESS_FILES.map((file) => {
					const square = `${file}${rank}`;
					const piece = game.get(square as any);
					const dark = (CHESS_FILES.indexOf(file) + Number(rank)) % 2 === 0;
					const label = piece ? PIECE_LABELS[`${piece.color}${piece.type}`] : "";

					return (
						<Pressable
							key={square}
							onPress={() => pressSquare(square)}
							style={[
								styles.chessCell,
								{ backgroundColor: selected === square ? currentTheme.accent : dark ? "#334155" : "#CBD5E1" },
							]}
						>
							<Text style={[styles.chessPiece, { color: piece?.color === "b" ? "#020617" : "#FFFFFF" }]}>{label}</Text>
						</Pressable>
					);
				}))}
			</View>
			<StylizedButton text="Reset Board" onClick={reset} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
		</View>
	);
}

const DURAK_RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const DURAK_SUITS = ["C", "D", "H", "S"];

interface DurakState {
	deck: string[];
	trump: string;
	player1Hand: string[];
	player2Hand: string[];
	table: { attack: string | null; defense: string | null };
	turn: OnlineRole;
	phase: "attack" | "defend";
	discardCount: number;
	winner: OnlineRole | null;
}

function createDurakDeck() {
	return DURAK_SUITS.flatMap((suit) => DURAK_RANKS.map((rank) => `${rank}${suit}`)).sort(() => Math.random() - 0.5);
}

function createDurakState(): DurakState {
	const deck = createDurakDeck();
	const player1Hand = deck.splice(0, 6);
	const player2Hand = deck.splice(0, 6);
	const trump = deck[deck.length - 1]?.slice(-1) || "S";
	return {
		deck,
		trump,
		player1Hand,
		player2Hand,
		table: { attack: null, defense: null },
		turn: "player1",
		phase: "attack",
		discardCount: 0,
		winner: null,
	};
}

function cardRankValue(card: string) {
	return DURAK_RANKS.indexOf(card.slice(0, -1));
}

function cardSuit(card: string) {
	return card.slice(-1);
}

function canBeatDurakCard(defense: string, attack: string, trump: string) {
	if (cardSuit(defense) === cardSuit(attack)) return cardRankValue(defense) > cardRankValue(attack);
	return cardSuit(defense) === trump && cardSuit(attack) !== trump;
}

function drawDurakCards(state: DurakState) {
	const next = { ...state, deck: [...state.deck], player1Hand: [...state.player1Hand], player2Hand: [...state.player2Hand] };
	while (next.player1Hand.length < 6 && next.deck.length > 0) next.player1Hand.push(next.deck.shift()!);
	while (next.player2Hand.length < 6 && next.deck.length > 0) next.player2Hand.push(next.deck.shift()!);
	if (next.deck.length === 0) {
		if (next.player1Hand.length === 0) next.winner = "player1";
		if (next.player2Hand.length === 0) next.winner = "player2";
	}
	return next;
}

function DurakOnlineGame() {
	const { currentTheme } = useTheme();
	const [state, setState] = useState<DurakState | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);

	const syncState = (nextState: DurakState) => {
		setState(nextState);
		roomRef.current?.send("sync", { state: nextState });
	};

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			if (roomRef.current?.role === "player1" && state) {
				roomRef.current.send("sync", { state });
			}
			return;
		}
		if (event === "sync" && payload.state) {
			setState(payload.state);
			setOpponentReady(true);
		}
	}, [state]);

	const room = useMiniGameRoom("durak", handleEvent);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	const myHand = room.role === "player1" ? state?.player1Hand : state?.player2Hand;
	const defender = state ? getOtherRole(state.turn) : "player2";

	const removeCard = (cards: string[], card: string) => {
		const index = cards.indexOf(card);
		if (index < 0) return cards;
		return [...cards.slice(0, index), ...cards.slice(index + 1)];
	};

	const playAttack = (card: string) => {
		if (!state || state.winner || room.role !== state.turn || state.phase !== "attack") return;
		const nextState: DurakState = {
			...state,
			player1Hand: room.role === "player1" ? removeCard(state.player1Hand, card) : state.player1Hand,
			player2Hand: room.role === "player2" ? removeCard(state.player2Hand, card) : state.player2Hand,
			table: { attack: card, defense: null },
			phase: "defend",
		};
		syncState(nextState);
	};

	const playDefense = (card: string) => {
		if (!state?.table.attack || state.winner || room.role !== defender || state.phase !== "defend") return;
		if (!canBeatDurakCard(card, state.table.attack, state.trump)) return;
		const defendedState: DurakState = {
			...state,
			player1Hand: room.role === "player1" ? removeCard(state.player1Hand, card) : state.player1Hand,
			player2Hand: room.role === "player2" ? removeCard(state.player2Hand, card) : state.player2Hand,
			table: { attack: null, defense: null },
			discardCount: state.discardCount + 2,
			turn: defender,
			phase: "attack",
		};
		syncState(drawDurakCards(defendedState));
	};

	const takeCard = () => {
		if (!state?.table.attack || state.winner || room.role !== defender || state.phase !== "defend") return;
		const nextState: DurakState = {
			...state,
			player1Hand: room.role === "player1" ? [...state.player1Hand, state.table.attack] : state.player1Hand,
			player2Hand: room.role === "player2" ? [...state.player2Hand, state.table.attack] : state.player2Hand,
			table: { attack: null, defense: null },
			turn: state.turn,
			phase: "attack",
		};
		syncState(drawDurakCards(nextState));
	};

	const playCard = (card: string) => {
		if (state?.phase === "attack") playAttack(card);
		else playDefense(card);
	};

	const host = () => {
		const nextState = createDurakState();
		setState(nextState);
		setOpponentReady(false);
		room.connect("player1");
	};

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={host}
				onJoin={() => { setState(null); setOpponentReady(false); room.connect("player2", room.roomCode); }}
				onDisconnect={room.disconnect}
			/>
			<Text style={[styles.gameStatus, { color: state?.winner ? currentTheme.accent : currentTheme.textPrimary }]}>
				{state?.winner ? `${state.winner.toUpperCase()} wins` : state ? `Trump ${state.trump} | ${state.phase} | ${state.turn}` : "Waiting for deal"}
			</Text>
			{state && (
				<View style={styles.durakTable}>
					<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>
						Deck {state.deck.length} | Opponent {room.role === "player1" ? state.player2Hand.length : state.player1Hand.length} | Ready {opponentReady ? "yes" : "no"}
					</Text>
					<View style={styles.durakCenter}>
						<Text style={[styles.cardText, { color: currentTheme.textPrimary }]}>Attack: {state.table.attack || "-"}</Text>
						<Text style={[styles.cardText, { color: currentTheme.textPrimary }]}>Defense: {state.table.defense || "-"}</Text>
					</View>
					<View style={styles.cardHand}>
						{myHand?.map((card, index) => (
							<Pressable key={`${card}-${index}`} onPress={() => playCard(card)} style={[styles.playingCard, { borderColor: currentTheme.gridBorder, backgroundColor: currentTheme.emptyBlockBorder }]}>
								<Text style={[styles.cardText, { color: cardSuit(card) === state.trump ? currentTheme.accent : currentTheme.textPrimary }]}>{card}</Text>
							</Pressable>
						))}
					</View>
					{state.phase === "defend" && room.role === defender && (
						<StylizedButton text="Take" onClick={takeCard} backgroundColor={cssColors.spaceGray} style={styles.resetButton} textStyle={styles.smallButtonText} />
					)}
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	moreHeaderRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 10,
	},
	topBackButton: {
		minWidth: 82,
		height: 34,
		minHeight: 34,
		margin: 0,
		paddingHorizontal: 8,
	},
	topBackSpacer: {
		width: 82,
	},
	moreHeaderTextBlock: {
		flex: 1,
		minWidth: 0,
		alignItems: "center",
	},
	header: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
	},
	subHeader: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
		marginTop: 2,
	},
	moreList: {
		width: "100%",
	},
	moreListContent: {
		gap: 8,
		paddingBottom: 18,
	},
	moreGameRow: {
		width: "100%",
		minHeight: 102,
		borderWidth: 2,
		borderRadius: 8,
		padding: 10,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	cardMain: {
		flex: 1,
		minWidth: 0,
		gap: 5,
	},
	cardTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 16,
	},
	cardDesc: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 14,
	},
	tagRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 4,
	},
	tag: {
		borderWidth: 1,
		borderRadius: 4,
		paddingHorizontal: 5,
		paddingVertical: 2,
		backgroundColor: "rgba(255, 255, 255, 0.04)",
	},
	tagText: {
		fontFamily: "Silkscreen",
		fontSize: 8,
	},
	playButton: {
		minWidth: 86,
		width: 86,
		height: 34,
		minHeight: 34,
		paddingHorizontal: 6,
		margin: 0,
	},
	smallButtonText: {
		fontSize: 10,
	},
	tinyButtonText: {
		fontSize: 9,
	},
	gameSurface: {
		width: "100%",
		flex: 1,
		alignItems: "center",
	},
	centerGame: {
		width: "100%",
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
	},
	gameStatus: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
		lineHeight: 20,
	},
	ticBoard: {
		width: 240,
		height: 240,
		flexDirection: "row",
		flexWrap: "wrap",
	},
	ticCell: {
		width: 80,
		height: 80,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	ticText: {
		fontFamily: "SilkscreenBold",
		fontSize: 34,
	},
	sudokuBoard: {
		width: 315,
		height: 315,
		flexDirection: "row",
		flexWrap: "wrap",
	},
	sudokuCell: {
		width: 35,
		height: 35,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	sudokuCellBottom: {
		borderBottomWidth: 3,
	},
	sudokuCellRight: {
		borderRightWidth: 3,
	},
	sudokuText: {
		fontFamily: "Silkscreen",
		fontSize: 14,
	},
	numberPad: {
		width: 315,
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	numberButton: {
		width: 40,
		minWidth: 40,
		height: 32,
		minHeight: 32,
		paddingHorizontal: 2,
		margin: 0,
	},
	clearNumberButton: {
		minWidth: 92,
		height: 32,
		minHeight: 32,
		margin: 0,
	},
	mahjongBoard: {
		width: 264,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		justifyContent: "center",
	},
	mahjongTile: {
		width: 58,
		height: 58,
		borderWidth: 2,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	mahjongText: {
		fontFamily: "SilkscreenBold",
		fontSize: 22,
	},
	roomPanel: {
		width: "100%",
		gap: 6,
		marginBottom: 8,
	},
	roomRow: {
		flexDirection: "row",
		gap: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	roomButton: {
		minWidth: 72,
		height: 34,
		minHeight: 34,
		margin: 0,
		paddingHorizontal: 5,
	},
	roomInput: {
		width: 96,
		height: 34,
		borderWidth: 2,
		borderRadius: 5,
		textAlign: "center",
		fontFamily: "Silkscreen",
		fontSize: 13,
		paddingHorizontal: 6,
	},
	roomMetaRow: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
	},
	roomMeta: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
	},
	leaveRoomButton: {
		minWidth: 58,
		height: 26,
		minHeight: 26,
		margin: 0,
		paddingHorizontal: 4,
	},
	onlineGame: {
		width: "100%",
		flex: 1,
		alignItems: "center",
		gap: 8,
	},
	battleBoards: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 14,
	},
	battleGridWrap: {
		alignItems: "center",
		gap: 5,
	},
	gridLabel: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
	},
	battleGrid: {
		width: 165,
		height: 165,
		flexDirection: "row",
		flexWrap: "wrap",
	},
	battleCell: {
		width: 33,
		height: 33,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	battleCellText: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
		color: "#FFFFFF",
	},
	chessBoard: {
		width: 320,
		height: 320,
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.35)",
	},
	chessCell: {
		width: 39.5,
		height: 39.5,
		alignItems: "center",
		justifyContent: "center",
	},
	chessPiece: {
		fontFamily: "SilkscreenBold",
		fontSize: 20,
		textShadowColor: "rgba(0,0,0,0.55)",
		textShadowOffset: { width: 1, height: 1 },
		textShadowRadius: 1,
	},
	resetButton: {
		minWidth: 124,
		height: 34,
		minHeight: 34,
		margin: 0,
	},
	durakTable: {
		width: "100%",
		alignItems: "center",
		gap: 10,
	},
	durakCenter: {
		width: "90%",
		minHeight: 62,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.24)",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: "rgba(0,0,0,0.24)",
	},
	cardHand: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	playingCard: {
		width: 52,
		height: 68,
		borderWidth: 2,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	cardText: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
		textAlign: "center",
	},
});
