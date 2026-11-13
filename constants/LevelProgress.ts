import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom } from "jotai";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";
import { LEVELS, LEVELS_PER_CHAPTER } from "./Levels";
import type { ChestPrize } from "./DailyReward";

// Stars of the level map. Kept on the device for everyone; for an account also on the server (record_level_result),
// which is what chapter chests are checked against. Opening the map merges both: the best of each level wins.

const KEY = "LEVEL_PROGRESS_V1";

export type LevelStars = Record<string, number>;

export interface LevelProgressState {
	stars: LevelStars;
	/** Chapter chests already opened, as "chapter:kind". */
	chests: string[];
}

export const levelProgressAtom = atom<LevelProgressState>({ stars: {}, chests: [] });

export function mergeStars(a: LevelStars, b: LevelStars): LevelStars {
	const merged: LevelStars = { ...a };
	for (const [id, stars] of Object.entries(b)) merged[id] = Math.max(merged[id] ?? 0, stars);
	return merged;
}

export async function loadLocalLevelStars(): Promise<LevelStars> {
	try {
		const raw = await AsyncStorage.getItem(KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

async function saveLocalLevelStars(stars: LevelStars): Promise<void> {
	try {
		await AsyncStorage.setItem(KEY, JSON.stringify(stars));
	} catch {}
}

/** Local and server progress merged; local stars the server does not have yet are sent to it. */
export async function loadLevelProgress(): Promise<LevelProgressState> {
	const local = await loadLocalLevelStars();
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { stars: local, chests: [] };
		const { data, error } = await supabase.rpc("get_level_progress");
		if (error || !data || data.status !== "ok") return { stars: local, chests: [] };
		const server: LevelStars = data.levels ?? {};
		const merged = mergeStars(local, server);
		for (const [id, stars] of Object.entries(local)) {
			if ((server[id] ?? 0) < stars) void supabase.rpc("record_level_result", { p_level_id: id, p_stars: stars });
		}
		await saveLocalLevelStars(merged);
		const chests = Array.isArray(data.chests) ? data.chests.map((c: { chapter: number; kind: string }) => `${c.chapter}:${c.kind}`) : [];
		return { stars: merged, chests };
	} catch {
		return { stars: local, chests: [] };
	}
}

/** Saves a won level (best stars kept). Returns the stars now kept. */
export async function recordLevelWin(levelId: string, stars: number): Promise<number> {
	const local = await loadLocalLevelStars();
	const kept = Math.max(local[levelId] ?? 0, stars);
	await saveLocalLevelStars({ ...local, [levelId]: kept });
	try {
		const { data: { session } } = await getAccountSession();
		if (session?.user) await supabase.rpc("record_level_result", { p_level_id: levelId, p_stars: stars });
	} catch {}
	return kept;
}

/** A level is open when it is the first one or the one before it is won. */
export function isLevelUnlocked(stars: LevelStars, number: number): boolean {
	if (number <= 1) return true;
	const previous = LEVELS[number - 2];
	return Boolean(previous && (stars[previous.id] ?? 0) > 0);
}

export function chapterStars(stars: LevelStars, chapter: number): { won: number; stars: number; perfect: number } {
	let won = 0, total = 0, perfect = 0;
	for (let i = 1; i <= LEVELS_PER_CHAPTER; i++) {
		const s = stars[`${chapter}-${i}`] ?? 0;
		if (s > 0) won++;
		if (s === 3) perfect++;
		total += s;
	}
	return { won, stars: total, perfect };
}

export function totalStars(stars: LevelStars): number {
	return Object.values(stars).reduce((sum, s) => sum + s, 0);
}

export type ChapterChestKind = "complete" | "perfect";

export interface ChapterChestResult {
	status: "opened" | "already" | "locked" | "guest" | "error";
	chest?: ChestPrize;
	coins?: number;
	ownedItemIds?: string[];
}

export async function claimChapterChest(chapter: number, kind: ChapterChestKind): Promise<ChapterChestResult> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return { status: "guest" };
		const { data, error } = await supabase.rpc("claim_chapter_chest", { p_chapter: chapter, p_kind: kind });
		if (error || !data) return { status: "error" };
		if (data.status !== "opened") return { status: data.status === "already" || data.status === "locked" ? data.status : "error", coins: data.coins };
		const raw = data.chest ?? {};
		const chest: ChestPrize = raw.kind === "item"
			? { size: raw.size, kind: "item", itemId: raw.item_id, coins: raw.coins ?? 0, rarity: raw.rarity ?? "common" }
			: { size: raw.size, kind: "coins", coins: raw.coins ?? 0, rarity: raw.rarity ?? "common" };
		return { status: "opened", chest, coins: data.coins, ownedItemIds: Array.isArray(data.owned_item_ids) ? data.owned_item_ids : undefined };
	} catch {
		return { status: "error" };
	}
}
