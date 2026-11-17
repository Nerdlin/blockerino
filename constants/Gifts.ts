import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { parseChestState, parseOpenedChest, publishChestState, type BuyChestResult, type ChestState } from "./Chests";

// Gifts between friends: an item from the shop or a chest (a key). The sender pays the shop price; the server
// moves everything at once (send_gift) and the friend sees the gift on their next start (claim_gifts).
// Migration 20261116120000_chest_keys_gifts.

export const GIFTS_PER_DAY = 5;

export type GiftKind = "item" | "chest";

export type SendGiftStatus = "ok" | "not_friends" | "no_coins" | "owned" | "not_for_sale" | "limit" | "no_account" | "failed";

export async function sendGift(friendId: string, kind: GiftKind, itemId?: string): Promise<{ status: SendGiftStatus; coins: number | null }> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "no_account", coins: null };
		const { data, error } = await supabase.rpc("send_gift", { p_friend: friendId, p_kind: kind, p_item_id: itemId ?? null });
		if (error || !data || typeof data !== "object") return { status: "failed", coins: null };
		const row = data as Record<string, unknown>;
		const coins = typeof row.coins === "number" ? row.coins : null;
		const known: SendGiftStatus[] = ["ok", "not_friends", "no_coins", "owned", "not_for_sale", "limit"];
		const status = known.includes(row.status as SendGiftStatus) ? (row.status as SendGiftStatus) : row.status === "no_profile" || row.status === "unauthenticated" ? "no_account" : "failed";
		return { status, coins };
	} catch {
		return { status: "failed", coins: null };
	}
}

export interface ReceivedGift {
	kind: GiftKind;
	itemId: string | null;
	fromName: string;
}

export interface GiftClaim {
	gifts: ReceivedGift[];
	ownedItemIds: string[];
	state: ChestState | null;
}

export function parseGiftClaim(data: unknown): GiftClaim | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	const gifts = Array.isArray(row.gifts)
		? row.gifts.flatMap((entry): ReceivedGift[] => {
			if (!entry || typeof entry !== "object") return [];
			const gift = entry as Record<string, unknown>;
			if (gift.kind !== "item" && gift.kind !== "chest") return [];
			return [{ kind: gift.kind, itemId: typeof gift.item_id === "string" ? gift.item_id : null, fromName: typeof gift.from_name === "string" ? gift.from_name : "?" }];
		})
		: [];
	const ownedItemIds = Array.isArray(row.owned_item_ids) ? row.owned_item_ids.filter((id): id is string => typeof id === "string") : [];
	return { gifts, ownedItemIds, state: parseChestState(row.state) };
}

/** Gifts not shown yet; null for guests and when the server cannot be reached. */
export async function claimGifts(): Promise<GiftClaim | null> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("claim_gifts");
		if (error) return null;
		const claim = parseGiftClaim(data);
		if (claim) publishChestState(claim.state);
		return claim;
	} catch {
		return null;
	}
}

export interface GiftFriend {
	id: string;
	name: string;
}

/** Accepted friends of the signed-in player, by name. */
export async function fetchGiftFriends(): Promise<GiftFriend[]> {
	try {
		const { data: { session } } = await getAccountSession();
		const me = session?.user?.id;
		if (!me) return [];
		const { data } = await supabase
			.from("friends")
			.select("user_id_1, user_id_2")
			.eq("status", "accepted")
			.or(`user_id_1.eq.${me},user_id_2.eq.${me}`);
		const ids = (data ?? []).map((row) => (row.user_id_1 === me ? row.user_id_2 : row.user_id_1)).filter((id): id is string => typeof id === "string");
		if (ids.length === 0) return [];
		const { data: profiles } = await supabase.from("profiles").select("auth_user_id, player_name").in("auth_user_id", ids);
		const names = new Map((profiles ?? []).map((row) => [row.auth_user_id as string, row.player_name as string]));
		return ids.map((id) => ({ id, name: names.get(id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

export interface GiftChest {
	id: string;
	fromName: string;
	createdAt: string;
}

export function parseGiftChests(data: unknown): GiftChest[] {
	if (!Array.isArray(data)) return [];
	return data.flatMap((entry): GiftChest[] => {
		if (!entry || typeof entry !== "object") return [];
		const row = entry as Record<string, unknown>;
		if (typeof row.id !== "string") return [];
		return [{ id: row.id, fromName: typeof row.from_name === "string" ? row.from_name : "?", createdAt: typeof row.created_at === "string" ? row.created_at : "" }];
	});
}

/** The gift chests waiting in the profile; empty for guests and offline. */
export async function fetchGiftChests(): Promise<GiftChest[]> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return [];
		const { data, error } = await supabase.rpc("my_gift_chests");
		return error ? [] : parseGiftChests(data);
	} catch {
		return [];
	}
}

/** Opens a gift chest: the same answer as buying one. */
export async function openGiftChest(giftId: string): Promise<BuyChestResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "no_account" };
		const { data, error } = await supabase.rpc("open_gift_chest", { p_gift: giftId });
		if (error) return { status: "failed" };
		return parseOpenedChest(data);
	} catch {
		return { status: "failed" };
	}
}
