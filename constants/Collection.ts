import { useMemo } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { FREE_SHOP_ITEM_IDS, SHOP_ITEMS, type ShopCategory, type ShopItem } from "./Shop";
import { itemRarity, parseChestState, publishChestState, useChestState, type ChestState } from "./Chests";
import type { Rarity } from "./DailyReward";

// The collection: every item that can be owned, grouped in sets. A set is one shop category at one rarity
// ("piece_skin:epic"), plus "exclusive" for the chest-only items. A complete set pays keys once; the server checks
// it (claim_collection_set, migration 20261116120000_chest_keys_gifts), the same grouping lives in its
// item_category() and collection_set_items().

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];
export const EXCLUSIVE_SET = "exclusive";

/** Keys for a complete set; mirrors collection_set_keys(). */
export function setKeys(setId: string): number {
	if (setId === EXCLUSIVE_SET) return 10;
	const rarity = setId.split(":")[1];
	return rarity === "legendary" ? 5 : rarity === "epic" ? 3 : rarity === "rare" ? 2 : rarity === "common" ? 1 : 0;
}

/** Items sold for coins plus the chest exclusives: what a collection counts. */
export function collectibleItems(): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.price > 0 && !item.secret);
}

export interface CollectionSet {
	id: string;
	category: ShopCategory | null;
	rarity: Rarity | null;
	items: ShopItem[];
	owned: number;
	complete: boolean;
	claimed: boolean;
	keys: number;
}

export function buildCollectionSets(ownedItemIds: string[], claimedSets: string[]): CollectionSet[] {
	const owned = new Set(ownedItemIds);
	const claimed = new Set(claimedSets);
	const groups = new Map<string, ShopItem[]>();
	for (const item of collectibleItems()) {
		const id = item.chestOnly ? EXCLUSIVE_SET : `${item.category}:${itemRarity(item.price)}`;
		groups.set(id, [...(groups.get(id) ?? []), item]);
	}
	return [...groups.entries()].map(([id, items]) => {
		const [category, rarity] = id === EXCLUSIVE_SET ? [null, null] : (id.split(":") as [ShopCategory, Rarity]);
		const ownedCount = items.filter((item) => owned.has(item.id)).length;
		return {
			id,
			category,
			rarity,
			items,
			owned: ownedCount,
			complete: ownedCount === items.length,
			claimed: claimed.has(id),
			keys: setKeys(id),
		};
	});
}

export interface CollectionSummary {
	owned: number;
	total: number;
	/** Complete sets whose keys are not collected yet. */
	claimable: number;
	byRarity: Record<Rarity, { owned: number; total: number }>;
}

export function summarizeCollection(ownedItemIds: string[], chestState: ChestState | null): CollectionSummary {
	// The counter also counts the items everyone starts with (they are always owned); sets and their keys stay on
	// collectibleItems(), the same list the server uses.
	const owned = new Set([...ownedItemIds, ...FREE_SHOP_ITEM_IDS]);
	const freeIds = new Set<string>(FREE_SHOP_ITEM_IDS);
	const freeItems = SHOP_ITEMS.filter((item) => freeIds.has(item.id) && item.price <= 0);
	const items = [...freeItems, ...collectibleItems()];
	const byRarity = Object.fromEntries(RARITY_ORDER.map((rarity) => [rarity, { owned: 0, total: 0 }])) as CollectionSummary["byRarity"];
	for (const item of items) {
		const entry = byRarity[itemRarity(item.price)];
		entry.total += 1;
		if (owned.has(item.id)) entry.owned += 1;
	}
	const claimable = chestState
		? buildCollectionSets(ownedItemIds, chestState.collectionSets).filter((set) => set.complete && !set.claimed).length
		: 0;
	return { owned: items.filter((item) => owned.has(item.id)).length, total: items.length, claimable, byRarity };
}

export function useCollectionSummary(ownedItemIds: string[]): CollectionSummary {
	const { chestState } = useChestState();
	return useMemo(() => summarizeCollection(ownedItemIds, chestState), [ownedItemIds, chestState]);
}

export type ClaimSetResult = { status: "ok"; keys: number } | { status: "incomplete" | "already" | "no_account" | "failed" };

export async function claimCollectionSet(setId: string): Promise<ClaimSetResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "no_account" };
		const { data, error } = await supabase.rpc("claim_collection_set", { p_set: setId });
		if (error || !data || typeof data !== "object") return { status: "failed" };
		const row = data as Record<string, unknown>;
		publishChestState(parseChestState(row.state));
		if (row.status === "ok") return { status: "ok", keys: typeof row.keys === "number" ? row.keys : 0 };
		if (row.status === "incomplete" || row.status === "already") return { status: row.status };
		return { status: "failed" };
	} catch {
		return { status: "failed" };
	}
}
