import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { supabase } from "./Supabase";

export type ShopCategory = "piece_skin" | "background" | "music" | "sfx";
export type BackgroundScene = "classic" | "ender" | "sunset" | "ice" | "cyber";

export interface ShopItem {
	id: string;
	category: ShopCategory;
	title: string;
	description: string;
	price: number;
	accent: string;
	previewColors: string[];
	gradient?: [string, string, string];
	scene?: BackgroundScene;
}

export interface EquippedCosmetics {
	piece_skin: string;
	background: string;
	music: string;
	sfx: string;
}

export interface ShopState {
	balance: number;
	ownedItemIds: string[];
	equipped: EquippedCosmetics;
	starterGrantClaimed: boolean;
	updatedAt: number;
}

const SHOP_STATE_KEY = "SHOP_STATE_V1";
const PLAYER_NAME_KEY = "PLAYER_NAME";
const PLAYER_ID_KEY = "PLAYER_ID";
export const STARTER_SHOP_COINS = 250;

export const DEFAULT_EQUIPPED_COSMETICS: EquippedCosmetics = {
	piece_skin: "piece_classic",
	background: "background_classic",
	music: "music_classic",
	sfx: "sfx_classic",
};

export const FREE_SHOP_ITEM_IDS = Object.values(DEFAULT_EQUIPPED_COSMETICS);

export const SHOP_ITEMS: ShopItem[] = [
	{
		id: "piece_classic",
		category: "piece_skin",
		title: "Classic Pixels",
		description: "Original bright blockerino pieces.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#E38F10", "#BA1326", "#109E28", "#1438B8"],
	},
	{
		id: "piece_minecraft",
		category: "piece_skin",
		title: "Mine Blocks",
		description: "Grass, dirt, stone and gem colors with chunky cube edges.",
		price: 120,
		accent: "#5DBB3F",
		previewColors: ["#6BBF45", "#8A5A2B", "#808080", "#2CCED2"],
	},
	{
		id: "piece_crystal",
		category: "piece_skin",
		title: "Crystal Gems",
		description: "Sharp glossy blocks with cold jewel tones.",
		price: 220,
		accent: "#7DEBFF",
		previewColors: ["#7DEBFF", "#C77DFF", "#FF7DDD", "#8DFFB2"],
	},
	{
		id: "piece_lava",
		category: "piece_skin",
		title: "Lava Forge",
		description: "Hot magma palette with darker forged edges.",
		price: 320,
		accent: "#FF6B1A",
		previewColors: ["#FFB000", "#FF4D00", "#8B1E00", "#3A0B00"],
	},
	{
		id: "piece_circuit",
		category: "piece_skin",
		title: "Circuit Tiles",
		description: "Clean tech blocks with electric green and cyan traces.",
		price: 420,
		accent: "#00FF9D",
		previewColors: ["#00FF9D", "#00D4FF", "#4D5BFF", "#D5FF3F"],
	},
	{
		id: "background_classic",
		category: "background",
		title: "Classic Night",
		description: "The original dark animated gradient.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#0A0A14", "#140A1E", "#1E0A14"],
		gradient: ["rgb(10, 10, 20)", "rgb(20, 10, 30)", "rgb(30, 10, 20)"],
		scene: "classic",
	},
	{
		id: "background_ender",
		category: "background",
		title: "Ender Depths",
		description: "Deep violet caves with a green shimmer.",
		price: 160,
		accent: "#6BFFB8",
		previewColors: ["#090716", "#251047", "#0E3D37"],
		gradient: ["rgb(9, 7, 22)", "rgb(37, 16, 71)", "rgb(14, 61, 55)"],
		scene: "ender",
	},
	{
		id: "background_sunset",
		category: "background",
		title: "Sunset Grid",
		description: "Warm arcade sunset without washing out the board.",
		price: 240,
		accent: "#FFD166",
		previewColors: ["#231942", "#FF6B6B", "#FFD166"],
		gradient: ["rgb(35, 25, 66)", "rgb(255, 107, 107)", "rgb(255, 209, 102)"],
		scene: "sunset",
	},
	{
		id: "background_ice",
		category: "background",
		title: "Ice Cave",
		description: "Cold blues and glassy shadows.",
		price: 300,
		accent: "#90E0EF",
		previewColors: ["#061A2D", "#0A4D68", "#90E0EF"],
		gradient: ["rgb(6, 26, 45)", "rgb(10, 77, 104)", "rgb(144, 224, 239)"],
		scene: "ice",
	},
	{
		id: "background_cyber",
		category: "background",
		title: "Cyber Alley",
		description: "Dark city neon with cyan and pink motion.",
		price: 380,
		accent: "#FF2BD6",
		previewColors: ["#050816", "#00D4FF", "#FF2BD6"],
		gradient: ["rgb(5, 8, 22)", "rgb(0, 85, 132)", "rgb(86, 14, 96)"],
		scene: "cyber",
	},
	{
		id: "music_classic",
		category: "music",
		title: "Classic Loop",
		description: "The original background mix.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "music_lofi",
		category: "music",
		title: "Lo-fi Builder",
		description: "Softer mix preset for longer solo runs.",
		price: 140,
		accent: "#BDE0FE",
		previewColors: ["#BDE0FE", "#FFC8DD", "#A2D2FF"],
	},
	{
		id: "music_arcade",
		category: "music",
		title: "Arcade Rush",
		description: "A brighter, louder arcade-style mix preset.",
		price: 220,
		accent: "#FF006E",
		previewColors: ["#FF006E", "#FBFF12", "#3A86FF"],
	},
	{
		id: "music_cave",
		category: "music",
		title: "Cave Echoes",
		description: "A darker mix preset for mining-style themes.",
		price: 280,
		accent: "#8D99AE",
		previewColors: ["#2B2D42", "#8D99AE", "#EDF2F4"],
	},
	{
		id: "music_space",
		category: "music",
		title: "Space Drift",
		description: "A quieter floating mix preset.",
		price: 360,
		accent: "#9D4EDD",
		previewColors: ["#10002B", "#5A189A", "#E0AAFF"],
	},
	{
		id: "sfx_classic",
		category: "sfx",
		title: "Classic Clicks",
		description: "The original placement, combo and menu sounds.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "sfx_wood",
		category: "sfx",
		title: "Wooden Blocks",
		description: "Chunkier placement emphasis for blocky skins.",
		price: 140,
		accent: "#B08968",
		previewColors: ["#7F5539", "#B08968", "#E6CCB2"],
	},
	{
		id: "sfx_glass",
		category: "sfx",
		title: "Glass Pops",
		description: "Brighter feedback for clears and combos.",
		price: 220,
		accent: "#A9DEF9",
	{
		id: "music_classic",
		category: "music",
		title: "Classic Loop",
		description: "The original background mix.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "music_lofi",
		category: "music",
		title: "Lo-fi Builder",
		description: "Softer mix preset for longer solo runs.",
		price: 140,
		accent: "#BDE0FE",
		previewColors: ["#BDE0FE", "#FFC8DD", "#A2D2FF"],
	},
	{
		id: "music_arcade",
		category: "music",
		title: "Arcade Rush",
		description: "A brighter, louder arcade-style mix preset.",
		price: 220,
		accent: "#FF006E",
		previewColors: ["#FF006E", "#FBFF12", "#3A86FF"],
	},
	{
		id: "music_cave",
		category: "music",
		title: "Cave Echoes",
		description: "A darker mix preset for mining-style themes.",
		price: 280,
		accent: "#8D99AE",
		previewColors: ["#2B2D42", "#8D99AE", "#EDF2F4"],
	},
	{
		id: "music_space",
		category: "music",
		title: "Space Drift",
		description: "A quieter floating mix preset.",
		price: 360,
		accent: "#9D4EDD",
		previewColors: ["#10002B", "#5A189A", "#E0AAFF"],
	},
	{
		id: "sfx_classic",
		category: "sfx",
		title: "Classic Clicks",
		description: "The original placement, combo and menu sounds.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "sfx_wood",
		category: "sfx",
		title: "Wooden Blocks",
		description: "Chunkier placement emphasis for blocky skins.",
		price: 140,
		accent: "#B08968",
		previewColors: ["#7F5539", "#B08968", "#E6CCB2"],
	},
	{
		id: "sfx_glass",
		category: "sfx",
		title: "Glass Pops",
		description: "Brighter feedback for clears and combos.",
		price: 220,
		accent: "#A9DEF9",
		previewColors: ["#A9DEF9", "#E4C1F9", "#FCF6BD"],
	},
	{
		id: "sfx_retro",
		category: "sfx",
		title: "Retro Beeps",
		description: "Sharper arcade event mapping.",
		price: 300,
		accent: "#06D6A0",
		previewColors: ["#06D6A0", "#FFD166", "#EF476F"],
	},
	{
		id: "sfx_metal",
		category: "sfx",
		title: "Metal Clanks",
		description: "Heavier feedback for intense runs.",
		price: 380,
		accent: "#ADB5BD",
		previewColors: ["#343A40", "#ADB5BD", "#F8F9FA"],
	},
	{
		id: "music_custom",
		category: "music",
		title: "Custom Stream URL",
		description: "Secret! Play your own music stream URL. Configure in Options.",
		price: 0,
		accent: "#FFFFFF",
		previewColors: ["#FF0000", "#00FF00", "#0000FF"],
	},
	{
		id: "sfx_custom",
		category: "sfx",
		title: "Custom SFX URL",
		description: "Secret! Play your own SFX stream URL. Configure in Options.",
		price: 0,
		accent: "#FFFFFF",
		previewColors: ["#FF00FF", "#00FFFF", "#FFFF00"],
	},
];

const SHOP_ITEM_MAP = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

import { atom } from "jotai";
export const shopStateAtom = atom<ShopState>(createDefaultShopState());

export function createDefaultShopState(): ShopState {
	return {
		balance: STARTER_SHOP_COINS,
		ownedItemIds: [...FREE_SHOP_ITEM_IDS],
		equipped: { ...DEFAULT_EQUIPPED_COSMETICS },
		starterGrantClaimed: true,
		updatedAt: 0,
	};
}

export function getShopItem(itemId: string): ShopItem | undefined {
	return SHOP_ITEM_MAP.get(itemId);
}

export function getShopItemsByCategory(category: ShopCategory): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.category === category);
}

export function calculateCoinsForScore(score: number): number {
	return Math.max(0, Math.floor(score / 25));
}

export function normalizeShopState(value: Partial<ShopState> | null | undefined): ShopState {
	const fallback = createDefaultShopState();
	if (!value) return fallback;

	const ownedSet = new Set([
		...FREE_SHOP_ITEM_IDS,
		...(Array.isArray(value.ownedItemIds) ? value.ownedItemIds.filter((id) => SHOP_ITEM_MAP.has(id)) : []),
	]);

	const equipped = { ...fallback.equipped };
	if (value.equipped) {
		for (const category of Object.keys(equipped) as ShopCategory[]) {
			const itemId = value.equipped[category];
			const item = itemId ? SHOP_ITEM_MAP.get(itemId) : undefined;
			if (item && item.category === category && ownedSet.has(itemId)) {
				equipped[category] = itemId;
			}
		}
	}

	const savedBalance = Math.max(0, Math.floor(Number(value.balance) || 0));
	const starterGrantClaimed = value.starterGrantClaimed === true;
	const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Math.max(0, Number(value.updatedAt)) : 0;

	return {
		balance: starterGrantClaimed ? savedBalance : Math.max(savedBalance, STARTER_SHOP_COINS),
		ownedItemIds: [...ownedSet],
		equipped,
		starterGrantClaimed: true,
		updatedAt,
	};
}

export async function loadShopState(): Promise<ShopState> {
	try {
		const raw = await AsyncStorage.getItem(SHOP_STATE_KEY);
		return normalizeShopState(raw ? JSON.parse(raw) : null);
	} catch (error) {
		console.error("Error loading shop state:", error);
		return createDefaultShopState();
	}
}

export async function saveShopState(state: ShopState): Promise<void> {
	try {
		await AsyncStorage.setItem(SHOP_STATE_KEY, JSON.stringify(normalizeShopState(state)));
	} catch (error) {
		console.error("Error saving shop state:", error);
	}
}

export function purchaseShopItem(state: ShopState, itemId: string): { ok: boolean; state: ShopState; error?: string } {
	const item = getShopItem(itemId);
	const current = normalizeShopState(state);
	if (!item) {
		return { ok: false, state: current, error: "Unknown item." };
	}

	if (current.ownedItemIds.includes(item.id)) {
		return { ok: true, state: current };
	}

	if (current.balance < item.price) {
		return { ok: false, state: current, error: "Not enough coins." };
	}

	return {
		ok: true,
		state: {
			...current,
			balance: current.balance - item.price,
			ownedItemIds: [...current.ownedItemIds, item.id],
		},
	};
}

export function equipShopItem(state: ShopState, itemId: string): { ok: boolean; state: ShopState; error?: string } {
	const item = getShopItem(itemId);
	const current = normalizeShopState(state);
	if (!item) {
		return { ok: false, state: current, error: "Unknown item." };
	}

	if (!current.ownedItemIds.includes(item.id)) {
		return { ok: false, state: current, error: "Buy this item first." };
	}

	return {
		ok: true,
		state: {
			...current,
			equipped: {
				...current.equipped,
				[item.category]: item.id,
			},
		},
	};
}

export function addCoinsToShopState(state: ShopState, coins: number): ShopState {
	const current = normalizeShopState(state);
	return {
		...current,
		balance: current.balance + Math.max(0, Math.floor(coins)),
	};
}

export function getEquippedShopItem(state: ShopState, category: ShopCategory): ShopItem {
	const current = normalizeShopState(state);
	return getShopItem(current.equipped[category]) ?? getShopItem(DEFAULT_EQUIPPED_COSMETICS[category])!;
}

export function getBackgroundGradient(itemId: string): [string, string, string] | undefined {
	return getShopItem(itemId)?.gradient;
}

export function getBackgroundScene(itemId: string): BackgroundScene {
	return getShopItem(itemId)?.scene ?? "classic";
}

export function getBackgroundParticleConfig(itemId: string, isGameplayActive: boolean) {
	const scene = getBackgroundScene(itemId);
	if (scene === "classic") {
		return {
			count: isGameplayActive ? 14 : 25,
			blockSize: isGameplayActive ? 22 : 28,
			maxOpacity: isGameplayActive ? 0.55 : 1,
		};
	}

	return {
		count: isGameplayActive ? 4 : 8,
		blockSize: isGameplayActive ? 18 : 22,
		maxOpacity: isGameplayActive ? 0.18 : 0.28,
	};
}

export function mergeShopStates(localState: ShopState, remoteState: Partial<ShopState> | null | undefined): ShopState {
	const local = normalizeShopState(localState);
	const remote = normalizeShopState(remoteState);
	const ownedSet = new Set([...local.ownedItemIds, ...remote.ownedItemIds]);
	
	const localNewer = local.updatedAt >= remote.updatedAt;

	return normalizeShopState({
		balance: localNewer ? local.balance : remote.balance,
		ownedItemIds: [...ownedSet],
		equipped: local.equipped, // Always prefer local equipped items to avoid annoying reverts
		starterGrantClaimed: true,
		updatedAt: Math.max(local.updatedAt, remote.updatedAt),
	});
}

interface ShopSyncIdentity {
	playerName: string;
	playerId: string | null;
}

interface RemoteShopProfile {
	id?: string;
	player_name?: string;
	player_id?: string | null;
	coins?: number | null;
	owned_item_ids?: string[] | null;
	equipped?: Partial<EquippedCosmetics> | null;
	updated_at?: string | null;
}

async function getShopSyncIdentity(): Promise<ShopSyncIdentity | null> {
	const [rawName, playerId] = await Promise.all([
		AsyncStorage.getItem(PLAYER_NAME_KEY),
		AsyncStorage.getItem(PLAYER_ID_KEY),
	]);
	const playerName = (rawName || "").trim();
	if (!playerName) return null;

	return {
		playerName,
		playerId: playerId || null,
	};
}

function profileToShopState(profile: RemoteShopProfile | null | undefined): Partial<ShopState> | null {
	if (!profile) return null;

	return {
		balance: Math.max(0, Math.floor(Number(profile.coins) || 0)),
		ownedItemIds: Array.isArray(profile.owned_item_ids) ? profile.owned_item_ids : [],
		equipped: profile.equipped as EquippedCosmetics | undefined,
		starterGrantClaimed: true,
		updatedAt: profile.updated_at ? new Date(profile.updated_at).getTime() : 0,
	};
}

function escapeIlike(value: string): string {
	return value.replace(/[%_]/g, "\\$&");
}

export async function syncShopStateWithProfile(localState: ShopState): Promise<{ status: "synced" | "skipped" | "failed"; state: ShopState }> {
	const local = normalizeShopState(localState);

	try {
		const identity = await getShopSyncIdentity();
		if (!identity) {
			return { status: "skipped", state: local };
		}

		const { data: profiles, error: fetchError } = await supabase
			.from("profiles")
			.select("id, player_name, player_id, coins, owned_item_ids, equipped, updated_at")
			.ilike("player_name", escapeIlike(identity.playerName))
			.limit(1);

		if (fetchError) {
			console.error("Error fetching shop profile:", fetchError);
			return { status: "failed", state: local };
		}

		const profile = profiles?.[0] as RemoteShopProfile | undefined;
		const merged = {
			...mergeShopStates(local, profileToShopState(profile)),
			updatedAt: Date.now(),
		};

		const payload = {
			player_name: identity.playerName,
			player_id: identity.playerId,
			coins: merged.balance,
			owned_item_ids: merged.ownedItemIds,
			equipped: merged.equipped,
			updated_at: new Date(merged.updatedAt).toISOString(),
		};

		const writeResult = profile?.id
			? await supabase.from("profiles").update(payload).eq("id", profile.id)
			: await supabase.from("profiles").insert(payload);

		if (writeResult.error) {
			console.error("Error saving shop profile:", writeResult.error);
			return { status: "failed", state: local };
		}

		await saveShopState(merged);
		return { status: "synced", state: normalizeShopState(merged) };
	} catch (error) {
		console.error("Error syncing shop profile:", error);
		return { status: "failed", state: local };
	}
}

export function useShopState() {
	const [state, setState] = useAtom(shopStateAtom);

	const commit = useCallback(async (next: ShopState) => {
		const normalized = normalizeShopState({ ...next, updatedAt: Date.now() });
		setState(normalized);
		await saveShopState(normalized);
		const syncResult = await syncShopStateWithProfile(normalized);
		if (syncResult.status === "synced") {
			setState(syncResult.state);
			return syncResult.state;
		}
		return normalized;
	}, [setState]);

	const reload = useCallback(async () => {
		const next = await loadShopState();
		setState(next);
		return next;
	}, [setState]);

	const purchase = useCallback(async (itemId: string) => {
		const result = purchaseShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state);
		}
		return result;
	}, [commit, state]);

	const equip = useCallback(async (itemId: string) => {
		const result = equipShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state);
		}
		return result;
	}, [commit, state]);

	const purchaseAndEquip = useCallback(async (itemId: string) => {
		const purchaseResult = purchaseShopItem(state, itemId);
		if (!purchaseResult.ok) {
			return purchaseResult;
		}
		const equipResult = equipShopItem(purchaseResult.state, itemId);
		if (!equipResult.ok) {
			return equipResult;
		}
		await commit(equipResult.state);
		return equipResult;
	}, [commit, state]);

	const awardCoins = useCallback(async (score: number) => {
		const coins = calculateCoinsForScore(score);
		if (coins <= 0) return 0;
		const latest = await loadShopState();
		await commit(addCoinsToShopState(latest, coins));
		return coins;
	}, [commit]);

	return {
		state,
		reload,
		purchase,
		equip,
		purchaseAndEquip,
		awardCoins,
	};
}

export function useShopBootstrap() {
	const [, setState] = useAtom(shopStateAtom);

	useEffect(() => {
		loadShopState().then(async (local) => {
			setState(local);
			const syncResult = await syncShopStateWithProfile(local);
			if (syncResult.status === "synced") {
				setState(syncResult.state);
			}
		});
	}, [setState]);
}
