import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { SHOP_ITEMS, type ShopItem } from "./Shop";
import { parseChest, type ChestPrize, type ChestSize, type Rarity } from "./DailyReward";

// Chests: the server rolls and pays them (claim_daily_reward, buy_chest, open_key_chest;
// supabase/migrations/20261116120000_chest_keys_gifts.sql). This file holds what the screens show: prices, the odds,
// the lucky hour, keys and pity, and the strip of the roulette.

export const CHEST_PRICES: Record<ChestSize, number> = { small: 400, big: 1000 };
/** The tenth chest (bought or opened with a key) without a legendary is legendary. */
export const PITY_MAX = 10;
/** Versus wins that make a key. */
export const KEY_SHARDS = 5;

/** The lucky hour, in UTC: 17:00-18:00 (20:00-21:00 in Moscow). The server checks the same hour. */
export const LUCKY_HOUR_UTC = 17;

export function isLuckyHour(now: Date = new Date()): boolean {
	return now.getUTCHours() === LUCKY_HOUR_UTC;
}

/** Milliseconds until the lucky hour starts (0 while it runs) and until it ends. */
export function luckyHourTimes(now: Date = new Date()): { startsIn: number; endsIn: number } {
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), LUCKY_HOUR_UTC));
	const end = new Date(start.getTime() + 3600_000);
	if (now >= end) start.setUTCDate(start.getUTCDate() + 1);
	if (now >= start && now < end) return { startsIn: 0, endsIn: end.getTime() - now.getTime() };
	return { startsIn: start.getTime() - now.getTime(), endsIn: 0 };
}

/** One line of the odds: a prize kind and its chance in percent. "coins" is a chest of coins, the rest are items. */
export interface ChestOdd {
	kind: "coins" | "common_rare" | Rarity;
	percent: number;
}

/** The odds the server rolls with (open_chest); the lucky hour leans to the rare end. */
export function chestOdds(size: ChestSize, lucky: boolean): ChestOdd[] {
	if (size === "small") {
		return lucky
			? [{ kind: "coins", percent: 13 }, { kind: "common_rare", percent: 42 }, { kind: "epic", percent: 29 }, { kind: "legendary", percent: 16 }]
			: [{ kind: "coins", percent: 30 }, { kind: "common_rare", percent: 40 }, { kind: "epic", percent: 20 }, { kind: "legendary", percent: 10 }];
	}
	return lucky
		? [{ kind: "epic", percent: 55 }, { kind: "legendary", percent: 45 }]
		: [{ kind: "epic", percent: 70 }, { kind: "legendary", percent: 30 }];
}

/** Rarity of a shop item by its price, as the server counts it (item_rarity). */
export function itemRarity(price: number): Rarity {
	if (price <= 300) return "common";
	if (price <= 600) return "rare";
	if (price <= 900) return "epic";
	return "legendary";
}

/** A tile of the roulette strip. */
export type RouletteTile =
	| { kind: "coins"; coins: number; rarity: Rarity }
	| { kind: "item"; item: ShopItem; rarity: Rarity };

export const ROULETTE_LENGTH = 46;
/** Where the prize sits on the strip: far enough for a long spin, with tiles after it so the strip does not end. */
export const ROULETTE_WIN_INDEX = 40;

/** Everything a chest can give: shop items and the chest exclusives. */
function paidItems(): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.price > 0 && !item.secret);
}

export function chestExclusives(): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.chestOnly);
}

/** The strip: random tiles drawn with the chest's odds, and the prize at ROULETTE_WIN_INDEX. */
export function buildRouletteStrip(prize: ChestPrize, prizeItem: ShopItem | undefined, random: () => number = Math.random): RouletteTile[] {
	const items = paidItems();
	const byRarity = (rarity: Rarity) => items.filter((item) => itemRarity(item.price) === rarity);
	const odds = chestOdds(prize.size, false);
	const pick = (): RouletteTile => {
		let roll = random() * 100;
		let odd = odds[odds.length - 1];
		for (const entry of odds) {
			if (roll < entry.percent) { odd = entry; break; }
			roll -= entry.percent;
		}
		if (odd.kind === "coins") return { kind: "coins", coins: 400 + Math.floor(random() * 41) * 10, rarity: "common" };
		const rarity: Rarity = odd.kind === "common_rare" ? (random() < 0.5 ? "common" : "rare") : odd.kind;
		const pool = byRarity(rarity);
		if (pool.length === 0) return { kind: "coins", coins: 600, rarity };
		return { kind: "item", item: pool[Math.floor(random() * pool.length)], rarity };
	};
	const strip = Array.from({ length: ROULETTE_LENGTH }, pick);
	strip[ROULETTE_WIN_INDEX] = prizeItem
		? { kind: "item", item: prizeItem, rarity: prize.rarity }
		: { kind: "coins", coins: prize.coins, rarity: prize.rarity };
	// a near miss looks better than a random neighbour: a legendary tile right after the prize, now and then
	if (prize.rarity !== "legendary" && random() < 0.35) {
		const legend = byRarity("legendary");
		if (legend.length > 0) strip[ROULETTE_WIN_INDEX + 1] = { kind: "item", item: legend[Math.floor(random() * legend.length)], rarity: "legendary" };
	}
	return strip;
}

/** Keys, Versus key shards, chests since the last legendary and the collection sets already paid. */
export interface ChestState {
	keys: number;
	keyShards: number;
	pity: number;
	collectionSets: string[];
}

export function parseChestState(value: unknown): ChestState | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
	return {
		keys: num(row.keys),
		keyShards: num(row.key_shards),
		pity: num(row.pity),
		collectionSets: Array.isArray(row.collection_sets) ? row.collection_sets.filter((id): id is string => typeof id === "string") : [],
	};
}

/** Null until it is known (guests never know it). */
export const chestStateAtom = atom<ChestState | null>(null);

const stateListeners = new Set<(state: ChestState) => void>();
/** Any answer that carries the state (a chest, a gift, a quest claim) updates every screen that shows it. */
export function publishChestState(state: ChestState | null): void {
	if (state) stateListeners.forEach((listener) => listener(state));
}

export async function fetchChestState(): Promise<ChestState | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("get_chest_state");
		if (error) return null;
		return parseChestState(data);
	} catch {
		return null;
	}
}

/** The chest state, loaded when a screen that shows it opens and whenever refresh() is called. */
export function useChestState(): { chestState: ChestState | null; refresh: () => Promise<void> } {
	const [chestState, setChestState] = useAtom(chestStateAtom);
	useEffect(() => {
		stateListeners.add(setChestState);
		return () => {
			stateListeners.delete(setChestState);
		};
	}, [setChestState]);
	const refresh = useCallback(async () => {
		const next = await fetchChestState();
		if (next) setChestState(next);
	}, [setChestState]);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	return { chestState, refresh };
}

export type BuyChestResult =
	| { status: "ok"; chest: ChestPrize; coins: number; ownedItemIds: string[]; state: ChestState | null; pity: boolean; exclusive: boolean }
	| { status: "no_coins" | "no_keys" | "no_account" | "failed" };

export function parseOpenedChest(data: unknown): BuyChestResult {
	if (!data || typeof data !== "object") return { status: "failed" };
	const row = data as Record<string, unknown>;
	if (row.status === "no_coins") return { status: "no_coins" };
	if (row.status === "no_keys") return { status: "no_keys" };
	if (row.status === "unauthenticated" || row.status === "no_profile") return { status: "no_account" };
	const chest = parseChest(row.chest);
	if (row.status !== "ok" || !chest || typeof row.coins !== "number") return { status: "failed" };
	const ownedItemIds = Array.isArray(row.owned_item_ids) ? row.owned_item_ids.filter((id): id is string => typeof id === "string") : [];
	const raw = row.chest as Record<string, unknown>;
	const state = parseChestState(row.state);
	publishChestState(state);
	return { status: "ok", chest, coins: row.coins, ownedItemIds, state, pity: raw.pity === true, exclusive: raw.exclusive === true };
}

async function openOnServer(fn: "buy_chest" | "open_key_chest", args?: Record<string, unknown>): Promise<BuyChestResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "no_account" };
		const { data, error } = await supabase.rpc(fn, args);
		if (error) return { status: "failed" };
		return parseOpenedChest(data);
	} catch {
		return { status: "failed" };
	}
}

export function buyChest(size: ChestSize): Promise<BuyChestResult> {
	return openOnServer("buy_chest", { p_size: size });
}

/** Opens a small chest with a key. */
export function openKeyChest(): Promise<BuyChestResult> {
	return openOnServer("open_key_chest");
}
