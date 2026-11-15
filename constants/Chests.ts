import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { SHOP_ITEMS, type ShopItem } from "./Shop";
import { parseChest, type ChestPrize, type ChestSize, type Rarity } from "./DailyReward";

// Chests: the server rolls and pays them (claim_daily_reward, buy_chest; supabase/migrations/20261115120000_elo_admin_chests.sql).
// This file holds what the screens show: prices, the odds, the lucky hour and the strip of the roulette.

export const CHEST_PRICES: Record<ChestSize, number> = { small: 500, big: 1200 };

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
			? [{ kind: "coins", percent: 26 }, { kind: "common_rare", percent: 43 }, { kind: "epic", percent: 23 }, { kind: "legendary", percent: 8 }]
			: [{ kind: "coins", percent: 45 }, { kind: "common_rare", percent: 35 }, { kind: "epic", percent: 15 }, { kind: "legendary", percent: 5 }];
	}
	return lucky
		? [{ kind: "rare", percent: 43 }, { kind: "epic", percent: 41 }, { kind: "legendary", percent: 16 }]
		: [{ kind: "rare", percent: 60 }, { kind: "epic", percent: 30 }, { kind: "legendary", percent: 10 }];
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

function paidItems(): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.price > 0 && !item.secret);
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
		if (odd.kind === "coins") return { kind: "coins", coins: 250 + Math.floor(random() * 35) * 10, rarity: "common" };
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

export type BuyChestResult =
	| { status: "ok"; chest: ChestPrize; coins: number; ownedItemIds: string[] }
	| { status: "no_coins" | "no_account" | "failed" };

export async function buyChest(size: ChestSize): Promise<BuyChestResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "no_account" };
		const { data, error } = await supabase.rpc("buy_chest", { p_size: size });
		if (error || !data || typeof data !== "object") return { status: "failed" };
		const row = data as Record<string, unknown>;
		if (row.status === "no_coins") return { status: "no_coins" };
		if (row.status === "unauthenticated" || row.status === "no_profile") return { status: "no_account" };
		const chest = parseChest(row.chest);
		if (row.status !== "ok" || !chest || typeof row.coins !== "number") return { status: "failed" };
		const ownedItemIds = Array.isArray(row.owned_item_ids) ? row.owned_item_ids.filter((id): id is string => typeof id === "string") : [];
		return { status: "ok", chest, coins: row.coins, ownedItemIds };
	} catch {
		return { status: "failed" };
	}
}
