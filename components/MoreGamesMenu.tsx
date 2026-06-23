import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chess } from "chess.js";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
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
} from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useShopState } from "@/constants/Shop";
import { useAppState } from "@/hooks/useAppState";
import { useEscapeKey } from "@/hooks/useEscapeKey";

type MoreGameId = "shop" | "battleship" | "durak" | "chess" | "sudoku" | "tictactoe" | "mahjong";
type OnlineRole = "player1" | "player2" | "player3" | "player4" | "player5" | "player6";
type DuelRole = "player1" | "player2";
type RoomStatus = "offline" | "connecting" | "connected" | "error";
type TicMark = "X" | "O";
type ShipOrientation = "h" | "v";
type DurakVariant = "throw_in" | "transfer" | "cheat";
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
	variant: DurakVariant;
	phase: "attack" | "defend" | "throw";
	discardCount: number;
	winner: OnlineRole | null;
	message: string;
	bet: number;
	deckSize: number;
	tableId: string;
}

const DURAK_BET_PRESETS = [100, 1000, 10000, 100000, 1000000, 10000000];
const DURAK_DECK_SIZES = [24, 36, 52] as const;
const DURAK_EMOJIS = ["😀", "😂", "😎", "😉", "😅", "🤔", "😴", "😡", "😭", "🤯", "👍", "👎", "👋", "🤝", "🔥", "💰", "🃏", "❤️", "💀", "🎉"];

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

function useMiniGameRoom(gameId: MoreGameId, onEvent: (event: string, payload: any, senderRole?: OnlineRole) => void, playerName: string = DEFAULT_MORE_GAME_PLAYER_NAME) {
	const [roomCode, setRoomCode] = useState("");
	const [role, setRole] = useState<OnlineRole | null>(null);
	const [status, setStatus] = useState<RoomStatus>("offline");
	const channelRef = useRef<any>(null);
	const roleRef = useRef<OnlineRole | null>(null);
	const onEventRef = useRef(onEvent);
	const playerNameRef = useRef(playerName);
	const clientIdRef = useRef(createRoomCode());

	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	useEffect(() => {
		playerNameRef.current = playerName;
	}, [playerName]);

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
						payload: { role: nextRole, playerName: playerNameRef.current },
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
	joinText,
}: {
	roomCode: string;
	setRoomCode: (value: string) => void;
	role: OnlineRole | null;
	status: RoomStatus;
	onHost: () => void;
	onJoin: () => void;
	onDisconnect: () => void;
	joinText?: string;
}) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<View style={styles.roomPanel}>
			<View style={styles.roomRow}>
				<StylizedButton text={t("common.host")} onClick={onHost} backgroundColor={currentTheme.buttonPrimary} style={styles.roomButton} textStyle={styles.smallButtonText} />
				<TextInput
					value={roomCode}
					onChangeText={(value) => setRoomCode(value.toUpperCase())}
					placeholder={t("moregames.codePlaceholder")}
					placeholderTextColor={currentTheme.textSecondary}
					autoCapitalize="characters"
					maxLength={5}
					style={[styles.roomInput, { color: currentTheme.textPrimary, borderColor: currentTheme.gridBorder }]}
				/>
				<StylizedButton text={joinText ?? t("common.join")} onClick={onJoin} backgroundColor={currentTheme.buttonSecondary} style={styles.roomButton} textStyle={styles.smallButtonText} />
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

export default function MoreGamesMenu() {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [, , , popAppState] = useAppState();
	const { width } = useWindowDimensions();
	const isMobile = width < 600;
	const [activeGame, setActiveGame] = useState<MoreGameId | null>(null);
	const [cosmetics, setCosmetics] = useState<ExtraGameCosmetics>(DEFAULT_EXTRA_COSMETICS);
	const [playerName, setPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [draftPlayerName, setDraftPlayerName] = useState(DEFAULT_MORE_GAME_PLAYER_NAME);
	const [ratingGame, setRatingGame] = useState<RatedMoreGameId>("durak");
	const [leaderboard, setLeaderboard] = useState<MoreGameRating[]>([]);
	const [myRating, setMyRating] = useState<MoreGameRating | null>(null);
	const [ratingsLoading, setRatingsLoading] = useState(false);
	const [ratingPanel, setRatingPanel] = useState<"list" | "leaderboard">("list");

	useEffect(() => {
		AsyncStorage.getItem(EXTRA_COSMETICS_KEY).then((raw) => {
			if (!raw) return;
			try {
				setCosmetics({ ...DEFAULT_EXTRA_COSMETICS, ...JSON.parse(raw) });
			} catch {}
		});
	}, []);

	useEffect(() => {
		AsyncStorage.getItem(PLAYER_NAME_KEY).then((rawName) => {
			const nextName = normalizeStoredPlayerName(rawName);
			setPlayerName(nextName);
			setDraftPlayerName(nextName);
		});
	}, []);

	const updateCosmetics = useCallback((next: ExtraGameCosmetics) => {
		setCosmetics(next);
		void AsyncStorage.setItem(EXTRA_COSMETICS_KEY, JSON.stringify(next));
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
					{activeGame === "shop" && <ExtraGameShop cosmetics={cosmetics} onChange={updateCosmetics} />}
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
		<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ratingTabs}>
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
		</ScrollView>
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
							<Text style={[styles.leaderboardName, { flex: 1.75, color: currentTheme.textPrimary }]} numberOfLines={1}>
								{entry.player_name}{isMe ? ` (${t("moregames.you")})` : ""}
							</Text>
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

function ExtraGameShop({ cosmetics, onChange }: { cosmetics: ExtraGameCosmetics; onChange: (value: ExtraGameCosmetics) => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	const setCosmetic = <K extends keyof ExtraGameCosmetics>(key: K, value: ExtraGameCosmetics[K]) => {
		onChange({ ...cosmetics, [key]: value });
	};

	return (
		<ScrollView style={styles.moreList} contentContainerStyle={styles.shopContent}>
			<Text style={[styles.gameStatus, { color: currentTheme.textPrimary }]}>{t("moregames.styleShop")}</Text>
			<Text style={[styles.shopHint, { color: currentTheme.textSecondary }]}>{t("moregames.shopHint")}</Text>
			<CosmeticSection title={t("moregames.shop.chessPieces")} accent="#C4B5FD">
				<SegmentButton value="classic" selected={cosmetics.chessPieces} label={t("moregames.cos.classic")} onPress={(value) => setCosmetic("chessPieces", value)} accent="#C4B5FD" />
				<SegmentButton value="royal" selected={cosmetics.chessPieces} label={t("moregames.cos.royal")} onPress={(value) => setCosmetic("chessPieces", value)} accent="#C4B5FD" />
				<SegmentButton value="club" selected={cosmetics.chessPieces} label={t("moregames.cos.club")} onPress={(value) => setCosmetic("chessPieces", value)} accent="#C4B5FD" />
			</CosmeticSection>
			<CosmeticSection title={t("moregames.shop.chessBoard")} accent="#8B5CF6">
				<SegmentButton value="slate" selected={cosmetics.chessBoard} label={t("moregames.cos.slate")} onPress={(value) => setCosmetic("chessBoard", value)} accent="#8B5CF6" />
				<SegmentButton value="violet" selected={cosmetics.chessBoard} label={t("moregames.cos.violet")} onPress={(value) => setCosmetic("chessBoard", value)} accent="#8B5CF6" />
				<SegmentButton value="walnut" selected={cosmetics.chessBoard} label={t("moregames.cos.walnut")} onPress={(value) => setCosmetic("chessBoard", value)} accent="#8B5CF6" />
			</CosmeticSection>
			<CosmeticSection title={t("moregames.shop.tableSkins")} accent="#38BDF8">
				<SegmentButton value="paper" selected={cosmetics.seaSkin} label={t("moregames.cos.paperSea")} onPress={(value) => setCosmetic("seaSkin", value)} accent="#38BDF8" />
				<SegmentButton value="navy" selected={cosmetics.seaSkin} label={t("moregames.cos.navySea")} onPress={(value) => setCosmetic("seaSkin", value)} accent="#38BDF8" />
				<SegmentButton value="classic" selected={cosmetics.cardSkin} label={t("moregames.cos.classicCards")} onPress={(value) => setCosmetic("cardSkin", value)} accent="#F97316" />
				<SegmentButton value="casino" selected={cosmetics.cardSkin} label={t("moregames.cos.casinoCards")} onPress={(value) => setCosmetic("cardSkin", value)} accent="#F97316" />
			</CosmeticSection>
			<CosmeticSection title={t("moregames.shop.soloSkins")} accent="#2DD4BF">
				<SegmentButton value="wood" selected={cosmetics.sudokuTheme} label={t("moregames.cos.woodSudoku")} onPress={(value) => setCosmetic("sudokuTheme", value)} accent="#A3E635" />
				<SegmentButton value="night" selected={cosmetics.sudokuTheme} label={t("moregames.cos.nightSudoku")} onPress={(value) => setCosmetic("sudokuTheme", value)} accent="#A3E635" />
				<SegmentButton value="jade" selected={cosmetics.mahjongTheme} label={t("moregames.cos.jadeMahjong")} onPress={(value) => setCosmetic("mahjongTheme", value)} accent="#2DD4BF" />
				<SegmentButton value="ivory" selected={cosmetics.mahjongTheme} label={t("moregames.cos.ivoryMahjong")} onPress={(value) => setCosmetic("mahjongTheme", value)} accent="#2DD4BF" />
			</CosmeticSection>
		</ScrollView>
	);
}

function CosmeticSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
	return (
		<View style={[styles.cosmeticSection, { borderColor: accent }]}>
			<Text style={[styles.cosmeticTitle, { color: accent }]}>{title}</Text>
			<View style={styles.segmentRow}>{children}</View>
		</View>
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

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={() => { reset(); setOpponentReady(false); room.connect("player1"); }}
				onJoin={() => { reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
				onDisconnect={room.disconnect}
			/>
			<Text style={[styles.gameStatus, { color: winner || remoteResult ? currentTheme.accent : currentTheme.textPrimary }]}>{status}</Text>
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
									left: 20 + tile.x * 42 + tile.z * 6,
									top: 8 + tile.y * 46 - tile.z * 8,
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
		{ id: "b4", name: "Carrier", length: 4, x: 0, y: 0, orientation: "h" },
		{ id: "b3a", name: "Cruiser A", length: 3, x: 0, y: 2, orientation: "h" },
		{ id: "b3b", name: "Cruiser B", length: 3, x: 6, y: 0, orientation: "v" },
		{ id: "b2a", name: "Destroyer A", length: 2, x: 0, y: 4, orientation: "h" },
		{ id: "b2b", name: "Destroyer B", length: 2, x: 3, y: 4, orientation: "h" },
		{ id: "b2c", name: "Destroyer C", length: 2, x: 6, y: 5, orientation: "v" },
		{ id: "b1a", name: "Boat A", length: 1, x: 0, y: 7, orientation: "h" },
		{ id: "b1b", name: "Boat B", length: 1, x: 2, y: 7, orientation: "h" },
		{ id: "b1c", name: "Boat C", length: 1, x: 4, y: 7, orientation: "h" },
		{ id: "b1d", name: "Boat D", length: 1, x: 8, y: 8, orientation: "h" },
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

	const occupiedByOthers = new Set(fleet.filter((ship) => ship.id !== candidate.id).flatMap(getShipCells));
	return cells.every((cell) => !occupiedByOthers.has(cell));
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
	const ratingSubmittedRef = useRef<string | null>(null);
	const fleetRef = useRef(fleet);
	const incomingRef = useRef(incomingShots);

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
			if (!lost) setTurn(currentRole);
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
			}
		}
	}, [ready]);

	const room = useMiniGameRoom("battleship", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

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
		ratingSubmittedRef.current = null;
	};

	const placeSelectedShip = (cell: string) => {
		if (ready) return;
		const [x, y] = cell.split(",").map(Number);
		setFleet((current) => {
			const selected = current.find((ship) => ship.id === selectedShipId);
			if (!selected) return current;
			const nextShip = { ...selected, x, y };
			if (!isShipPlacementValid(nextShip, current)) return current;
			return current.map((ship) => ship.id === selectedShipId ? nextShip : ship);
		});
	};

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
				{winner ? t("moregames.wins", { name: roleLabel(winner) }) : ready && opponentReady ? t("moregames.turn", { name: turn ? roleLabel(turn) : t("moregames.wait") }) : t("moregames.placeShips")}
			</Text>
			<View style={styles.battleToolbar}>
				<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fleetScroll} contentContainerStyle={styles.fleetList}>
					{fleet.map((ship) => (
						<Pressable
							key={ship.id}
							onPress={() => setSelectedShipId(ship.id)}
							style={[styles.fleetChip, { borderColor: ship.id === selectedShipId ? "#FACC15" : currentTheme.gridBorder }]}
						>
							<Text style={[styles.fleetChipText, { color: currentTheme.textPrimary }]}>{ship.length}x</Text>
						</Pressable>
					))}
				</ScrollView>
				<StylizedButton text={t("moregames.rotate")} onClick={rotateSelectedShip} backgroundColor={cssColors.spaceGray} style={styles.miniActionButton} textStyle={styles.tinyButtonText} disabled={ready} />
				<StylizedButton text={t("moregames.ready")} onClick={markReady} backgroundColor={ready ? "#16A34A" : currentTheme.buttonPrimary} style={styles.miniActionButton} textStyle={styles.tinyButtonText} disabled={ready} />
			</View>
			<View style={styles.battleBoards}>
				<BattleGrid title={t("moregames.target")} cells={targetShots} onPress={fire} cosmetics={cosmetics} />
				<BattleGrid title={t("moregames.myFleet")} cells={incomingShots} ships={fleet} selectedShipId={selectedShipId} onPress={placeSelectedShip} cosmetics={cosmetics} />
			</View>
		</View>
	);
}

function BattleGrid({
	title,
	cells,
	ships,
	selectedShipId,
	onPress,
	cosmetics,
}: {
	title: string;
	cells: Record<string, string>;
	ships?: BattleShip[];
	selectedShipId?: string;
	onPress?: (cell: string) => void;
	cosmetics: ExtraGameCosmetics;
}) {
	const { currentTheme } = useTheme();
	const shipByCell = new Map<string, BattleShip>();
	ships?.forEach((ship) => getShipCells(ship).forEach((cell) => shipByCell.set(cell, ship)));
	const paper = cosmetics.seaSkin === "paper";

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
					const backgroundColor = status === "hit"
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
							<Text style={[styles.battleCellText, { color: paper ? "#1E3A8A" : "#FFFFFF" }]}>{status === "hit" ? "X" : status === "miss" ? "." : ship ? "■" : ""}</Text>
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
	const roundedCaps = orientation === "h"
		? {
			borderTopLeftRadius: isStart ? 8 : 2,
			borderBottomLeftRadius: isStart ? 8 : 2,
			borderTopRightRadius: isEnd ? 8 : 2,
			borderBottomRightRadius: isEnd ? 8 : 2,
		}
		: {
			borderTopLeftRadius: isStart ? 8 : 2,
			borderTopRightRadius: isStart ? 8 : 2,
			borderBottomLeftRadius: isEnd ? 8 : 2,
			borderBottomRightRadius: isEnd ? 8 : 2,
		};

	return (
		<View
			pointerEvents="none"
			style={[
				styles.shipSegment,
				orientation === "h" ? styles.shipSegmentHorizontal : styles.shipSegmentVertical,
				paper && styles.shipSegmentPaper,
				selected && styles.shipSegmentSelected,
				roundedCaps,
			]}
		>
			<View style={styles.shipPorthole} />
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
	const [selected, setSelected] = useState<string | null>(null);
	const [opponentReady, setOpponentReady] = useState(false);
	const [opponentName, setOpponentName] = useState("Opponent");
	const [remoteResult, setRemoteResult] = useState<string | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			roomRef.current?.send("sync", { fen });
			return;
		}
		if (event === "system_left" && senderRole && roomRef.current.role) {
			setOpponentName(normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)));
			setRemoteResult(t("moregames.leftYouWin", { name: roleLabel(senderRole) }));
			return;
		}
		if (event === "sync" && payload.fen) {
			setFen(payload.fen);
			setOpponentReady(true);
			setSelected(null);
			setRemoteResult(null);
			return;
		}
		if (event === "move" && payload.fen) {
			setFen(payload.fen);
			setSelected(null);
			setRemoteResult(null);
		}
	}, [fen, t]);

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
		if (isDuelRole(room.role) && (room.role !== turnRole || !opponentReady || remoteResult)) return;
		if (!room.role && game.isGameOver()) return;
		const piece = game.get(square as any);
		const myColor = room.role === "player2" ? "b" : "w";

		if (!selected) {
			if (!room.role || piece?.color === myColor) setSelected(square);
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
		setSelected(null);
		setRemoteResult(null);
		ratingSubmittedRef.current = null;
		room.send("sync", { fen: nextFen });
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

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={() => { reset(); setOpponentReady(false); room.connect("player1"); }}
				onJoin={() => { reset(); setOpponentReady(false); room.connect("player2", room.roomCode); }}
				onDisconnect={room.disconnect}
			/>
			<Text style={[styles.gameStatus, { color: game.isCheckmate() || remoteResult ? currentTheme.accent : currentTheme.textPrimary }]}>{room.role && !opponentReady ? t("moregames.waitingOpponent") : status}</Text>
			<View style={styles.chessBoard}>
				{displayRanks.map((rank) => displayFiles.map((file) => {
					const square = `${file}${rank}`;
					const piece = game.get(square as any);
					const dark = (CHESS_FILES.indexOf(file) + Number(rank)) % 2 === 0;
					const label = piece ? UNICODE_PIECES[`${piece.color}${piece.type}`] : "";
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
							<Text
								style={[
									styles.chessPiece,
									cosmetics.chessPieces === "club" && styles.chessPieceClub,
									{ color: piece?.color === "b" ? "#111827" : "#FFFFFF" },
								]}
							>
								{label}
							</Text>
						</Pressable>
					);
				}))}
			</View>
			<StylizedButton text={t("moregames.resetBoard")} onClick={reset} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} />
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

function createDurakState(playerCount: number, variant: DurakVariant, deckSize: number = 36, bet: number = 0): DurakState {
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
		variant,
		phase: "attack",
		discardCount: 0,
		winner: null,
		message: "Attack with any card.",
		bet,
		deckSize,
		tableId: createRoomCode(),
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

export function canBeatDurakCard(defense: string, attack: string, trump: string, variant: DurakVariant = "throw_in") {
	if (variant === "cheat" && cardSuit(defense) === cardSuit(attack) && cardRankValue(defense) >= cardRankValue(attack)) return true;
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

function canThrowDurakCard(state: DurakState, card: string) {
	if (state.table.length === 0) return true;
	const ranks = new Set(getTableCards(state.table).map(cardRank));
	return ranks.has(cardRank(card));
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
	const [allowTransfer, setAllowTransfer] = useState(true);
	const [allowCheat, setAllowCheat] = useState(false);
	const [joinSeat, setJoinSeat] = useState<OnlineRole>("player2");
	const [, setOpponentReady] = useState(false);
	const [playerNames, setPlayerNames] = useState<Partial<Record<OnlineRole, string>>>({});
	const [emotes, setEmotes] = useState<Partial<Record<OnlineRole, { emoji: string; id: number }>>>({});
	const [showEmojis, setShowEmojis] = useState(false);
	const [coinResult, setCoinResult] = useState<number | null>(null);
	const [betError, setBetError] = useState<string | null>(null);
	const ratingSubmittedRef = useRef<string | null>(null);
	const antePaidRef = useRef<Set<string>>(new Set());
	const settledRef = useRef<Set<string>>(new Set());
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
		setState(nextState);
		roomRef.current?.send("sync", { state: nextState });
	};

	const handleEvent = useCallback((event: string, payload: any, senderRole?: OnlineRole) => {
		if (event === "emoji" && senderRole) {
			showEmote(senderRole, payload?.emoji);
			return;
		}
		if (event === "system_joined" && senderRole) {
			setOpponentReady(true);
			setPlayerNames((current) => ({ ...current, [senderRole]: normalizeStoredPlayerName(payload?.playerName || roleLabel(senderRole)) }));
			if (roomRef.current.role === "player1" && state) roomRef.current.send("sync", { state });
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
			setState(payload.state);
			setOpponentReady(true);
		}
	}, [showEmote, state]);

	const room = useMiniGameRoom("durak", handleEvent, playerName);
	const roomRef = useRef({ role: room.role, send: room.send });
	useEffect(() => {
		roomRef.current = { role: room.role, send: room.send };
	}, [room.role, room.send]);

	// Ante: each participant pays their bet once per table (host on deal, joiners on sync).
	useEffect(() => {
		if (!state || !room.role || state.bet <= 0) return;
		if (antePaidRef.current.has(state.tableId)) return;
		antePaidRef.current.add(state.tableId);
		adjustCoins(-state.bet);
	}, [adjustCoins, room.role, state]);

	const sendEmoji = (emoji: string) => {
		setShowEmojis(false);
		if (!room.role) return;
		showEmote(room.role, emoji);
		room.send("emoji", { emoji });
	};

	const myHand = room.role && state ? state.hands[room.role] : [];
	const allDefended = Boolean(state?.table.length) && state!.table.every((bout) => Boolean(bout.defense));
	const activeRoles = state ? getActiveDurakRoles(state.playerCount) : getActiveDurakRoles(Number(playerCount));
	const variant: DurakVariant = allowCheat ? "cheat" : allowTransfer ? "transfer" : "throw_in";

	const playCard = (card: string) => {
		if (!state || !room.role || state.winner) return;
		if (room.role === state.attacker && (state.phase === "attack" || state.phase === "throw")) {
			if (!canThrowDurakCard(state, card) || state.table.length >= Math.min(6, state.hands[state.defender].length + state.table.filter((bout) => bout.defense).length)) return;
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
			const openIndex = state.table.findIndex((bout) => !bout.defense);
			const openBout = state.table[openIndex];
			if (!openBout) return;

			if ((state.variant === "transfer" || state.variant === "cheat") && state.table.every((bout) => !bout.defense) && cardRank(card) === cardRank(openBout.attack)) {
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

			if (!canBeatDurakCard(card, openBout.attack, state.trump, state.variant)) return;
			const nextTable = state.table.map((bout, index) => index === openIndex ? { ...bout, defense: card } : bout);
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
		const nextState = createDurakState(Number(playerCount), variant, deckSize, bet);
		setState(nextState);
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
				metadata: { playerCount: state.playerCount, variant: state.variant, source: forfeit ? "forfeit" : "normal" },
			});
		})).then(() => onRatingChange());
	}, [adjustCoins, onRatingChange, playerName, playerNames, room.isConnected, room.role, room.roomCode, state]);

	const pot = bet * Number(playerCount);
	const prize = getDurakNetPrize(bet, Number(playerCount));

	return (
		<View style={styles.onlineGame}>
			<OnlineRoomControls
				roomCode={room.roomCode}
				setRoomCode={room.setRoomCode}
				role={room.role}
				status={room.status}
				onHost={host}
				onJoin={join}
				onDisconnect={room.disconnect}
				joinText={`${t("common.join")} ${roleLabel(joinSeat)}`}
			/>
			{!state ? (
				<ScrollView style={styles.moreList} contentContainerStyle={styles.durakPrep}>
					<View style={[styles.durakBalanceRow, { borderColor: currentTheme.accent }]}>
						<Text style={[styles.durakBalanceText, { color: currentTheme.textPrimary }]}>{t("durak.balance")}: {shopState.balance} 💰</Text>
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.yourBet")}</Text>
					<View style={styles.segmentRow}>
						{DURAK_BET_PRESETS.map((preset) => {
							const affordable = preset <= shopState.balance;
							const active = bet === preset;
							return (
								<Pressable
									key={preset}
									disabled={!affordable}
									onPress={() => { setBet(preset); setBetError(null); }}
									style={[styles.durakBetButton, { borderColor: active ? "#FACC15" : currentTheme.gridBorder, backgroundColor: active ? "#FACC15" : "rgba(255,255,255,0.06)" }, !affordable && styles.disabledControl]}
								>
									<Text style={[styles.durakBetButtonText, { color: active ? "#111827" : currentTheme.textPrimary }]}>{formatCoins(preset)}</Text>
								</Pressable>
							);
						})}
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.players")}</Text>
					<View style={styles.segmentRow}>
						{(["2", "3", "4", "5", "6"] as const).map((count) => (
							<SegmentButton key={count} value={count} selected={playerCount} label={`${count}P`} onPress={setPlayerCount} accent="#FACC15" />
						))}
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.deck")}</Text>
					<View style={styles.segmentRow}>
						{DURAK_DECK_SIZES.map((size) => (
							<SegmentButton key={size} value={String(size)} selected={String(deckSize)} label={String(size)} onPress={(value) => setDeckSize(Number(value))} accent="#38BDF8" />
						))}
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.modes")}</Text>
					<View style={styles.segmentRow}>
						<RuleToggle label={t("durak.modeThrowIn")} active={!allowTransfer && !allowCheat} onPress={() => { setAllowTransfer(false); setAllowCheat(false); }} accent="#F97316" />
						<RuleToggle label={t("durak.modeTransfer")} active={allowTransfer || allowCheat} onPress={() => setAllowTransfer((value) => !value)} accent="#38BDF8" />
						<RuleToggle label={t("durak.modeCheat")} active={allowCheat} onPress={() => { setAllowCheat((value) => !value); setAllowTransfer(true); }} accent="#FACC15" />
					</View>

					<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.players")} ({t("common.join")})</Text>
					<View style={styles.segmentRow}>
						{getActiveDurakRoles(Number(playerCount)).slice(1).map((seat) => (
							<SegmentButton key={seat} value={seat} selected={joinSeat} label={roleLabel(seat)} onPress={setJoinSeat} accent="#38BDF8" />
						))}
					</View>

					<Text style={[styles.durakPotText, { color: currentTheme.accent }]}>
						{t("durak.bank", { bet: formatCoins(bet), pot: formatCoins(pot), prize: formatCoins(prize) })}
					</Text>
					{betError && <Text style={styles.durakBetError}>{betError}</Text>}
					<Text style={[styles.gameStatus, { color: currentTheme.textSecondary }]}>{t("durak.hostDeals")}</Text>
				</ScrollView>
			) : (
				<>
					<Text style={[styles.gameStatus, { color: state.winner ? currentTheme.accent : currentTheme.textPrimary }]}>
						{state.winner ? t("durak.wins", { seat: roleLabel(state.winner) }) : `${t("durak.trump")} ${SUIT_SYMBOLS[state.trump]} | ${roleLabel(state.attacker)} → ${roleLabel(state.defender)}`}
					</Text>
					{coinResult !== null && (
						<Text style={[styles.durakCoinResult, { color: coinResult >= 0 ? "#22C55E" : "#F87171" }]}>
							{coinResult >= 0 ? t("durak.youWon", { amount: coinResult }) : t("durak.youLost", { amount: Math.abs(coinResult) })}
						</Text>
					)}
					<View style={styles.durakTable}>
						<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>
							{t("durak.deckLabel", { deck: state.deck.length, discard: state.discardCount })}
						</Text>
						<Text style={[styles.gridLabel, { color: currentTheme.textSecondary }]}>{state.message}</Text>
						<View style={styles.durakPlayersRow}>
							{activeRoles.map((role) => (
								<View key={role} style={[styles.durakPlayerPill, role === room.role && { borderColor: currentTheme.accent }, role === state.defender && { backgroundColor: "rgba(56,189,248,0.18)" }, role === state.attacker && { backgroundColor: "rgba(249,115,22,0.18)" }]}>
									{emotes[role] ? <Text style={styles.durakEmote}>{emotes[role]!.emoji}</Text> : null}
									<Text style={[styles.durakPlayerText, { color: currentTheme.textPrimary }]}>{roleLabel(role)} {state.hands[role].length}</Text>
								</View>
							))}
						</View>
						<View style={styles.durakCenter}>
							{state.table.length === 0 ? (
								<Text style={[styles.cardText, { color: currentTheme.textSecondary }]}>{state.message}</Text>
							) : (
								state.table.map((bout, index) => (
									<View key={`${bout.attack}-${index}`} style={styles.durakBout}>
										<DurakCardView card={bout.attack} trump={state.trump} cosmetics={cosmetics} small />
										{bout.defense ? <DurakCardView card={bout.defense} trump={state.trump} cosmetics={cosmetics} small /> : <View style={styles.emptyDefenseSlot}><Text style={styles.emptyDefenseText}>?</Text></View>}
									</View>
								))
							)}
						</View>
						<View style={styles.cardHand}>
							{myHand.map((card, index) => (
								<Pressable key={`${card}-${index}`} onPress={() => playCard(card)}>
									<DurakCardView card={card} trump={state.trump} cosmetics={cosmetics} />
								</Pressable>
							))}
						</View>
						<View style={styles.controlRow}>
							<StylizedButton text={t("durak.pass")} onClick={passRound} backgroundColor={currentTheme.buttonPrimary} style={styles.resetButton} textStyle={styles.smallButtonText} disabled={!allDefended || room.role !== state.attacker} />
							<StylizedButton text={t("durak.take")} onClick={takeRound} backgroundColor={cssColors.spaceGray} style={styles.resetButton} textStyle={styles.smallButtonText} disabled={room.role !== state.defender} />
							<Pressable onPress={() => setShowEmojis((value) => !value)} style={[styles.durakEmojiButton, { borderColor: currentTheme.accent }]}>
								<Text style={styles.durakEmojiButtonText}>🙂</Text>
							</Pressable>
						</View>
						{showEmojis && (
							<View style={styles.durakEmojiPicker}>
								{DURAK_EMOJIS.map((emoji) => (
									<Pressable key={emoji} onPress={() => sendEmoji(emoji)} style={styles.durakEmojiOption}>
										<Text style={styles.durakEmojiOptionText}>{emoji}</Text>
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

function DurakCardView({ card, trump, cosmetics, small = false }: { card: string; trump: string; cosmetics: ExtraGameCosmetics; small?: boolean }) {
	const suit = cardSuit(card);
	const red = suit === "D" || suit === "H";
	const casino = cosmetics.cardSkin === "casino";
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
		width: 322,
		height: 304,
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
		width: 48,
		height: 58,
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
		fontSize: 24,
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
	durakEmojiPicker: {
		width: "96%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 7,
		padding: 8,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.22)",
		borderRadius: 8,
		backgroundColor: "rgba(0,0,0,0.22)",
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
	battleToolbar: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	fleetScroll: {
		flexGrow: 1,
		flexShrink: 1,
		maxWidth: 300,
	},
	fleetList: {
		gap: 5,
		paddingHorizontal: 4,
		alignItems: "center",
	},
	fleetChip: {
		minWidth: 38,
		height: 30,
		borderWidth: 2,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	fleetChipText: {
		fontFamily: "SilkscreenBold",
		fontSize: 9,
	},
	miniActionButton: {
		minWidth: 70,
		height: 30,
		minHeight: 30,
		margin: 0,
		paddingHorizontal: 4,
	},
	battleBoards: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 12,
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
		alignItems: "center",
		gap: 8,
		borderWidth: 2,
		borderColor: "rgba(250,204,21,0.45)",
		borderRadius: 14,
		padding: 10,
		backgroundColor: "#0F3B2E",
		shadowColor: "#000",
		shadowOpacity: 0.35,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
	},
	durakPlayersRow: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 5,
	},
	durakPlayerPill: {
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.24)",
		borderRadius: 6,
		paddingHorizontal: 7,
		paddingVertical: 4,
		backgroundColor: "rgba(255,255,255,0.06)",
	},
	durakPlayerText: {
		fontFamily: "Silkscreen",
		fontSize: 9,
	},
	durakCenter: {
		width: "96%",
		minHeight: 104,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "rgba(250,204,21,0.28)",
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#14533F",
		padding: 8,
	},
	durakBout: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
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
});
