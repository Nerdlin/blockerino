import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import Svg, { Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chess } from "chess.js";
import { Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, Image, ActivityIndicator, Clipboard, LayoutAnimation, UIManager } from "react-native";

import Slider from '@react-native-community/slider';
import SimplePopupView, { useUiScale } from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import {
	getMoreGameLeaderboard,
	getPlayerMoreGameRating,
	MoreGameRating,
	MoreGameRatingGameId,
	submitMoreGameMatchResult,
	submitMoreGameSoloResult,
	supabase,
	getPlayerProfileData,
	durakPayAnte,
	durakReport,
} from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState, loadShopState, ShopItem, ShopCategory, getVisibleShopItemsByCategory } from "@/constants/Shop";
import { MenuStateType, useAppState } from "@/hooks/useAppState";
import { setProfileAuthIntent } from "@/constants/ProfileIntent";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { track } from "@/constants/Analytics";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import PixelIcon from "@/components/PixelIcon";
import ShipArt from "@/components/ShipArt";
import UiIcon from "@/components/UiIcon";
import type { UiGlyphName } from "@/constants/UiGlyphs";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

type MoreGameId = "shop" | "battleship" | "durak" | "chess" | "sudoku" | "tictactoe" | "mahjong";
type OnlineRole = "player1" | "player2" | "player3" | "player4" | "player5" | "player6";
type DuelRole = "player1" | "player2";
type RoomStatus = "offline" | "connecting" | "connected" | "error";
type TicMark = "X" | "O";
type ShipOrientation = "h" | "v";
type DurakVariant = "throw_in" | "transfer" | "cheat" | "neighbors" | "classic" | "all" | "fair" | "draw";
type RatedMoreGameId = Exclude<MoreGameId, "shop">;

interface MoreGameCard {
	id: MoreGameId;
	title: string;
	color: string;
	description: string;
	tags: string[];
}

// Cosmetic palettes of the More Games shop. Every shop item id (without its category prefix) has an entry here.
export const CHESS_BOARD_COLORS = {
	slate: { light: "#CBD5E1", dark: "#334155" },
	violet: { light: "#C4B5FD", dark: "#7C3AED" },
	walnut: { light: "#E8C99B", dark: "#8B5E34" },
	emerald: { light: "#EEEED2", dark: "#769656" },
	ice: { light: "#DEEAF6", dark: "#5B8DB8" },
	candy: { light: "#FCE7F3", dark: "#D9619A" },
} as const satisfies Record<string, { light: string; dark: string }>;

export const CHESS_PIECE_COLORS = {
	classic: { white: "#FFFFFF", black: "#111827", heavy: false },
	royal: { white: "#FDE047", black: "#111827", heavy: false },
	club: { white: "#E5E7EB", black: "#1F2937", heavy: true },
	neon: { white: "#67E8F9", black: "#581C87", heavy: false },
	ember: { white: "#FED7AA", black: "#7F1D1D", heavy: false },
	frost: { white: "#E0F2FE", black: "#1E3A8A", heavy: false },
} as const satisfies Record<string, { white: string; black: string; heavy: boolean }>;

export const MAHJONG_THEMES = {
	jade: { board: "#0F3A3E", boardBorder: "#2DD4BF", tile: "#ECFDF5", tileBorder: "#0F766E", text: "#047857" },
	ivory: { board: "#78350F", boardBorder: "#FED7AA", tile: "#FFF7ED", tileBorder: "#B45309", text: "#991B1B" },
	onyx: { board: "#0B0B10", boardBorder: "#FACC15", tile: "#1F2937", tileBorder: "#6B7280", text: "#FACC15" },
	ruby: { board: "#450A0A", boardBorder: "#F87171", tile: "#FEF2F2", tileBorder: "#B91C1C", text: "#B91C1C" },
	sakura: { board: "#4A1D3A", boardBorder: "#F9A8D4", tile: "#FDF2F8", tileBorder: "#BE185D", text: "#9D174D" },
} as const satisfies Record<string, { board: string; boardBorder: string; tile: string; tileBorder: string; text: string }>;

export const CARD_SKINS = {
	classic: { faceBg: null, faceBorder: null, backBg: "#1E40AF", backBorder: "#FFFFFF", backGlyph: "#60A5FA" },
	casino: { faceBg: "#F8FAFC", faceBorder: "#FACC15", backBg: "#B91C1C", backBorder: "#FACC15", backGlyph: "#FCA5A5" },
	midnight: { faceBg: "#F8FAFC", faceBorder: "#6366F1", backBg: "#111827", backBorder: "#6366F1", backGlyph: "#818CF8" },
	forest: { faceBg: "#F7FEE7", faceBorder: "#16A34A", backBg: "#14532D", backBorder: "#86EFAC", backGlyph: "#4ADE80" },
	sakura: { faceBg: "#FFF1F2", faceBorder: "#F472B6", backBg: "#BE185D", backBorder: "#FBCFE8", backGlyph: "#F9A8D4" },
} as const satisfies Record<string, { faceBg: string | null; faceBorder: string | null; backBg: string; backBorder: string; backGlyph: string }>;

export const SEA_SKINS = {
	navy: { paper: false, gridBg: "#082F49", gridBorder: "#38BDF8", water: "rgba(14,165,233,0.12)", miss: "#1E40AF", cellBorder: null },
	paper: { paper: true, gridBg: "#DBEAFE", gridBorder: "#1E3A8A", water: "rgba(255,255,255,0.32)", miss: "#CBD5E1", cellBorder: "#2563EB" },
	sonar: { paper: false, gridBg: "#022C22", gridBorder: "#34D399", water: "rgba(52,211,153,0.10)", miss: "#065F46", cellBorder: "rgba(52,211,153,0.35)" },
	sunset: { paper: false, gridBg: "#431407", gridBorder: "#FB923C", water: "rgba(251,146,60,0.14)", miss: "#9A3412", cellBorder: "rgba(251,146,60,0.4)" },
	blueprint: { paper: false, gridBg: "#1D4ED8", gridBorder: "#BFDBFE", water: "rgba(191,219,254,0.18)", miss: "#1E3A8A", cellBorder: "rgba(191,219,254,0.55)" },
} as const satisfies Record<string, { paper: boolean; gridBg: string; gridBorder: string; water: string; miss: string; cellBorder: string | null }>;

interface SudokuPalette {
	surface: { bg: string; border: string } | null;
	boardBorder: string;
	boardBg: string;
	cellBorder: string;
	cellBg: string;
	cellShadow: string | null;
	related: string;
	selected: string;
	/** Colours left undefined fall back to the app theme (the dark themes). */
	status?: string;
	given?: string;
	entry?: string;
	notes?: string;
	tile: { bg: string; border: string } | null;
	tileText?: string;
}

export const SUDOKU_THEMES = {
	wood: {
		surface: { bg: "#D8A868", border: "#7C2D12" }, boardBorder: "#5B2E14", boardBg: "#B77C43", cellBorder: "#7C2D12", cellBg: "#F6D7B0",
		cellShadow: "#7C2D12", related: "#E9C99A", selected: "#FACC15", status: "#5B2E14", given: "#5B2E14", entry: "#7C2D12", notes: "#8B5E34",
		tile: { bg: "#F6D7B0", border: "#7C2D12" }, tileText: "#5B2E14",
	},
	night: {
		surface: null, boardBorder: "#94A3B8", boardBg: "#020617", cellBorder: "#475569", cellBg: "#111827", cellShadow: null,
		related: "rgba(96,165,250,0.16)", selected: "#334155", tile: null,
	},
	mint: {
		surface: { bg: "#BBF7D0", border: "#166534" }, boardBorder: "#14532D", boardBg: "#16A34A", cellBorder: "#166534", cellBg: "#F0FDF4",
		cellShadow: null, related: "#DCFCE7", selected: "#FDE047", status: "#14532D", given: "#14532D", entry: "#0F766E", notes: "#4D7C0F",
		tile: { bg: "#F0FDF4", border: "#166534" }, tileText: "#14532D",
	},
	ocean: {
		surface: { bg: "#BAE6FD", border: "#075985" }, boardBorder: "#0C4A6E", boardBg: "#0284C7", cellBorder: "#075985", cellBg: "#F0F9FF",
		cellShadow: null, related: "#E0F2FE", selected: "#FDE047", status: "#0C4A6E", given: "#0C4A6E", entry: "#1D4ED8", notes: "#0369A1",
		tile: { bg: "#F0F9FF", border: "#075985" }, tileText: "#0C4A6E",
	},
	neon: {
		surface: null, boardBorder: "#22D3EE", boardBg: "#050816", cellBorder: "#155E75", cellBg: "#0B1220", cellShadow: null,
		related: "rgba(34,211,238,0.14)", selected: "#164E63", entry: "#22D3EE", notes: "#67E8F9", tile: null,
	},
} as const satisfies Record<string, SudokuPalette>;

interface ExtraGameCosmetics {
	chessPieces: keyof typeof CHESS_PIECE_COLORS;
	chessBoard: keyof typeof CHESS_BOARD_COLORS;
	sudokuTheme: keyof typeof SUDOKU_THEMES;
	mahjongTheme: keyof typeof MAHJONG_THEMES;
	cardSkin: keyof typeof CARD_SKINS;
	seaSkin: keyof typeof SEA_SKINS;
}

interface BattleShip {
	id: string;
	name: string;
	length: number;
	x: number;
	y: number;
	orientation: ShipOrientation;
}

interface MahjongTile {
	id: string;
	symbol: string;
	matchKey: string;
	x: number;
	y: number;
	z: number;
	removed: boolean;
}

interface DurakBout {
	attack: string;
	defense: string | null;
}

interface DurakState {
	deck: string[];
	trump: string;
	hands: Record<OnlineRole, string[]>;
	table: DurakBout[];
	attacker: OnlineRole;
	defender: OnlineRole;
	playerCount: number;
	variants: DurakVariant[];
	phase: "attack" | "defend" | "throw";
	discardCount: number;
	winner: OnlineRole | null;
	finished?: OnlineRole[];
	draw?: boolean;
	cancelled?: boolean;
	message: string;
	bet: number;
	deckSize: number;
	tableId: string;
	bustedCheaters?: OnlineRole[];
}

const DURAK_BET_PRESETS = [100, 1000, 10000, 100000, 1000000, 10000000];
const DURAK_DECK_SIZES = [24, 36, 52] as const;
const DURAK_EMOJIS = ["face-happy", "face-sad", "skull", "heart", "coin", "medal", "crown", "gear", "fire", "star", "bomb", "shield", "sword", "diamond", "ghost", "alien"];

// Everyone antes once. The winner receives the full pot, so their net gain is
// (players - 1) * bet: 1v1 @100 -> +100, 6 players @100 -> +500.
export function getDurakPayout(bet: number, playerCount: number): number {
	return Math.max(0, bet * playerCount);
}

export function getDurakNetPrize(bet: number, playerCount: number): number {
	return Math.max(0, getDurakPayout(bet, playerCount) - bet);
}

function formatCoins(amount: number): string {
	if (amount >= 1000000) return `${amount % 1000000 === 0 ? amount / 1000000 : (amount / 1000000).toFixed(1)}M`;
	if (amount >= 1000) return `${amount % 1000 === 0 ? amount / 1000 : (amount / 1000).toFixed(1)}K`;
	return `${amount}`;
}

const ONLINE_ROLES: OnlineRole[] = ["player1", "player2", "player3", "player4", "player5", "player6"];
const EXTRA_COSMETICS_KEY = "EXTRA_GAME_COSMETICS_V1";
const PLAYER_NAME_KEY = "PLAYER_NAME";
const DEFAULT_MORE_GAME_PLAYER_NAME = "Player";

/** Resolves an equipped shop item id to a palette key, falling back when the id is missing or unknown. */
export function pickCosmetic<T extends Record<string, unknown>>(palettes: T, itemId: string | undefined, prefix: string, fallback: keyof T): keyof T {
	const key = itemId?.startsWith(prefix) ? itemId.slice(prefix.length) : itemId;
	return key !== undefined && Object.prototype.hasOwnProperty.call(palettes, key) ? key as keyof T : fallback;
}

const DEFAULT_EXTRA_COSMETICS: ExtraGameCosmetics = {
	chessPieces: "royal",
	chessBoard: "violet",
	sudokuTheme: "wood",
	mahjongTheme: "jade",
	cardSkin: "classic",
	seaSkin: "paper",
};

const MORE_GAME_CARDS: MoreGameCard[] = [
	{
		id: "shop",
		title: "Extra Game Shop",
		color: "#FACC15",
		description: "Switch chess pieces, boards, cards, ships, sudoku and mahjong skins.",
		tags: ["skins", "boards", "style"],
	},
	{
		id: "battleship",
		title: "Sea Battle Online",
		color: "#38BDF8",
		description: "10x10 duel with movable multi-cell ships, ready checks, hits and sunk fleet wins.",
		tags: ["online", "10x10", "ships"],
	},
	{
		id: "durak",
		title: "Durak Online",
		color: "#F97316",
		description: "Realtime Durak with card faces, throw-in, transfer, cheat mode and 2-6 seats.",
		tags: ["online", "cards", "2-6"],
	},
	{
		id: "chess",
		title: "Chess Online",
		color: "#E5E7EB",
		description: "Legal moves, board rotation, checkmate/draw states and skinable boards.",
		tags: ["online", "rules", "1v1"],
	},
	{
		id: "sudoku",
		title: "Sudoku",
		color: "#A3E635",
		description: "Polished logic board with highlighting, mistakes, notes and a calmer tile UI.",
		tags: ["solo", "logic", "notes"],
	},
	{
		id: "tictactoe",
		title: "Tic-Tac-Toe Online",
		color: "#F472B6",
		description: "Quick local or realtime room-code duel with win and draw sync.",
		tags: ["online", "quick", "1v1"],
	},
	{
		id: "mahjong",
		title: "Mahjong Match",
		color: "#2DD4BF",
		description: "Layered tile matching with free-tile rules, hints, undo and shuffle.",
		tags: ["solo", "tiles", "layers"],
	},
];

const RATED_MORE_GAME_IDS: RatedMoreGameId[] = ["battleship", "durak", "chess", "tictactoe", "sudoku", "mahjong"];
const RATED_MORE_GAME_CARDS = MORE_GAME_CARDS.filter((card): card is MoreGameCard & { id: RatedMoreGameId } => card.id !== "shop");
const ELO_TIERS = [
	{ tier: "Bronze", color: "#CD7F32", icon: "medalBronze" as const, min: 0, max: 800 },
	{ tier: "Silver", color: "#C0C0C0", icon: "medalSilver" as const, min: 800, max: 1000 },
	{ tier: "Gold", color: "#FFD700", icon: "medalGold" as const, min: 1000, max: 1200 },
	{ tier: "Diamond", color: "#00BFFF", icon: "diamond" as const, min: 1200, max: 1400 },
	{ tier: "Master", color: "#DA70D6", icon: "star" as const, min: 1400, max: 1600 },
	{ tier: "Legend", color: "#FF4500", icon: "crown" as const, min: 1600, max: 2000 },
];

function getMoreGameEloBadge(elo: number) {
	return ELO_TIERS.find((tier) => elo < tier.max) || ELO_TIERS[ELO_TIERS.length - 1];
}

function normalizeStoredPlayerName(value: string | null | undefined) {
	const name = (value || "").trim().slice(0, 24);
	return name || DEFAULT_MORE_GAME_PLAYER_NAME;
}

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

function roleLabel(role: OnlineRole | null) {
	if (!role) return "No seat";
	return `P${ONLINE_ROLES.indexOf(role) + 1}`;
}

function isDuelRole(role: OnlineRole | null | undefined): role is DuelRole {
	return role === "player1" || role === "player2";
}

function getDuelOpponent(role: DuelRole): DuelRole {
	return role === "player1" ? "player2" : "player1";
}

function getActiveDurakRoles(playerCount: number) {
	return ONLINE_ROLES.slice(0, playerCount);
}

function getNextDurakRole(role: OnlineRole, playerCount: number, hands?: Record<OnlineRole, string[]>, allowEmpty: boolean = false): OnlineRole {
	const roles = getActiveDurakRoles(playerCount);
	const start = roles.indexOf(role);
	for (let offset = 1; offset <= roles.length; offset += 1) {
		const candidate = roles[(start + offset) % roles.length];
		if (allowEmpty || !hands || hands[candidate].length > 0) return candidate;
	}
	return roles[(start + 1) % roles.length];
}

const SHOT_RESEND_MS = 3000;
const SHOT_RESEND_LIMIT = 4;
const PRESENCE_LEAVE_GRACE_MS = 10000;
const ROOM_JOIN_TIMEOUT_MS = 12000;

export function useMiniGameRoom(gameId: MoreGameId, onEvent: (event: string, payload: any, senderRole?: OnlineRole) => void, playerName: string = DEFAULT_MORE_GAME_PLAYER_NAME, avatarUrl?: string) {
	// Durak and Sea Battle hand out seats: the host seats each guest and ignores everyone else.
	const usesSeats = gameId === 'durak' || gameId === 'battleship';
	const [roomCode, setRoomCode] = useState("");
	const [role, setRole] = useState<OnlineRole | null>(null);
	const [status, setStatus] = useState<RoomStatus>("offline");
	const channelRef = useRef<any>(null);
	const roleRef = useRef<OnlineRole | null>(null);
	const onEventRef = useRef(onEvent);
	const playerNameRef = useRef(playerName);
	const avatarUrlRef = useRef(avatarUrl);
	const clientIdRef = useRef(createRoomCode());
	const seatsRef = useRef<Record<string, OnlineRole>>({});
	const capacityRef = useRef(2);
	const seatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const seatConfirmedRef = useRef(false);
	const tableStartedRef = useRef(false);
	const leftKeysRef = useRef<Set<string>>(new Set());
	const presenceTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	useEffect(() => {
		playerNameRef.current = playerName;
	}, [playerName]);

	useEffect(() => {
		avatarUrlRef.current = avatarUrl;
	}, [avatarUrl]);

	const disconnect = useCallback(() => {
		if (seatTimerRef.current) clearTimeout(seatTimerRef.current);
		presenceTimersRef.current.forEach((timer) => clearTimeout(timer));
		presenceTimersRef.current.clear();
		const channel = channelRef.current;
		const currentRole = roleRef.current;
		const hadSeat = seatConfirmedRef.current;
		seatConfirmedRef.current = false;
		channelRef.current = null;
		setStatus("offline");
		setRole(null);
		roleRef.current = null;

		if (!channel) return;

		const removeChannel = () => {
			supabase.removeChannel(channel);
		};

		if (currentRole && hadSeat) {
			void channel.send({
				type: "broadcast",
				event: "mini_game",
					payload: {
						event: "system_left",
						payload: { role: currentRole, playerName: playerNameRef.current },
						role: currentRole,
						senderId: clientIdRef.current,
					},
			}).then(removeChannel, removeChannel);
			return;
		}

		removeChannel();
	}, []);

	const connect = useCallback((nextRole: OnlineRole, requestedCode?: string, capacity = 2) => {
		const cleanedCode = requestedCode?.trim().toUpperCase() || "";
		if (nextRole !== "player1" && !cleanedCode) {
			setStatus("error");
			return;
		}

		const nextCode = cleanedCode || createRoomCode();
		disconnect();
		setRoomCode(nextCode);
		setRole(nextRole);
		roleRef.current = nextRole;
		setStatus("connecting");
		capacityRef.current = Math.max(2, Math.min(6, capacity));
		seatsRef.current = nextRole === 'player1' ? { [clientIdRef.current]: 'player1' } : {};
		seatConfirmedRef.current = !usesSeats || nextRole === 'player1';
		tableStartedRef.current = false;
		leftKeysRef.current = new Set();

		const channel = supabase.channel(`more-games:${gameId}:${nextCode}`, {
			config: { broadcast: { self: false, ack: true }, presence: { key: clientIdRef.current } },
		});
		const trackPresence = (seat: OnlineRole) => {
			void Promise.resolve(channel.track?.({ role: seat })).catch(() => undefined);
		};
		const presenceKeys = () => Object.keys(typeof channel.presenceState === 'function' ? channel.presenceState() : {});

		channel.on("broadcast", { event: "mini_game" }, ({ payload }: { payload: any }) => {
			if (channelRef.current !== channel || !payload || payload.senderId === clientIdRef.current) return;
			if (usesSeats && payload.event === 'seat_request' && roleRef.current === 'player1') {
				const assigned = seatsRef.current[payload.senderId] || (!tableStartedRef.current ? ONLINE_ROLES.slice(1, capacityRef.current).find(seat => !Object.values(seatsRef.current).includes(seat)) : undefined);
				if (assigned) seatsRef.current[payload.senderId] = assigned;
				void channel.send({ type: 'broadcast', event: 'mini_game', payload: { event: 'seat_assigned', payload: { to: payload.senderId, seat: assigned || null }, role: 'player1', senderId: clientIdRef.current } });
				return;
			}
			if (usesSeats && payload.event === 'seat_assigned' && payload.payload?.to === clientIdRef.current) {
				if (seatTimerRef.current) clearTimeout(seatTimerRef.current);
				const assigned = payload.payload.seat;
				if (!ONLINE_ROLES.includes(assigned) || assigned === 'player1') { setStatus('error'); return; }
				roleRef.current = assigned;
				seatConfirmedRef.current = true;
				setRole(assigned);
				setStatus('connected');
				trackPresence(assigned);
				void channel.send({ type: 'broadcast', event: 'mini_game', payload: { event: 'system_joined', payload: { playerName: playerNameRef.current, avatar: avatarUrlRef.current }, role: assigned, senderId: clientIdRef.current } });
				return;
			}
			if (usesSeats && roleRef.current === 'player1' && seatsRef.current[payload.senderId] !== payload.role) return;
			if (payload.event === 'system_left') leftKeysRef.current.add(payload.senderId);
			if (usesSeats && payload.event === 'system_left') delete seatsRef.current[payload.senderId];
			if (typeof payload.event !== "string" || !payload.payload || typeof payload.payload !== "object" || !ONLINE_ROLES.includes(payload.role)) return;
			onEventRef.current(payload.event, payload.payload, payload.role);
		});

		// A peer that closes the tab or loses the network never sends system_left; presence reports it
		// instead. The grace period keeps a brief socket reconnect from counting as a forfeit.
		channel.on?.("presence", { event: "leave" }, ({ key, leftPresences }: { key?: string; leftPresences?: Array<{ role?: OnlineRole }> }) => {
			if (channelRef.current !== channel || !key || key === clientIdRef.current) return;
			const leftRole = leftPresences?.[0]?.role;
			if (!leftRole || !ONLINE_ROLES.includes(leftRole)) return;
			const timer = setTimeout(() => {
				presenceTimersRef.current.delete(timer);
				if (channelRef.current !== channel || leftKeysRef.current.has(key) || presenceKeys().includes(key)) return;
				leftKeysRef.current.add(key);
				if (usesSeats) delete seatsRef.current[key];
				onEventRef.current("system_left", {}, leftRole);
			}, PRESENCE_LEAVE_GRACE_MS);
			presenceTimersRef.current.add(timer);
		});

		channelRef.current = channel;
		channel.subscribe((nextStatus: string) => {
			if (channelRef.current !== channel) return;
			if (nextStatus === "SUBSCRIBED") {
				if (usesSeats && nextRole !== 'player1') {
					seatTimerRef.current = setTimeout(() => { if (channelRef.current === channel) setStatus('error'); }, 15000);
					void channel.send({ type: 'broadcast', event: 'mini_game', payload: { event: 'seat_request', payload: {}, role: nextRole, senderId: clientIdRef.current } }).catch(() => { if (channelRef.current === channel) setStatus('error'); });
					return;
				}
				setStatus("connected");
				trackPresence(nextRole);
				if (nextRole !== 'player1' && typeof channel.presenceState === 'function') {
					// Nobody else in the channel means the code is wrong or the host is gone.
					seatTimerRef.current = setTimeout(() => {
						if (channelRef.current === channel && presenceKeys().every((key) => key === clientIdRef.current)) setStatus('error');
					}, ROOM_JOIN_TIMEOUT_MS);
				}
				void channel.send({
					type: "broadcast",
					event: "mini_game",
					payload: {
						event: "system_joined",
						payload: { role: nextRole, playerName: playerNameRef.current, avatar: avatarUrlRef.current },
						role: nextRole,
						senderId: clientIdRef.current,
					},
				}).then((result: string) => {
					if (channelRef.current === channel && result !== "ok") setStatus("error");
				}, () => {
					if (channelRef.current === channel) setStatus("error");
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
		if (usesSeats && !seatConfirmedRef.current) return;
		if (gameId === 'durak' && currentRole === 'player1' && event === 'sync') tableStartedRef.current = true;

		void channel.send({
			type: "broadcast",
			event: "mini_game",
			payload: {
				event,
				payload,
				role: currentRole,
				senderId: clientIdRef.current,
			},
		}).then((result: string) => {
			if (channelRef.current === channel && result !== "ok") setStatus("error");
		}, () => {
			if (channelRef.current === channel) setStatus("error");
		});
	}, [gameId]);

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
	opponentReady,
	playerCount,
	connectedPlayersCount,
	onHost,
	onJoin,
	onDisconnect,
	joinText,
	disabled,
}: {
	roomCode: string;
	setRoomCode: (value: string) => void;
	role: OnlineRole | null;
	status: RoomStatus;
	opponentReady?: boolean;
	playerCount?: number;
	connectedPlayersCount?: number;
	onHost: () => void;
	onJoin: () => void;
	onDisconnect: () => void;
	joinText?: string;
	disabled?: boolean;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	const { isMobile } = useIsMobile();

	if (role) {
		const isReady = opponentReady || (playerCount && connectedPlayersCount && connectedPlayersCount >= playerCount);
		if (!isReady) {
			if (role === "player1") {
				return (
					<View style={styles.waitingContainer}>
						<Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>{t("mp.roomCreated")}</Text>
						<Text style={[styles.waitingSub, { color: currentTheme.textSecondary }]}>{t("mp.shareCode")}</Text>
	
						<View style={[styles.codeDisplayContainer, isMobile && { width: '95%' }]}>
							<Text style={[styles.codeText, { color: currentTheme.accent }, isMobile && { fontSize: 24 }]} adjustsFontSizeToFit numberOfLines={1}>{roomCode}</Text>
							<StylizedButton text={t("mp.copy")} onClick={() => Clipboard.setString(roomCode)} backgroundColor={currentTheme.buttonPrimary} style={{ width: 100 }} />
						</View>
	
						<Text style={[styles.waitingStatus, { color: currentTheme.textSecondary }]}>
							{playerCount && connectedPlayersCount ? `WAITING FOR PLAYERS (${connectedPlayersCount}/${playerCount})...` : t("mp.waitingFriend")}
						</Text>
						<ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 20 }} />
	
						<StylizedButton text={t("mp.cancel")} onClick={onDisconnect} backgroundColor={cssColors.spaceGray} />
					</View>
				);
			} else {
				return (
					<View style={styles.waitingContainer}>
						<Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>{status === "error" ? t("mp.connectionError") : t("mp.connecting")}</Text>
						{status !== "error" && <ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 30 }} />}
						<StylizedButton text={t("mp.cancel")} onClick={onDisconnect} backgroundColor={cssColors.spaceGray} />
					</View>
				);
			}
		}
	}

	return (
		<View style={styles.roomPanel}>
			<View style={styles.roomRow}>
				<StylizedButton text={t("common.host")} onClick={onHost} backgroundColor={disabled ? '#555' : currentTheme.buttonPrimary} style={styles.roomButton} textStyle={styles.smallButtonText} disabled={disabled} />
				<TextInput
					value={roomCode}
					onChangeText={(value) => setRoomCode(value.toUpperCase())}
					placeholder={t("moregames.codePlaceholder")}
					placeholderTextColor={currentTheme.textSecondary}
					autoCapitalize="characters"
					maxLength={5}
					style={[styles.roomInput, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }, disabled && { opacity: 0.5 }]}
					editable={!disabled}
				/>
				<StylizedButton text={joinText ?? t("common.join")} onClick={onJoin} backgroundColor={disabled ? '#555' : currentTheme.buttonSecondary} style={styles.roomButton} textStyle={styles.smallButtonText} disabled={disabled} />
			</View>
			<View style={styles.roomMetaRow}>
				<Text style={[styles.roomMeta, { color: currentTheme.textSecondary }]}>
					{role ? `${roleLabel(role)} | ${status.toUpperCase()} | ${roomCode || t("moregames.noCode")}` : t("moregames.createOrJoin")}
				</Text>
				{role && (
					<StylizedButton text={t("common.leave")} onClick={onDisconnect} backgroundColor={cssColors.spaceGray} style={styles.leaveRoomButton} textStyle={styles.tinyButtonText} />
				)}
			</View>
		</View>
	);
}

function useIsMobile() {
	const { width } = useWindowDimensions();
	return { isMobile: width <= 768 };
}

function SegmentButton<T extends string>({
	value,
	selected,
	label,
	onPress,
	accent,
}: {
	value: T;
	selected: T;
	label: string;
	onPress: (value: T) => void;
	accent: string;
}) {
	const { currentTheme } = useTheme();
	const active = value === selected;
	return (
		<Pressable
			onPress={() => onPress(value)}
			style={[
				styles.segmentButton,
				{
					borderColor: active ? accent : currentTheme.gridBorder,
					backgroundColor: active ? accent : "rgba(255,255,255,0.06)",
				},
			]}
		>
			<Text style={[styles.segmentText, { color: active ? getReadableButtonTextColor(accent) : currentTheme.textPrimary }]}>{label}</Text>
		</Pressable>
	);
}

function RuleToggle({ label, active, onPress, accent }: { label: string; active: boolean; onPress: () => void; accent: string }) {
	const { currentTheme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.segmentButton,
				{
					borderColor: active ? accent : currentTheme.gridBorder,
					backgroundColor: active ? accent : "rgba(255,255,255,0.06)",
				},
			]}
		>
			<Text style={[styles.segmentText, { color: active ? getReadableButtonTextColor(accent) : currentTheme.textPrimary }]}>{label}</Text>
		</Pressable>
	);
}
function DurakModeToggleColumn({
	topLabel, topIcon, topActive, onTopPress,
	bottomLabel, bottomIcon, bottomActive, onBottomPress
}: {
	topLabel: string; topIcon: UiGlyphName; topActive: boolean; onTopPress: () => void;
	bottomLabel: string; bottomIcon: UiGlyphName; bottomActive: boolean; onBottomPress: () => void;
}) {
	return (
		<View style={styles.durakModeColumn}>
			<Pressable style={[styles.durakModeCell, topActive && styles.durakModeCellActive, { borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.2)" }]} onPress={onTopPress}>
				<View style={styles.durakModeIcon}><UiIcon name={topIcon} size={36} /></View>
				<Text style={[styles.durakModeLabel, topActive && styles.durakModeLabelActive]}>{topLabel}</Text>
				{topActive && <View style={styles.durakModeCheck}><Text style={styles.durakModeCheckText}>✓</Text></View>}
			</Pressable>
			<Pressable style={[styles.durakModeCell, bottomActive && styles.durakModeCellActive]} onPress={onBottomPress}>
				<View style={styles.durakModeIcon}><UiIcon name={bottomIcon} size={36} /></View>
				<Text style={[styles.durakModeLabel, bottomActive && styles.durakModeLabelActive]}>{bottomLabel}</Text>
				{bottomActive && <View style={styles.durakModeCheck}><Text style={styles.durakModeCheckText}>✓</Text></View>}
			</Pressable>
		</View>
	);
}
export default function MoreGamesMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [, , appendAppState, popAppState] = useAppState();
	const { checked: authChecked, signedIn, name: accountName } = useAccountIdentity();
	const openAccountScreen = (intent: "login" | "register") => {
		setProfileAuthIntent(intent);
		appendAppState(MenuStateType.PROFILE);
	};
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [activeGame, setActiveGame] = useState<MoreGameId | null>(null);
	const { state: shopState } = useShopState();
	
	const cosmetics: ExtraGameCosmetics = useMemo(() => ({
		chessPieces: pickCosmetic(CHESS_PIECE_COLORS, shopState.equipped.chess_piece, "chess_piece_", "classic"),
		chessBoard: pickCosmetic(CHESS_BOARD_COLORS, shopState.equipped.chess_board, "chess_board_", "slate"),
		sudokuTheme: pickCosmetic(SUDOKU_THEMES, shopState.equipped.sudoku_theme, "sudoku_theme_", "wood"),
		mahjongTheme: pickCosmetic(MAHJONG_THEMES, shopState.equipped.mahjong_theme, "mahjong_theme_", "jade"),
		cardSkin: pickCosmetic(CARD_SKINS, shopState.equipped.card_skin, "card_skin_", "classic"),
		seaSkin: pickCosmetic(SEA_SKINS, shopState.equipped.sea_skin, "sea_skin_", "navy"),
	}), [shopState.equipped]);

	const [playerName, setPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [draftPlayerName, setDraftPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [ratingGame, setRatingGame] = useState<RatedMoreGameId>("durak");
	const [leaderboard, setLeaderboard] = useState<MoreGameRating[]>([]);
	const [myRating, setMyRating] = useState<MoreGameRating | null>(null);
	const [ratingsLoading, setRatingsLoading] = useState(false);
	const [ratingPanel, setRatingPanel] = useState<"list" | "leaderboard">("list");
	const popupScrollRef = useRef<ScrollView>(null);
	useEffect(() => { popupScrollRef.current?.scrollTo({ y: 0, animated: false }); }, [activeGame, ratingPanel]);
	useEffect(() => { if (activeGame) track("more_game_open", { game: activeGame }); }, [activeGame]);

	useEffect(() => {
		AsyncStorage.getItem(PLAYER_NAME_KEY).then((rawName) => {
			const nextName = normalizeStoredPlayerName(rawName);
			setPlayerName(nextName);
			setDraftPlayerName(nextName);
		});
	}, []);

	// A signed-in player's nickname comes from the account and is edited in the profile only.
	useEffect(() => {
		if (!signedIn || !accountName) return;
		const nextName = normalizeStoredPlayerName(accountName);
		setPlayerName(nextName);
		setDraftPlayerName(nextName);
	}, [signedIn, accountName]);

	const loadRatings = useCallback(async (game: RatedMoreGameId = ratingGame, name: string = playerName) => {
		setRatingsLoading(true);
		try {
			const [top, mine] = await Promise.all([
				getMoreGameLeaderboard(game as MoreGameRatingGameId, 100),
				getPlayerMoreGameRating(name, game as MoreGameRatingGameId),
			]);
			setLeaderboard(top);
			setMyRating(mine);
		} finally {
			setRatingsLoading(false);
		}
	}, [playerName, ratingGame]);

	useEffect(() => {
		void loadRatings(ratingGame, playerName);
	}, [loadRatings, playerName, ratingGame]);

	useEffect(() => {
		if (ratingPanel !== "list") {
			void loadRatings();
		}
	}, [loadRatings, ratingPanel]);

	const savePlayerName = useCallback(() => {
		const nextName = normalizeStoredPlayerName(draftPlayerName);
		setPlayerName(nextName);
		setDraftPlayerName(nextName);
		void AsyncStorage.setItem(PLAYER_NAME_KEY, nextName);
		void loadRatings(ratingGame, nextName);
	}, [draftPlayerName, loadRatings, ratingGame]);

	const openRatingPanel = useCallback((panel: "leaderboard", game: RatedMoreGameId = ratingGame) => {
		setActiveGame(null);
		setRatingGame(game);
		setRatingPanel(panel);
		void loadRatings(game, playerName);
	}, [loadRatings, playerName, ratingGame]);

	const handleRatingGameChange = useCallback((game: RatedMoreGameId) => {
		setRatingGame(game);
		void loadRatings(game, playerName);
	}, [loadRatings, playerName]);

	const handleBack = useCallback(() => {
		if (activeGame) {
			setActiveGame(null);
			return;
		}
		if (ratingPanel !== "list") {
			setRatingPanel("list");
			return;
		}
		popAppState();
	}, [activeGame, popAppState, ratingPanel]);

	useEscapeKey(handleBack);

	const activeCard = MORE_GAME_CARDS.find((card) => card.id === activeGame);

	return (
		<SimplePopupView
			scrollRef={popupScrollRef}
			style={[
				{ justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground, height: "92%" },
				isMobile && { width: "94%", height: "92%", paddingHorizontal: 8 },
			]}
		>
			<View style={[styles.moreHeaderRow, isMobile && { flexDirection: "column" }]}>
				<StylizedButton text={t("common.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.topBackButton} textStyle={styles.smallButtonText} />
				<View style={[styles.moreHeaderTextBlock, isMobile && { flex: 0, width: "100%" }]}>
					<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>
						{activeCard ? t(`moregames.card.${activeCard.id}.title`) : (ratingPanel === "leaderboard" ? t("moregames.leaderboardTitle") : t("moregames.title"))}
					</Text>
					<Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>
						{activeCard ? t(`moregames.help.${activeCard.id}`) : ratingPanel !== "list" ? t("moregames.subtitleRatings", { game: t(`moregames.label.${ratingGame}`) }) : t("moregames.subtitleList")}
					</Text>
				</View>
				{!isMobile && <View style={styles.topBackSpacer} />}
			</View>

			{ratingPanel === "leaderboard" ? (
				<MoreGameLeaderboardPanel
					gameId={ratingGame}
					onGameChange={handleRatingGameChange}
					leaderboard={leaderboard}
					myRating={myRating}
					loading={ratingsLoading}
					playerName={playerName}
					onRefresh={() => loadRatings()}
				/>
			) : !activeGame ? (
				<ScrollView style={styles.moreList} contentContainerStyle={styles.moreListContent}>
					<View style={styles.moreTopPanel}>
						{authChecked && !signedIn && (
						<View style={styles.moreNameRow}>
							<TextInput
								value={draftPlayerName}
								onChangeText={setDraftPlayerName}
								onBlur={savePlayerName}
								placeholder={t("moregames.playerNamePlaceholder")}
								placeholderTextColor={currentTheme.textSecondary}
								maxLength={24}
								style={[styles.moreNameInput, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
							/>
							<StylizedButton text={t("common.save")} onClick={savePlayerName} backgroundColor={currentTheme.buttonSecondary} style={styles.compactTopButton} textStyle={styles.tinyButtonText} />
						</View>
						)}
						{authChecked && !signedIn && (
							<View style={{ width: "100%", alignItems: "center", gap: 6, marginBottom: 8 }}>
								<Text style={[styles.subHeader, { color: currentTheme.textSecondary, fontSize: 10, textAlign: "center" }]}>{t("over.accountPrompt")}</Text>
								<View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
									<StylizedButton text={t("over.createAccount")} onClick={() => openAccountScreen("register")} backgroundColor={currentTheme.accent} style={{ minWidth: 120, height: 34 }} textStyle={styles.tinyButtonText} />
									<StylizedButton text={t("over.haveAccount")} onClick={() => openAccountScreen("login")} backgroundColor={cssColors.spaceGray} style={{ minWidth: 120, height: 34 }} textStyle={styles.tinyButtonText} />
								</View>
							</View>
						)}
						<View style={styles.moreQuickActions}>
							<StylizedButton text={t("moregames.shopButton")} onClick={() => setActiveGame("shop")} backgroundColor="#FACC15" style={styles.shopQuickButton} textStyle={[styles.tinyButtonText, { color: "#111827" }]} />
							<StylizedButton text={t("moregames.leaderboardTitle")} onClick={() => openRatingPanel("leaderboard")} backgroundColor={currentTheme.buttonPrimary} style={styles.leaderboardQuickButton} textStyle={styles.tinyButtonText} />
						</View>
					</View>
					{RATED_MORE_GAME_CARDS.map((card) => (
						<View
							key={card.id}
							style={[
								styles.moreGameRow,
								{
									borderColor: card.color,
									backgroundColor: "rgba(0, 0, 0, 0.28)",
								},
							]}
						>
							<View style={styles.cardMain}>
								<Text style={[styles.cardTitle, { color: card.color }]} numberOfLines={2} adjustsFontSizeToFit>
									{t(`moregames.card.${card.id}.title`)}
								</Text>
								<Text style={[styles.cardDesc, { color: currentTheme.textPrimary }]} numberOfLines={3}>
									{t(`moregames.card.${card.id}.desc`)}
								</Text>
								<View style={styles.tagRow}>
									{card.tags.map((tag) => {
										const tagLabel = t(`moregames.tag.${tag}`);
										return (
											<View key={tag} style={[styles.tag, { borderColor: card.color }]}>
												<Text style={[styles.tagText, { color: card.color }]}>{tagLabel.startsWith("moregames.") ? tag : tagLabel}</Text>
											</View>
										);
									})}
								</View>
							</View>
							<StylizedButton
								text={t("common.play")}
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
					{activeGame === "shop" && <ExtraGameShop />}
					{activeGame === "tictactoe" && <TicTacToeGame playerName={playerName} onRatingChange={() => loadRatings("tictactoe")} />}
					{activeGame === "sudoku" && <SudokuGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("sudoku")} />}
					{activeGame === "mahjong" && <MahjongGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("mahjong")} />}
					{activeGame === "battleship" && <BattleshipGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("battleship")} />}
					{activeGame === "chess" && <ChessOnlineGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("chess")} />}
					{activeGame === "durak" && <DurakOnlineGame cosmetics={cosmetics} playerName={playerName} onRatingChange={() => loadRatings("durak")} />}
				</View>
			)}
		</SimplePopupView>
	);
}

function RatingBadge({ elo, small = false }: { elo: number; small?: boolean }) {
	const badge = getMoreGameEloBadge(elo);
	return (
		<View style={[styles.ratingBadgeCircle, small && styles.ratingBadgeCircleSmall, { backgroundColor: badge.color }]}>
			<UiIcon name={badge.icon} size={small ? 18 : 27} />
		</View>
	);
}

function MoreGameTabs({ selected, onChange }: { selected: RatedMoreGameId; onChange: (game: RatedMoreGameId) => void }) {
	const { t } = useLanguage();
	return (
		<View style={styles.ratingTabsWrapper}>
			{RATED_MORE_GAME_IDS.map((gameId) => {
				const card = MORE_GAME_CARDS.find((item) => item.id === gameId);
				const active = selected === gameId;
				return (
					<Pressable
						key={gameId}
						onPress={() => onChange(gameId)}
						style={[
							styles.ratingTab,
							{
								borderColor: active ? card?.color || "#FFFFFF" : "rgba(255,255,255,0.22)",
								backgroundColor: active ? card?.color || "#FFFFFF" : "rgba(255,255,255,0.06)",
							},
						]}
					>
						<Text style={[styles.ratingTabText, { color: active ? getReadableButtonTextColor(card?.color || "#FFFFFF") : "#FFFFFF" }]}>
							{t(`moregames.label.${gameId}`)}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

function MoreGameLeaderboardPanel({
	gameId,
	onGameChange,
	leaderboard,
	myRating,
	loading,
	playerName,
	onRefresh,
}: {
	gameId: RatedMoreGameId;
	onGameChange: (game: RatedMoreGameId) => void;
	leaderboard: MoreGameRating[];
	myRating: MoreGameRating | null;
	loading: boolean;
	playerName: string;
	onRefresh: () => void;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<View style={styles.ratingScreen}>
			<MoreGameTabs selected={gameId} onChange={onGameChange} />
			<View style={[styles.ratingSummaryCard, { borderColor: currentTheme.buttonPrimary }]}>
				<RatingBadge elo={myRating?.elo || 0} small />
				<View style={styles.myRatingTextBlock}>
					<Text style={[styles.myRatingTitle, { color: currentTheme.buttonPrimary }]}>{playerName}</Text>
					<Text style={[styles.myRatingMeta, { color: currentTheme.textSecondary }]}>
						{myRating?.elo || 0} ELO | W {myRating?.wins || 0} / L {myRating?.losses || 0} / D {myRating?.draws || 0}
					</Text>
				</View>
			</View>
			<View style={styles.leaderboardTopRow}>
				<Text style={[styles.leaderboardSub, { color: currentTheme.textSecondary }]}>{t("moregames.top100")}</Text>
				<StylizedButton text={loading ? "..." : t("common.refresh")} onClick={onRefresh} backgroundColor={cssColors.spaceGray} style={styles.compactTopButton} textStyle={styles.tinyButtonText} />
			</View>
			<View style={styles.leaderboardHeaderRow}>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.35 }]}>#</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 1.75 }]}>{t("moregames.colPlayer")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 1 }]}>{t("moregames.colTier")}</Text>
				<Text style={[styles.leaderboardHeaderText, { flex: 0.65, textAlign: "right" }]}>{t("moregames.colElo")}</Text>
			</View>
			<ScrollView style={styles.leaderboardList} contentContainerStyle={styles.leaderboardListContent}>
				{leaderboard.length === 0 ? (
					<Text style={[styles.emptyLeaderboardText, { color: currentTheme.textSecondary }]}>
						{loading ? t("moregames.loadingRatings") : t("moregames.noRatings")}
					</Text>
				) : leaderboard.map((entry, index) => {
					const badge = getMoreGameEloBadge(entry.elo);
					const isMe = entry.player_name.toLowerCase() === playerName.toLowerCase();
					return (
						<View key={`${entry.game_id}-${entry.player_key || entry.player_name}`} style={[styles.leaderboardRow, isMe && { borderColor: badge.color, backgroundColor: "rgba(255,255,255,0.06)" }]}>
							<Text style={[styles.leaderboardRank, { flex: 0.35, color: currentTheme.textPrimary }]}>{index + 1}</Text>
							<View style={{ flex: 1.75, flexDirection: 'row', alignItems: 'center' }}>
								{entry.avatar_url && entry.avatar_url.startsWith("http") ? (
									<Image source={{ uri: entry.avatar_url }} style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: 'transparent' }} />
								) : entry.avatar_url ? (
									<Text style={{ fontSize: 14, marginRight: 6 }}>{entry.avatar_url}</Text>
								) : (
									<View style={{ width: 18, height: 18, borderRadius: 9, marginRight: 6, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
										<Text style={{ fontSize: 10, color: '#fff' }}>{entry.player_name.charAt(0).toUpperCase()}</Text>
									</View>
								)}
								<Text style={[styles.leaderboardName, { flexShrink: 1, color: currentTheme.textPrimary }]} numberOfLines={1}>
									{entry.player_name}{isMe ? ` (${t("moregames.you")})` : ""}
								</Text>
							</View>
							<View style={[styles.leaderboardTier, { flex: 1, backgroundColor: badge.color }]}>
								<UiIcon name={badge.icon} size={9} />
								<Text style={styles.leaderboardTierText}>{t(`moregames.tier.${badge.tier}`)}</Text>
							</View>
							<Text style={[styles.leaderboardElo, { flex: 0.65, color: currentTheme.textPrimary }]}>{entry.elo}</Text>
						</View>
					);
				})}
			</ScrollView>
		</View>
	);
}

const EXTRA_CATEGORIES: { id: ShopCategory; labelKey: string }[] = [
	{ id: "chess_piece", labelKey: "moregames.shop.chessPieces" },
	{ id: "chess_board", labelKey: "moregames.shop.chessBoard" },
	{ id: "sea_skin", labelKey: "moregames.shop.seaSkins" },
	{ id: "card_skin", labelKey: "moregames.shop.cardSkins" },
	{ id: "sudoku_theme", labelKey: "moregames.shop.sudokuThemes" },
	{ id: "mahjong_theme", labelKey: "moregames.shop.mahjongThemes" },
];

function ExtraGameShop() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { state, equip, purchaseAndEquip } = useShopState();
	const [message, setMessage] = useState(t("moregames.shopHint"));

	const [activeCategory, setActiveCategory] = useState<ShopCategory>("chess_piece");

	const handleItemPress = async (item: ShopItem) => {
		const isOwned = state.ownedItemIds.includes(item.id);
		const result = isOwned ? await equip(item.id) : await purchaseAndEquip(item.id);
		if (result.ok) {
			setMessage(isOwned ? t("shop.equippedMsg", { name: item.title }) : t("shop.boughtMsg", { name: item.title }));
		} else {
			setMessage(result.error ?? t("shop.couldNotBuy"));
		}
	};

	const items = getVisibleShopItemsByCategory(activeCategory, state.ownedItemIds);

	return (
		<ScrollView style={styles.moreList} contentContainerStyle={styles.shopContent}>
			<View style={{ alignItems: 'center', marginBottom: 16 }}>
				<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>EXTRA GAME SHOP</Text>
				<Text style={[styles.shopHint, { color: currentTheme.accent, fontSize: 14, marginTop: 4 }]}>
					{t("shop.coins", { count: state.balance })}
				</Text>
				<Text style={[styles.shopHint, { color: currentTheme.textSecondary }]}>{message}</Text>
			</View>

			<View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 16 }}>
				{EXTRA_CATEGORIES.map((cat) => {
					const isActive = activeCategory === cat.id;
					return (
						<Pressable
							key={cat.id}
							onPress={() => setActiveCategory(cat.id)}
							style={{
								borderWidth: 2,
								borderRadius: 8,
								paddingHorizontal: 10,
								paddingVertical: 8,
								alignItems: "center",
								borderColor: isActive ? currentTheme.accent : "rgba(255,255,255,0.15)",
								backgroundColor: isActive ? currentTheme.buttonPrimary : "rgba(255,255,255,0.06)"
							}}
						>
							<Text style={{ fontFamily: "Silkscreen", fontSize: 10, textAlign: "center", color: isActive ? "white" : currentTheme.textSecondary }}>
								{t(cat.labelKey)}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<View style={{ width: "100%", marginBottom: 24, alignItems: "center" }}>
				<View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
					{items.map((item) => {
						const isOwned = state.ownedItemIds.includes(item.id);
						const isEquipped = state.equipped[item.category] === item.id;
						const canAfford = state.balance >= item.price;
						const buttonText = isEquipped ? t("shop.equipped") : isOwned || item.price === 0 ? t("shop.equip") : t("shop.buy", { price: item.price });
						const disabled = isEquipped || (!isOwned && !canAfford);

						return (
							<View key={item.id} style={[{ width: 150, minHeight: 180, borderWidth: 2, borderRadius: 8, padding: 8, alignItems: "center", justifyContent: "space-between", borderColor: isEquipped ? item.accent : "rgba(255,255,255,0.12)", backgroundColor: "rgba(0, 0, 0, 0.38)" }]}>
								<View style={{ width: "100%", height: 40, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)", justifyContent: "center", alignItems: "center" }}>
									<View style={{ flexDirection: "row", gap: 4 }}>
										{item.previewColors.map((color, idx) => (
											<View key={idx} style={{ width: 16, height: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.24)", backgroundColor: color }} />
										))}
									</View>
								</View>
								<Text style={{ fontFamily: "Silkscreen", fontSize: 11, textAlign: "center", marginTop: 8, color: currentTheme.textPrimary }} numberOfLines={1} adjustsFontSizeToFit>{item.title}</Text>
								<Text style={{ fontFamily: "Silkscreen", fontSize: 8, lineHeight: 11, textAlign: "center", minHeight: 34, color: currentTheme.textSecondary }} numberOfLines={3}>{item.description}</Text>
								<Text style={{ fontFamily: "Silkscreen", fontSize: 9, textAlign: "center", color: isOwned ? item.accent : currentTheme.textSecondary, marginBottom: 4 }}>
									{isOwned ? t("shop.owned") : t("shop.price", { price: item.price })}
								</Text>
								<StylizedButton text={buttonText} onClick={() => handleItemPress(item)} backgroundColor={isOwned ? item.accent : currentTheme.buttonPrimary} disabled={disabled} style={{ minWidth: 100, minHeight: 28, paddingHorizontal: 4, margin: 0 }} textStyle={{ fontSize: 10 }} />
							</View>
						);
					})}
				</View>
			</View>
		</ScrollView>
	);
}

function TicTacToeGame({ playerName, onRatingChange }: { playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [board, setBoard] = useState<(TicMark | null)[]>(Array(9).fill(null));
	const [turn, setTurn] = useState<TicMark>("X");
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
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

	const status = remoteResult || (winner ? t("moregames.wins", { name: winner }) : isDraw ? t("moregames.draw") : room.role && !opponentReady ? t("moregames.waitingOpponent") : t("moregames.turn", { name: turn }));

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
					onHost={() => { reset(); setOpponentReady(false); room.connect("player1"); }}
					onJoin={() => { reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
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
			<View style={{ marginTop: 20, alignItems: "center" }}>
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

const SUDOKU_MAX_MISTAKES = 3;
const SUDOKU_TARGET_REMOVED = 48; // leaves ~33 givens (medium difficulty)

type SudokuBoard = { puzzle: number[][]; solution: number[][] };

function shuffleInPlace<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

function isSudokuSafe(grid: number[][], row: number, col: number, value: number) {
	for (let i = 0; i < 9; i += 1) {
		if (grid[row][i] === value || grid[i][col] === value) return false;
	}
	const boxRow = Math.floor(row / 3) * 3;
	const boxCol = Math.floor(col / 3) * 3;
	for (let r = 0; r < 3; r += 1) {
		for (let c = 0; c < 3; c += 1) {
			if (grid[boxRow + r][boxCol + c] === value) return false;
		}
	}
	return true;
}

function fillSudokuSolution(grid: number[][]): boolean {
	for (let row = 0; row < 9; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			if (grid[row][col] !== 0) continue;
			for (const value of shuffleInPlace([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
				if (!isSudokuSafe(grid, row, col, value)) continue;
				grid[row][col] = value;
				if (fillSudokuSolution(grid)) return true;
				grid[row][col] = 0;
			}
			return false;
		}
	}
	return true;
}

export function countSudokuSolutions(grid: number[][], limit: number): number {
	for (let row = 0; row < 9; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			if (grid[row][col] !== 0) continue;
			let count = 0;
			for (let value = 1; value <= 9; value += 1) {
				if (!isSudokuSafe(grid, row, col, value)) continue;
				grid[row][col] = value;
				count += countSudokuSolutions(grid, limit - count);
				grid[row][col] = 0;
				if (count >= limit) return count;
			}
			return count;
		}
	}
	return 1;
}

// Generates a fresh puzzle with a unique solution so "New game" always shows new numbers.
export function generateSudoku(): SudokuBoard {
	const solution = Array.from({ length: 9 }, () => Array(9).fill(0));
	fillSudokuSolution(solution);
	const puzzle = solution.map((row) => [...row]);

	let removed = 0;
	for (const cell of shuffleInPlace(Array.from({ length: 81 }, (_, index) => index))) {
		if (removed >= SUDOKU_TARGET_REMOVED) break;
		const row = Math.floor(cell / 9);
		const col = cell % 9;
		if (puzzle[row][col] === 0) continue;
		const backup = puzzle[row][col];
		puzzle[row][col] = 0;
		const probe = puzzle.map((line) => [...line]);
		if (countSudokuSolutions(probe, 2) === 1) {
			removed += 1;
		} else {
			puzzle[row][col] = backup;
		}
	}
	return { puzzle, solution };
}

function SudokuGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [board, setBoard] = useState<SudokuBoard>(generateSudoku);
	const [grid, setGrid] = useState<number[][]>(() => board.puzzle.map((row) => [...row]));
	const [notes, setNotes] = useState<Record<string, number[]>>({});
	const [selected, setSelected] = useState<[number, number] | null>(null);
	const [noteMode, setNoteMode] = useState(false);
	const [mistakes, setMistakes] = useState(0);
	const ratingSubmittedRef = useRef(false);
	const { puzzle, solution } = board;
	const complete = grid.every((row, y) => row.every((value, x) => value === solution[y][x]));
	const lost = mistakes >= SUDOKU_MAX_MISTAKES;
	const finished = complete || lost;
	const sudoku: SudokuPalette = SUDOKU_THEMES[cosmetics.sudokuTheme];
	const sudokuText = sudoku.given ?? currentTheme.textPrimary;

	useEffect(() => {
		if (!finished || ratingSubmittedRef.current) return;
		ratingSubmittedRef.current = true;
		void submitMoreGameSoloResult({
			gameId: "sudoku",
			playerName,
			won: complete,
			score: complete ? Math.max(0, 1000 - mistakes * 100) : 0,
			metadata: { mistakes, result: complete ? "win" : "loss" },
		}).then(() => onRatingChange());
	}, [complete, finished, mistakes, onRatingChange, playerName]);

	const startNewGame = () => {
		const next = generateSudoku();
		setBoard(next);
		setGrid(next.puzzle.map((row) => [...row]));
		setNotes({});
		setSelected(null);
		setMistakes(0);
		ratingSubmittedRef.current = false;
	};

	const restartGame = () => {
		setGrid(puzzle.map((row) => [...row]));
		setNotes({});
		setSelected(null);
		setMistakes(0);
		ratingSubmittedRef.current = false;
	};

	const setNumber = (value: number) => {
		if (!selected || finished) return;
		const [y, x] = selected;
		if (puzzle[y][x] !== 0) return;

		const key = `${y}-${x}`;
		if (noteMode && value !== 0) {
			if (grid[y][x] !== 0) return;
			setNotes((current) => {
				const currentNotes = current[key] || [];
				const nextNotes = currentNotes.includes(value) ? currentNotes.filter((item) => item !== value) : [...currentNotes, value].sort();
				return { ...current, [key]: nextNotes };
			});
			return;
		}

		if (value === grid[y][x]) return;
		if (value !== 0 && value !== solution[y][x]) {
			setMistakes((current) => current + 1);
		}

		setNotes((current) => {
			const next = { ...current, [key]: [] };
			if (value !== 0 && value === solution[y][x]) {
				for (const noteKey of Object.keys(next)) {
					const [row, col] = noteKey.split("-").map(Number);
					if (row === y || col === x || (Math.floor(row / 3) === Math.floor(y / 3) && Math.floor(col / 3) === Math.floor(x / 3))) {
						next[noteKey] = next[noteKey].filter((note) => note !== value);
					}
				}
			}
			return next;
		});
		setGrid((current) => current.map((row, rowIndex) => (
			row.map((cell, colIndex) => rowIndex === y && colIndex === x ? value : cell)
		)));
	};

	return (
		<View style={[styles.centerGame, sudoku.surface && styles.woodGameSurface, sudoku.surface && { backgroundColor: sudoku.surface.bg, borderColor: sudoku.surface.border }]}>
			<View style={styles.sudokuTopBar}>
				<Text style={[styles.gameStatus, { color: complete ? "#7C2D12" : lost ? "#DC2626" : sudoku.status ?? currentTheme.textPrimary }]}>
					{complete ? t("sudoku.solved") : lost ? t("sudoku.gameOver") : selected ? `${t("sudoku.mistakes")} ${mistakes}/${SUDOKU_MAX_MISTAKES}` : t("sudoku.selectCell")}
				</Text>
				<Pressable onPress={() => setNoteMode((value) => !value)} style={[styles.noteToggle, { borderColor: noteMode ? "#FACC15" : "rgba(0,0,0,0.25)" }]}>
					<Text style={[styles.noteToggleText, { color: sudoku.status ?? currentTheme.textPrimary }]}>{t("sudoku.notes")} {noteMode ? t("common.on") : t("common.off")}</Text>
				</Pressable>
			</View>
			<View style={styles.sudokuBoardWrap}>
				<View style={[styles.sudokuBoard, { borderColor: sudoku.boardBorder, backgroundColor: sudoku.boardBg }]}>
					{grid.map((row, y) => row.map((value, x) => {
						const fixed = puzzle[y][x] !== 0;
						const isSelected = selected?.[0] === y && selected?.[1] === x;
						const related = selected && (selected[0] === y || selected[1] === x || (Math.floor(selected[0] / 3) === Math.floor(y / 3) && Math.floor(selected[1] / 3) === Math.floor(x / 3)));
						const wrong = value !== 0 && value !== solution[y][x];
						const key = `${y}-${x}`;

						return (
							<Pressable
								key={key}
								onPress={() => setSelected([y, x])}
								style={[
									styles.sudokuCell,
									{ borderColor: sudoku.cellBorder, backgroundColor: sudoku.cellBg },
									sudoku.cellShadow ? { shadowColor: sudoku.cellShadow, shadowOpacity: 0.22, shadowRadius: 2 } : null,
									related && !isSelected && { backgroundColor: sudoku.related },
									isSelected && { backgroundColor: sudoku.selected },
									(y + 1) % 3 === 0 && y < 8 && styles.sudokuCellBottom,
									(x + 1) % 3 === 0 && x < 8 && styles.sudokuCellRight,
								]}
							>
								{value ? (
									<Text style={[
										styles.sudokuText,
										{ color: wrong ? "#DC2626" : fixed ? sudokuText : (sudoku.entry ?? currentTheme.accent) },
									]}>
										{value}
									</Text>
								) : (
									<Text style={[styles.sudokuNotes, { color: sudoku.notes ?? currentTheme.textSecondary }]}>{notes[key]?.join("") || ""}</Text>
								)}
							</Pressable>
						);
					}))}
				</View>
				{finished && (
					<View style={styles.sudokuOverlay}>
						<View style={[styles.sudokuOverlayCard, { borderColor: complete ? "#22C55E" : "#DC2626" }]}>
							<Text style={[styles.sudokuOverlayTitle, { color: complete ? "#22C55E" : "#F87171" }]}>
								{complete ? t("sudoku.solved") : t("sudoku.gameOver")}
							</Text>
							<Text style={styles.sudokuOverlaySub}>
								{complete ? t("sudoku.cleanBoard") : `${t("sudoku.mistakes")} ${mistakes}/${SUDOKU_MAX_MISTAKES}`}
							</Text>
							<View style={styles.sudokuOverlayButtons}>
								<StylizedButton text={t("sudoku.restart")} onClick={restartGame} backgroundColor={cssColors.spaceGray} style={styles.sudokuOverlayButton} textStyle={styles.smallButtonText} />
								<StylizedButton text={t("sudoku.newGame")} onClick={startNewGame} backgroundColor={currentTheme.buttonPrimary} style={styles.sudokuOverlayButton} textStyle={styles.smallButtonText} />
							</View>
						</View>
					</View>
				)}
			</View>
			<View style={styles.numberPad}>
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
					<Pressable key={number} onPress={() => setNumber(number)} style={[styles.sudokuNumberTile, sudoku.tile && { borderColor: sudoku.tile.border, backgroundColor: sudoku.tile.bg }, finished && styles.disabledControl]} disabled={finished}>
						<Text style={[styles.sudokuNumberText, { color: sudoku.tileText ?? currentTheme.textPrimary }]}>{number}</Text>
					</Pressable>
				))}
				<StylizedButton text={t("sudoku.clear")} onClick={() => setNumber(0)} backgroundColor={cssColors.spaceGray} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
				<StylizedButton text={t("sudoku.newGame")} onClick={startNewGame} backgroundColor={currentTheme.buttonPrimary} style={styles.clearNumberButton} textStyle={styles.tinyButtonText} />
			</View>
		</View>
	);
}

const MAHJONG_SYMBOLS = ["一", "二", "三", "竹", "花", "中", "發", "東", "南", "北", "白", "九", "萬", "風", "春", "月", "山", "水"];
const MAHJONG_LAYOUT = [
	[0, 2, 0], [1, 2, 0], [2, 2, 0], [3, 2, 0], [4, 2, 0], [5, 2, 0],
	[0, 3, 0], [1, 3, 0], [2, 3, 0], [3, 3, 0], [4, 3, 0], [5, 3, 0],
	[1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 1, 0],
	[1, 4, 0], [2, 4, 0], [3, 4, 0], [4, 4, 0],
	[2, 0, 0], [3, 0, 0], [2, 5, 0], [3, 5, 0],
	[2, 2, 1], [3, 2, 1], [2, 3, 1], [3, 3, 1],
	[1, 2, 1], [4, 2, 1], [1, 3, 1], [4, 3, 1],
	[2, 2, 2], [3, 2, 2], [2, 3, 2], [3, 3, 2],
];

// A tile is free when nothing sits on top of it (same column, higher layer) and at
// least one of its left/right neighbours on the same layer is missing. The covering
// test must be column-exact: with this layout the upper layers sit directly above
// lower tiles, so a loose threshold wrongly traps the board's edge tiles.
function isPositionCovered(x: number, y: number, z: number, present: boolean[]): boolean {
	for (let i = 0; i < MAHJONG_LAYOUT.length; i += 1) {
		if (!present[i]) continue;
		const [ix, iy, iz] = MAHJONG_LAYOUT[i];
		if (iz > z && Math.abs(ix - x) < 0.9 && Math.abs(iy - y) < 0.9) return true;
	}
	return false;
}

function isPositionSideBlocked(x: number, y: number, z: number, dx: number, present: boolean[]): boolean {
	for (let i = 0; i < MAHJONG_LAYOUT.length; i += 1) {
		if (!present[i]) continue;
		const [ix, iy, iz] = MAHJONG_LAYOUT[i];
		if (iz === z && ix === x + dx && Math.abs(iy - y) < 0.6) return true;
	}
	return false;
}

function isLayoutIndexFree(index: number, present: boolean[]): boolean {
	if (!present[index]) return false;
	const [x, y, z] = MAHJONG_LAYOUT[index];
	if (isPositionCovered(x, y, z, present)) return false;
	return !isPositionSideBlocked(x, y, z, -1, present) || !isPositionSideBlocked(x, y, z, 1, present);
}

// Builds a guaranteed-solvable board: pairs are laid down in the reverse of a valid
// removal order, so at least one winning sequence always exists.
export function createMahjongTiles(): MahjongTile[] {
	const count = MAHJONG_LAYOUT.length;
	const symbols: string[] = new Array(count).fill("");
	const present = new Array<boolean>(count).fill(true);
	const pairSymbols = shuffleInPlace([...MAHJONG_SYMBOLS]);
	const failed = new Set<string>();
	const findOrder = (): [number, number][] | null => {
		if (!present.some(Boolean)) return [];
		const key = present.map(Number).join("");
		if (failed.has(key)) return null;
		const free = shuffleInPlace(present.map((_, index) => index).filter((index) => isLayoutIndexFree(index, present)));
		for (let i = 0; i < free.length; i++) {
			for (let j = i + 1; j < free.length; j++) {
				const a = free[i], b = free[j];
				present[a] = present[b] = false;
				const rest = findOrder();
				present[a] = present[b] = true;
				if (rest) return [[a, b], ...rest];
			}
		}
		failed.add(key);
		return null;
	};
	const order = findOrder();
	if (!order) throw new Error("Mahjong layout has no legal removal order");
	order.forEach(([a, b], step) => {
		const symbol = pairSymbols[step % pairSymbols.length];
		symbols[a] = symbol;
		symbols[b] = symbol;
	});

	return MAHJONG_LAYOUT.map(([x, y, z], index) => ({
		id: `${index}-${index}`,
		symbol: symbols[index],
		matchKey: symbols[index],
		x,
		y,
		z,
		removed: false,
	}));
}

export function isMahjongTileFree(tile: MahjongTile, tiles: MahjongTile[]) {
	if (tile.removed) return false;
	const present = MAHJONG_LAYOUT.map((_, index) => !tiles[index]?.removed);
	const layoutIndex = Number(tile.id.split("-")[0]);
	return isLayoutIndexFree(layoutIndex, present);
}

// True when no matchable pair is currently reachable but tiles remain (a soft deadlock).
function hasFreeMahjongPair(tiles: MahjongTile[]): boolean {
	const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
	return free.some((tile) => free.some((other) => other.id !== tile.id && other.matchKey === tile.matchKey));
}

// Reshuffles the remaining tiles' symbols, retrying until at least one move exists.
export function shuffleMahjongTiles(tiles: MahjongTile[]): MahjongTile[] {
	const activeIndexes = tiles.map((tile, index) => (tile.removed ? -1 : index)).filter((index) => index >= 0);
	const symbols = activeIndexes.map((index) => tiles[index].symbol);
	for (let attempt = 0; attempt < 40; attempt += 1) {
		shuffleInPlace(symbols);
		const next = tiles.map((tile) => ({ ...tile }));
		activeIndexes.forEach((index, order) => {
			next[index].symbol = symbols[order];
			next[index].matchKey = symbols[order];
		});
		if (hasFreeMahjongPair(next)) return next;
	}
	// A random retry limit must never leave the shuffle button ineffective.
	const next = tiles.map((tile) => ({ ...tile }));
	const free = activeIndexes.filter((index) => isMahjongTileFree(next[index], next));
	if (free.length >= 2) {
		const first = free[0];
		const second = free[1];
		const matching = activeIndexes.find((index) => index !== first && next[index].matchKey === next[first].matchKey);
		if (matching !== undefined) {
			[next[second].symbol, next[matching].symbol] = [next[matching].symbol, next[second].symbol];
			[next[second].matchKey, next[matching].matchKey] = [next[matching].matchKey, next[second].matchKey];
		}
	}
	return next;
}

function MahjongGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const [boardWidth, setBoardWidth] = useState(370);
	const boardScale = Math.min(1, boardWidth / 370);
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [tiles, setTiles] = useState(createMahjongTiles);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [history, setHistory] = useState<MahjongTile[][]>([]);
	const ratingSubmittedRef = useRef(false);
	const remaining = tiles.filter((tile) => !tile.removed).length;
	const mahjong = MAHJONG_THEMES[cosmetics.mahjongTheme];

	useEffect(() => {
		if (remaining !== 0 || ratingSubmittedRef.current) return;
		ratingSubmittedRef.current = true;
		void submitMoreGameSoloResult({
			gameId: "mahjong",
			playerName,
			won: true,
			score: Math.max(0, 1000 - history.length * 5),
			metadata: { moves: history.length },
		}).then(() => onRatingChange());
	}, [history.length, onRatingChange, playerName, remaining]);

	const freePairs = useMemo(() => {
		const free = tiles.filter((tile) => isMahjongTileFree(tile, tiles));
		for (const tile of free) {
			const pair = free.find((item) => item.id !== tile.id && item.matchKey === tile.matchKey);
			if (pair) return [tile.id, pair.id];
		}
		return [];
	}, [tiles]);

	const noMoves = remaining > 0 && freePairs.length === 0;

	const pickTile = (id: string) => {
		const picked = tiles.find((tile) => tile.id === id);
		if (!picked || !isMahjongTileFree(picked, tiles)) return;
		if (!selectedId) {
			setSelectedId(id);
			return;
		}

		if (selectedId === id) {
			setSelectedId(null);
			return;
		}

		const selected = tiles.find((tile) => tile.id === selectedId);
		if (selected?.matchKey === picked.matchKey) {
			setHistory((current) => [...current, tiles]);
			setTiles((current) => current.map((tile) => (
				tile.id === id || tile.id === selectedId ? { ...tile, removed: true } : tile
			)));
		}
		setSelectedId(null);
	};

	return (
		<View style={styles.centerGame}>
			<Text style={[styles.gameStatus, { color: remaining === 0 ? currentTheme.accent : noMoves ? "#F59E0B" : currentTheme.textPrimary }]}>
				{remaining === 0 ? t("mahjong.boardCleared") : noMoves ? t("mahjong.noMoves") : t("mahjong.tilesLeft", { count: remaining })}
			</Text>
			<View onLayout={(event) => setBoardWidth(event.nativeEvent.layout.width)} style={{ width: '100%', height: 360 * boardScale, alignItems: 'center' }}>
			<View style={[styles.mahjongLayerBoard, { backgroundColor: mahjong.board, borderColor: mahjong.boardBorder }, { position: 'absolute', left: Math.max(0, (boardWidth - 370) / 2), transformOrigin: 'top left', transform: [{ scale: boardScale }] }]}>
				{tiles.map((tile) => {
					if (tile.removed) return null;
					const free = isMahjongTileFree(tile, tiles);
					const selected = selectedId === tile.id;
					const hinted = freePairs.includes(tile.id);
					return (
						<Pressable
							key={tile.id}
							onPress={() => pickTile(tile.id)}
							style={[
								styles.mahjongLayerTile,
								{
									left: 20 + tile.x * 51 + tile.z * 7,
									top: 10 + tile.y * 56 - tile.z * 10,
									zIndex: tile.z * 20 + tile.y,
									opacity: free ? 1 : 0.58,
									borderColor: selected ? "#FACC15" : hinted ? "#22D3EE" : mahjong.tileBorder,
									backgroundColor: mahjong.tile,
								},
							]}
						>
							<Text style={[styles.mahjongText, { color: mahjong.text }]}>{tile.symbol}</Text>
						</Pressable>
					);
				})}
			</View>
			</View>
			<View style={styles.controlRow}>
				<StylizedButton text={t("mahjong.undo")} onClick={() => {
					const last = history[history.length - 1];
					if (!last) return;
					setTiles(last);
					setHistory((current) => current.slice(0, -1));
					setSelectedId(null);
				}} backgroundColor={cssColors.spaceGray} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.shuffle")} onClick={() => {
					setHistory((current) => [...current, tiles]);
					setTiles((current) => shuffleMahjongTiles(current));
					setSelectedId(null);
				}} backgroundColor={currentTheme.buttonSecondary} style={styles.resetButton} textStyle={styles.smallButtonText} />
				<StylizedButton text={t("mahjong.new")} onClick={() => { setTiles(createMahjongTiles()); setSelectedId(null); setHistory([]); ratingSubmittedRef.current = false; }} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
			</View>
		</View>
	);
}

const BATTLE_BOARD_SIZE = 10;

function createDefaultFleet(): BattleShip[] {
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

function occupiedFleetCells(fleet: BattleShip[]) {
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

const CROSS_PIXELS = ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"];
function CrossMark({ size }: { size: number }) {
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

function BattleshipGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
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
	}, [ready, opponentReady, winner, turn]);

	useEffect(() => {
		if (!room.role) {
			setOpponentPresent(false);
			setOpponentReady(false);
		}
	}, [room.role]);

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

	const fire = (cell: string) => {
		if (targetCrossed.has(cell)) return;
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

	if (!room.role) {
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
							<BattleGrid title={t("moregames.myFleet")} cells={incomingShots} crossed={ownCrossed} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
						</View>
						<View style={styles.battleLobbyButtons}>
							<OnlineRoomControls
								roomCode={room.roomCode}
								setRoomCode={room.setRoomCode}
								role={room.role}
								status={room.status}
								onHost={() => { room.connect("player1"); }}
								onJoin={() => { room.connect("player2", room.roomCode); }}
								onDisconnect={room.disconnect}
								disabled={!allShipsPlaced}
							/>
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
				<OnlineRoomControls
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
					<View style={[styles.battlePlayerBadge, turn === room.role ? styles.battleTurnActive : null]}>
						<Text style={styles.battlePlayerName}>{playerName}</Text>
						<Text style={styles.battlePlayerLabel}>{t("moregames.you")}</Text>
					</View>
					
					<View style={styles.battleTimerCenter}>
						<Text style={styles.battleTimerText}>{t("battleship.timer", { time: timeLeft })}</Text>
						<Text style={styles.battleTurnArrow}>
							{turn === room.role ? "←" : "→"}
						</Text>
					</View>
					
					<View style={[styles.battlePlayerBadge, turn !== room.role ? styles.battleTurnActive : null]}>
						<Text style={styles.battlePlayerName}>{opponentName}</Text>
						<Text style={styles.battlePlayerLabel}>{t("moregames.colPlayer")}</Text>
					</View>
				</View>
			) : (
				<Text style={[styles.gameStatus, { color: winner ? currentTheme.accent : currentTheme.textPrimary }]}>
					{winner ? t("moregames.wins", { name: roleLabel(winner) }) : t("moregames.placeShips")}
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
					{ready ? <BattleGrid title={t("moregames.target")} cells={targetShots} crossed={targetCrossed} onPress={fire} cosmetics={cosmetics} /> : null}
					<View ref={boardRef} onLayout={() => {
						measureScreenRect(boardRef.current, (pageX, pageY, w, h) => {
							setBoardLayout({ x: pageX, y: pageY, w, h });
						});
					}}>
						<BattleGrid title={t("moregames.myFleet")} cells={incomingShots} crossed={ownCrossed} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
					</View>
				</View>
			</View>
		</View>
	);
}

function ShipDragItem({ ship, onDrop, selected, onSelect, paper, onDragMove, onDragEnd }: {
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
function measureScreenRect(view: View | null | undefined, onRect: (x: number, y: number, w: number, h: number) => void) {
	if (!view) return;
	if (Platform.OS === "web") {
		view.measureInWindow((x, y, w, h) => onRect(x, y, w, h));
	} else {
		view.measure((_x, _y, w, h, pageX, pageY) => onRect(pageX, pageY, w, h));
	}
}

function useBattleGridSize() {
	const { width, height } = useWindowDimensions();
	return getBattleGridSize(width, height);
}

function BattleGrid({
	title,
	cells,
	crossed,
	ships,
	selectedShipId,
	onPress,
	cosmetics,
	dragPreview,
}: {
	title: string;
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

const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const CHESS_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const UNICODE_PIECES: Record<string, string> = {
	wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
	bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

function getChessBoardColors(board: ExtraGameCosmetics["chessBoard"], dark: boolean) {
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

function ChessOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
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

			<View style={{ marginTop: 20, alignItems: "center" }}>
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

// Full rank ordering so cardRankValue stays correct for every deck size.
const DURAK_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const DURAK_SUITS = ["C", "D", "H", "S"];

// Each deck keeps the highest ranks: 24 -> 9..A, 36 -> 6..A, 52 -> 2..A.
function getDurakRanksForDeck(deckSize: number): string[] {
	const ranksPerSuit = deckSize / DURAK_SUITS.length;
	return DURAK_RANKS.slice(DURAK_RANKS.length - ranksPerSuit);
}
// Suits are drawn as 7x7 pixel art so they match the game's look instead of the platform's emoji glyphs.
const SUIT_PIXELS: Record<string, string[]> = {
	S: ["...#...", "..###..", ".#####.", "#######", "#######", "...#...", "..###.."],
	C: ["..###..", "..###..", "#######", "#######", "##.#.##", "...#...", "..###.."],
	H: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
	D: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
};

function DurakSuitIcon({ suit, size, color }: { suit: string; size: number; color: string }) {
	const rows = SUIT_PIXELS[suit];
	if (!rows) return null;
	let d = "";
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x += 1) if (row[x] === "#") d += `M${x} ${y}h1v1h-1z`;
	});
	return (
		<Svg width={size} height={size} viewBox="0 0 7 7">
			<Path d={d} fill={color} />
		</Svg>
	);
}

function createDurakDeck(deckSize: number = 36) {
	const ranks = getDurakRanksForDeck(deckSize);
	return DURAK_SUITS.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`)).sort(() => Math.random() - 0.5);
}

function createEmptyHands(): Record<OnlineRole, string[]> {
	return {
		player1: [],
		player2: [],
		player3: [],
		player4: [],
		player5: [],
		player6: [],
	};
}

export function createDurakState(playerCount: number, variants: DurakVariant[], deckSize: number = 36, bet: number = 0): DurakState {
	const deck = createDurakDeck(deckSize);
	const hands = createEmptyHands();
	const roles = getActiveDurakRoles(playerCount);
	for (let cardIndex = 0; cardIndex < 6; cardIndex += 1) {
		roles.forEach((role) => {
			const card = deck.shift();
			if (card) hands[role].push(card);
		});
	}
	const trump = deck[deck.length - 1]?.slice(-1) || "S";
	return {
		deck,
		trump,
		hands,
		table: [],
		attacker: "player1",
		defender: "player2",
		playerCount,
		variants,
		phase: "attack",
		discardCount: 0,
		winner: null,
		message: "Attack with any card.",
		bet,
		deckSize,
		tableId: createRoomCode(),
		bustedCheaters: [],
	};
}

function cardRank(card: string) {
	return card.slice(0, -1);
}

function cardRankValue(card: string) {
	return DURAK_RANKS.indexOf(cardRank(card));
}

function cardSuit(card: string) {
	return card.slice(-1);
}

export function canBeatDurakCard(defense: string, attack: string, trump: string, variants: DurakVariant[] = ["throw_in"], canCheat: boolean = false) {
	if (canCheat) return true;
	if (cardSuit(defense) === cardSuit(attack)) return cardRankValue(defense) > cardRankValue(attack);
	return cardSuit(defense) === trump && cardSuit(attack) !== trump;
}

function removeCard(cards: string[], card: string) {
	const index = cards.indexOf(card);
	if (index < 0) return cards;
	return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

function getTableCards(table: DurakBout[]) {
	return table.flatMap((bout) => [bout.attack, bout.defense].filter(Boolean) as string[]);
}

function canThrowDurakCard(state: DurakState, card: string, role: OnlineRole) {
	const canCheat = state.variants.includes("cheat") && !state.bustedCheaters?.includes(role);
	if (canCheat) return true;
	if (state.table.length === 0) return true;
	const ranks = new Set(getTableCards(state.table).map(cardRank));
	return ranks.has(cardRank(card));
}

function getDurakVariantLabel(variant: DurakVariant) {
	if (variant === "throw_in") return "durak.modeThrowIn";
	if (variant === "transfer") return "durak.modeTransfer";
	if (variant === "neighbors") return "durak.modeNeighbors";
	if (variant === "all") return "durak.modeAll";
	if (variant === "cheat") return "durak.modeCheat";
	if (variant === "fair") return "durak.modeFair";
	if (variant === "classic") return "durak.modeClassic";
	return "durak.modeDraw";
}

export function resolveDurakCardTarget(
	table: DurakBout[],
	card: string,
	trump: string,
	variants: DurakVariant[] = ["throw_in"],
	preferredIndex?: number | null,
	canCheat: boolean = false,
) {
	const openIndexes = table
		.map((bout, index) => (!bout.defense ? index : -1))
		.filter((index) => index >= 0);
	if (openIndexes.length === 0) return null;

	const orderedIndexes = preferredIndex !== undefined && preferredIndex !== null
		? [preferredIndex, ...openIndexes.filter((index) => index !== preferredIndex)]
		: openIndexes;
	const transferAllowed = variants.includes("transfer") || variants.includes("cheat");
	const preferredBout = preferredIndex !== undefined && preferredIndex !== null ? table[preferredIndex] : null;

	if (preferredBout && !preferredBout.defense) {
		if (canBeatDurakCard(card, preferredBout.attack, trump, variants, canCheat)) {
			return { index: preferredIndex as number, action: "defend" as const };
		}
		if (transferAllowed && table.every((bout) => !bout.defense) && cardRank(card) === cardRank(preferredBout.attack)) {
			return { index: preferredIndex as number, action: "transfer" as const };
		}
	}

	for (const index of orderedIndexes) {
		const bout = table[index];
		if (!bout || bout.defense) continue;
		if (canBeatDurakCard(card, bout.attack, trump, variants, canCheat)) {
			return { index, action: "defend" as const };
		}
	}

	if (transferAllowed && table.every((bout) => !bout.defense)) {
		for (const index of orderedIndexes) {
			const bout = table[index];
			if (!bout || bout.defense) continue;
			if (cardRank(card) === cardRank(bout.attack)) {
				return { index, action: "transfer" as const };
			}
		}
	}

	return null;
}

export function drawDurakCards(state: DurakState, startRole: OnlineRole) {
	const next: DurakState = {
		...state,
		deck: [...state.deck],
		hands: { ...state.hands },
	};
	const roles = getActiveDurakRoles(next.playerCount);
	const startIndex = roles.indexOf(startRole);
	const drawOrder = [...roles.slice(startIndex), ...roles.slice(0, startIndex)];
	drawOrder.forEach((role) => {
		next.hands[role] = [...next.hands[role]];
		while (next.hands[role].length < 6 && next.deck.length > 0) {
			next.hands[role].push(next.deck.shift()!);
		}
	});
	if (next.deck.length === 0) {
		const finished = roles.filter((role) => next.hands[role].length === 0);
		next.finished = [...(state.finished || []), ...finished.filter(role => !state.finished?.includes(role))];
		if (finished.length >= roles.length - 1) {
			next.winner = next.finished[0];
			// Every seat ran out of cards on the same deal: nobody is the durak.
			if (next.finished.length >= roles.length) {
				next.draw = true;
				next.message = "Draw.";
			}
		} else {
			if (!next.hands[next.attacker].length) next.attacker = getNextDurakRole(next.attacker, next.playerCount, next.hands);
			next.defender = getNextDurakRole(next.attacker, next.playerCount, next.hands);
		}
	}
	return next;
}

function DurakOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const tableHeight = Math.max(440, Math.min(600, useWindowDimensions().height - 220));
const { t } = useLanguage();
	const { state: shopState, commit } = useShopState();
	const { signedIn: durakSignedIn } = useAccountIdentity();
	const signedInRef = useRef(durakSignedIn);
	signedInRef.current = durakSignedIn;
	const [state, setState] = useState<DurakState | null>(null);
	const [playerCount, setPlayerCount] = useState<"2" | "3" | "4" | "5" | "6">("2");
	const [deckSize, setDeckSize] = useState<number>(36);
	const [bet, setBet] = useState<number>(100);
	const [activeVariants, setActiveVariants] = useState<DurakVariant[]>(["throw_in", "neighbors", "cheat", "classic"]);
	const [opponentReady, setOpponentReady] = useState(false);
	const [playerNames, setPlayerNames] = useState<Partial<Record<OnlineRole, string>>>({});
	const [playerAvatars, setPlayerAvatars] = useState<Partial<Record<OnlineRole, string>>>({});
	const [emotes, setEmotes] = useState<Partial<Record<OnlineRole, { emoji: string; id: number }>>>({});
	const [showEmojis, setShowEmojis] = useState(false);
	const [hoveredCard, setHoveredCard] = useState<number | null>(null);
	const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);
	const [coinResult, setCoinResult] = useState<number | null>(null);
	const [betError, setBetError] = useState<string | null>(null);
	// Settings of the table a guest is joining, announced by the host before the deal.
	const [tableInfo, setTableInfo] = useState<{ bet: number; playerCount: number } | null>(null);
	const [restartStatus, setRestartStatus] = useState<'idle' | 'waiting' | 'requested'>('idle');
	const [restartAccepts, setRestartAccepts] = useState<string[]>([]);
	const ratingSubmittedRef = useRef<string | null>(null);
	const pendingStateRef = useRef<DurakState | null>(null);
	const antePaidRef = useRef<Set<string>>(new Set());
	const settledRef = useRef<Set<string>>(new Set());
	const [hoveredDurakTargetIndex, setHoveredDurakTargetIndex] = useState<number | null>(null);
	const boutRefs = useRef<(View | null)[]>([]);
	const boutRects = useRef<Array<{ x: number, y: number, w: number, h: number }>>([]);
	
	const shakeAnim = useRef(new Animated.Value(0)).current;

	const triggerShake = useCallback(() => {
		Animated.sequence([
			Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
			Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true })
		]).start();
	}, [shakeAnim]);
	const balanceRef = useRef(shopState.balance);

	useEffect(() => { balanceRef.current = shopState.balance; }, [shopState.balance]);

	// Coins at a betting table are held by the server: show the balance it answers with. While a table waits for
	// the other players' reports the balance is fetched again later (the server settles within about 90 s).
	const applyServerCoins = useCallback((coins: number | null) => {
		if (coins === null) return;
		balanceRef.current = coins;
		void loadShopState().then((latest) => commit({ ...latest, balance: coins }, []));
	}, [commit]);

	const refreshServerCoins = useCallback(() => {
		for (const delay of [8000, 40000, 100000]) {
			setTimeout(() => { void loadShopState().then((latest) => commit(latest, [])); }, delay);
		}
	}, [commit]);

	const reportDurakResult = useCallback(async (tableId: string, result: "win" | "loss" | "draw" | "cancelled") => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const outcome = await durakReport(tableId, result);
			if (outcome) {
				applyServerCoins(outcome.coins);
				if (outcome.status === "pending") refreshServerCoins();
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
		}
	}, [applyServerCoins, refreshServerCoins]);

	const showEmote = useCallback((role: OnlineRole, emoji?: string) => {
		if (!emoji) return;
		const id = Date.now() + Math.floor(Math.random() * 1000);
		setEmotes((current) => ({ ...current, [role]: { emoji, id } }));
		setTimeout(() => {
			setEmotes((current) => (current[role]?.id === id ? { ...current, [role]: undefined } : current));
		}, 2600);
	}, []);

	const syncState = (nextState: DurakState) => {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setState(nextState);
		roomRef.current?.send("sync", { state: nextState });
	};

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "emoji" && senderRole) {
			showEmote(senderRole, payload?.emoji);
			return;
		}
		if (event === "system_joined" && senderRole) {
			setPlayerNames((current) => ({ ...current, [senderRole]: normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)) }));
			if (payload?.avatar) setPlayerAvatars((current) => ({ ...current, [senderRole]: payload.avatar }));
			if (roomRef.current.role && senderRole !== roomRef.current.role) {
				const pending = pendingStateRef.current;
				const table = roomRef.current.role === "player1" && pending ? { bet: pending.bet, playerCount: pending.playerCount } : undefined;
				roomRef.current.send("system_welcome", { playerName, avatar: "", table });
			}
			return;
		}
		if (event === "system_welcome" && senderRole) {
			setPlayerNames((current) => ({ ...current, [senderRole]: normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)) }));
			if (payload?.avatar) setPlayerAvatars((current) => ({ ...current, [senderRole]: payload.avatar }));
			const table = payload?.table;
			if (senderRole === "player1" && roomRef.current.role && roomRef.current.role !== "player1" && table && typeof table.bet === "number") {
				setTableInfo({ bet: table.bet, playerCount: Number(table.playerCount) || 0 });
				if (table.bet > 0 && !signedInRef.current) {
					setBetError(t("durak.signInToBet"));
					roomRef.current.disconnect();
				} else if (table.bet > 0 && balanceRef.current < table.bet) {
					// The ante must be paid in full: leave before the deal instead of playing for free.
					setBetError(t("durak.notEnoughTable", { bet: table.bet }));
					roomRef.current.disconnect();
				}
			}
			return;
		}
		if (event === "system_left" && senderRole) {
			const currentRole = roomRef.current.role;
			if (currentRole && senderRole !== currentRole) {
				setPlayerNames((current) => { const next = { ...current }; delete next[senderRole]; return next; });
				if (state && !state.winner && !state.cancelled) setState({ ...state, winner: null, cancelled: true, message: `${roleLabel(senderRole)} left. Game cancelled; bets refunded.` });
				if (!state && senderRole === 'player1') roomRef.current.disconnect();
			}
			return;
		}
		if (event === "sync" && payload.state) {
			if (state?.cancelled && payload.state.tableId === state.tableId) return;
			LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
			setState(payload.state);
			setOpponentReady(true);
			setRestartStatus('idle');
			setRestartAccepts([]);
		}
		if (event === "restart_request" && senderRole) {
			setRestartStatus("requested");
			setRestartAccepts([senderRole]);
		}
		if (event === "restart_accept" && senderRole) {
			setRestartAccepts((prev) => {
				const next = prev.includes(senderRole) ? prev : [...prev, senderRole];
				if (next.length === state?.playerCount && roomRef.current.role === "player1") {
					// All players accepted, player1 starts a new game
					const nextState = createDurakState(state.playerCount, state.variants, state.deckSize, state.bet);
					setState(nextState);
					roomRef.current.send("sync", { state: nextState });
				}
				return next;
			});
		}
		if (event === "restart_decline") {
			roomRef.current.disconnect();
			setState(null);
			setRestartStatus("idle");
			setRestartAccepts([]);
		}
	}, [showEmote, state, t]);

	const room = useMiniGameRoom("durak", handleEvent, playerName);
	useEffect(() => {
		if (room.role && room.isConnected) setPlayerNames(current => ({ ...current, [room.role!]: playerName }));
	}, [room.role, room.isConnected, playerName]);
	const roomRef = useRef({ role: room.role, send: room.send, disconnect: room.disconnect });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send, disconnect: room.disconnect };
	}, [room.role, room.send, room.disconnect]);

	useEffect(() => {
		if (room.role === "player1" && pendingStateRef.current && !opponentReady) {
			const count = Object.keys(playerNames).length;
			if (count >= Number(playerCount)) {
				const nextState = pendingStateRef.current;
				setState(nextState);
				setOpponentReady(true);
				roomRef.current.send("sync", { state: nextState });
			}
		}
	}, [playerNames, room.role, opponentReady, playerCount]);

	// Ante: each participant pays their bet once per table (host on deal, joiners on sync). The server takes it.
	const antePendingRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!state || !room.role || state.bet <= 0) return;
		const tableId = state.tableId;
		const tableBet = state.bet;
		if (antePaidRef.current.has(tableId) || antePendingRef.current.has(tableId)) return;
		antePendingRef.current.add(tableId);
		void durakPayAnte(tableId, tableBet, state.playerCount).then((result) => {
			antePendingRef.current.delete(tableId);
			if (result && (result.status === "paid" || result.status === "already")) {
				antePaidRef.current.add(tableId);
				applyServerCoins(result.coins);
				return;
			}
			// Not paid: leave before playing for free (not enough coins, signed out, server unreachable, table closed).
			setBetError(
				result?.status === "not_enough_coins" ? t("durak.notEnoughTable", { bet: tableBet })
					: result?.status === "unauthenticated" ? t("durak.signInToBet")
						: t("durak.betUnavailable")
			);
			setState(null);
			roomRef.current.disconnect();
		});
	}, [applyServerCoins, room.role, state, t]);

	useEffect(() => {
		const fetchAvatars = async () => {
			const fetchList = Object.entries(playerNames).filter(([role, name]) => name && playerAvatars[role as OnlineRole] === undefined);
			if (fetchList.length === 0) return;
			const nextAvatars = { ...playerAvatars };
			for (const [role, name] of fetchList) {
				try {
					const data = await getPlayerProfileData(name as string);
					nextAvatars[role as OnlineRole] = data?.avatar_url || "";
				} catch (e) {
					nextAvatars[role as OnlineRole] = "";
				}
			}
			setPlayerAvatars(nextAvatars);
		};
		void fetchAvatars();
	}, [playerNames]);

	const sendEmoji = (emoji: string) => {
		setShowEmojis(false);
		if (!room.role) return;
		showEmote(room.role, emoji);
		room.send("emoji", { emoji });
	};

	const myHand = room.role && state ? state.hands[room.role] : [];

	// Sync localHandOrder whenever the actual hand changes (cards drawn/removed)
	useEffect(() => {
		setLocalHandOrder((prev) => {
			if (myHand.length === 0) return [];
			// Keep existing order for cards still in hand, append new cards at end
			const existing = prev.filter(c => myHand.includes(c));
			const newCards = myHand.filter(c => !prev.includes(c));
			return [...existing, ...newCards];
		});
	}, [myHand.join(',')]);

	const orderedHand = localHandOrder.filter(c => myHand.includes(c));
	const handToRender = orderedHand.length === myHand.length ? orderedHand : myHand;

	useEffect(() => {
		setHoveredDurakTargetIndex(null);
	}, [state?.table.length, state?.phase, state?.attacker, state?.defender, state?.winner]);

	const reorderCard = (fromIndex: number, toIndex: number) => {
		if (fromIndex === toIndex) return;
		setLocalHandOrder(prev => {
			const arr = [...prev];
			const [moved] = arr.splice(fromIndex, 1);
			arr.splice(toIndex, 0, moved);
			return arr;
		});
	};

	const allDefended = Boolean(state?.table.length) && state!.table.every((bout) => Boolean(bout.defense));
	const activeRoles = state ? getActiveDurakRoles(state.playerCount) : getActiveDurakRoles(Number(playerCount));
	const toggleVariant = (v: DurakVariant) => {
		if (v === "all" && Number(playerCount) < 4) {
			triggerShake();
			return;
		}
		setActiveVariants((prev) => {
			let next = [...prev];
			if (v === "throw_in") next = next.filter(x => x !== "transfer");
			if (v === "transfer") next = next.filter(x => x !== "throw_in");
			if (v === "neighbors") next = next.filter(x => x !== "all");
			if (v === "all") next = next.filter(x => x !== "neighbors");
			if (v === "cheat") next = next.filter(x => x !== "fair");
			if (v === "fair") next = next.filter(x => x !== "cheat");
			if (v === "classic") next = next.filter(x => x !== "draw");
			if (v === "draw") next = next.filter(x => x !== "classic");
			
			return next.includes(v) ? next : [...next, v];
		});
	};

	const callOutCheat = (boutIndex: number, isDefense: boolean) => {
		if (!state || !room.role || state.winner || state.cancelled || !state.variants.includes("cheat")) return;
		const bout = state.table[boutIndex];
		if (!bout) return;

		if (isDefense && bout.defense) {
			if (state.defender === room.role) return; // Cannot accuse yourself
			const isLegal = canBeatDurakCard(bout.defense, bout.attack, state.trump, ["throw_in"]);
			if (!isLegal) {
				const next: DurakState = {
					...state,
					hands: { ...state.hands, [state.defender]: [...state.hands[state.defender], bout.defense] },
					table: state.table.map((b, i) => i === boutIndex ? { ...b, defense: null } : b),
					phase: "defend",
					bustedCheaters: [...(state.bustedCheaters || []), state.defender],
					message: `${roleLabel(state.defender)} busted!`,
				};
				syncState(next);
			}
		} else if (!isDefense) {
			if (boutIndex === 0 && state.table.length === 1) return;
			if (state.attacker === room.role) return; // Cannot accuse yourself
			const previousCards = state.table.slice(0, boutIndex).flatMap(b => [b.attack, b.defense]).filter(Boolean) as string[];
			if (previousCards.length === 0) return;
			const validRanks = new Set(previousCards.map(cardRank));
			const isLegal = validRanks.has(cardRank(bout.attack));
			if (!isLegal) {
				const next: DurakState = {
					...state,
					hands: { ...state.hands, [state.attacker]: [...state.hands[state.attacker], bout.attack] },
					table: state.table.filter((_, i) => i !== boutIndex),
					bustedCheaters: [...(state.bustedCheaters || []), state.attacker],
					message: `${roleLabel(state.attacker)} busted!`,
				};
				syncState(next);
			}
		}
	};

	const playCard = (card: string, targetIndexOverride?: number) => {
		if (!state || !room.role || state.winner || state.cancelled) return;
		if (!room.isConnected || !state.hands[room.role].includes(card)) return;
		if (room.role === state.attacker && (state.phase === "attack" || state.phase === "throw" || state.phase === "defend")) {
			if (!canThrowDurakCard(state, card, room.role) || state.table.length >= Math.min(6, state.hands[state.defender].length + state.table.filter((bout) => bout.defense).length)) return;
			const next: DurakState = {
				...state,
				hands: { ...state.hands, [room.role]: removeCard(state.hands[room.role], card) },
				table: [...state.table, { attack: card, defense: null }],
				phase: "defend",
				message: `${roleLabel(state.defender)} defends.`,
			};
			syncState(next);
			return;
		}

		if (room.role === state.defender && state.phase === "defend") {
			const canCheat = state.variants.includes("cheat") && !state.bustedCheaters?.includes(room.role);
			const target = resolveDurakCardTarget(state.table, card, state.trump, state.variants, targetIndexOverride, canCheat);
			if (!target) return;

			if (target.action === "transfer") {
				const nextDefender = getNextDurakRole(state.defender, state.playerCount, state.hands, true);
				if (state.table.length + 1 > Math.min(6, state.hands[nextDefender].length)) return;
				const next: DurakState = {
					...state,
					hands: { ...state.hands, [room.role]: removeCard(state.hands[room.role], card) },
					table: [...state.table, { attack: card, defense: null }],
					attacker: state.defender,
					defender: nextDefender,
					message: `${roleLabel(state.defender)} transferred to ${roleLabel(nextDefender)}.`,
				};
				syncState(next);
				return;
			}

			const nextTable = state.table.map((bout, index) => index === target.index ? { ...bout, defense: card } : bout);
			const defended = nextTable.every((bout) => bout.defense);
			const next: DurakState = {
				...state,
				hands: { ...state.hands, [room.role]: removeCard(state.hands[room.role], card) },
				table: nextTable,
				phase: defended ? "throw" : "defend",
				message: defended ? "Defended. Attacker may throw more or pass." : "Defend the next card.",
			};
			syncState(next);
		}
	};

	const passRound = () => {
		if (!state || state.cancelled || state.winner || !room.isConnected || !room.role || room.role !== state.attacker || !allDefended) return;
		const nextAttacker = state.defender;
		const nextDefender = getNextDurakRole(nextAttacker, state.playerCount, state.hands);
		syncState(drawDurakCards({
			...state,
			table: [],
			discardCount: state.discardCount + getTableCards(state.table).length,
			attacker: nextAttacker,
			defender: nextDefender,
			phase: "attack",
			message: `${roleLabel(nextAttacker)} attacks.`,
		}, state.attacker));
	};

	const takeRound = () => {
		if (!state || state.cancelled || state.winner || !room.isConnected || !room.role || room.role !== state.defender || state.table.length === 0) return;
		const tableCards = getTableCards(state.table);
		const nextAttacker = getNextDurakRole(state.defender, state.playerCount, state.hands);
		const nextDefender = getNextDurakRole(nextAttacker, state.playerCount, state.hands);
		syncState(drawDurakCards({
			...state,
			hands: { ...state.hands, [state.defender]: [...state.hands[state.defender], ...tableCards] },
			table: [],
			attacker: nextAttacker,
			defender: nextDefender,
			phase: "attack",
			message: `${roleLabel(state.defender)} took ${tableCards.length} card(s).`,
		}, state.attacker));
	};

	const host = () => {
		if (bet > 0 && !durakSignedIn) { setBetError(t("durak.signInToBet")); return; }
		if (bet > 0 && shopState.balance < bet) { setBetError(t("durak.notEnough")); return; }
		setBetError(null);
		setCoinResult(null);
		const nextState = createDurakState(Number(playerCount), activeVariants, deckSize, bet);
		pendingStateRef.current = nextState;
		setState(null);
		setOpponentReady(false);
		setPlayerNames({ player1: playerName });
		ratingSubmittedRef.current = null;
		room.connect("player1", undefined, Number(playerCount));
	};

	const join = () => {
		// The table bet is set by the host; it is checked when the host announces it.
		setBetError(null);
		setCoinResult(null);
		setTableInfo(null);
		setState(null);
		setOpponentReady(false);
		setPlayerNames({});
		ratingSubmittedRef.current = null;
		room.connect('player2', room.roomCode);
	};

	useEffect(() => {
		if (state?.cancelled && room.role) {
			const refundKey = `${state.tableId}:refund`;
			if (antePaidRef.current.has(state.tableId) && !settledRef.current.has(refundKey)) {
				settledRef.current.add(refundKey);
				setCoinResult(0);
				void reportDurakResult(state.tableId, "cancelled");
			}
			return;
		}
		if (!state?.winner || !room.isConnected || !room.role) return;

		// Settle the pot once per finished table: winner takes the prize, others keep their loss.
		const settleKey = `${state.tableId}:${state.winner}`;
		if (state.bet > 0 && antePaidRef.current.has(state.tableId) && !settledRef.current.has(settleKey)) {
			settledRef.current.add(settleKey);
			// Everybody reports their own result; the server pays the pot to the one player who claims the win and
			// refunds the antes when nobody (or more than one player) does. The net gain shown is (players - 1) * bet.
			if (state.draw) {
				setCoinResult(0);
				void reportDurakResult(state.tableId, "draw");
			} else if (room.role === state.winner) {
				setCoinResult(getDurakNetPrize(state.bet, state.playerCount));
				void reportDurakResult(state.tableId, "win");
			} else {
				setCoinResult(-state.bet);
				void reportDurakResult(state.tableId, "loss");
			}
		}

		// One rating per table: later edits of a finished state must not pay out again.
		const resultKey = state.tableId;
		if (ratingSubmittedRef.current === resultKey) return;

		const forfeit = state.message.toLowerCase().includes("left");
		const shouldSubmit = room.role === "player1" || (forfeit && room.role === state.winner);
		if (!shouldSubmit) return;

		ratingSubmittedRef.current = resultKey;
		const roles = getActiveDurakRoles(state.playerCount);
		// A seat whose name never arrived would be rated under its "P3" label, so it is skipped.
		const nameOf = (role: OnlineRole) => (role === room.role ? playerName : playerNames[role]);
		const winnerName = nameOf(state.winner);
		if (!winnerName) return;
		const losers = roles.filter((role) => role !== state.winner && nameOf(role));
		void Promise.all(losers.map((loserRole) => {
			const loserName = nameOf(loserRole)!;
			return submitMoreGameMatchResult({
				gameId: "durak",
				player1Name: winnerName,
				player2Name: loserName,
				result: state.draw ? "draw" : "player1",
				roomCode: room.roomCode,
				metadata: { playerCount: state.playerCount, variants: state.variants, source: forfeit ? "forfeit" : "normal", matchId: state.tableId },
			});
		})).then(() => onRatingChange());
	}, [onRatingChange, playerName, playerNames, reportDurakResult, room.isConnected, room.role, room.roomCode, state]);

	const pot = bet * Number(playerCount);
	const prize = getDurakNetPrize(bet, Number(playerCount));

	const displayMessage = useMemo(() => {
		if (!state?.message) return "";
		let msg = state.message;
		const roles = ["player1", "player2", "player3", "player4", "player5", "player6"];
		for (const role of roles) {
			const label = roleLabel(role as OnlineRole);
			if (msg.includes(label)) {
				const name = role === room.role ? `${playerName} (you)` : (playerNames[role as OnlineRole] || label);
				msg = msg.replace(new RegExp(`\\b${label}\\b`, 'g'), name);
			}
		}
		return msg;
	}, [state?.message, playerNames, playerName, room.role]);

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: 'center' }]}>
				{tableInfo && (
					<Text style={[styles.durakSectionLabel, { color: currentTheme.textPrimary, textAlign: 'center' }]}>
						{t("durak.tableInfo", { bet: tableInfo.bet, players: tableInfo.playerCount })}
					</Text>
				)}
				<OnlineRoomControls
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
					playerCount={Number(playerCount)}
					connectedPlayersCount={Object.keys(playerNames).length}
					onHost={host}
					onJoin={join}
					onDisconnect={room.disconnect}
				/>
			</View>
		);
	}

	return (
		<View style={styles.onlineGame}>
			{!state ? (
				<ScrollView style={styles.moreList} contentContainerStyle={styles.durakPrep}>
					<View style={[styles.durakBalanceRow, { borderColor: currentTheme.accent }]}>
						<View style={styles.durakCoinRow}>
							<Text style={[styles.durakBalanceText, { color: currentTheme.textPrimary }]}>{t("durak.balance")}: {shopState.balance}</Text>
							<UiIcon name="coin" size={18} />
						</View>
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.yourBet")}</Text>
					<BetSlider value={bet} onChange={(v) => { setBet(v); setBetError(null); }} maxBalance={shopState.balance} />

					<Animated.Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary, transform: [{ translateX: shakeAnim }] }]}>{t("durak.players")}</Animated.Text>
					<Animated.View style={[styles.segmentRow, { transform: [{ translateX: shakeAnim }] }]}>
						{(["2", "3", "4", "5", "6"] as const).map((count) => (
							<SegmentButton key={count} value={count} selected={playerCount} label={`${count}P`} onPress={(val) => {
								setPlayerCount(val);
								if (Number(val) < 4 && activeVariants.includes("all")) {
									setActiveVariants(prev => prev.filter(x => x !== "all"));
								}
							}} accent="#FACC15" />
						))}
					</Animated.View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.deck")}</Text>
					<View style={styles.segmentRow}>
						{DURAK_DECK_SIZES.map((size) => (
							<SegmentButton key={size} value={String(size)} selected={String(deckSize)} label={String(size)} onPress={(value) => setDeckSize(Number(value))} accent="#38BDF8" />
						))}
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary, marginTop: 40 }]}>{t("durak.modes")}</Text>
					<Animated.View style={[styles.segmentRow, { alignItems: "flex-start", gap: 8, transform: [{ translateX: shakeAnim }] }]}>
						<DurakModeToggleColumn
							topLabel={t("durak.modeThrowIn")} topIcon="arrow" topActive={activeVariants.includes("throw_in")} onTopPress={() => toggleVariant("throw_in")}
							bottomLabel={t("durak.modeTransfer")} bottomIcon="swap" bottomActive={activeVariants.includes("transfer")} onBottomPress={() => toggleVariant("transfer")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeNeighbors")} topIcon="people" topActive={activeVariants.includes("neighbors")} onTopPress={() => toggleVariant("neighbors")}
							bottomLabel={t("durak.modeAll")} bottomIcon="globe" bottomActive={activeVariants.includes("all")} onBottomPress={() => toggleVariant("all")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeCheat")} topIcon="spy" topActive={activeVariants.includes("cheat")} onTopPress={() => toggleVariant("cheat")}
							bottomLabel={t("durak.modeFair")} bottomIcon="shield" bottomActive={activeVariants.includes("fair")} onBottomPress={() => toggleVariant("fair")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeClassic")} topIcon="card" topActive={activeVariants.includes("classic")} onTopPress={() => toggleVariant("classic")}
							bottomLabel={t("durak.modeDraw")} bottomIcon="scales" bottomActive={activeVariants.includes("draw")} onBottomPress={() => toggleVariant("draw")}
						/>
					</Animated.View>

					<View style={{ marginTop: 40, alignItems: "center" }}>
						<OnlineRoomControls
							roomCode={room.roomCode}
							setRoomCode={room.setRoomCode}
							role={room.role}
							status={room.status}
							onHost={host}
							onJoin={join}
							onDisconnect={room.disconnect}
						/>
					</View>

					{betError && <Text style={styles.durakBetError}>{betError}</Text>}
				</ScrollView>
			) : (
				<>
					{state.winner || state.cancelled ? (
						<Text style={[styles.gameStatus, { color: currentTheme.accent }]}>
							{state.cancelled || state.draw ? state.message : t("durak.wins", { seat: roleLabel(state.winner) })}
						</Text>
					) : null}
					{coinResult !== null && (
						<Text style={[styles.durakCoinResult, { color: coinResult >= 0 ? "#22C55E" : "#F87171" }]}>
							{coinResult >= 0 ? t("durak.youWon", { amount: coinResult }) : t("durak.youLost", { amount: Math.abs(coinResult) })}
						</Text>
					)}
					<View style={[styles.durakTable, { height: tableHeight }]}>
						<View style={[styles.durakStatusBar, { borderColor: currentTheme.accent, backgroundColor: "rgba(0,0,0,0.4)" }]}>
							<Text style={[styles.durakStatusText, { color: currentTheme.textPrimary }]}>
								{t("durak.players")}: {state.playerCount} · {t("durak.deck")}: {state.deckSize} · {t("durak.yourBet")}: {state.bet} {t("durak.coinsUnit")}
							</Text>
							<Text style={[styles.durakStatusText, { color: currentTheme.textSecondary }]}>
								{state.variants.map((variant) => t(getDurakVariantLabel(variant))).join(" · ")}
							</Text>
						</View>
						{/* Deck & Discard info */}
						<View style={styles.durakDeckArea}>
							{state.deck.length > 0 && (
								<View style={[styles.durakTrumpUnder, { transform: [{ rotate: '90deg' }, { translateX: 0 }, { translateY: 20 }, { scale: 1.2 }] }]}>
									<DurakCardView card={state.deck.length > 1 ? `${state.trump}0` : state.deck[0]} trump={state.trump} cosmetics={cosmetics} />
								</View>
							)}
							{state.deck.length > 1 && (
								<View style={[styles.durakDeckStack, { transform: [{ scale: 1.2 }] }]}>
									<DurakCardView card="back" trump={state.trump} cosmetics={cosmetics} />
									<View style={styles.durakDeckCountBadge}>
										<Text style={styles.durakDeckCountText}>{state.deck.length}</Text>
									</View>
								</View>
							)}
						</View>

						{/* Opponents */}
						<View style={styles.durakTopOpponents}>
							{activeRoles.map((role) => {
								const isMe = role === room.role;
								const avatar = playerAvatars[role];
								const isAttacker = role === state.attacker;
								const isDefender = role === state.defender;
								const name = isMe ? playerName : (playerNames[role] || roleLabel(role));
								const handSize = state.hands[role].length;
								const emote = emotes[role];
								const isBusted = state.bustedCheaters?.includes(role);
								return (
									<View key={role} style={[styles.durakAvatarContainer, { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 64, justifyContent: 'center' }]}>
										{/* Emoji bubble appears to the LEFT of the avatar */}
										{emote ? (
											<View style={{ position: 'absolute', left: -14, top: -8, zIndex: 20, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center' }}>
												<PixelIcon name={emote.emoji as any} size={18} />
											</View>
										) : (
											null
										)}
										<View style={{ alignItems: 'center', gap: 4 }}>
											<View style={[styles.durakAvatarBorder, isAttacker && { borderColor: "#F97316" }, isDefender && { borderColor: "#38BDF8" }, isMe && { borderColor: '#22C55E', borderWidth: 2 }]}>
												{avatar && avatar.startsWith("http") ? (
													<Image source={{ uri: avatar }} style={styles.durakAvatarImage} />
												) : (
													<View style={[styles.durakAvatarImage, { justifyContent: 'center', alignItems: 'center' }]}>
														<Text style={{ fontFamily: "Silkscreen", fontSize: 16, color: '#FFF' }}>{name.charAt(0).toUpperCase()}</Text>
													</View>
												)}
												<View style={styles.durakAvatarBadge}>
													<Text style={styles.durakAvatarBadgeText}>{handSize}</Text>
												</View>
												{isBusted && (
													<View style={{ position: 'absolute', top: -8, right: -8, zIndex: 10, backgroundColor: '#111827', borderRadius: 12, padding: 2 }}>
														<Text style={{ fontSize: 16 }}>👮‍♂️</Text>
													</View>
												)}
											</View>
											<Text style={[styles.durakAvatarName, isMe && { color: '#86EFAC' }]} numberOfLines={1}>{name}{isMe ? ' (you)' : ''}</Text>
										</View>
									</View>
								);
							})}
						</View>

						<Text style={[styles.gridLabel, { color: 'rgba(255,255,255,0.7)', marginTop: 10 }]}>{displayMessage}</Text>
						
						{/* Center Bouts */}
						<View style={styles.durakCenter}>
							{state.table.length === 0 ? null : (
								state.table.map((bout, index) => {
									const rotations = ['-4deg', '3deg', '-2deg', '5deg', '-6deg', '2deg'];
									const baseRotation = rotations[index % rotations.length];
									return (
										<DurakBoutAnimated
											key={`bout-${index}`}
											ref={(el: View | null) => { boutRefs.current[index] = el; }}
											rotate={baseRotation}
											attack={bout.attack}
											defense={bout.defense}
											trump={state.trump}
											cosmetics={cosmetics}
											isHoverTarget={hoveredDurakTargetIndex === index}
											onAttackPress={() => callOutCheat(index, false)}
											onDefensePress={() => callOutCheat(index, true)}
										/>
									);
								})
							)}
						</View>

						{/* Fanned Player Hand */}
						<View style={[styles.fannedHandContainer, { overflow: 'visible' }]}>
							{handToRender.map((card, index) => {
								const total = handToRender.length;
								const mid = (total - 1) / 2;
								const offset = index - mid;
								const baseY = Math.abs(offset) * Math.abs(offset) * 1.5;
								return (
									<DraggableHandCard
										key={card}
										card={card}
										index={index}
										total={total}
										baseY={baseY}
										offset={offset}
										trump={state.trump}
										cosmetics={cosmetics}
										onPlay={(targetIndexOverride) => playCard(card, targetIndexOverride)}
										onReorder={reorderCard}
										cardWidth={50}
										onDragStart={() => {
											boutRefs.current.forEach((ref, i) => {
												if (ref) {
													measureScreenRect(ref, (px, py, w, h) => {
														boutRects.current[i] = { x: px, y: py, w, h };
													});
												}
											});
										}}
										onDragMove={(x, y) => {
											if (room.role !== state.defender) return;
											const hoveredIndex = boutRects.current.findIndex((rect, i) => {
												if (!rect || state.table[i]?.defense) return false;
												return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
											});
											if (hoveredIndex !== -1 && hoveredDurakTargetIndex !== hoveredIndex) {
												setHoveredDurakTargetIndex(hoveredIndex);
											} else if (hoveredIndex === -1 && hoveredDurakTargetIndex !== null) {
												setHoveredDurakTargetIndex(null);
											}
										}}
										onDragEnd={(x, y, movedUp) => {
											const finalHoverIndex = hoveredDurakTargetIndex;
											setHoveredDurakTargetIndex(null);
											return finalHoverIndex !== null ? finalHoverIndex : null;
										}}
									/>
								);
							})}
						</View>

						{state.cancelled ? (
							<StylizedButton text="Leave" onClick={() => { room.disconnect(); setState(null); setOpponentReady(false); }} backgroundColor={cssColors.spaceGray} />
						) : state.winner ? (
							<View style={[styles.controlRow, { position: 'absolute', bottom: 120, zIndex: 100 }]}>
								{restartStatus === 'idle' && (
									<>
										<StylizedButton text="Play Again" onClick={() => {
											setRestartStatus('waiting');
											setRestartAccepts(room.role ? [room.role] : []);
											roomRef.current.send('restart_request', { role: room.role });
										}} backgroundColor={currentTheme.buttonPrimary} style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
										<StylizedButton text="Leave" onClick={() => {
											roomRef.current.send('restart_decline', { role: room.role });
											roomRef.current.disconnect();
											setState(null);
											setRestartStatus('idle');
											setRestartAccepts([]);
										}} backgroundColor={cssColors.spaceGray} style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
									</>
								)}
								{restartStatus === 'waiting' && (
									<Text style={{ color: currentTheme.textSecondary, fontFamily: 'Silkscreen' }}>Waiting for players...</Text>
								)}
								{restartStatus === 'requested' && (
									<>
										<Text style={{ color: currentTheme.textPrimary, fontFamily: 'Silkscreen', fontSize: 10, marginRight: 10 }}>Restart?</Text>
										<StylizedButton text="Accept" onClick={() => {
											setRestartStatus('waiting');
											roomRef.current.send('restart_accept', { role: room.role });
											setRestartAccepts(prev => {
												const next = prev.includes(room.role!) ? prev : [...prev, room.role!];
												if (next.length === state?.playerCount && roomRef.current.role === "player1") {
													const nextState = createDurakState(state.playerCount, state.variants, state.deckSize, state.bet);
													setState(nextState);
													roomRef.current.send("sync", { state: nextState });
												}
												return next;
											});
										}} backgroundColor={currentTheme.buttonPrimary} style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
										<StylizedButton text="Decline" onClick={() => {
											roomRef.current.send('restart_decline', { role: room.role });
											roomRef.current.disconnect();
											setState(null);
											setRestartStatus('idle');
											setRestartAccepts([]);
										}} backgroundColor="#EF4444" style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
									</>
								)}
							</View>
						) : (
							<View style={[styles.controlRow, { position: 'absolute', bottom: 120, zIndex: 100 }]}>
								<StylizedButton text={t("durak.pass")} onClick={passRound} backgroundColor="#B45309" borderColor="#FDE68A" style={[styles.miniActionButton, styles.durakPassButton, { width: 100 }]} textStyle={{ fontSize: 10 }} disabled={room.role !== state.attacker || !allDefended} />
								<StylizedButton text={t("durak.take")} onClick={takeRound} backgroundColor="#166534" borderColor="#86EFAC" style={[styles.miniActionButton, styles.durakTakeButton, { width: 100 }]} textStyle={{ fontSize: 10 }} disabled={room.role !== state.defender || state.table.every(b => !b.attack)} />
								<Pressable onPress={() => setShowEmojis(!showEmojis)} style={[styles.durakEmojiButton, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: currentTheme.accent }]}>
									<PixelIcon name="face-happy" size={20} color="#FACC15" />
								</Pressable>
							</View>
						)}
						{showEmojis && (
							<View style={styles.durakEmojiPicker}>
								{DURAK_EMOJIS.map((emoji) => (
									<Pressable key={emoji} onPress={() => sendEmoji(emoji)} style={styles.durakEmojiOption}>
										<PixelIcon name={emoji as any} size={20} />
									</Pressable>
								))}
							</View>
						)}
					</View>
				</>
			)}
		</View>
	);
}

/** Draggable card in player's hand:
 *  - Drag UP (dy < -90) → plays the card on the table
 *  - Drag LEFT/RIGHT (|dx| > 30, |dy| < 60) → reorder in hand
 *  - Release in place → snap back (no action)
 */
function DraggableHandCard({
	card, index, total, baseY, offset, trump, cosmetics, onPlay, onReorder, cardWidth, onDragStart, onDragMove, onDragEnd
}: {
	card: string; index: number; total: number; baseY: number; offset: number;
	trump: string; cosmetics: ExtraGameCosmetics;
	onPlay: (targetIndexOverride?: number) => void; onReorder: (from: number, to: number) => void; cardWidth: number;
	onDragStart?: () => void;
	onDragMove?: (x: number, y: number) => void;
	onDragEnd?: (x: number, y: number, movedUp: boolean) => number | null; // Returns target index if valid drop
}) {
	const dragX = useRef(new Animated.Value(0)).current;
	const dragY = useRef(new Animated.Value(0)).current;
	const [dragging, setDragging] = useState(false);
	const [willPlay, setWillPlay] = useState(false);
	const [isHovered, setIsHovered] = useState(false);

	const animOffset = useRef(new Animated.Value(offset)).current;
	const animBaseY = useRef(new Animated.Value(baseY)).current;
	const hoverAnim = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		Animated.spring(animOffset, { toValue: offset, useNativeDriver: true }).start();
		Animated.spring(animBaseY, { toValue: baseY, useNativeDriver: true }).start();
	}, [offset, baseY]);

	useEffect(() => {
		Animated.spring(hoverAnim, { toValue: isHovered && !dragging ? -15 : 0, useNativeDriver: true }).start();
	}, [isHovered, dragging]);

	const rotate = animOffset.interpolate({ inputRange: [-10, 10], outputRange: ['-40deg', '40deg'] });

	const uiScaleRef = useRef(1);
	uiScaleRef.current = useUiScale();
	const callbacksRef = useRef({ onPlay, onReorder, onDragStart, onDragMove, onDragEnd });
	useEffect(() => {
		callbacksRef.current = { onPlay, onReorder, onDragStart, onDragMove, onDragEnd };
	});

	// During drag: card follows finger; lifted = baseY - 28 (slightly up)
	// When willPlay, tint the card green (we do this via border highlight)

	const panResponder = useMemo(() => PanResponder.create({
		onStartShouldSetPanResponder: () => true,
		onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6,
		onPanResponderGrant: () => {
			setDragging(true);
			setWillPlay(false);
			dragX.setValue(0);
			dragY.setValue(0);
			if (callbacksRef.current.onDragStart) callbacksRef.current.onDragStart();
		},
		onPanResponderMove: (_, gs) => {
			dragX.setValue(gs.dx / uiScaleRef.current);
			dragY.setValue(gs.dy / uiScaleRef.current);
			setWillPlay(gs.dy < -80);
			if (callbacksRef.current.onDragMove) callbacksRef.current.onDragMove(gs.moveX, gs.moveY);
		},
		onPanResponderRelease: (_, gs) => {
			setDragging(false);
			setWillPlay(false);

			const movedUp = gs.dy < -80;
			const movedHorizontal = Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < 60;
			const targetIndex = callbacksRef.current.onDragEnd ? callbacksRef.current.onDragEnd(gs.moveX, gs.moveY, movedUp) : null;

			if (movedUp || targetIndex !== null) {
				// Fly card up and play it
				Animated.parallel([
					Animated.timing(dragY, { toValue: -300, duration: 200, useNativeDriver: true }),
					Animated.timing(dragX, { toValue: gs.dx * 0.5, duration: 200, useNativeDriver: true }),
				]).start(() => {
					dragX.setValue(0);
					dragY.setValue(0);
					callbacksRef.current.onPlay(targetIndex !== null ? targetIndex : undefined);
				});
			} else if (movedHorizontal) {
				// Reorder
				const step = Math.max(cardWidth - 25, 15);
				const targetIndex = Math.max(0, Math.min(total - 1, Math.round(index + gs.dx / uiScaleRef.current / step)));
				Animated.parallel([
					Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
					Animated.spring(dragY, { toValue: 0, useNativeDriver: true }),
				]).start();
				callbacksRef.current.onReorder(index, targetIndex);
			} else {
				// Snap back
				Animated.parallel([
					Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
					Animated.spring(dragY, { toValue: 0, useNativeDriver: true }),
				]).start();
			}
		},
		onPanResponderTerminate: () => {
			setDragging(false);
			setWillPlay(false);
			Animated.parallel([
				Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
				Animated.spring(dragY, { toValue: 0, useNativeDriver: true }),
			]).start();
		},
	}), [index, total, cardWidth]);

	const baseTranslateY = Animated.add(animBaseY, hoverAnim);
	const finalTranslateY = dragging ? Animated.add(dragY, baseY - 20) : Animated.add(dragY, baseTranslateY);

	return (
		<Animated.View
			{...panResponder.panHandlers}
			//@ts-ignore - Web-only props
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				...(Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as any) : null),
				transform: [
					{ translateX: dragX },
					{ translateY: finalTranslateY },
					{ rotate },
				],
				zIndex: dragging ? 999 : index,
				elevation: dragging ? 999 : index,
				marginLeft: index === 0 ? 0 : -25,
			}}
		>
			{/* Green glow ring when dragged to table zone */}
			<View style={{
				borderRadius: 8,
				borderWidth: willPlay ? 3 : 0,
				borderColor: '#22C55E',
				shadowColor: willPlay ? '#22C55E' : 'transparent',
				shadowRadius: willPlay ? 12 : 0,
				shadowOpacity: willPlay ? 1 : 0,
			}}>
				<DurakCardView card={card} trump={trump} cosmetics={cosmetics} />
			</View>
			{/* Hint arrow: shows when slightly dragging up */}
			{dragging && !willPlay && (
				<View style={{ position: 'absolute', top: -20, left: 0, right: 0, alignItems: 'center' }}>
					<Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>↑</Text>
				</View>
			)}
			{willPlay && (
				<View style={{ position: 'absolute', top: -24, left: 0, right: 0, alignItems: 'center' }}>
					<Text style={{ color: '#22C55E', fontSize: 11, fontFamily: 'Silkscreen' }}>PLAY!</Text>
				</View>
			)}
		</Animated.View>
	);
}


type DurakBoutProps = { rotate: string; attack: string; defense: string | null; trump: string; cosmetics: ExtraGameCosmetics; selected?: boolean; isHoverTarget?: boolean; onAttackPress?: () => void; onDefensePress?: () => void };
const DurakBoutAnimated = forwardRef<View, DurakBoutProps>(
	({ rotate, attack, defense, trump, cosmetics, selected = false, isHoverTarget = false, onAttackPress, onDefensePress }: DurakBoutProps, ref) => {
	const attackAnim = useRef(new Animated.Value(80)).current;
	const attackOpacity = useRef(new Animated.Value(0)).current;
	const defenseAnim = useRef(new Animated.Value(40)).current;
	const defenseOpacity = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		Animated.parallel([
			Animated.spring(attackAnim, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 160 }),
			Animated.timing(attackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
		]).start();
	}, []);

	useEffect(() => {
		if (!defense) return;
		Animated.parallel([
			Animated.spring(defenseAnim, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 160 }),
			Animated.timing(defenseOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
		]).start();
	}, [defense]);

	return (
		<View ref={ref} style={[styles.durakBout, { transform: [{ rotate }] }]}>
			{isHoverTarget && (
				<View style={{ position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderRadius: 8, borderWidth: 3, borderColor: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.2)', zIndex: 10, pointerEvents: 'none' }}>
					<Text style={{ position: 'absolute', top: -15, alignSelf: 'center', color: '#4ADE80', fontSize: 10, fontFamily: 'SilkscreenBold', backgroundColor: '#111827', paddingHorizontal: 4, borderRadius: 4 }}>TARGET</Text>
				</View>
			)}
			<Animated.View style={{ position: 'absolute', top: 0, left: 0, opacity: attackOpacity, transform: [{ translateY: attackAnim }] }}>
				<Pressable onPress={onAttackPress}>
					<DurakCardView card={attack} trump={trump} cosmetics={cosmetics} small />
				</Pressable>
			</Animated.View>
			{defense && (
				<Animated.View style={{ position: 'absolute', top: 10, left: 8, transform: [{ rotate: '8deg' }, { translateY: defenseAnim }], opacity: defenseOpacity }}>
					<Pressable onPress={onDefensePress}>
						<DurakCardView card={defense} trump={trump} cosmetics={cosmetics} small />
					</Pressable>
				</Animated.View>
			)}
		</View>
	);
});

function DurakCardView({ card, trump, cosmetics, small = false }: { card: string; trump: string; cosmetics: ExtraGameCosmetics; small?: boolean }) {
	const skin: { faceBg: string | null; faceBorder: string | null; backBg: string; backBorder: string; backGlyph: string } = CARD_SKINS[cosmetics.cardSkin];
	const faceSkin = skin.faceBg ? { backgroundColor: skin.faceBg, borderColor: skin.faceBorder ?? skin.faceBg } : null;
	if (card === "back") {
		const isRed = trump === "D" || trump === "H";
		return (
			<View style={[styles.playingCard, small && styles.smallPlayingCard, { backgroundColor: skin.backBg, borderColor: skin.backBorder, alignItems: 'center', justifyContent: 'center' }]}>
								<DurakSuitIcon suit={trump} size={small ? 14 : 28} color={isRed ? '#DC2626' : '#111827'} />
			</View>
		);
	}
	const suit = cardSuit(card);
	const red = suit === "D" || suit === "H";
	return (
		<View style={[styles.playingCard, small && styles.smallPlayingCard, faceSkin, cardSuit(card) === trump && styles.trumpCard]}>
			<Text style={[styles.cardCorner, small && styles.smallCardCorner, { color: red ? "#DC2626" : "#111827" }]}>{cardRank(card)}</Text>
			<DurakSuitIcon suit={suit} size={small ? 21 : 28} color={red ? "#DC2626" : "#111827"} />
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
	moreTopPanel: {
		width: "100%",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.18)",
		borderRadius: 8,
		padding: 8,
		gap: 8,
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	moreNameRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	moreNameInput: {
		flex: 1,
		minWidth: 0,
		height: 30,
		borderWidth: 2,
		borderRadius: 6,
		fontFamily: "Silkscreen",
		fontSize: 10,
		paddingHorizontal: 8,
	},
	moreQuickActions: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	compactTopButton: {
		minWidth: 76,
		height: 30,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 6,
	},
	shopQuickButton: {
		minWidth: 64,
		width: 70,
		height: 30,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 5,
	},
	leaderboardQuickButton: {
		minWidth: 130,
		flexGrow: 1,
		height: 30,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 6,
	},
	myRatingCard: {
		flexGrow: 1,
		flexShrink: 1,
		minWidth: 168,
		minHeight: 44,
		borderWidth: 2,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "rgba(0,0,0,0.26)",
	},
	myRatingTextBlock: {
		flex: 1,
		minWidth: 0,
	},
	myRatingTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
	},
	myRatingMeta: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 13,
	},
	ratingArrow: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
	},
	moreGameRow: {
		width: "100%",
		minHeight: 108,
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
	ratingScreen: {
		width: "100%",
		flex: 1,
		alignItems: "center",
		gap: 10,
	},
	ratingTabs: {
		gap: 6,
		paddingHorizontal: 4,
		paddingBottom: 2,
		alignItems: "center",
	},
	ratingTabsWrapper: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
		paddingHorizontal: 4,
		paddingBottom: 2,
	},
	ratingTab: {
		minHeight: 30,
		borderWidth: 2,
		borderRadius: 8,
		paddingHorizontal: 9,
		paddingVertical: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	ratingTabText: {
		fontFamily: "SilkscreenBold",
		fontSize: 9,
	},
	ratingBadgeCircle: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.35)",
	},
	ratingBadgeCircleSmall: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	ratingBadgeIcon: {
		fontSize: 22,
		lineHeight: 26,
		textAlign: "center",
		color: "#111827",
	},
	ratingBadgeIconSmall: {
		fontSize: 13,
		lineHeight: 16,
		textAlign: "center",
		color: "#111827",
	},
	ratingSummaryCard: {
		width: "100%",
		minHeight: 54,
		borderWidth: 2,
		borderRadius: 8,
		padding: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "rgba(255,255,255,0.04)",
	},
	leaderboardTopRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	leaderboardSub: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textTransform: "uppercase",
	},
	roomMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		width: "100%",
	},
	waitingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		width: '100%',
		paddingHorizontal: 20,
		paddingVertical: 40,
	},
	waitingTitle: {
		fontSize: 26,
		fontFamily: 'Silkscreen',
		marginBottom: 10,
		textAlign: 'center',
	},
	waitingSub: {
		fontSize: 16,
		fontFamily: 'Silkscreen',
		marginBottom: 20,
		textAlign: 'center',
	},
	waitingStatus: {
		fontSize: 14,
		fontFamily: 'Silkscreen',
		marginTop: 10,
		textAlign: 'center',
	},
	codeDisplayContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		flexWrap: 'wrap',
		gap: 15,
		backgroundColor: 'rgba(0,0,0,0.5)',
		padding: 15,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#555',
		marginVertical: 15,
	},
	codeText: {
		fontSize: 32,
		fontFamily: 'SilkscreenBold',
		letterSpacing: 2,
		textAlign: 'center',
	},
	leaveRoomButton: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textTransform: "uppercase",
	},
	leaderboardHeaderRow: {
		width: "100%",
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255,255,255,0.18)",
		paddingHorizontal: 8,
		paddingBottom: 5,
		gap: 8,
	},
	leaderboardHeaderText: {
		fontFamily: "SilkscreenBold",
		fontSize: 9,
		color: "rgba(255,255,255,0.55)",
	},
	leaderboardList: {
		width: "100%",
		flex: 1,
	},
	leaderboardListContent: {
		paddingBottom: 16,
		gap: 4,
	},
	emptyLeaderboardText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 16,
		textAlign: "center",
		paddingVertical: 22,
	},
	leaderboardRow: {
		width: "100%",
		minHeight: 32,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
		borderRadius: 6,
		paddingHorizontal: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	leaderboardRank: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
	},
	leaderboardName: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
	},
	leaderboardTier: {
		minHeight: 20,
		borderRadius: 5,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
		paddingHorizontal: 4,
	},
	leaderboardTierEmoji: {
		fontSize: 11,
		lineHeight: 14,
	},
	leaderboardTierText: {
		fontFamily: "SilkscreenBold",
		fontSize: 8,
		color: "#111827",
	},
	leaderboardElo: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		textAlign: "right",
	},
	myRatingHero: {
		width: "100%",
		alignItems: "center",
		gap: 8,
		paddingVertical: 8,
	},
	myRatingHeading: {
		fontFamily: "SilkscreenBold",
		fontSize: 22,
		textAlign: "center",
	},
	myRatingHeroRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	myRatingTierText: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
	},
	myRatingEloText: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
	},
	ratingProgressBg: {
		width: "92%",
		height: 10,
		borderRadius: 5,
		backgroundColor: "rgba(255,255,255,0.16)",
		overflow: "hidden",
	},
	ratingProgressFill: {
		height: "100%",
		borderRadius: 5,
	},
	ratingMainButton: {
		minWidth: 168,
		height: 34,
		minHeight: 34,
		margin: 0,
	},
	ratingTiersTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		textTransform: "uppercase",
	},
	ratingTierList: {
		width: "100%",
		maxHeight: 190,
	},
	ratingTierListContent: {
		gap: 6,
		paddingBottom: 8,
	},
	ratingTierRow: {
		width: "100%",
		minHeight: 48,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
		borderRadius: 7,
		padding: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	ratingTierName: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
	},
	eloInfoBox: {
		width: "100%",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.22)",
		borderRadius: 8,
		padding: 10,
		backgroundColor: "rgba(0,0,0,0.22)",
		gap: 5,
	},
	eloInfoTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	eloInfoText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 16,
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
	woodGameSurface: {
		backgroundColor: "#D8A868",
		borderRadius: 8,
		paddingVertical: 10,
		borderWidth: 2,
		borderColor: "#7C2D12",
	},
	gameStatus: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		textAlign: "center",
		lineHeight: 20,
	},
	shopContent: {
		width: "100%",
		alignItems: "center",
		gap: 10,
		paddingBottom: 18,
	},
	shopHint: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 15,
		textAlign: "center",
		width: "90%",
	},
	cosmeticSection: {
		width: "96%",
		borderWidth: 2,
		borderRadius: 8,
		padding: 10,
		backgroundColor: "rgba(0,0,0,0.24)",
		gap: 8,
	},
	cosmeticTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
	},
	segmentRow: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	segmentButton: {
		minHeight: 30,
		borderWidth: 2,
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	segmentText: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	rulePanel: {
		width: "100%",
		alignItems: "center",
		gap: 5,
	},
	ticBoard: {
		width: "100%",
		maxWidth: 252,
		aspectRatio: 1,
		flexDirection: "row",
		flexWrap: "wrap",
		borderRadius: 8,
		overflow: "hidden",
	},
	ticCell: {
		width: "33.333333%",
		height: "33.333333%",
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	ticText: {
		fontFamily: "SilkscreenBold",
		fontSize: 36,
	},
	sudokuTopBar: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		maxWidth: 332,
	},
	noteToggle: {
		borderWidth: 2,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 6,
		backgroundColor: "rgba(255,255,255,0.24)",
	},
	noteToggleText: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	sudokuBoardWrap: {
		position: "relative",
		width: "100%",
		height: undefined,
		maxWidth: 333,
		aspectRatio: 1,
	},
	sudokuBoard: {
		width: "100%",
		height: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 3,
		overflow: "hidden",
	},
	sudokuOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.62)",
		borderRadius: 6,
	},
	sudokuOverlayCard: {
		minWidth: 220,
		paddingVertical: 18,
		paddingHorizontal: 16,
		borderRadius: 12,
		borderWidth: 2,
		backgroundColor: "rgba(15,23,42,0.96)",
		alignItems: "center",
		gap: 10,
	},
	sudokuOverlayTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 20,
		textAlign: "center",
	},
	sudokuOverlaySub: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		lineHeight: 15,
		textAlign: "center",
		color: "#CBD5E1",
	},
	sudokuOverlayButtons: {
		flexDirection: "row",
		gap: 8,
		marginTop: 4,
	},
	sudokuOverlayButton: {
		minWidth: 96,
		height: 36,
		minHeight: 36,
		margin: 0,
		paddingHorizontal: 8,
	},
	disabledControl: {
		opacity: 0.4,
	},
	sudokuCell: {
		width: "11.111111%",
		height: "11.111111%",
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
		fontFamily: Platform.select({ web: "Georgia, serif", default: "Silkscreen" }),
		fontSize: 22,
		fontWeight: "700",
	},
	sudokuNotes: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
	},
	numberPad: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
		maxWidth: 333,
	},
	sudokuNumberTile: {
		width: 42,
		height: 36,
		borderRadius: 7,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.35)",
		backgroundColor: "rgba(255,255,255,0.12)",
		alignItems: "center",
		justifyContent: "center",
	},
	sudokuNumberText: {
		fontFamily: "SilkscreenBold",
		fontSize: 14,
	},
	clearNumberButton: {
		minWidth: 92,
		height: 32,
		minHeight: 32,
		margin: 0,
	},
	mahjongLayerBoard: {
		width: 370,
		height: 360,
		borderRadius: 10,
		borderWidth: 2,
		position: "relative",
		overflow: "hidden",
	},
	mahjongLayerTile: {
		position: "absolute",
		width: 58,
		height: 70,
		borderWidth: 2,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOpacity: 0.4,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 3 },
	},
	mahjongText: {
		fontFamily: Platform.select({ web: "Georgia, serif", default: "SilkscreenBold" }),
		fontSize: 32,
		fontWeight: "700",
	},
	roomPanel: {
		width: "100%",
		gap: 6,
		marginBottom: 8,
	},
	roomRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		maxWidth: "100%",
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
	roomMeta: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		textAlign: "center",
	},
	onlineGame: {
		flex: 1,
		width: "100%",
		maxWidth: 600,
		alignSelf: "center",
		alignItems: "center",
		paddingVertical: 10,
		gap: 12,
	},
	battlePlayersHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		width: "100%",
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: "rgba(15,23,42,0.6)",
		borderRadius: 16,
		marginBottom: 10,
	},
	battlePlayerBadge: {
		alignItems: "center",
		padding: 10,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	battleTurnActive: {
		borderColor: "#FACC15",
		backgroundColor: "rgba(250,204,21,0.1)",
	},
	battlePlayerName: {
		fontFamily: "Silkscreen",
		color: "#FFFFFF",
		fontSize: 14,
	},
	battlePlayerLabel: {
		color: "#9CA3AF",
		fontSize: 10,
		marginTop: 4,
	},
	battleTimerCenter: {
		alignItems: "center",
	},
	battleTimerText: {
		fontFamily: "Silkscreen",
		color: "#EF4444",
		fontSize: 18,
	},
	battleTurnArrow: {
		color: "#FACC15",
		fontSize: 24,
		marginTop: 4,
	},
	durakPrep: {
		width: "100%",
		alignItems: "center",
		gap: 10,
		paddingBottom: 18,
	},
	durakBalanceRow: {
		width: "92%",
		borderWidth: 2,
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		backgroundColor: "rgba(0,0,0,0.24)",
		alignItems: "center",
	},
	durakCoinRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	durakBalanceText: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		textAlign: "center",
	},
	durakSectionLabel: {
		width: "100%",
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		textAlign: "center",
		marginTop: 2,
	},
	durakBetButton: {
		minWidth: 74,
		minHeight: 34,
		borderWidth: 2,
		borderRadius: 7,
		paddingHorizontal: 8,
		paddingVertical: 7,
		alignItems: "center",
		justifyContent: "center",
	},
	durakBetButtonText: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
	},
	durakPotText: {
		width: "92%",
		fontFamily: "SilkscreenBold",
		fontSize: 11,
		lineHeight: 17,
		textAlign: "center",
	},
	durakBetError: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		color: "#F87171",
		textAlign: "center",
	},
	durakCoinResult: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		textAlign: "center",
	},
	durakStatusBar: {
		width: "100%",
		borderWidth: 2,
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 8,
		marginBottom: 8,
		gap: 4,
	},
	durakStatusText: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		lineHeight: 13,
		textAlign: "center",
	},
	durakEmote: {
		position: "absolute",
		top: -30,
		alignSelf: "center",
		fontSize: 24,
		zIndex: 3,
	},
	durakEmojiButton: {
		width: 38,
		height: 34,
		borderWidth: 2,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.10)",
	},
	durakEmojiButtonText: {
		fontSize: 18,
		lineHeight: 22,
	},
	durakPassButton: {
		shadowColor: "#FDE68A",
		shadowOpacity: 0.45,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
	},
	durakTakeButton: {
		shadowColor: "#86EFAC",
		shadowOpacity: 0.45,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
	},

	durakEmojiOption: {
		width: 34,
		height: 34,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.10)",
	},
	durakEmojiOptionText: {
		fontSize: 18,
		lineHeight: 22,
	},
	controlRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
	},
	battlePlayArea: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		alignItems: "flex-start",
		gap: 16,
		paddingHorizontal: 0,
		overflow: 'visible' as const,
	},
	battleLeftPanel: {
		width: 70,
		alignItems: "center",
		gap: 8,
		overflow: 'visible' as const,
	},
	battleRotateButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(255,255,255,0.15)",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.3)",
	},
	fleetVerticalScroll: {
		flexGrow: 1,
		maxHeight: 400,
	},
	fleetVerticalList: {
		alignItems: "center",
		paddingVertical: 10,
		gap: 8,
	},
	battleBoardsVertical: {
		flex: 1,
		minWidth: 220,
		flexBasis: 220,
		alignItems: "center",
		gap: 16,
	},
	battleLobbyButtons: {
		width: "100%",
		alignItems: "center",
		marginTop: 8,
	},
	miniActionButton: {
		minWidth: 70,
		height: 30,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 4,
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
		width: 220,
		height: 220,
		flexDirection: "column",
		borderWidth: 2,
	},
	battleRow: {
		flex: 1,
		flexDirection: "row",
	},
	battleOverlay: {
		...StyleSheet.absoluteFillObject,
	},
	battleMarkCell: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	battleHitCell: {
		backgroundColor: "rgba(220, 38, 38, 0.55)",
	},
	battleCell: {
		flex: 1,
		borderWidth: 0.7,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		position: "relative",
	},
	battleCellText: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		lineHeight: 12,
		zIndex: 4,
	},
	shipSegment: {
		position: "absolute",
		zIndex: 5,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#0EA5E9",
		borderColor: "#E0F2FE",
		borderWidth: 1,
		shadowColor: "#020617",
		shadowOpacity: 0.28,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
	},
	shipSegmentHorizontal: {
		left: -1,
		right: -1,
		top: 3,
		bottom: 3,
	},
	shipSegmentVertical: {
		top: -1,
		bottom: -1,
		left: 3,
		right: 3,
	},
	shipSegmentPaper: {
		backgroundColor: "#60A5FA",
		borderColor: "#1D4ED8",
	},
	shipSegmentSelected: {
		backgroundColor: "#FACC15",
		borderColor: "#FEF9C3",
	},
	shipPorthole: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(2,6,23,0.72)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.5)",
	},
	chessBoard: {
		width: '100%',
		maxWidth: 336,
		aspectRatio: 1,
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 4,
		borderColor: "rgba(255,255,255,0.35)",
		borderRadius: 8,
		overflow: "hidden",
	},
	chessCell: {
		width: '12.5%',
		height: '12.5%',
		alignItems: "center",
		justifyContent: "center",
		position: "relative",
	},
	chessPiece: {
		fontFamily: Platform.select({ web: "Georgia, 'Times New Roman', serif", default: "serif" }),
		fontSize: 32,
		lineHeight: 38,
		textShadowColor: "rgba(0,0,0,0.65)",
		textShadowOffset: { width: 1, height: 2 },
		textShadowRadius: 2,
	},
	chessPieceClub: {
		fontWeight: "900",
	},
	legalDot: {
		position: "absolute",
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "rgba(15,23,42,0.45)",
	},
	resetButton: {
		minWidth: 104,
		height: 34,
		minHeight: 34,
		margin: 0,
	},
	durakTable: {
		width: "100%",
		height: 600,
		alignItems: "center",
		backgroundColor: "#2F5C43",
		borderRadius: 16,
		overflow: "hidden",
		position: "relative",
	},
	durakDeckArea: {
		position: 'absolute',
		top: 180,
		left: 10,
		zIndex: 5,
		alignItems: 'center',
		justifyContent: 'center',
	},
	durakTrumpUnder: {
		position: 'absolute',
		transform: [{ rotate: '90deg' }, { translateX: 0 }, { translateY: 20 }],
	},
	durakDeckStack: {
		shadowColor: "#000",
		shadowOpacity: 0.5,
		shadowRadius: 5,
		shadowOffset: { width: 2, height: 2 },
	},
	durakEmojiPicker: {
		position: 'absolute',
		bottom: 160,
		right: 20,
		backgroundColor: 'rgba(0,0,0,0.85)',
		borderRadius: 16,
		padding: 10,
		flexDirection: 'row',
		flexWrap: 'wrap',
		width: 160,
		gap: 12,
		justifyContent: 'center',
		borderWidth: 1,
		borderColor: '#FACC15',
		zIndex: 1000,
	},
	durakDeckCountBadge: {
		position: 'absolute',
		top: -8,
		right: -8,
		backgroundColor: '#FFF',
		borderRadius: 12,
		minWidth: 24,
		height: 24,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#000',
	},
	durakDeckCountText: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		color: '#000',
	},
	durakTopOpponents: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "center",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 20,
		zIndex: 10,
	},
	durakAvatarContainer: {
		alignItems: "center",
		gap: 4,
	},
	durakAvatarBorder: {
		borderRadius: 26,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.8)",
	},
	durakAvatarImage: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "rgba(0,0,0,0.3)",
	},
	durakAvatarBadge: {
		position: "absolute",
		bottom: -5,
		right: -5,
		backgroundColor: "#FACC15",
		borderRadius: 10,
		minWidth: 20,
		paddingHorizontal: 4,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "#000",
	},
	durakAvatarBadgeText: {
		fontFamily: "SilkscreenBold",
		fontSize: 10,
		color: "#000",
	},
	durakAvatarName: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		color: "#FFF",
		backgroundColor: "rgba(0,0,0,0.5)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	durakCenter: {
		flex: 1,
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		padding: 20,
	},
	fannedHandContainer: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "flex-end",
		position: "absolute",
		bottom: 34,
		zIndex: 50,
		height: 120,
	},
	durakBout: {
		position: "relative",
		width: 48,
		height: 66,
		marginHorizontal: 4,
		marginVertical: 4,
	},
	durakBoutPressable: {
		width: 56,
		height: 74,
		alignItems: "center",
		justifyContent: "center",
	},
	durakBoutSelected: {
		borderWidth: 2,
		borderColor: "#FACC15",
		borderRadius: 12,
		shadowColor: "#FACC15",
		shadowOpacity: 0.75,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 0 },
	},
	durakBoutTargetBadge: {
		position: "absolute",
		top: -10,
		alignSelf: "center",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		backgroundColor: "rgba(250, 204, 21, 0.95)",
	},
	durakBoutTargetBadgeText: {
		fontFamily: "SilkscreenBold",
		fontSize: 7,
		color: "#111827",
	},
	durakModeColumn: {
		flexDirection: "column",
		width: 78,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.15)",
		overflow: "hidden",
	},
	durakModeCell: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 10,
		paddingHorizontal: 4,
		minHeight: 74,
		position: "relative",
	},
	durakModeCellActive: {
		backgroundColor: "#FFFFFF",
	},
	durakModeIcon: {
		marginBottom: 4,
	},
	durakModeLabel: {
		fontFamily: "Silkscreen",
		fontSize: 9,
		color: "#FFFFFF",
		textAlign: "center",
	},
	durakModeLabelActive: {
		color: "#DC2626",
	},
	durakModeCheck: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: "#EF4444",
		alignItems: "center",
		justifyContent: "center",
	},
	durakModeCheckText: {
		color: "#FFFFFF",
		fontSize: 9,
		fontWeight: "bold",
	},
	cardHand: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
	},
	playingCard: {
		width: 54,
		height: 76,
		borderWidth: 2,
		borderRadius: 8,
		borderColor: "#E5E7EB",
		backgroundColor: "#FFF7ED",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOpacity: 0.25,
		shadowRadius: 3,
		shadowOffset: { width: 0, height: 2 },
	},
	trumpCard: {
		borderColor: "#FACC15",
	},
	smallPlayingCard: {
		width: 40,
		height: 56,
		borderRadius: 6,
	},
	cardCorner: {
		position: "absolute",
		left: 5,
		top: 3,
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	smallCardCorner: {
		fontSize: 9,
		left: 4,
		top: 2,
	},
	cardSuit: {
		fontFamily: Platform.select({ web: "Georgia, serif", default: "serif" }),
		fontSize: 30,
		fontWeight: "900",
	},
	smallCardSuit: {
		fontSize: 22,
	},
	emptyDefenseSlot: {
		width: 40,
		height: 56,
		borderWidth: 2,
		borderRadius: 6,
		borderColor: "rgba(255,255,255,0.22)",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.18)",
	},
	emptyDefenseText: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
		color: "rgba(255,255,255,0.35)",
	},
	cardText: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
		textAlign: "center",
	},
	sliderContainer: {
		width: "100%",
		paddingHorizontal: 16,
		paddingVertical: 12,
		alignItems: "center",
	},
	sliderTrack: {
		width: "100%",
		height: 12,
		borderRadius: 6,
		position: "relative",
		justifyContent: "center",
	},
	sliderFill: {
		height: "100%",
		borderRadius: 6,
		position: "absolute",
		left: 0,
		top: 0,
	},
	sliderThumb: {
		width: 24,
		height: 24,
		borderRadius: 12,
		position: "absolute",
		top: -6,
		marginLeft: -12,
		shadowColor: "#000",
		shadowOpacity: 0.3,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	sliderLabels: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 8,
	},
	sliderLabelText: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	betValueRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	betRangeRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		width: "100%",
		paddingHorizontal: 6,
	},
	betQuickRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 8,
		marginTop: 8,
	},
	betQuickButton: {
		borderWidth: 2,
		borderRadius: 6,
		paddingVertical: 4,
		paddingHorizontal: 12,
	},
});

const BET_MIN = 100;

function snapBet(raw: number): number {
	if (raw >= 1000) return Number(raw.toPrecision(2));
	return Math.round(raw / 10) * 10;
}

// Maps slider position (0..1) to a bet between the minimum bet and the player's balance.
// The track always spans exactly that range, so the far end of the slider is "all in".
export function betFromPosition(position: number, balance: number): number {
	const min = Math.min(BET_MIN, balance);
	if (balance <= min) return balance;
	const clamped = Math.min(1, Math.max(0, position));
	if (clamped >= 0.995) return balance;
	if (clamped <= 0.005) return min;
	const raw = balance / min > 12
		? Math.exp(Math.log(min) + clamped * (Math.log(balance) - Math.log(min)))
		: min + clamped * (balance - min);
	return Math.min(balance, Math.max(min, snapBet(raw)));
}

export function positionFromBet(bet: number, balance: number): number {
	const min = Math.min(BET_MIN, balance);
	if (balance <= min) return 0;
	const clamped = Math.min(balance, Math.max(min, bet));
	return balance / min > 12
		? (Math.log(clamped) - Math.log(min)) / (Math.log(balance) - Math.log(min))
		: (clamped - min) / (balance - min);
}

function BetSlider({ value, onChange, maxBalance }: { value: number; onChange: (value: number) => void; maxBalance: number }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const minBet = Math.min(BET_MIN, maxBalance);
	const canBet = maxBalance >= BET_MIN;

	// Keep the bet inside what the player can actually afford (e.g. after the balance changes).
	useEffect(() => {
		if (canBet && value > maxBalance) onChange(maxBalance);
	}, [canBet, maxBalance, onChange, value]);

	const quickBets = [
		{ label: t("durak.betMin"), amount: minBet },
		{ label: t("durak.betHalf"), amount: betFromPosition(0.5, maxBalance) },
		{ label: t("durak.betMax"), amount: maxBalance },
	];

	return (
		<View style={styles.sliderContainer}>
			<View style={styles.betValueRow}>
				<Text style={[styles.sliderLabelText, { color: currentTheme.textPrimary, fontSize: 16 }]}>{formatCoins(value)}</Text>
				<UiIcon name="coin" size={18} />
			</View>
			<Slider
				style={{ width: "100%", height: 40 }}
				minimumValue={0}
				maximumValue={1}
				step={0.005}
				disabled={!canBet}
				value={positionFromBet(value, maxBalance)}
				onValueChange={(position) => {
					const next = betFromPosition(position, maxBalance);
					if (next !== value) onChange(next);
				}}
				minimumTrackTintColor="#38BDF8"
				maximumTrackTintColor="rgba(255,255,255,0.2)"
				thumbTintColor="#FFFFFF"
			/>
			<View style={styles.betRangeRow}>
				<Text style={[styles.sliderLabelText, { color: currentTheme.textSecondary }]}>{formatCoins(minBet)}</Text>
				<Text style={[styles.sliderLabelText, { color: currentTheme.textSecondary }]}>{formatCoins(maxBalance)}</Text>
			</View>
			<View style={styles.betQuickRow}>
				{quickBets.map((quick) => {
					const active = value === quick.amount;
					return (
						<Pressable
							key={quick.label}
							disabled={!canBet}
							onPress={() => onChange(quick.amount)}
							style={[styles.betQuickButton, { borderColor: active ? "#38BDF8" : "rgba(255,255,255,0.35)", backgroundColor: active ? "rgba(56,189,248,0.2)" : "transparent" }]}
						>
							<Text style={[styles.sliderLabelText, { color: currentTheme.textPrimary }]}>{quick.label}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
