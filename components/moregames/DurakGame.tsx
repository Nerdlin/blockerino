import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/constants/Theme";
import { useWindowDimensions, View, Animated, LayoutAnimation, Text, ScrollView, Image, Pressable, PanResponder, Platform } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useShopState, loadShopState } from "@/constants/Shop";
import { useAccountIdentity } from "@/hooks/useAccountIdentity";
import { useRef, useState, useCallback, useEffect, useMemo, forwardRef } from "react";
import { durakReport, durakPayAnte, getPlayerProfileData, submitMoreGameMatchResult } from "@/constants/Supabase";
import UiIcon from "@/components/UiIcon";
import PixelIcon from "@/components/PixelIcon";
import StylizedButton from "../StylizedButton";
import Collapsible from "../Collapsible";
import { cssColors } from "@/constants/Color";
import { useUiScale } from "../SimplePopupView";
import Slider from "@react-native-community/slider";
import { recordMoreGameWin } from "@/constants/Achievements";
import { DurakBotView, chooseDurakAction } from "@/constants/bots/DurakBot";
import { BotPanel, useBotSettings } from "./BotPanel";
import { DurakBout, DurakState, DurakVariant, OnlineRole } from "./types";
import { DURAK_DECK_SIZES, DURAK_EMOJIS, DurakModeToggleColumn, OnlineRoomControls, SegmentButton, createRoomCode, formatCoins, getActiveDurakRoles, getDurakNetPrize, getNextDurakRole, normalizeStoredPlayerName, roleLabel, useMiniGameRoom } from "./shared";
import { CARD_SKINS, ExtraGameCosmetics } from "./cosmetics";
import { styles } from "./styles";
import { measureScreenRect } from "./BattleshipGame";

// Full rank ordering so cardRankValue stays correct for every deck size.
export const DURAK_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const DURAK_SUITS = ["C", "D", "H", "S"];

// Each deck keeps the highest ranks: 24 -> 9..A, 36 -> 6..A, 52 -> 2..A.
export function getDurakRanksForDeck(deckSize: number): string[] {
	const ranksPerSuit = deckSize / DURAK_SUITS.length;
	return DURAK_RANKS.slice(DURAK_RANKS.length - ranksPerSuit);
}
// Suits are drawn as 7x7 pixel art so they match the game's look instead of the platform's emoji glyphs.
export const SUIT_PIXELS: Record<string, string[]> = {
	S: ["...#...", "..###..", ".#####.", "#######", "#######", "...#...", "..###.."],
	C: ["..###..", "..###..", "#######", "#######", "##.#.##", "...#...", "..###.."],
	H: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
	D: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
};

export function DurakSuitIcon({ suit, size, color }: { suit: string; size: number; color: string }) {
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

export function createDurakDeck(deckSize: number = 36) {
	const ranks = getDurakRanksForDeck(deckSize);
	return DURAK_SUITS.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`)).sort(() => Math.random() - 0.5);
}

export function createEmptyHands(): Record<OnlineRole, string[]> {
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

export function cardRank(card: string) {
	return card.slice(0, -1);
}

export function cardRankValue(card: string) {
	return DURAK_RANKS.indexOf(cardRank(card));
}

export function cardSuit(card: string) {
	return card.slice(-1);
}

export function canBeatDurakCard(defense: string, attack: string, trump: string, variants: DurakVariant[] = ["throw_in"], canCheat: boolean = false) {
	if (canCheat) return true;
	if (cardSuit(defense) === cardSuit(attack)) return cardRankValue(defense) > cardRankValue(attack);
	return cardSuit(defense) === trump && cardSuit(attack) !== trump;
}

export function removeCard(cards: string[], card: string) {
	const index = cards.indexOf(card);
	if (index < 0) return cards;
	return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

export function getTableCards(table: DurakBout[]) {
	return table.flatMap((bout) => [bout.attack, bout.defense].filter(Boolean) as string[]);
}

export function canThrowDurakCard(state: DurakState, card: string, role: OnlineRole) {
	const canCheat = state.variants.includes("cheat") && !state.bustedCheaters?.includes(role);
	if (canCheat) return true;
	if (state.table.length === 0) return true;
	const ranks = new Set(getTableCards(state.table).map(cardRank));
	return ranks.has(cardRank(card));
}

export function getDurakVariantLabel(variant: DurakVariant) {
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

export function DurakOnlineGame({ cosmetics, playerName, onRatingChange }: { cosmetics: ExtraGameCosmetics; playerName: string; onRatingChange: () => void }) {
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
	const [showModes, setShowModes] = useState(false);
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
	// Against the computer there is no room: the player sits at player1 and the other seats are played by the bot.
	const { difficulty: botDifficulty, setDifficulty: setBotDifficulty, vsBot, setVsBot } = useBotSettings("durak");
	const [botMode, setBotMode] = useState(false);
	const seat: OnlineRole | null = botMode ? "player1" : room.role;
	const online = botMode || room.isConnected;
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
		if (!seat) return;
		showEmote(seat, emoji);
		room.send("emoji", { emoji });
	};

	const myHand = seat && state ? state.hands[seat] : [];

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
		if (!state || !seat || state.winner || state.cancelled || !state.variants.includes("cheat")) return;
		const bout = state.table[boutIndex];
		if (!bout) return;

		if (isDefense && bout.defense) {
			if (state.defender === seat) return; // Cannot accuse yourself
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
			if (state.attacker === seat) return; // Cannot accuse yourself
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

	const playCard = (card: string, targetIndexOverride?: number, actor: OnlineRole | null = seat) => {
		if (!state || !actor || state.winner || state.cancelled) return;
		if (!online || !state.hands[actor].includes(card)) return;
		if (actor === state.attacker && (state.phase === "attack" || state.phase === "throw" || state.phase === "defend")) {
			if (!canThrowDurakCard(state, card, actor) || state.table.length >= Math.min(6, state.hands[state.defender].length + state.table.filter((bout) => bout.defense).length)) return;
			const next: DurakState = {
				...state,
				hands: { ...state.hands, [actor]: removeCard(state.hands[actor], card) },
				table: [...state.table, { attack: card, defense: null }],
				phase: "defend",
				message: `${roleLabel(state.defender)} defends.`,
			};
			syncState(next);
			return;
		}

		if (actor === state.defender && state.phase === "defend") {
			const canCheat = state.variants.includes("cheat") && !state.bustedCheaters?.includes(actor);
			const target = resolveDurakCardTarget(state.table, card, state.trump, state.variants, targetIndexOverride, canCheat);
			if (!target) return;

			if (target.action === "transfer") {
				const nextDefender = getNextDurakRole(state.defender, state.playerCount, state.hands, true);
				if (state.table.length + 1 > Math.min(6, state.hands[nextDefender].length)) return;
				const next: DurakState = {
					...state,
					hands: { ...state.hands, [actor]: removeCard(state.hands[actor], card) },
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
				hands: { ...state.hands, [actor]: removeCard(state.hands[actor], card) },
				table: nextTable,
				phase: defended ? "throw" : "defend",
				message: defended ? "Defended. Attacker may throw more or pass." : "Defend the next card.",
			};
			syncState(next);
		}
	};

	const passRound = (actor: OnlineRole | null = seat) => {
		if (!state || state.cancelled || state.winner || !online || !actor || actor !== state.attacker || !allDefended) return;
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

	const takeRound = (actor: OnlineRole | null = seat) => {
		if (!state || state.cancelled || state.winner || !online || !actor || actor !== state.defender || state.table.length === 0) return;
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

	const startBotGame = () => {
		// The computer neither cheats nor accuses, so a cheating table becomes a fair one. No bet, no rating.
		const variants = activeVariants.includes("cheat") ? [...activeVariants.filter((variant) => variant !== "cheat"), "fair" as DurakVariant] : activeVariants;
		const count = Number(playerCount);
		const roles = getActiveDurakRoles(count);
		setBetError(null);
		setCoinResult(null);
		setBotMode(true);
		setPlayerNames(Object.fromEntries(roles.map((role, index) => [role, index === 0 ? playerName : count > 2 ? `Computer ${index}` : "Computer"])));
		setPlayerAvatars(Object.fromEntries(roles.map((role) => [role, ""])));
		setOpponentReady(true);
		setState(createDurakState(count, variants, deckSize, 0));
	};

	const leaveBotGame = () => {
		setBotMode(false);
		setState(null);
		setOpponentReady(false);
		setPlayerNames({});
	};

	useEffect(() => {
		if (!botMode || !state || state.winner || state.cancelled) return;
		// Whoever has to answer an open attack acts; otherwise the attacker leads or decides to throw in or pass.
		const actor = state.table.some((bout) => !bout.defense) ? state.defender : state.attacker;
		if (actor === "player1") return;
		const view: DurakBotView = {
			hand: state.hands[actor],
			table: state.table,
			trump: state.trump,
			deckCount: state.deck.length,
			isAttacker: actor === state.attacker,
			isDefender: actor === state.defender,
			defenderHandSize: state.hands[state.defender].length,
		};
		const timer = setTimeout(() => {
			const action = chooseDurakAction(view, botDifficulty);
			if (action.type === "attack") playCard(action.card, undefined, actor);
			else if (action.type === "defend") playCard(action.card, action.index, actor);
			else if (action.type === "take") takeRound(actor);
			else if (action.type === "pass") passRound(actor);
		}, 900);
		return () => clearTimeout(timer);
	}, [botMode, state, botDifficulty]);

	// Count the win for achievements once per finished table.
	const winRecordedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!state?.winner || state.draw || state.cancelled || !seat || state.winner !== seat) return;
		if (!botMode && !room.isConnected) return;
		if (winRecordedRef.current === state.tableId) return;
		winRecordedRef.current = state.tableId;
		recordMoreGameWin("durak", { vsBot: botMode, difficulty: botDifficulty });
	}, [botDifficulty, botMode, room.isConnected, seat, state]);

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
				const name = role === seat ? `${playerName} (you)` : (playerNames[role as OnlineRole] || label);
				msg = msg.replace(new RegExp(`\\b${label}\\b`, 'g'), name);
			}
		}
		return msg;
	}, [state?.message, playerNames, playerName, seat]);

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

						<BotPanel vsBot={vsBot} onVsBotChange={(next) => { setVsBot(next); if (next) setActiveVariants((prev) => (prev.includes("cheat") ? [...prev.filter((variant) => variant !== "cheat"), "fair"] : prev)); }} difficulty={botDifficulty} onDifficultyChange={setBotDifficulty} friendLabel={t("bot.online")} />

					<Collapsible visible={!vsBot}>
<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.yourBet")}</Text>
						<BetSlider value={bet} onChange={(v) => { setBet(v); setBetError(null); }} maxBalance={shopState.balance} />
					</Collapsible>

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

					<Pressable onPress={() => setShowModes((open) => !open)} style={styles.durakModesHeader} accessibilityRole="button">
						<Text style={[styles.durakSectionLabel, { color: currentTheme.textSecondary }]}>{t("durak.modes")} {showModes ? "▲" : "▼"}</Text>
						<Text style={[styles.durakModesSummary, { color: currentTheme.textPrimary }]} numberOfLines={2}>{activeVariants.map((variant) => t(getDurakVariantLabel(variant))).join(" · ")}</Text>
					</Pressable>
					<Collapsible visible={showModes}>
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
					</Collapsible>

					<View style={{ marginTop: 40, alignItems: "center", width: "100%" }}>
						<Collapsible visible={vsBot}>
<StylizedButton text={t("bot.play")} onClick={startBotGame} backgroundColor={currentTheme.buttonPrimary} />
						</Collapsible>
						<Collapsible visible={!vsBot}>
<OnlineRoomControls
							roomCode={room.roomCode}
							setRoomCode={room.setRoomCode}
							role={room.role}
							status={room.status}
							onHost={host}
							onJoin={join}
							onDisconnect={room.disconnect}
						/>
						</Collapsible>
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
								const isMe = role === seat;
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
											if (seat !== state.defender) return;
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
							) : state.winner && botMode ? (
							<View style={[styles.controlRow, { position: 'absolute', bottom: 120, zIndex: 100 }]}>
								<StylizedButton text={t("bot.newGame")} onClick={startBotGame} backgroundColor={currentTheme.buttonPrimary} style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
								<StylizedButton text="Leave" onClick={leaveBotGame} backgroundColor={cssColors.spaceGray} style={{ height: 40 }} textStyle={{ fontSize: 12 }} />
							</View>
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
								<StylizedButton text={t("durak.pass")} onClick={() => passRound()} backgroundColor="#B45309" borderColor="#FDE68A" style={[styles.miniActionButton, styles.durakPassButton, { width: 100 }]} textStyle={{ fontSize: 10 }} disabled={seat !== state.attacker || !allDefended} />
								<StylizedButton text={t("durak.take")} onClick={() => takeRound()} backgroundColor="#166534" borderColor="#86EFAC" style={[styles.miniActionButton, styles.durakTakeButton, { width: 100 }]} textStyle={{ fontSize: 10 }} disabled={seat !== state.defender || state.table.every(b => !b.attack)} />
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
export function DraggableHandCard({
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


export type DurakBoutProps = { rotate: string; attack: string; defense: string | null; trump: string; cosmetics: ExtraGameCosmetics; selected?: boolean; isHoverTarget?: boolean; onAttackPress?: () => void; onDefensePress?: () => void };
export const DurakBoutAnimated = forwardRef<View, DurakBoutProps>(
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

export function DurakCardView({ card, trump, cosmetics, small = false }: { card: string; trump: string; cosmetics: ExtraGameCosmetics; small?: boolean }) {
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

export const BET_MIN = 100;

export function snapBet(raw: number): number {
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

export function BetSlider({ value, onChange, maxBalance }: { value: number; onChange: (value: number) => void; maxBalance: number }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const minBet = Math.min(BET_MIN, maxBalance);
	const canBet = maxBalance >= BET_MIN;

	// Keep the bet inside what the player can actually afford (e.g. after the balance changes). Below the minimum bet the
	// player can still host or join, just without a wager, instead of being blocked by a bet they cannot pay.
	useEffect(() => {
		if (canBet && value > maxBalance) onChange(maxBalance);
		if (!canBet && value !== 0) onChange(0);
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