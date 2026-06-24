import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chess } from "chess.js";
import { Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, Image, ActivityIndicator, Clipboard, LayoutAnimation, UIManager } from "react-native";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}
import Slider from '@react-native-community/slider';
import SimplePopupView from "./SimplePopupView";
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
} from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState, ShopItem, ShopCategory, getVisibleShopItemsByCategory } from "@/constants/Shop";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import PixelIcon from "@/components/PixelIcon";

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

interface ExtraGameCosmetics {
	chessPieces: "classic" | "royal" | "club";
	chessBoard: "slate" | "violet" | "walnut";
	sudokuTheme: "wood" | "night";
	mahjongTheme: "jade" | "ivory";
	cardSkin: "classic" | "casino";
	seaSkin: "navy" | "paper";
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
	{ tier: "Bronze", color: "#CD7F32", icon: "🥉", min: 0, max: 800 },
	{ tier: "Silver", color: "#C0C0C0", icon: "🥈", min: 800, max: 1000 },
	{ tier: "Gold", color: "#FFD700", icon: "🥇", min: 1000, max: 1200 },
	{ tier: "Diamond", color: "#00BFFF", icon: "💎", min: 1200, max: 1400 },
	{ tier: "Master", color: "#DA70D6", icon: "👑", min: 1400, max: 1600 },
	{ tier: "Legend", color: "#FF4500", icon: "🔥", min: 1600, max: 2000 },
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

function useMiniGameRoom(gameId: MoreGameId, onEvent: (event: string, payload: any, senderRole?: OnlineRole) => void, playerName: string = DEFAULT_MORE_GAME_PLAYER_NAME, avatarUrl?: string) {
	const [roomCode, setRoomCode] = useState("");
	const [role, setRole] = useState<OnlineRole | null>(null);
	const [status, setStatus] = useState<RoomStatus>("offline");
	const channelRef = useRef<any>(null);
	const roleRef = useRef<OnlineRole | null>(null);
	const onEventRef = useRef(onEvent);
	const playerNameRef = useRef(playerName);
	const avatarUrlRef = useRef(avatarUrl);
	const clientIdRef = useRef(createRoomCode());

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
		const channel = channelRef.current;
		const currentRole = roleRef.current;
		channelRef.current = null;
		setStatus("offline");
		setRole(null);
		roleRef.current = null;

		if (!channel) return;

		const removeChannel = () => {
			supabase.removeChannel(channel);
		};

		if (currentRole) {
			void channel.send({
				type: "broadcast",
				event: "mini_game",
					payload: {
						event: "system_left",
						payload: { role: currentRole, playerName: playerNameRef.current },
						role: currentRole,
						senderId: clientIdRef.current,
					},
			}).finally(removeChannel);
			return;
		}

		removeChannel();
	}, []);

	const connect = useCallback((nextRole: OnlineRole, requestedCode?: string) => {
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

		const channel = supabase.channel(`more-games:${gameId}:${nextCode}`, {
			config: { broadcast: { self: false } },
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
						payload: { role: nextRole, playerName: playerNameRef.current, avatar: avatarUrlRef.current },
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
						<Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>{t("mp.connecting")}</Text>
						<ActivityIndicator size="large" color={currentTheme.accent} style={{ marginVertical: 30 }} />
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
	topLabel: string; topIcon: string; topActive: boolean; onTopPress: () => void;
	bottomLabel: string; bottomIcon: string; bottomActive: boolean; onBottomPress: () => void;
}) {
	return (
		<View style={styles.durakModeColumn}>
			<Pressable style={[styles.durakModeCell, topActive && styles.durakModeCellActive, { borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.2)" }]} onPress={onTopPress}>
				<Text style={styles.durakModeIcon}>{topIcon}</Text>
				<Text style={[styles.durakModeLabel, topActive && styles.durakModeLabelActive]}>{topLabel}</Text>
				{topActive && <View style={styles.durakModeCheck}><Text style={styles.durakModeCheckText}>✓</Text></View>}
			</Pressable>
			<Pressable style={[styles.durakModeCell, bottomActive && styles.durakModeCellActive]} onPress={onBottomPress}>
				<Text style={styles.durakModeIcon}>{bottomIcon}</Text>
				<Text style={[styles.durakModeLabel, bottomActive && styles.durakModeLabelActive]}>{bottomLabel}</Text>
				{bottomActive && <View style={styles.durakModeCheck}><Text style={styles.durakModeCheckText}>✓</Text></View>}
			</Pressable>
		</View>
	);
}
export default function MoreGamesMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [activeGame, setActiveGame] = useState<MoreGameId | null>(null);
	const { state: shopState } = useShopState();
	
	const cosmetics: ExtraGameCosmetics = useMemo(() => ({
		chessPieces: (shopState.equipped.chess_piece?.replace("chess_piece_", "") || "classic") as ExtraGameCosmetics["chessPieces"],
		chessBoard: (shopState.equipped.chess_board?.replace("chess_board_", "") || "slate") as ExtraGameCosmetics["chessBoard"],
		sudokuTheme: (shopState.equipped.sudoku_theme?.replace("sudoku_theme_", "") || "wood") as ExtraGameCosmetics["sudokuTheme"],
		mahjongTheme: (shopState.equipped.mahjong_theme?.replace("mahjong_theme_", "") || "jade") as ExtraGameCosmetics["mahjongTheme"],
		cardSkin: (shopState.equipped.card_skin?.replace("card_skin_", "") || "classic") as ExtraGameCosmetics["cardSkin"],
		seaSkin: (shopState.equipped.sea_skin?.replace("sea_skin_", "") || "navy") as ExtraGameCosmetics["seaSkin"],
	}), [shopState.equipped]);

	const [playerName, setPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [draftPlayerName, setDraftPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [ratingGame, setRatingGame] = useState<RatedMoreGameId>("durak");
	const [leaderboard, setLeaderboard] = useState<MoreGameRating[]>([]);
	const [myRating, setMyRating] = useState<MoreGameRating | null>(null);
	const [ratingsLoading, setRatingsLoading] = useState(false);
	const [ratingPanel, setRatingPanel] = useState<"list" | "leaderboard">("list");

	useEffect(() => {
		AsyncStorage.getItem(PLAYER_NAME_KEY).then((rawName) => {
			const nextName = normalizeStoredPlayerName(rawName);
			setPlayerName(nextName);
			setDraftPlayerName(nextName);
		});
	}, []);

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
			style={[
				{ justifyContent: "flex-start", backgroundColor: currentTheme.menuBackground, height: "92%" },
				isMobile && { width: "94%", height: "92%", paddingHorizontal: 8 },
			]}
		>
			<View style={styles.moreHeaderRow}>
				<StylizedButton text={t("common.back")} onClick={handleBack} backgroundColor={cssColors.spaceGray} style={styles.topBackButton} textStyle={styles.smallButtonText} />
				<View style={styles.moreHeaderTextBlock}>
					<Text style={[styles.header, { color: currentTheme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>
						{activeCard ? t(`moregames.card.${activeCard.id}.title`) : (ratingPanel === "leaderboard" ? t("moregames.leaderboardTitle") : t("moregames.title"))}
					</Text>
					<Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>
						{activeCard ? t("moregames.subtitleActive") : ratingPanel !== "list" ? t("moregames.subtitleRatings", { game: t(`moregames.label.${ratingGame}`) }) : t("moregames.subtitleList")}
					</Text>
				</View>
				<View style={styles.topBackSpacer} />
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
			<Text style={[styles.ratingBadgeIcon, small && styles.ratingBadgeIconSmall]}>{badge.icon}</Text>
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
								<Text style={styles.leaderboardTierEmoji}>{badge.icon}</Text>
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
			roomRef.current?.send("sync", { board, turn });
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
	}, [board, turn, t]);

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
		if (winner || isDraw || board[index]) return;
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

function countSudokuSolutions(grid: number[][], limit: number): number {
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
function generateSudoku(): SudokuBoard {
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
	const wood = cosmetics.sudokuTheme === "wood";

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
			setNotes((current) => {
				const currentNotes = current[key] || [];
				const nextNotes = currentNotes.includes(value) ? currentNotes.filter((item) => item !== value) : [...currentNotes, value].sort();
				return { ...current, [key]: nextNotes };
			});
			return;
		}

		if (value !== 0 && value !== solution[y][x]) {
			setMistakes((current) => current + 1);
		}

		setNotes((current) => ({ ...current, [key]: [] }));
		setGrid((current) => current.map((row, rowIndex) => (
			row.map((cell, colIndex) => rowIndex === y && colIndex === x ? value : cell)
		)));
	};

	return (
		<View style={[styles.centerGame, wood && styles.woodGameSurface]}>
			<View style={styles.sudokuTopBar}>
				<Text style={[styles.gameStatus, { color: complete ? "#7C2D12" : lost ? "#DC2626" : wood ? "#5B2E14" : currentTheme.textPrimary }]}>
					{complete ? t("sudoku.solved") : lost ? t("sudoku.gameOver") : selected ? `${t("sudoku.mistakes")} ${mistakes}/${SUDOKU_MAX_MISTAKES}` : t("sudoku.selectCell")}
				</Text>
				<Pressable onPress={() => setNoteMode((value) => !value)} style={[styles.noteToggle, { borderColor: noteMode ? "#FACC15" : "rgba(0,0,0,0.25)" }]}>
					<Text style={[styles.noteToggleText, { color: wood ? "#5B2E14" : currentTheme.textPrimary }]}>{t("sudoku.notes")} {noteMode ? t("common.on") : t("common.off")}</Text>
				</Pressable>
			</View>
			<View style={styles.sudokuBoardWrap}>
				<View style={[styles.sudokuBoard, wood ? styles.sudokuBoardWood : styles.sudokuBoardNight]}>
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
									wood ? styles.sudokuCellWood : styles.sudokuCellNight,
									related && !isSelected && { backgroundColor: wood ? "#E9C99A" : "rgba(96,165,250,0.16)" },
									isSelected && { backgroundColor: wood ? "#FACC15" : "#334155" },
									(y + 1) % 3 === 0 && y < 8 && styles.sudokuCellBottom,
									(x + 1) % 3 === 0 && x < 8 && styles.sudokuCellRight,
								]}
							>
								{value ? (
									<Text style={[
										styles.sudokuText,
										{ color: wrong ? "#DC2626" : fixed ? (wood ? "#5B2E14" : currentTheme.textPrimary) : (wood ? "#7C2D12" : currentTheme.accent) },
									]}>
										{value}
									</Text>
								) : (
									<Text style={[styles.sudokuNotes, { color: wood ? "#8B5E34" : currentTheme.textSecondary }]}>{notes[key]?.join("") || ""}</Text>
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
					<Pressable key={number} onPress={() => setNumber(number)} style={[styles.sudokuNumberTile, wood && styles.sudokuNumberTileWood, finished && styles.disabledControl]} disabled={finished}>
						<Text style={[styles.sudokuNumberText, { color: wood ? "#5B2E14" : currentTheme.textPrimary }]}>{number}</Text>
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
function createMahjongTiles(): MahjongTile[] {
	const count = MAHJONG_LAYOUT.length;
	const symbols: string[] = new Array(count).fill("");
	const present = new Array<boolean>(count).fill(true);
	const pairSymbols = shuffleInPlace([...MAHJONG_SYMBOLS]);

	for (let step = 0; step < count / 2; step += 1) {
		let candidates: number[] = [];
		for (let i = 0; i < count; i += 1) {
			if (present[i] && isLayoutIndexFree(i, present)) candidates.push(i);
		}
		if (candidates.length < 2) {
			candidates = [];
			for (let i = 0; i < count; i += 1) if (present[i]) candidates.push(i);
		}
		shuffleInPlace(candidates);
		const a = candidates[0];
		const b = candidates[1];
		const symbol = pairSymbols[step % pairSymbols.length];
		symbols[a] = symbol;
		symbols[b] = symbol;
		present[a] = false;
		present[b] = false;
	}

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

function isMahjongTileFree(tile: MahjongTile, tiles: MahjongTile[]) {
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
function shuffleMahjongTiles(tiles: MahjongTile[]): MahjongTile[] {
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
	return tiles.map((tile) => ({ ...tile }));
}

function MahjongGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [tiles, setTiles] = useState(createMahjongTiles);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [history, setHistory] = useState<MahjongTile[][]>([]);
	const ratingSubmittedRef = useRef(false);
	const remaining = tiles.filter((tile) => !tile.removed).length;
	const jade = cosmetics.mahjongTheme === "jade";

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
			<View style={[styles.mahjongLayerBoard, jade ? styles.mahjongJadeBoard : styles.mahjongIvoryBoard]}>
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
									borderColor: selected ? "#FACC15" : hinted ? "#22D3EE" : jade ? "#0F766E" : "#B45309",
									backgroundColor: jade ? "#ECFDF5" : "#FFF7ED",
								},
							]}
						>
							<Text style={[styles.mahjongText, { color: jade ? "#047857" : "#991B1B" }]}>{tile.symbol}</Text>
						</Pressable>
					);
				})}
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

export function getShipCells(ship: BattleShip): string[] {
	return Array.from({ length: ship.length }, (_, index) => {
		const x = ship.x + (ship.orientation === "h" ? index : 0);
		const y = ship.y + (ship.orientation === "v" ? index : 0);
		return `${x},${y}`;
	});
}

export function isShipPlacementValid(candidate: BattleShip, fleet: BattleShip[]) {
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

function occupiedFleetCells(fleet: BattleShip[]) {
	return new Set(fleet.flatMap(getShipCells));
}

function BattleshipGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [fleet, setFleet] = useState(createDefaultFleet);
	const [selectedShipId, setSelectedShipId] = useState("b4");
	const [incomingShots, setIncomingShots] = useState<Record<string, "hit" | "miss">>({});
	const [targetShots, setTargetShots] = useState<Record<string, "pending" | "hit" | "miss">>({});
	const [turn, setTurn] = useState<DuelRole | null>("player1");
	const [winner, setWinner] = useState<DuelRole | null>(null);
	const [winnerSource, setWinnerSource] = useState<"normal" | "forfeit" | null>(null);
	const [ready, setReady] = useState(false);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [timeLeft, setTimeLeft] = useState(60);
	const [boardLayout, setBoardLayout] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
	const [dragPreview, setDragPreview] = useState<{ shipId: string; x: number; y: number; valid: boolean } | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const fleetRef = useRef(fleet);
	const incomingRef = useRef(incomingShots);
	const boardRef = useRef<View>(null);

	useEffect(() => {
		fleetRef.current = fleet;
	}, [fleet]);

	useEffect(() => {
		incomingRef.current = incomingShots;
	}, [incomingShots]);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			roomRef.current?.send("ready_state", { ready });
			return;
		}
		if (event === "system_left" && isDuelRole(senderRole) && isDuelRole(roomRef.current.role)) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setWinnerSource("forfeit");
			setWinner(roomRef.current.role);
			return;
		}
		if (event === "ready_state") {
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
				winner: lost ? payload.from : null,
			});
			if (!lost) {
				setTurn(currentRole);
				setTimeLeft(60);
			}
			return;
		}
		if (event === "shot_result") {
			const currentRole = roomRef.current.role;
			if (!isDuelRole(currentRole) || payload.to !== currentRole) return;
			setTargetShots((current) => ({ ...current, [payload.cell]: payload.result }));
			if (payload.winner && isDuelRole(payload.winner)) {
				setWinnerSource("normal");
				setWinner(payload.winner);
			} else {
				setTurn(getDuelOpponent(currentRole));
				setTimeLeft(60);
			}
		}
	}, [ready]);

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

	const resetLocal = () => {
		setFleet(createDefaultFleet());
		setSelectedShipId("b4");
		setIncomingShots({});
		setTargetShots({});
		setTurn("player1");
		setWinner(null);
		setWinnerSource(null);
		setReady(false);
		setOpponentReady(false);
		setTimeLeft(60);
		ratingSubmittedRef.current = null;
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
		if (!boardLayout) return;
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
	}, [boardLayout]);

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
		const shipSizes = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
		const shipNames = ["Carrier", "Cruiser A", "Cruiser B", "Destroyer A", "Destroyer B", "Destroyer C", "Boat A", "Boat B", "Boat C", "Boat D"];
		const newFleet: BattleShip[] = [];

		for (let i = 0; i < shipSizes.length; i++) {
			const size = shipSizes[i];
			let attempts = 0;
			let placed = false;

			while (!placed && attempts < 100) {
				const orientation: ShipOrientation = Math.random() < 0.5 ? "h" : "v";
				const x = Math.floor(Math.random() * BATTLE_BOARD_SIZE);
				const y = Math.floor(Math.random() * BATTLE_BOARD_SIZE);

				const candidate: BattleShip = {
					id: `b${size}-${i}`,
					name: shipNames[i],
					length: size,
					x,
					y,
					orientation,
				};

				if (isShipPlacementValid(candidate, newFleet)) {
					newFleet.push(candidate);
					placed = true;
				}
				attempts++;
			}

			if (!placed) {
				// Если не удалось разместить, начинаем сначала
				return randomizeFleet();
			}
		}

		setFleet(newFleet);
	};

	const markReady = () => {
		setReady(true);
		room.send("ready_state", { ready: true });
	};

	const fire = (cell: string) => {
		if (!isDuelRole(room.role) || !room.isConnected || !ready || !opponentReady || winner || turn !== room.role || targetShots[cell]) return;
		setTargetShots((current) => ({ ...current, [cell]: "pending" }));
		setTurn(null);
		room.send("shot", { from: room.role, to: getDuelOpponent(room.role), cell });
	};

	useEffect(() => {
		if (!winner || !room.isConnected || !isDuelRole(room.role)) return;
		const resultKey = `${room.roomCode}:${winner}:${winnerSource || "normal"}`;
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
			metadata: { source: winnerSource || "normal" },
		}).then(() => onRatingChange());
	}, [onRatingChange, opponentName, playerName, room.isConnected, room.role, room.roomCode, winner, winnerSource]);

	const allShipsPlaced = fleet.every(s => s.x >= 0 && s.x < BATTLE_BOARD_SIZE);

	if (!room.role) {
		// Pre-lobby: place ships first, then host or join
		return (
			<View style={styles.onlineGame}>
				<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>{t("moregames.placeShips")}</Text>
				<View style={styles.battlePlayArea}>
					<View style={[styles.battleLeftPanel, { zIndex: 200, elevation: 200 }]}>
						<View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
							<Pressable onPress={rotateSelectedShip} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 22, color: '#FFF', lineHeight: 26 }}>↻</Text>
							</Pressable>
							<Pressable onPress={randomizeFleet} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 16, color: '#FFF', lineHeight: 26 }}>🎲</Text>
							</Pressable>
						</View>
						<View style={[styles.fleetVerticalList, { overflow: 'visible' }]}>
							{fleet.map((ship) => (
								<ShipDragItem
									key={ship.id}
									ship={ship}
									selected={ship.id === selectedShipId}
									onSelect={() => setSelectedShipId(ship.id)}
									onDrop={onDropShip}
									onDragMove={onDragMove}
									onDragEnd={onDragEnd}
									paper={cosmetics.seaSkin === "paper"}
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
							boardRef.current?.measure((x, y, w, h, pageX, pageY) => {
								setBoardLayout({ x: pageX, y: pageY, w, h });
							});
						}}>
							<BattleGrid title={t("moregames.myFleet")} cells={incomingShots} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
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

	if (room.role && !opponentReady) {
		return (
			<View style={[styles.onlineGame, { minHeight: 400, justifyContent: 'center' }]}>
				<OnlineRoomControls
					roomCode={room.roomCode}
					setRoomCode={room.setRoomCode}
					role={room.role}
					status={room.status}
					opponentReady={opponentReady}
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
					<View style={[styles.battleLeftPanel, { zIndex: 200, elevation: 200 }]}>
						<View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
							<Pressable onPress={rotateSelectedShip} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 22, color: '#FFF', lineHeight: 26 }}>↻</Text>
							</Pressable>
							<Pressable onPress={randomizeFleet} style={styles.battleRotateButton}>
								<Text style={{ fontSize: 16, color: '#FFF', lineHeight: 26 }}>🎲</Text>
							</Pressable>
						</View>
						<View style={[styles.fleetVerticalList, { overflow: 'visible' }]}>
							{fleet.map((ship) => (
								<ShipDragItem
									key={ship.id}
									ship={ship}
									selected={ship.id === selectedShipId}
									onSelect={() => setSelectedShipId(ship.id)}
									onDrop={onDropShip}
									onDragMove={onDragMove}
									onDragEnd={onDragEnd}
									paper={cosmetics.seaSkin === "paper"}
								/>
							))}
						</View>
						<StylizedButton text={t("moregames.ready")} onClick={markReady} backgroundColor={allShipsPlaced ? currentTheme.buttonPrimary : '#555'} style={[styles.miniActionButton, { width: '100%', marginTop: 10 }]} textStyle={styles.tinyButtonText} disabled={ready || !allShipsPlaced} />
					</View>
				)}
				<View style={[styles.battleBoardsVertical, { zIndex: 1 }]}>
					{ready ? <BattleGrid title={t("moregames.target")} cells={targetShots} onPress={fire} cosmetics={cosmetics} /> : null}
					<View ref={boardRef} onLayout={() => {
						boardRef.current?.measure((x, y, w, h, pageX, pageY) => {
							setBoardLayout({ x: pageX, y: pageY, w, h });
						});
					}}>
						<BattleGrid title={t("moregames.myFleet")} cells={incomingShots} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} dragPreview={dragPreview} />
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
	const panResponder = useMemo(() => PanResponder.create({
		onStartShouldSetPanResponder: () => true,
		onMoveShouldSetPanResponder: () => true,
		onPanResponderGrant: () => {
			isDragging.current = true;
			onSelect();
			pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
			pan.setValue({ x: 0, y: 0 });
		},
		onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
			useNativeDriver: false,
			listener: (e: any) => {
				if (onDragMove && isDragging.current) {
					onDragMove(ship.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
				}
			}
		}),
		onPanResponderRelease: (e) => {
			isDragging.current = false;
			pan.flattenOffset();
			onDrop(ship.id, e.nativeEvent.pageX, e.nativeEvent.pageY);
			if (onDragEnd) onDragEnd();
			Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
		}
	}), [ship.id, onDrop, onSelect, onDragMove, onDragEnd]);

	const cellSize = 18;
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
			<View style={{ flexDirection: ship.orientation === 'h' ? 'row' : 'column', width: '100%', height: '100%' }}>
				{Array.from({ length: ship.length }).map((_, i) => (
					<View key={i} style={{ width: cellSize, height: cellSize }}>
						<ShipCellArt length={ship.length} orientation={ship.orientation} paper={paper} segmentIndex={i} selected={selected} />
					</View>
				))}
			</View>
		</Animated.View>
	);
}

function BattleGrid({
	title,
	cells,
	ships,
	selectedShipId,
	onPress,
	cosmetics,
	dragPreview,
}: {
	title: string;
	cells: Record<string, string>;
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
	const paper = cosmetics.seaSkin === "paper";

	// Получаем клетки для превью
	const previewCells = new Set<string>();
	if (dragPreview && ships) {
		const previewShip = ships.find(s => s.id === dragPreview.shipId);
		if (previewShip) {
			const previewShipData = { ...previewShip, x: dragPreview.x, y: dragPreview.y };
			getShipCells(previewShipData).forEach(cell => previewCells.add(cell));
		}
	}

	return (
		<View style={styles.battleGridWrap}>
			<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>{title}</Text>
			<View style={[styles.battleGrid, paper ? styles.paperBattleGrid : styles.navyBattleGrid]}>
				{Array.from({ length: BATTLE_BOARD_SIZE * BATTLE_BOARD_SIZE }).map((_, index) => {
					const cell = `${index % BATTLE_BOARD_SIZE},${Math.floor(index / BATTLE_BOARD_SIZE)}`;
					const status = cells[cell];
					const ship = shipByCell.get(cell);
					const shipCells = ship ? getShipCells(ship) : [];
					const shipSegmentIndex = ship ? shipCells.indexOf(cell) : -1;
					const isPreviewCell = previewCells.has(cell);
					const previewColor = dragPreview?.valid ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)";
					const backgroundColor = isPreviewCell
						? previewColor
						: status === "hit"
						? "#DC2626"
						: status === "miss"
							? paper ? "#CBD5E1" : "#1E40AF"
							: status === "pending"
								? "#FACC15"
								: ship
									? ship.id === selectedShipId ? "#FACC15" : paper ? "#93C5FD" : "#38BDF8"
									: paper ? "rgba(255,255,255,0.32)" : "rgba(14,165,233,0.12)";
					return (
						<Pressable key={cell} onPress={() => onPress?.(cell)} style={[styles.battleCell, { backgroundColor, borderColor: paper ? "#2563EB" : currentTheme.gridBorder }]}>
							{ship && !status ? (
								<ShipCellArt
									length={ship.length}
									orientation={ship.orientation}
									paper={paper}
									segmentIndex={shipSegmentIndex}
									selected={ship.id === selectedShipId}
								/>
							) : null}
							<Text style={[styles.battleCellText, { color: paper ? "#1E3A8A" : "#FFFFFF", fontSize: status ? 12 : 10 }]}>{status === "hit" ? "🔥" : status === "miss" ? "🌊" : ""}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function ShipCellArt({
	length,
	orientation,
	paper,
	segmentIndex,
	selected,
}: {
	length: number;
	orientation: "h" | "v";
	paper: boolean;
	segmentIndex: number;
	selected: boolean;
}) {
	const isStart = segmentIndex === 0;
	const isEnd = segmentIndex === length - 1;
	const isHorizontal = orientation === "h";
	
	const shipStyle = {
		position: "absolute" as const,
		top: isHorizontal ? 2 : isStart ? 2 : 0,
		bottom: isHorizontal ? 2 : isEnd ? 2 : 0,
		left: !isHorizontal ? 2 : isStart ? 2 : 0,
		right: !isHorizontal ? 2 : isEnd ? 2 : 0,
		backgroundColor: paper ? "rgba(30,58,138,0.2)" : (selected ? "#FACC15" : "#475569"),
		borderColor: paper ? "#1E3A8A" : (selected ? "#FEF9C3" : "#94A3B8"),
		borderWidth: paper ? 1.5 : 1,
		borderStyle: paper ? "solid" as const : "solid" as const,
	};
	
	const roundedCaps = isHorizontal
		? {
			borderTopLeftRadius: isStart ? 16 : 0,
			borderBottomLeftRadius: isStart ? 16 : 0,
			borderTopRightRadius: isEnd ? 4 : 0,
			borderBottomRightRadius: isEnd ? 4 : 0,
		}
		: {
			borderTopLeftRadius: isStart ? 16 : 0,
			borderTopRightRadius: isStart ? 16 : 0,
			borderBottomLeftRadius: isEnd ? 4 : 0,
			borderBottomRightRadius: isEnd ? 4 : 0,
		};

	return (
		<View style={[shipStyle, roundedCaps]} pointerEvents="none">
			{paper && (
				<View style={{ flex: 1, margin: 2, borderWidth: 1, borderColor: "rgba(30,58,138,0.4)", borderRadius: isStart ? 10 : 2, borderStyle: "dotted", justifyContent: 'center', alignItems: 'center' }}>
					{isStart && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#1E3A8A" }} />}
					{!isStart && !isEnd && <View style={{ width: 6, height: 6, borderWidth: 1, borderColor: "#1E3A8A", borderRadius: 3 }} />}
				</View>
			)}
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
	if (board === "walnut") return dark ? "#8B5E34" : "#E8C99B";
	if (board === "violet") return dark ? "#7C3AED" : "#C4B5FD";
	return dark ? "#334155" : "#CBD5E1";
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

	const game = useMemo(() => new Chess(fen), [fen]);
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
		const myColor = room.role === "player2" ? "b" : "w";
		if (isDuelRole(room.role) && (room.role !== turnRole || !opponentReady || remoteResult || game.turn() !== myColor)) return;
		if (!room.role && game.isGameOver()) return;
		const piece = game.get(square as any);

		if (!selected) {
			if (!room.role || piece?.color === myColor) setSelected(square);
			return;
		}

		try {
			const nextGame = new Chess(fen);
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

	const handlePlayAgain = () => {
		const game = new Chess(fen);
		const isGameOver = game.isCheckmate() || game.isDraw() || remoteResult;
		if (!isGameOver || !room.role || !isDuelRole(room.role)) return;

		// Определяем результат игры
		let result: "player1" | "player2" | "draw";
		if (remoteResult) {
			// Оппонент вышел - текущий игрок победил
			result = room.role as "player1" | "player2";
		} else if (game.isDraw()) {
			result = "draw";
		} else {
			// Мат - выигрывает тот, кто НЕ ходит сейчас
			result = turnRole === "player1" ? "player2" : "player1";
		}

		if (result === room.role || result === "draw") {
			// Проигравший или ничья - показываем выбор цвета
			setShowColorChoice(true);
		} else {
			// Победитель ждёт выбора проигравшего
			room.send("playAgain", {});
		}
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
								cosmetics.chessPieces === "club" && styles.chessPieceClub,
								{ color: p!.color === "b" ? "#111827" : "#FFFFFF" },
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

				if (isGameOver && isDuelRole(room.role)) {
					return (
						<StylizedButton
							text={t("moregames.playAgain")}
							onClick={handlePlayAgain}
							backgroundColor={currentTheme.accent}
							style={styles.resetButton}
							textStyle={styles.smallButtonText}
						/>
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
const SUIT_SYMBOLS: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

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

function createDurakState(playerCount: number, variants: DurakVariant[], deckSize: number = 36, bet: number = 0): DurakState {
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

	if (transferAllowed && table.every((bout) => !bout.defense)) {
		for (const index of orderedIndexes) {
			const bout = table[index];
			if (!bout || bout.defense) continue;
			if (cardRank(card) === cardRank(bout.attack)) {
				return { index, action: "transfer" as const };
			}
		}
	}

	for (const index of orderedIndexes) {
		const bout = table[index];
		if (!bout || bout.defense) continue;
		if (canBeatDurakCard(card, bout.attack, trump, variants, canCheat)) {
			return { index, action: "defend" as const };
		}
	}

	return null;
}

function drawDurakCards(state: DurakState, startRole: OnlineRole) {
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
		if (finished.length > 0) next.winner = finished[0];
	}
	return next;
}

function DurakOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
	const { currentTheme } = useTheme();
const { t } = useLanguage();
	const { state: shopState, commit } = useShopState();
	const [state, setState] = useState<DurakState | null>(null);
	const [playerCount, setPlayerCount] = useState<"2" | "3" | "4" | "5" | "6">("2");
	const [deckSize, setDeckSize] = useState<number>(36);
	const [bet, setBet] = useState<number>(100);
	const [activeVariants, setActiveVariants] = useState<DurakVariant[]>(["throw_in", "neighbors", "cheat", "classic"]);
	const [joinSeat, setJoinSeat] = useState<OnlineRole>("player2");
	const [opponentReady, setOpponentReady] = useState(false);
	const [playerNames, setPlayerNames] = useState<Partial<Record<OnlineRole, string>>>({});
	const [playerAvatars, setPlayerAvatars] = useState<Partial<Record<OnlineRole, string>>>({});
	const [emotes, setEmotes] = useState<Partial<Record<OnlineRole, { emoji: string; id: number }>>>({});
	const [showEmojis, setShowEmojis] = useState(false);
	const [hoveredCard, setHoveredCard] = useState<number | null>(null);
	const [localHandOrder, setLocalHandOrder] = useState<string[]>([]);
	const [coinResult, setCoinResult] = useState<number | null>(null);
	const [betError, setBetError] = useState<string | null>(null);
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

	const adjustCoins = useCallback((delta: number) => {
		const next = Math.max(0, Math.round(balanceRef.current + delta));
		balanceRef.current = next;
		void commit({ ...shopState, balance: next }, ["coins"]);
	}, [commit, shopState]);

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
				roomRef.current.send("system_welcome", { playerName, avatar: "" });
			}
			return;
		}
		if (event === "system_welcome" && senderRole) {
			setPlayerNames((current) => ({ ...current, [senderRole]: normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)) }));
			if (payload?.avatar) setPlayerAvatars((current) => ({ ...current, [senderRole]: payload.avatar }));
			return;
		}
		if (event === "system_left" && senderRole && state) {
			const currentRole = roomRef.current.role;
			if (currentRole && senderRole !== currentRole) {
				setPlayerNames((current) => ({ ...current, [senderRole]: normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)) }));
				setState({ ...state, winner: currentRole, message: `${roleLabel(senderRole)} left the game.` });
			}
			return;
		}
		if (event === "sync" && payload.state) {
			LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
			setState(payload.state);
			setOpponentReady(true);
			setRestartStatus('idle');
			setRestartAccepts([]);
		}
		if (event === "restart_request" && senderRole) {
			setRestartStatus("requested");
		}
		if (event === "restart_accept" && senderRole) {
			setRestartAccepts((prev) => {
				const next = prev.includes(senderRole) ? prev : [...prev, senderRole];
				if (next.length === state?.playerCount && roomRef.current.role === "player1") {
					// All players accepted, player1 starts a new game
					const nextState = createDurakState(state.playerCount, state.variants, state.deck.length + Object.values(state.hands).flat().length + state.table.flatMap(b => [b.attack, b.defense]).filter(Boolean).length, state.bet);
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
	}, [showEmote, state]);

	const room = useMiniGameRoom("durak", handleEvent, playerName);
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

	// Ante: each participant pays their bet once per table (host on deal, joiners on sync).
	useEffect(() => {
		if (!state || !room.role || state.bet <= 0) return;
		if (antePaidRef.current.has(state.tableId)) return;
		antePaidRef.current.add(state.tableId);
		adjustCoins(-state.bet);
	}, [adjustCoins, room.role, state]);

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
		if (!state || !room.role || !state.variants.includes("cheat")) return;
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
		if (!state || !room.role || state.winner) return;
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
		if (!state || !room.role || room.role !== state.attacker || !allDefended) return;
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
		if (!state || !room.role || room.role !== state.defender) return;
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
		if (bet > 0 && shopState.balance < bet) { setBetError(t("durak.notEnough")); return; }
		setBetError(null);
		setCoinResult(null);
		const nextState = createDurakState(Number(playerCount), activeVariants, deckSize, bet);
		pendingStateRef.current = nextState;
		setState(null);
		setOpponentReady(false);
		setPlayerNames({ player1: playerName });
		ratingSubmittedRef.current = null;
		room.connect("player1");
	};

	const join = () => {
		if (bet > 0 && shopState.balance < bet) { setBetError(t("durak.notEnough")); return; }
		setBetError(null);
		setCoinResult(null);
		setState(null);
		setOpponentReady(false);
		setPlayerNames({ [joinSeat]: playerName });
		ratingSubmittedRef.current = null;
		room.connect(joinSeat, room.roomCode);
	};

	useEffect(() => {
		if (!state?.winner || !room.isConnected || !room.role) return;

		// Settle the pot once per finished table: winner takes the prize, others keep their loss.
		const settleKey = `${state.tableId}:${state.winner}`;
		if (state.bet > 0 && !settledRef.current.has(settleKey)) {
			settledRef.current.add(settleKey);
			if (room.role === state.winner) {
				// Winner already paid their ante, so credit the full pot back; the net
				// gain shown to the player is (players - 1) * bet.
				adjustCoins(getDurakPayout(state.bet, state.playerCount));
				setCoinResult(getDurakNetPrize(state.bet, state.playerCount));
			} else {
				setCoinResult(-state.bet);
			}
		}

		const resultKey = `${room.roomCode}:${state.winner}:${state.discardCount}:${state.message}`;
		if (ratingSubmittedRef.current === resultKey) return;

		const forfeit = state.message.toLowerCase().includes("left");
		const shouldSubmit = room.role === "player1" || (forfeit && room.role === state.winner);
		if (!shouldSubmit) return;

		ratingSubmittedRef.current = resultKey;
		const roles = getActiveDurakRoles(state.playerCount);
		const winnerName = state.winner === room.role ? playerName : playerNames[state.winner] || roleLabel(state.winner);
		const losers = roles.filter((role) => role !== state.winner);
		void Promise.all(losers.map((loserRole) => {
			const loserName = loserRole === room.role ? playerName : playerNames[loserRole] || roleLabel(loserRole);
			return submitMoreGameMatchResult({
				gameId: "durak",
				player1Name: winnerName,
				player2Name: loserName,
				result: "player1",
				roomCode: room.roomCode,
				metadata: { playerCount: state.playerCount, variants: state.variants, source: forfeit ? "forfeit" : "normal" },
			});
		})).then(() => onRatingChange());
	}, [adjustCoins, onRatingChange, playerName, playerNames, room.isConnected, room.role, room.roomCode, state]);

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
						<Text style={[styles.durakBalanceText, { color: currentTheme.textPrimary }]}>{t("durak.balance")}: {shopState.balance} 💰</Text>
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
							topLabel={t("durak.modeThrowIn")} topIcon="➡️" topActive={activeVariants.includes("throw_in")} onTopPress={() => toggleVariant("throw_in")}
							bottomLabel={t("durak.modeTransfer")} bottomIcon="🔄" bottomActive={activeVariants.includes("transfer")} onBottomPress={() => toggleVariant("transfer")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeNeighbors")} topIcon="👥" topActive={activeVariants.includes("neighbors")} onTopPress={() => toggleVariant("neighbors")}
							bottomLabel={t("durak.modeAll")} bottomIcon="🌐" bottomActive={activeVariants.includes("all")} onBottomPress={() => toggleVariant("all")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeCheat")} topIcon="🕵️" topActive={activeVariants.includes("cheat")} onTopPress={() => toggleVariant("cheat")}
							bottomLabel={t("durak.modeFair")} bottomIcon="🤝" bottomActive={activeVariants.includes("fair")} onBottomPress={() => toggleVariant("fair")}
						/>
						<DurakModeToggleColumn
							topLabel={t("durak.modeClassic")} topIcon="🃏" topActive={activeVariants.includes("classic")} onTopPress={() => toggleVariant("classic")}
							bottomLabel={t("durak.modeDraw")} bottomIcon="⚖️" bottomActive={activeVariants.includes("draw")} onBottomPress={() => toggleVariant("draw")}
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
					{state.winner ? (
						<Text style={[styles.gameStatus, { color: currentTheme.accent }]}>
							{t("durak.wins", { seat: roleLabel(state.winner) })}
						</Text>
					) : null}
					{coinResult !== null && (
						<Text style={[styles.durakCoinResult, { color: coinResult >= 0 ? "#22C55E" : "#F87171" }]}>
							{coinResult >= 0 ? t("durak.youWon", { amount: coinResult }) : t("durak.youLost", { amount: Math.abs(coinResult) })}
						</Text>
					)}
					<View style={styles.durakTable}>
						<View style={[styles.durakStatusBar, { borderColor: currentTheme.accent, backgroundColor: "rgba(0,0,0,0.4)" }]}>
							<Text style={[styles.durakStatusText, { color: currentTheme.textPrimary }]}>
								{t("durak.players")}: {state.playerCount} · {t("durak.deck")}: {state.deckSize} · {t("durak.yourBet")}: {state.bet} 💰
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
									<View key={role} style={[styles.durakAvatarContainer, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
										{/* Emoji bubble appears to the LEFT of the avatar */}
										{emote ? (
											<View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 1, borderColor: '#FACC15', alignItems: 'center', justifyContent: 'center' }}>
												<PixelIcon name={emote.emoji as any} size={18} />
											</View>
										) : (
											<View style={{ width: 34, height: 34 }} />
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
													ref.measure((x, y, w, h, px, py) => {
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

						{state.winner ? (
							<View style={[styles.controlRow, { position: 'absolute', bottom: 120, zIndex: 100 }]}>
								{restartStatus === 'idle' && (
									<>
										<StylizedButton text="Play Again" onClick={() => {
											setRestartStatus('waiting');
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
													const nextState = createDurakState(state.playerCount, state.variants, state.deck.length + Object.values(state.hands).flat().length + state.table.flatMap(b => [b.attack, b.defense]).filter(Boolean).length, state.bet);
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
			dragX.setValue(gs.dx);
			dragY.setValue(gs.dy);
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
				const targetIndex = Math.max(0, Math.min(total - 1, Math.round(index + gs.dx / step)));
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
	const casino = cosmetics.cardSkin === "casino";
	if (card === "back") {
		const isRed = trump === "D" || trump === "H";
		return (
			<View style={[styles.playingCard, small && styles.smallPlayingCard, casino && styles.casinoCard, { backgroundColor: '#1E40AF', borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }]}>
				<Text style={{ color: '#60A5FA', fontSize: small ? 14 : 24, position: 'absolute', opacity: 0.3 }}>🂠</Text>
				<Text style={{ color: isRed ? '#DC2626' : '#111827', fontSize: small ? 16 : 24, zIndex: 2, textShadowColor: 'rgba(255,255,255,0.8)', textShadowRadius: 2 }}>{SUIT_SYMBOLS[trump]}</Text>
			</View>
		);
	}
	const suit = cardSuit(card);
	const red = suit === "D" || suit === "H";
	return (
		<View style={[styles.playingCard, small && styles.smallPlayingCard, casino && styles.casinoCard, cardSuit(card) === trump && styles.trumpCard]}>
			<Text style={[styles.cardCorner, small && styles.smallCardCorner, { color: red ? "#DC2626" : "#111827" }]}>{cardRank(card)}</Text>
			<Text style={[styles.cardSuit, small && styles.smallCardSuit, { color: red ? "#DC2626" : "#111827" }]}>{SUIT_SYMBOLS[suit]}</Text>
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
		width: 252,
		height: 252,
		flexDirection: "row",
		flexWrap: "wrap",
		borderRadius: 8,
		overflow: "hidden",
	},
	ticCell: {
		width: 84,
		height: 84,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	ticText: {
		fontFamily: "SilkscreenBold",
		fontSize: 36,
	},
	sudokuTopBar: {
		width: 332,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
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
		width: 333,
		height: 333,
	},
	sudokuBoard: {
		width: 333,
		height: 333,
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
	sudokuBoardWood: {
		borderColor: "#5B2E14",
		backgroundColor: "#B77C43",
	},
	sudokuBoardNight: {
		borderColor: "#94A3B8",
		backgroundColor: "#020617",
	},
	sudokuCell: {
		width: 36.33,
		height: 36.33,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	sudokuCellWood: {
		borderColor: "#7C2D12",
		backgroundColor: "#F6D7B0",
		shadowColor: "#7C2D12",
		shadowOpacity: 0.22,
		shadowRadius: 2,
	},
	sudokuCellNight: {
		borderColor: "#475569",
		backgroundColor: "#111827",
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
		width: 333,
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 6,
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
	sudokuNumberTileWood: {
		borderColor: "#7C2D12",
		backgroundColor: "#F6D7B0",
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
	mahjongJadeBoard: {
		backgroundColor: "#0F3A3E",
		borderColor: "#2DD4BF",
	},
	mahjongIvoryBoard: {
		backgroundColor: "#78350F",
		borderColor: "#FED7AA",
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
		justifyContent: "center",
		alignItems: "flex-start",
		gap: 16,
		paddingHorizontal: 10,
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
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 2,
	},
	paperBattleGrid: {
		backgroundColor: "#DBEAFE",
		borderColor: "#1E3A8A",
	},
	navyBattleGrid: {
		backgroundColor: "#082F49",
		borderColor: "#38BDF8",
	},
	battleCell: {
		width: 21.6,
		height: 21.6,
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
		width: 336,
		height: 336,
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 4,
		borderColor: "rgba(255,255,255,0.35)",
		borderRadius: 8,
		overflow: "hidden",
	},
	chessCell: {
		width: 41,
		height: 41,
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
		height: 560,
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
		gap: 24,
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
		bottom: 10,
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
		fontSize: 28,
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
	casinoCard: {
		backgroundColor: "#F8FAFC",
		borderColor: "#FACC15",
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
});

function BetSlider({ value, onChange, maxBalance }: { value: number; onChange: (value: number) => void; maxBalance: number }) {
	const { currentTheme } = useTheme();

	const getRealValue = (sliderVal: number) => {
		const val = Math.pow(10, 2 + sliderVal);
		return Number(val.toPrecision(2));
	};

	const getSliderVal = (realVal: number) => {
		if (realVal < 100) return 0;
		return Math.log10(realVal) - 2;
	};

	const BET_STOPS = [100, 1000, 10000, 100000, 1000000, 10000000];
	const BET_LABELS = ["100", "1K", "10K", "100K", "1M", "10M"];

	const sliderMaxVal = Math.max(0.001, Math.min(5, getSliderVal(maxBalance)));
	const sliderWidth = Math.max(180, Math.round((sliderMaxVal / 5) * 280));

	return (
		<View style={styles.sliderContainer}>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10, marginBottom: -5 }}>
				<Text style={[styles.sliderLabelText, { color: currentTheme.textPrimary, fontSize: 14 }]}>
					{formatCoins(value)}
				</Text>
			</View>
			<View style={{ width: '100%' }}>
				<Slider
					style={{ width: sliderWidth, height: 40 }}
					minimumValue={0}
					maximumValue={sliderMaxVal}
					step={0.01}
					value={Math.min(sliderMaxVal, getSliderVal(value))}
					onValueChange={(val) => {
						let next = getRealValue(val);
						if (next > maxBalance) next = maxBalance;
						if (next < 100) next = 100;
						if (next !== value) onChange(next);
					}}
					minimumTrackTintColor="#38BDF8"
					maximumTrackTintColor="rgba(255,255,255,0.2)"
					thumbTintColor="#FFFFFF"
				/>
			</View>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10 }}>
				{BET_LABELS.map((label, index) => (
					<Text key={label} style={[styles.sliderLabelText, { color: currentTheme.textSecondary, opacity: maxBalance >= BET_STOPS[index] ? 1 : 0.4 }]}>
						{label}
					</Text>
				))}
			</View>
		</View>
	);
}
