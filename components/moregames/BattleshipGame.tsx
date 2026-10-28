import Svg, { Path } from "react-native-svg";
import { useWindowDimensions, View, Text, Pressable, Animated, PanResponder, Platform } from "react-native";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { submitMoreGameMatchResult } from "@/constants/Supabase";
import UiIcon from "@/components/UiIcon";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import { useUiScale } from "../SimplePopupView";
import ShipArt from "@/components/ShipArt";
import { recordMoreGameWin } from "@/constants/Achievements";
import { recordGameOutcome } from "@/constants/GameStats";
import { chooseBattleshipShot } from "@/constants/bots/BattleshipBot";
import { BotPanel, useBotSettings } from "./BotPanel";
import { BattleShip, DuelRole, OnlineRole } from "./types";
import { ExtraGameCosmetics, SEA_SKINS } from "./cosmetics";
import { OnlineRoomControls, SHOT_RESEND_LIMIT, SHOT_RESEND_MS, getDuelOpponent, isDuelRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { styles } from "./styles";
import { useIncomingGameInvite } from "@/constants/GameInvite";

export const BATTLE_BOARD_SIZE = 10;

export function createDefaultFleet(): BattleShip[] {
	return [
		{ id: "b4", name: "Carrier", length: 4, x: -99, y: 0, orientation: "h" },
		{ id: "b3a", name: "Cruiser A", length: 3, x: -99, y: 2, orientation: "h" },
		{ id: "b3b", name: "Cruiser B", length: 3, x: -99, y: 0, orientation: "v" },
		{ id: "b2a", name: "Destroyer A", length: 2, x: -99, y: 4, orientation: "h" },
		{ id: "b2b", name: "Destroyer B", length: 2, x: -99, y: 4, orientation: "h" },
		{ id: "b2c", name: "Destroyer C", length: 2, x: -99, y: 5, orientation: "v" },
		{ id: "b1a", name: "Boat A", length: 1, x: -99, y: 7, orientation: "h" },
		{ id: "b1b", name: "Boat B", length: 1, x: -99, y: 7, orientation: "h" },
		{ id: "b1c", name: "Boat C", length: 1, x: -99, y: 7, orientation: "h" },
		{ id: "b1d", name: "Boat D", length: 1, x: -99, y: 8, orientation: "h" },
	];
}

// Keeps the default ship ids so the selected ship (and rotation) still works after shuffling.
export function createRandomFleet(random: () => number = Math.random): BattleShip[] {
	const template = createDefaultFleet();
	for (let round = 0; round < 50; round += 1) {
		const placed: BattleShip[] = [];
		for (const ship of template) {
			let done = false;
			for (let attempt = 0; attempt < 100 && !done; attempt += 1) {
				const candidate: BattleShip = {
					...ship,
					orientation: ship.length === 1 || random() < 0.5 ? "h" : "v",
					x: Math.floor(random() * BATTLE_BOARD_SIZE),
					y: Math.floor(random() * BATTLE_BOARD_SIZE),
				};
				if (isShipPlacementValid(candidate, placed)) {
					placed.push(candidate);
					done = true;
				}
			}
			if (!done) break;
		}
		if (placed.length === template.length) return placed;
	}
	return template;
}

export function getShipCells(ship: BattleShip): string[] {
	return Array.from({ length: ship.length }, (_, index) => {
		const x = ship.x + (ship.orientation === "h" ? index : 0);
		const y = ship.y + (ship.orientation === "v" ? index : 0);
		return `${x},${y}`;
	});
}

export function isShipPlacementValid(candidate: BattleShip, fleet: BattleShip[]) {
	if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y) || !Number.isInteger(candidate.length) || candidate.length < 1 || candidate.length > 4 || !["h", "v"].includes(candidate.orientation)) return false;
	const cells = getShipCells(candidate);
	if (cells.some((cell) => {
		const [x, y] = cell.split(",").map(Number);
		return x < 0 || y < 0 || x >= BATTLE_BOARD_SIZE || y >= BATTLE_BOARD_SIZE;
	})) return false;

	// Получаем все клетки других кораблей и их соседей (по 8 направлениям)
	const otherShips = fleet.filter((ship) => ship.id !== candidate.id);
	const forbiddenCells = new Set<string>();

	for (const ship of otherShips) {
		const shipCells = getShipCells(ship);
		for (const cell of shipCells) {
			const [x, y] = cell.split(",").map(Number);
			// Добавляем саму клетку корабля
			forbiddenCells.add(cell);
			// Добавляем все 8 соседних клеток (включая диагонали)
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (dx === 0 && dy === 0) continue;
					forbiddenCells.add(`${x + dx},${y + dy}`);
				}
			}
		}
	}

	return cells.every((cell) => !forbiddenCells.has(cell));
}

/** Reply to a shot that was already resolved (the shooter re-sent it), or null for a new shot. */
export function getRepeatedShotReply(incoming: Record<string, "hit" | "miss">, occupied: Set<string>, cell: string) {
	const result = incoming[cell];
	if (!result) return null;
	return { result, lost: [...occupied].every((ship) => incoming[ship] === "hit") };
}

export function occupiedFleetCells(fleet: BattleShip[]) {
	return new Set(fleet.flatMap(getShipCells));
}

/** Cells of the ship that contains `cell` once every one of its cells was hit, or null while it floats. */
export function getSunkShipCells(fleet: BattleShip[], incoming: Record<string, string>, cell: string): string[] | null {
	for (const ship of fleet) {
		if (ship.x < 0) continue;
		const cells = getShipCells(ship);
		if (cells.includes(cell) && cells.every((shipCell) => incoming[shipCell] === "hit")) return cells;
	}
	return null;
}

/** Every cell of the given sunk ships plus the ring of cells around them, kept on the board. */
export function getCrossedCells(sunkShips: string[][]): Set<string> {
	const crossed = new Set<string>();
	for (const cells of sunkShips) {
		for (const cell of cells) {
			const [x, y] = cell.split(",").map(Number);
			for (let dx = -1; dx <= 1; dx += 1) {
				for (let dy = -1; dy <= 1; dy += 1) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && ny >= 0 && nx < BATTLE_BOARD_SIZE && ny < BATTLE_BOARD_SIZE) crossed.add(`${nx},${ny}`);
				}
			}
		}
	}
	return crossed;
}

export const CROSS_PIXELS = ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"];
export function CrossMark({ size }: { size: number }) {
	let d = "";
	CROSS_PIXELS.forEach((row, y) => {
		for (let x = 0; x < row.length; x += 1) if (row[x] === "#") d += `M${x} ${y}h1v1h-1z`;
	});
	return (
		<Svg width={size} height={size} viewBox="0 0 7 7">
			<Path d={d} fill="#F8FAFC" />
		</Svg>
	);
}

export function BattleshipGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const compactFleet = useWindowDimensions().width < 420;
	const battleGridSize = useBattleGridSize();
	const leftPanelWidth = battleGridSize > 220 ? Math.round((battleGridSize / 10) * 0.82 * 4) + 44 : 70;
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [fleet, setFleet] = useState(createDefaultFleet);
	const [selectedShipId, setSelectedShipId] = useState("b4");
	const [incomingShots, setIncomingShots] = useState<Record<string, "hit" | "miss">>({});
	const [targetShots, setTargetShots] = useState<Record<string, "pending" | "hit" | "miss">>({});
	// Cells of enemy ships that were sunk: they are crossed out together with the ring around them.
	const [targetSunk, setTargetSunk] = useState<string[][]>([]);
	const [turn, setTurn] = useState<DuelRole | null>("player1");
	const [winner, setWinner] = useState<DuelRole | null>(null);
	const [winnerSource, setWinnerSource] = useState<"normal" | "forfeit" | null>(null);
	const [ready, setReady] = useState(false);
	// Playing against the computer: it is player2, its fleet and sunk ships live here, never in a room.
	const { difficulty, setDifficulty, vsBot, setVsBot } = useBotSettings("battleship");
	const [botMode, setBotMode] = useState(false);
	const botFleetRef = useRef<BattleShip[]>([]);
	const botSunkRef = useRef<string[][]>([]);
	const [opponentReady, setOpponentReady] = useState(false);
	// A peer is in the room. The waiting screen ends here; the Ready buttons live on the next screen.
	const [opponentPresent, setOpponentPresent] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [timeLeft, setTimeLeft] = useState(60);
	const [boardLayout, setBoardLayout] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
	const [dragPreview, setDragPreview] = useState<{ shipId: string; x: number; y: number; valid: boolean } | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const fleetRef = useRef(fleet);
	const incomingRef = useRef(incomingShots);
	const winnerRef = useRef<DuelRole | null>(null);
	const startedRef = useRef(false);
	const pendingShotCellRef = useRef<string | null>(null);
	winnerRef.current = winner;
	startedRef.current = ready && opponentReady;
	const boardRef = useRef<View>(null);
	// Re-measure when a drag starts: the card may have moved or been scaled since the first layout.
	const remeasureBoard = () => {
		measureScreenRect(boardRef.current, (pageX, pageY, w, h) => {
			setBoardLayout({ x: pageX, y: pageY, w, h });
		});
	};

	useEffect(() => {
		fleetRef.current = fleet;
	}, [fleet]);

	useEffect(() => {
		incomingRef.current = incomingShots;
	}, [incomingShots]);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentPresent(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			roomRef.current?.send("ready_state", { ready, playerName });
			return;
		}
		if (event === "system_left" && isDuelRole(senderRole) && isDuelRole(roomRef.current.role)) {
			// A finished game keeps its result, and leaving before both fleets are ready is not a forfeit.
			if (winnerRef.current) return;
			if (!startedRef.current) {
				setOpponentReady(false);
				setOpponentPresent(false);
				return;
			}
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setWinnerSource("forfeit");
			setWinner(roomRef.current.role);
			return;
		}
		if (event === "rematch") {
			rematchLocal();
			return;
		}
		if (event === "ready_state") {
			if (payload.playerName) setOpponentName(normalizeStoredPlayerName(payload.playerName));
			setOpponentPresent(true);
			setOpponentReady(Boolean(payload.ready));
			return;
		}
		if (event === "timeout_pass") {
			const currentRole = roomRef.current.role;
			if (!isDuelRole(currentRole) || payload.to !== currentRole) return;
			setTurn(currentRole);
			setTimeLeft(60);
			return;
		}
		if (event === "shot") {
			const currentRole = roomRef.current.role;
			if (!isDuelRole(currentRole) || payload.to !== currentRole) return;
			const shotCell = String(payload.cell);
			const occupied = occupiedFleetCells(fleetRef.current);
			const repeated = getRepeatedShotReply(incomingRef.current, occupied, shotCell);
			if (repeated) {
				// A re-sent shot: our answer was lost, so repeat it. The turn already moved on.
				roomRef.current.send("shot_result", {
					to: payload.from,
					cell: shotCell,
					result: repeated.result,
					sunk: repeated.result === "hit" ? getSunkShipCells(fleetRef.current, incomingRef.current, shotCell) : null,
					winner: repeated.lost ? payload.from : null,
				});
				return;
			}
			const hit = occupied.has(shotCell);
			const nextIncoming: Record<string, "hit" | "miss"> = { ...incomingRef.current, [shotCell]: hit ? "hit" : "miss" };
			incomingRef.current = nextIncoming;
			setIncomingShots(nextIncoming);
			const lost = [...occupied].every((cell) => nextIncoming[cell] === "hit");
			if (lost && isDuelRole(payload.from)) {
				setWinnerSource("normal");
				setWinner(payload.from);
			}
			roomRef.current.send("shot_result", {
				to: payload.from,
				cell: shotCell,
				result: hit ? "hit" : "miss",
				sunk: hit ? getSunkShipCells(fleetRef.current, nextIncoming, shotCell) : null,
				winner: lost ? payload.from : null,
			});
			if (!lost) {
				// A hit lets the shooter fire again; a miss passes the turn to us.
				setTurn(hit && isDuelRole(payload.from) ? payload.from : currentRole);
				setTimeLeft(60);
			}
			return;
		}
		if (event === "shot_result") {
			const currentRole = roomRef.current.role;
			if (!isDuelRole(currentRole) || payload.to !== currentRole) return;
			// Ignore a duplicate result (the shot is re-sent when the first answer is lost).
			if (pendingShotCellRef.current !== String(payload.cell)) return;
			pendingShotCellRef.current = null;
			setTargetShots((current) => ({ ...current, [payload.cell]: payload.result }));
			if (Array.isArray(payload.sunk) && payload.sunk.length > 0 && payload.sunk.length <= 4 && payload.sunk.every((cell: unknown) => typeof cell === "string" && /^[0-9],[0-9]$/.test(cell))) {
				const sunkCells: string[] = payload.sunk;
				setTargetSunk((current) => [...current, sunkCells]);
			}
			if (payload.winner && isDuelRole(payload.winner)) {
				setWinnerSource("normal");
				setWinner(payload.winner);
			} else {
				setTurn(payload.result === "hit" ? currentRole : getDuelOpponent(currentRole));
				setTimeLeft(60);
			}
		}
	}, [ready, playerName]);

	const room = useMiniGameRoom("battleship", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	useEffect(() => {
		if (!ready || !opponentReady || winner) return;
		const timer = setInterval(() => {
			setTimeLeft((prev) => {
				if (prev <= 1) {
					if (botMode && turn === "player1") setTurn("player2");
					if (turn === roomRef.current.role && isDuelRole(roomRef.current.role)) {
						roomRef.current.send("timeout_pass", { from: roomRef.current.role, to: getDuelOpponent(roomRef.current.role) });
						setTurn(null);
					}
					return 60;
				}
				return prev - 1;
			});
		}, 1000);
		return () => clearInterval(timer);
	}, [ready, opponentReady, winner, turn, botMode]);

	useEffect(() => {
		if (!room.role && !botMode) {
			setOpponentPresent(false);
			setOpponentReady(false);
		}
	}, [room.role, botMode]);

	// an accepted invitation from a friend: join their room right away
	useIncomingGameInvite("battleship", (code) => { setBotMode(false); resetLocal(); room.setRoomCode(code); room.connect("player2", code); });

	const resetLocal = () => {
		setFleet(createDefaultFleet());
		setSelectedShipId("b4");
		setIncomingShots({});
		setTargetShots({});
		setTargetSunk([]);
		setTurn("player1");
		setWinner(null);
		setWinnerSource(null);
		setReady(false);
		setOpponentReady(false);
		setOpponentPresent(false);
		setTimeLeft(60);
		ratingSubmittedRef.current = null;
		pendingShotCellRef.current = null;
		setBotMode(false);
		botSunkRef.current = [];
	};

	// A new round with the same opponent: both sides place their fleets again, nobody has to rejoin.
	const rematchLocal = () => {
		setFleet(createDefaultFleet());
		setSelectedShipId("b4");
		setIncomingShots({});
		setTargetShots({});
		setTargetSunk([]);
		setTurn("player1");
		setWinner(null);
		setWinnerSource(null);
		setReady(false);
		setOpponentReady(false);
		setTimeLeft(60);
		ratingSubmittedRef.current = null;
		pendingShotCellRef.current = null;
	};

	const startBotGame = () => {
		if (!fleet.every((ship) => isShipPlacementValid(ship, fleet))) return;
		botFleetRef.current = createRandomFleet();
		botSunkRef.current = [];
		setIncomingShots({});
		setTargetShots({});
		setTargetSunk([]);
		setWinner(null);
		setWinnerSource(null);
		setOpponentName("Bot");
		setOpponentPresent(true);
		setOpponentReady(true);
		setReady(true);
		setBotMode(true);
		setTurn("player1");
		setTimeLeft(60);
	};

	const placeSelectedShip = (cell: string) => {
		if (ready) return;
		const [x, y] = cell.split(",").map(Number);
		setFleet((current) => {
			const selected = current.find((ship) => ship.id === selectedShipId);
			if (!selected) return current;
			const nextShip = { ...selected, x, y };
			if (isShipPlacementValid(nextShip, current)) {
				return current.map((ship) => (ship.id === selectedShipId ? nextShip : ship));
			}
			return current;
		});
	};

	const onDropShip = useCallback((shipId: string, pageX: number, pageY: number) => {
		if (ready || !boardLayout) return;
		const { x, y, w, h } = boardLayout;
		if (pageX >= x && pageX <= x + w && pageY >= y && pageY <= y + h) {
			const cellX = Math.floor((pageX - x) / (w / 10));
			const cellY = Math.floor((pageY - y) / (h / 10));

			setFleet((current) => {
				const selected = current.find((ship) => ship.id === shipId);
				if (!selected) return current;
				const nextShip = { ...selected, x: cellX, y: cellY };
				if (isShipPlacementValid(nextShip, current)) {
					return current.map((ship) => (ship.id === shipId ? nextShip : ship));
				}
				return current;
			});
		}
		setDragPreview(null);
	}, [boardLayout, ready]);

	const onDragMove = useCallback((shipId: string, pageX: number, pageY: number) => {
		if (!boardLayout) return;
		const { x, y, w, h } = boardLayout;
		if (pageX >= x && pageX <= x + w && pageY >= y && pageY <= y + h) {
			const cellX = Math.floor((pageX - x) / (w / 10));
			const cellY = Math.floor((pageY - y) / (h / 10));

			const ship = fleet.find((s) => s.id === shipId);
			if (!ship) return;

			const candidateShip = { ...ship, x: cellX, y: cellY };
			const valid = isShipPlacementValid(candidateShip, fleet);

			setDragPreview({ shipId, x: cellX, y: cellY, valid });
		} else {
			setDragPreview(null);
		}
	}, [boardLayout, fleet]);

	const onDragEnd = useCallback(() => {
		setDragPreview(null);
	}, []);

	const rotateSelectedShip = () => {
		if (ready) return;
		setFleet((current) => {
			const selected = current.find((ship) => ship.id === selectedShipId);
			if (!selected) return current;
			const nextShip = { ...selected, orientation: selected.orientation === "h" ? "v" as const : "h" as const };
			if (!isShipPlacementValid(nextShip, current)) return current;
			return current.map((ship) => ship.id === selectedShipId ? nextShip : ship);
		});
	};

	const randomizeFleet = () => {
		if (ready) return;
		setFleet(createRandomFleet());
	};

	const markReady = () => {
		if (!fleet.every((ship) => isShipPlacementValid(ship, fleet))) return;
		setReady(true);
		room.send("ready_state", { ready: true, playerName });
	};

	const targetCrossed = getCrossedCells(targetSunk);
	const ownCrossed = getCrossedCells(fleet.filter((ship) => ship.x >= 0 && getShipCells(ship).every((cell) => incomingShots[cell] === "hit")).map(getShipCells));

	useEffect(() => {
		if (!botMode || turn !== "player2" || winner) return;
		const timer = setTimeout(() => {
			const cell = chooseBattleshipShot(incomingShots, botSunkRef.current, difficulty);
			if (incomingShots[cell]) return;
			const occupied = occupiedFleetCells(fleet);
			const hit = occupied.has(cell);
			const nextIncoming: Record<string, "hit" | "miss"> = { ...incomingShots, [cell]: hit ? "hit" : "miss" };
			setIncomingShots(nextIncoming);
			const sunkCells = hit ? getSunkShipCells(fleet, nextIncoming, cell) : null;
			if (sunkCells) botSunkRef.current = [...botSunkRef.current, sunkCells];
			if ([...occupied].every((own) => nextIncoming[own] === "hit")) {
				setWinnerSource("normal");
				setWinner("player2");
				return;
			}
			// A hit lets the computer fire again, a miss gives the turn back.
			if (!hit) {
				setTurn("player1");
				setTimeLeft(60);
			}
		}, 650);
		return () => clearTimeout(timer);
	}, [botMode, turn, winner, incomingShots, fleet, difficulty]);

	// Count the win for achievements once per finished game.
	const winRecordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!winner) {
			winRecordedRef.current = null;
			return;
		}
		const iWon = botMode ? winner === "player1" : isDuelRole(room.role) && room.isConnected && winner === room.role;
		const iLost = !iWon && (botMode || (isDuelRole(room.role) && room.isConnected));
		if (!iWon && !iLost) return;
		const key = `${room.roomCode}:${botMode}:${winner}`;
		if (winRecordedRef.current === key) return;
		winRecordedRef.current = key;
		if (iWon) recordMoreGameWin("battleship", { vsBot: botMode, difficulty });
		else recordGameOutcome("battleship", "loss", { vsBot: botMode });
	}, [botMode, difficulty, room.isConnected, room.role, room.roomCode, winner]);

	const fire = (cell: string) => {
		if (targetCrossed.has(cell)) return;
		if (botMode) {
			if (winner || turn !== "player1" || targetShots[cell]) return;
			const occupied = occupiedFleetCells(botFleetRef.current);
			const hit = occupied.has(cell);
			const nextShots: Record<string, "pending" | "hit" | "miss"> = { ...targetShots, [cell]: hit ? "hit" : "miss" };
			setTargetShots(nextShots);
			const sunkCells = hit ? getSunkShipCells(botFleetRef.current, nextShots, cell) : null;
			if (sunkCells) setTargetSunk((current) => [...current, sunkCells]);
			if ([...occupied].every((own) => nextShots[own] === "hit")) {
				setWinnerSource("normal");
				setWinner("player1");
				return;
			}
			if (!hit) setTurn("player2");
			setTimeLeft(60);
			return;
		}
		if (!isDuelRole(room.role) || !room.isConnected || !ready || !opponentReady || winner || turn !== room.role || targetShots[cell] || pendingShotCellRef.current) return;
		pendingShotCellRef.current = cell;
		setTargetShots((current) => ({ ...current, [cell]: "pending" }));
		setTurn(null);
		room.send("shot", { from: room.role, to: getDuelOpponent(room.role), cell });
	};

	useEffect(() => {
		const cell = pendingShotCellRef.current;
		if (!cell || winner || targetShots[cell] !== "pending") return;
		let attempts = 0;
		const timer = setInterval(() => {
			const role = roomRef.current.role;
			if (!isDuelRole(role) || pendingShotCellRef.current !== cell) return;
			attempts += 1;
			if (attempts > SHOT_RESEND_LIMIT) {
				// No answer at all: free the cell and give the turn back so the player can shoot again.
				pendingShotCellRef.current = null;
				setTargetShots((current) => {
					const next = { ...current };
					delete next[cell];
					return next;
				});
				setTurn(role);
				setTimeLeft(60);
				return;
			}
			roomRef.current.send("shot", { from: role, to: getDuelOpponent(role), cell });
		}, SHOT_RESEND_MS);
		return () => clearInterval(timer);
	}, [targetShots, winner]);

	useEffect(() => {
		if (!winner || !room.isConnected || !isDuelRole(room.role)) return;
		// One rating per game: the room code is unique for each Sea Battle match.
		const resultKey = room.roomCode;
		if (ratingSubmittedRef.current === resultKey) return;
		const shouldSubmit = room.role === "player1" || winnerSource === "forfeit";
		if (!shouldSubmit) return;

		ratingSubmittedRef.current = resultKey;
		void submitMoreGameMatchResult({
			gameId: "battleship",
			player1Name: room.role === "player1" ? playerName : opponentName,
			player2Name: room.role === "player2" ? playerName : opponentName,
			result: winner,
			roomCode: room.roomCode,
			metadata: { source: winnerSource || "normal", matchId: room.roomCode },
		}).then(() => onRatingChange());
	}, [onRatingChange, opponentName, playerName, room.isConnected, room.role, room.roomCode, winner, winnerSource]);

	const allShipsPlaced = fleet.every((ship) => isShipPlacementValid(ship, fleet));

	if (!room.role && !botMode) {
		// Pre-lobby: place ships first, then host or join
		return (
			<View style={styles.onlineGame}>
				<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>{t("moregames.placeShips")}</Text>
				<View style={styles.battlePlayArea}>
					<View style={[styles.battleLeftPanel, { width: leftPanelWidth }, compactFleet && { width: "100%" }, { zIndex: 200, elevation: 200 }]}>
						<View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
							<Pressable onPress={rotateSelectedShip} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 22, color: '#FFF', lineHeight: 26 }}>↻</Text>
							</Pressable>
							<Pressable onPress={randomizeFleet} style={styles.battleRotateButton}>
								<UiIcon name="dice" size={18} />
							</Pressable>
						</View>
						<View style={[styles.fleetVerticalList, compactFleet && { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }, { overflow: 'visible' }]}>
							{fleet.map((ship) => (
								<ShipDragItem
									key={ship.id}
									ship={ship}
									selected={ship.id === selectedShipId}
									onSelect={() => { setSelectedShipId(ship.id); remeasureBoard(); }}
									onDrop={onDropShip}
									onDragMove={onDragMove}
									onDragEnd={onDragEnd}
									paper={SEA_SKINS[cosmetics.seaSkin].paper}
								/>
							))}
						</View>
						{!allShipsPlaced && (
							<Text style={{ color: '#FACC15', fontFamily: 'Silkscreen', fontSize: 8, textAlign: 'center', marginTop: 4 }}>
								{`${fleet.filter(s => s.x >= 0).length}/${fleet.length}`}
							</Text>
						)}
					</View>
					<View style={[styles.battleBoardsVertical, { zIndex: 1 }]}>
						<View ref={boardRef} onLayout={() => {
							measureScreenRect(boardRef.current, (pageX, pageY, w, h) => {
								setBoardLayout({ x: pageX, y: pageY, w, h });
							});
						}}>
							<BattleGrid testPrefix="sea-mine" title={t("moregames.myFleet")} cells={incomingShots} crossed={ownCrossed} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
						</View>
						<View style={styles.battleLobbyButtons}>
							<BotPanel vsBot={vsBot} onVsBotChange={setVsBot} difficulty={difficulty} onDifficultyChange={setDifficulty} friendLabel={t("bot.online")} />
							<Collapsible visible={vsBot}>
								<StylizedButton text={t("bot.play")} onClick={startBotGame} backgroundColor={allShipsPlaced ? currentTheme.buttonPrimary : "#555"} style={{ marginTop: 10 }} disabled={!allShipsPlaced} />
							</Collapsible>
							<Collapsible visible={!vsBot}>
<OnlineRoomControls inviteGame="battleship" inviteHostName={playerName}
								roomCode={room.roomCode}
								setRoomCode={room.setRoomCode}
								role={room.role}
								status={room.status}
								onHost={() => { room.connect("player1"); }}
								onJoin={() => { room.connect("player2", room.roomCode); }}
								onDisconnect={room.disconnect}
								disabled={!allShipsPlaced}
							/>
							</Collapsible>
							{!allShipsPlaced && (
								<Text style={{ color: '#F87171', fontFamily: 'Silkscreen', fontSize: 9, textAlign: 'center', marginTop: 6 }}>
									Place all ships first!
								</Text>
							)}
						</View>
					</View>
				</View>
			</View>
		);
	}

	if (room.role && !opponentPresent) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: 'center' }]}>
				<OnlineRoomControls inviteGame="battleship" inviteHostName={playerName}
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentPresent}
					onHost={() => { resetLocal(); room.connect("player1"); }}
					onJoin={() => { resetLocal(); room.connect("player2", room.roomCode); }}
					onDisconnect={room.disconnect}
				/>
			</View>
		);
	}

	return (
		<View style={styles.onlineGame}>

			{ready && opponentReady && !winner ? (
				<View style={styles.battlePlayersHeader}>
					<View style={[styles.battlePlayerBadge, turn === (botMode ? "player1" : room.role) ? styles.battleTurnActive : null]}>
						<Text style={styles.battlePlayerName}>{playerName}</Text>
						<Text style={styles.battlePlayerLabel}>{t("moregames.you")}</Text>
					</View>
					
					<View style={styles.battleTimerCenter}>
						<Text style={styles.battleTimerText}>{t("battleship.timer", { time: timeLeft })}</Text>
						<Text style={styles.battleTurnArrow}>
							{turn === (botMode ? "player1" : room.role) ? "←" : "→"}
						</Text>
					</View>
					
					<View style={[styles.battlePlayerBadge, turn !== (botMode ? "player1" : room.role) ? styles.battleTurnActive : null]}>
						<Text style={styles.battlePlayerName}>{opponentName}</Text>
						<Text style={styles.battlePlayerLabel}>{t("moregames.colPlayer")}</Text>
					</View>
				</View>
			) : (
				<Text style={[styles.gameStatus, { color: winner ? currentTheme.accent : currentTheme.textPrimary }]}>
					{winner ? t("moregames.wins", { name: botMode ? (winner === "player1" ? playerName : opponentName) : roleLabel(winner) }) : t("moregames.placeShips")}
				</Text>
			)}
			<View style={styles.battlePlayArea}>
				{!ready && (
					<View style={[styles.battleLeftPanel, { width: leftPanelWidth }, { zIndex: 200, elevation: 200 }]}>
						<View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
							<Pressable onPress={rotateSelectedShip} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 22, color: '#FFF', lineHeight: 26 }}>↻</Text>
							</Pressable>
							<Pressable onPress={randomizeFleet} style={styles.battleRotateButton}>
								<UiIcon name="dice" size={18} />
							</Pressable>
						</View>
						<View style={[styles.fleetVerticalList, { overflow: 'visible' }]}>
							{fleet.map((ship) => (
								<ShipDragItem
									key={ship.id}
									ship={ship}
									selected={ship.id === selectedShipId}
									onSelect={() => { setSelectedShipId(ship.id); remeasureBoard(); }}
									onDrop={onDropShip}
									onDragMove={onDragMove}
									onDragEnd={onDragEnd}
									paper={SEA_SKINS[cosmetics.seaSkin].paper}
								/>
							))}
						</View>
						<StylizedButton text={t("moregames.ready")} onClick={markReady} backgroundColor={allShipsPlaced ? currentTheme.buttonPrimary : '#555'} style={[styles.miniActionButton, { width: '100%', marginTop: 10 }]} textStyle={styles.tinyButtonText} disabled={ready || !allShipsPlaced} />
					</View>
				)}
				<View style={[styles.battleBoardsVertical, { zIndex: 1 }]}>
					{ready ? <BattleGrid testPrefix="sea-target" title={t("moregames.target")} cells={targetShots} crossed={targetCrossed} onPress={fire} cosmetics={cosmetics} /> : null}
					<View ref={boardRef} onLayout={() => {
						measureScreenRect(boardRef.current, (pageX, pageY, w, h) => {
							setBoardLayout({ x: pageX, y: pageY, w, h });
						});
					}}>
						<BattleGrid testPrefix="sea-mine" title={t("moregames.myFleet")} cells={incomingShots} crossed={ownCrossed} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
					</View>
				</View>
			</View>
			{winner && !botMode && isDuelRole(room.role) && room.isConnected && (
				<StylizedButton text={t("moregames.rematch")} onClick={() => { rematchLocal(); room.send("rematch", {}); }} backgroundColor="#16A34A" style={styles.resetButton} textStyle={styles.smallButtonText} />
			)}
			{botMode && (
				<StylizedButton text={t("bot.newGame")} onClick={resetLocal} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
			)}
		</View>
	);
}

export function ShipDragItem({ ship, onDrop, selected, onSelect, paper, onDragMove, onDragEnd }: {
	ship: BattleShip,
	onDrop: (id: string, x: number, y: number) => void,
	selected: boolean,
	onSelect: () => void,
	paper: boolean,
	onDragMove?: (shipId: string, pageX: number, pageY: number) => void,
	onDragEnd?: () => void
}) {
	const pan = useRef(new Animated.ValueXY()).current;
	const isDragging = useRef(false);
	const uiScaleRef = useRef(1);
	uiScaleRef.current = useUiScale();
	const panResponder = useMemo(() => PanResponder.create({
		onStartShouldSetPanResponder: () => true,
		onMoveShouldSetPanResponder: () => true,
		onPanResponderGrant: () => {
			isDragging.current = true;
			onSelect();
			pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
			pan.setValue({ x: 0, y: 0 });
		},
		onPanResponderMove: (e: any, gs) => {
			pan.setValue({ x: gs.dx / uiScaleRef.current, y: gs.dy / uiScaleRef.current });
			if (onDragMove && isDragging.current) {
				onDragMove(ship.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
			}
		},
		onPanResponderRelease: (e) => {
			isDragging.current = false;
			pan.flattenOffset();
			onDrop(ship.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
			if (onDragEnd) onDragEnd();
			Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
		}
	}), [ship.id, onDrop, onSelect, onDragMove, onDragEnd]);

	const cellSize = Math.round((useBattleGridSize() / 10) * 0.82);
	const w = ship.orientation === "h" ? ship.length * cellSize : cellSize;
	const h = ship.orientation === "v" ? ship.length * cellSize : cellSize;

	return (
		<Animated.View
			{...panResponder.panHandlers}
			style={[
				{ width: w, height: h, marginVertical: 6 },
				pan.getLayout(),
				{ zIndex: selected ? 9999 : 10, elevation: selected ? 9999 : 10 }
			]}
		>
			<ShipArt length={ship.length} orientation={ship.orientation} selected={selected} />
		</Animated.View>
	);
}

// Sea Battle board edge in px. The popup card itself is scaled up on big screens.
export function getBattleGridSize(_width: number, _height: number) {
	return 220;
}

// Screen-space rectangle of a view, in the same coordinates as touch pageX/pageY. On web, measure()
// ignores CSS transforms (the popup card is scaled on big screens), so measureInWindow is used there.
export function measureScreenRect(view: View | null | undefined, onRect: (x: number, y: number, w: number, h: number) => void) {
	if (!view) return;
	if (Platform.OS === "web") {
		view.measureInWindow((x, y, w, h) => onRect(x, y, w, h));
	} else {
		view.measure((_x, _y, w, h, pageX, pageY) => onRect(pageX, pageY, w, h));
	}
}

export function useBattleGridSize() {
	const { width, height } = useWindowDimensions();
	return getBattleGridSize(width, height);
}

export function BattleGrid({
	title,
	cells,
	crossed,
	ships,
	selectedShipId,
	onPress,
	cosmetics,
	dragPreview,
	testPrefix,
}: {
	title: string;
	testPrefix?: string;
	cells: Record<string, string>;
	crossed?: Set<string>;
	ships?: BattleShip[];
	selectedShipId?: string;
	onPress?: (cell: string) => void;
	cosmetics: ExtraGameCosmetics;
	dragPreview?: { shipId: string; x: number; y: number; valid: boolean } | null;
}) {
	const { currentTheme } = useTheme();
	// Only show ships that are placed on the board (x >= 0)
	const placedShips = ships?.filter(s => s.x >= 0 && s.x < BATTLE_BOARD_SIZE) ?? [];
	const shipByCell = new Map<string, BattleShip>();
	placedShips.forEach((ship) => getShipCells(ship).forEach((cell) => shipByCell.set(cell, ship)));
	const sea = SEA_SKINS[cosmetics.seaSkin];

	// Получаем клетки для превью
	const previewCells = new Set<string>();
	if (dragPreview && ships) {
		const previewShip = ships.find(s => s.id === dragPreview.shipId);
		if (previewShip) {
			const previewShipData = { ...previewShip, x: dragPreview.x, y: dragPreview.y };
			getShipCells(previewShipData).forEach(cell => previewCells.add(cell));
		}
	}

	const gridSize = useBattleGridSize();
	const markSize = Math.max(18, Math.round((gridSize / 10) * 0.8 / 9) * 9);
	const waterColor = sea.water;

	return (
		<View style={styles.battleGridWrap}>
			<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>{title}</Text>
			<View style={[styles.battleGrid, { width: gridSize, height: gridSize }, { backgroundColor: sea.gridBg, borderColor: sea.gridBorder }]}>
				{Array.from({ length: BATTLE_BOARD_SIZE }).map((_, rowIndex) => (
					<View key={`row-${rowIndex}`} style={styles.battleRow}>
						{Array.from({ length: BATTLE_BOARD_SIZE }).map((_, colIndex) => {
							const cell = `${colIndex},${rowIndex}`;
							const status = cells[cell];
							const isPreviewCell = previewCells.has(cell);
							const previewColor = dragPreview?.valid ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)";
							const backgroundColor = isPreviewCell
								? previewColor
								: status === "hit"
									? "#DC2626"
									: status === "miss"
										? sea.miss
										: status === "pending"
											? "#FACC15"
											: waterColor;
							return (
								<Pressable
									key={cell}
									testID={testPrefix ? `${testPrefix}-${cell}` : undefined}
									onPress={() => onPress?.(cell)}
									style={[styles.battleCell, { backgroundColor, borderColor: sea.cellBorder ?? currentTheme.gridBorder }]}
								/>
							);
						})}
					</View>
				))}

				<View style={styles.battleOverlay} pointerEvents="none">
					{placedShips.map((ship) => {
						const horizontal = ship.orientation === "h" || ship.length === 1;
						return (
							<View
								key={ship.id}
								style={{
									position: "absolute",
									left: `${ship.x * 10}%`,
									top: `${ship.y * 10}%`,
									width: `${(horizontal ? ship.length : 1) * 10}%`,
									height: `${(horizontal ? 1 : ship.length) * 10}%`,
								}}
							>
								<ShipArt length={ship.length} orientation={ship.orientation} selected={ship.id === selectedShipId} />
							</View>
						);
					})}
				</View>

				<View style={styles.battleOverlay} pointerEvents="none">
					{Array.from({ length: BATTLE_BOARD_SIZE }).map((_, rowIndex) => (
						<View key={`mark-row-${rowIndex}`} style={styles.battleRow}>
							{Array.from({ length: BATTLE_BOARD_SIZE }).map((_, colIndex) => {
								const status = cells[`${colIndex},${rowIndex}`];
								return (
									<View key={colIndex} style={[styles.battleMarkCell, status === "hit" && styles.battleHitCell]}>
										{crossed?.has(`${colIndex},${rowIndex}`) ? <CrossMark size={markSize} /> : status === "hit" ? <UiIcon name="fire" size={markSize} /> : status === "miss" ? <UiIcon name="wave" size={markSize} /> : null}
									</View>
								);
							})}
						</View>
					))}
				</View>
			</View>
		</View>
	);
}