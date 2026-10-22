import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/constants/Supabase";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { View, Text, Clipboard, TextInput, useWindowDimensions, Pressable } from "react-native";
import PixelLoader from "@/components/PixelLoader";
import StylizedButton from "../StylizedButton";
import { cssColors } from "@/constants/Color";
import { type UiGlyphName } from "@/constants/UiGlyphs";
import UiIcon from "@/components/UiIcon";
import { DuelRole, MoreGameCard, MoreGameId, OnlineRole, RatedMoreGameId, RoomStatus } from "./types";
import { styles } from "./styles";

export const DURAK_BET_PRESETS = [100, 1000, 10000, 100000, 1000000, 10000000];
export const DURAK_DECK_SIZES = [24, 36, 52] as const;
export const DURAK_EMOJIS = ["face-happy", "face-sad", "skull", "heart", "coin", "medal", "crown", "gear", "fire", "star", "bomb", "shield", "sword", "diamond", "ghost", "alien"];

// Everyone antes once. The winner receives the full pot, so their net gain is
// (players - 1) * bet: 1v1 @100 -> +100, 6 players @100 -> +500.
export function getDurakPayout(bet: number, playerCount: number): number {
	return Math.max(0, bet * playerCount);
}

export function getDurakNetPrize(bet: number, playerCount: number): number {
	return Math.max(0, getDurakPayout(bet, playerCount) - bet);
}

export function formatCoins(amount: number): string {
	if (amount >= 1000000) return `${amount % 1000000 === 0 ? amount / 1000000 : (amount / 1000000).toFixed(1)}M`;
	if (amount >= 1000) return `${amount % 1000 === 0 ? amount / 1000 : (amount / 1000).toFixed(1)}K`;
	return `${amount}`;
}

export const ONLINE_ROLES: OnlineRole[] = ["player1", "player2", "player3", "player4", "player5", "player6"];
export const EXTRA_COSMETICS_KEY = "EXTRA_GAME_COSMETICS_V1";
export const PLAYER_NAME_KEY = "PLAYER_NAME";
export const DEFAULT_MORE_GAME_PLAYER_NAME = "Player";

export const MORE_GAME_CARDS: MoreGameCard[] = [
	{
		id: "shop",
		title: "Extra Game Shop",
		color: "#FACC15",
		description: "Switch chess pieces, boards, cards, ships, sudoku and mahjong skins.",
		tags: ["skins", "boards", "style"],
	},
	{
		id: "battleship",
		title: "Sea Battle",
		color: "#38BDF8",
		description: "10x10 duel with movable multi-cell ships, ready checks, hits and sunk fleet wins.",
		tags: ["online", "bot", "10x10"],
	},
	{
		id: "durak",
		title: "Durak",
		color: "#F97316",
		description: "Realtime Durak with card faces, throw-in, transfer, cheat mode and 2-6 seats.",
		tags: ["online", "bot", "cards"],
	},
	{
		id: "chess",
		title: "Chess",
		color: "#E5E7EB",
		description: "Legal moves, board rotation, checkmate/draw states and skinable boards.",
		tags: ["online", "bot", "rules"],
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
		title: "Tic-Tac-Toe",
		color: "#F472B6",
		description: "Quick local or realtime room-code duel with win and draw sync.",
		tags: ["online", "bot", "quick"],
	},
	{
		id: "mahjong",
		title: "Mahjong Match",
		color: "#2DD4BF",
		description: "Layered tile matching with free-tile rules, hints, undo and shuffle.",
		tags: ["solo", "tiles", "layers"],
	},
];

export const RATED_MORE_GAME_IDS: RatedMoreGameId[] = ["battleship", "durak", "chess", "tictactoe", "sudoku", "mahjong"];
export const RATED_MORE_GAME_CARDS = MORE_GAME_CARDS.filter((card): card is MoreGameCard & { id: RatedMoreGameId } => card.id !== "shop");
export const ELO_TIERS = [
	{ tier: "Bronze", color: "#CD7F32", icon: "medalBronze" as const, min: 0, max: 800 },
	{ tier: "Silver", color: "#C0C0C0", icon: "medalSilver" as const, min: 800, max: 1000 },
	{ tier: "Gold", color: "#FFD700", icon: "medalGold" as const, min: 1000, max: 1200 },
	{ tier: "Diamond", color: "#00BFFF", icon: "diamond" as const, min: 1200, max: 1400 },
	{ tier: "Master", color: "#DA70D6", icon: "star" as const, min: 1400, max: 1600 },
	{ tier: "Legend", color: "#FF4500", icon: "crown" as const, min: 1600, max: 2000 },
];

export function getMoreGameEloBadge(elo: number) {
	return ELO_TIERS.find((tier) => elo < tier.max) || ELO_TIERS[ELO_TIERS.length - 1];
}

export function normalizeStoredPlayerName(value: string | null | undefined) {
	const name = (value || "").trim().slice(0, 24);
	return name || DEFAULT_MORE_GAME_PLAYER_NAME;
}

export function createRoomCode() {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 5; i += 1) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

export function getReadableButtonTextColor(backgroundColor: string) {
	const hex = backgroundColor.replace("#", "");
	if (hex.length !== 6) return "white";
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.72 ? "#111111" : "white";
}

export function roleLabel(role: OnlineRole | null) {
	if (!role) return "No seat";
	return `P${ONLINE_ROLES.indexOf(role) + 1}`;
}

export function isDuelRole(role: OnlineRole | null | undefined): role is DuelRole {
	return role === "player1" || role === "player2";
}

export function getDuelOpponent(role: DuelRole): DuelRole {
	return role === "player1" ? "player2" : "player1";
}

export function getActiveDurakRoles(playerCount: number) {
	return ONLINE_ROLES.slice(0, playerCount);
}

export function getNextDurakRole(role: OnlineRole, playerCount: number, hands?: Record<OnlineRole, string[]>, allowEmpty: boolean = false): OnlineRole {
	const roles = getActiveDurakRoles(playerCount);
	const start = roles.indexOf(role);
	for (let offset = 1; offset <= roles.length; offset += 1) {
		const candidate = roles[(start + offset) % roles.length];
		if (allowEmpty || !hands || hands[candidate].length > 0) return candidate;
	}
	return roles[(start + 1) % roles.length];
}

export const SHOT_RESEND_MS = 3000;
export const SHOT_RESEND_LIMIT = 4;
export const PRESENCE_LEAVE_GRACE_MS = 10000;
export const ROOM_JOIN_TIMEOUT_MS = 12000;

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

export function OnlineRoomControls({
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
						<PixelLoader size="large" color={currentTheme.accent} style={{ marginVertical: 20 }} />
	
						<StylizedButton text={t("mp.cancel")} onClick={onDisconnect} backgroundColor={cssColors.spaceGray} />
					</View>
				);
			} else {
				return (
					<View style={styles.waitingContainer}>
						<Text style={[styles.waitingTitle, { color: currentTheme.textPrimary }]}>{status === "error" ? t("mp.connectionError") : t("mp.connecting")}</Text>
						{status !== "error" && <PixelLoader size="large" color={currentTheme.accent} style={{ marginVertical: 30 }} />}
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

export function useIsMobile() {
	const { width } = useWindowDimensions();
	return { isMobile: width <= 768 };
}

export function SegmentButton<T extends string>({
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

export function RuleToggle({ label, active, onPress, accent }: { label: string; active: boolean; onPress: () => void; accent: string }) {
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
export function DurakModeToggleColumn({
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