import { useEffect, useState } from "react";
import { supabase } from "@/constants/Supabase";
import { getAccountSession } from "@/constants/AccountSession";

// How rare an achievement is: the share of players that have it (server: get_achievement_rarity). The numbers move
// slowly, so one answer is kept for a few minutes and shared by every screen that shows a percentage.

export interface AchievementRarity {
	/** Players that reported their achievements at all: the base of the percentage. */
	total: number;
	counts: Record<string, number>;
}

/** Below this many players a percentage says nothing, so none is shown. */
export const MIN_RARITY_BASE = 5;
const CACHE_MS = 5 * 60 * 1000;

export function parseAchievementRarity(data: unknown): AchievementRarity | null {
	if (!data || typeof data !== "object") return null;
	const raw = data as { total?: unknown; counts?: unknown };
	if (typeof raw.total !== "number" || !Number.isFinite(raw.total) || raw.total < 0) return null;
	const counts: Record<string, number> = {};
	if (raw.counts && typeof raw.counts === "object") {
		for (const [id, count] of Object.entries(raw.counts as Record<string, unknown>)) {
			if (typeof count === "number" && Number.isFinite(count) && count >= 0) counts[id] = count;
		}
	}
	return { total: raw.total, counts };
}

/** Share of the players that have the tier, 0-100, or null while the base is too small. */
export function rarityPercent(rarity: AchievementRarity | null, id: string): number | null {
	if (!rarity || rarity.total < MIN_RARITY_BASE) return null;
	const count = Math.min(rarity.counts[id] ?? 0, rarity.total);
	return (count / rarity.total) * 100;
}

/** "2.6", "12", "<1": the number as the screens print it. */
export function formatRarityPercent(percent: number): string {
	if (percent > 0 && percent < 1) return "<1";
	if (percent < 10) return (Math.round(percent * 10) / 10).toString();
	return Math.round(percent).toString();
}

export type RarityClass = "common" | "uncommon" | "rare" | "epic";

export function rarityClass(percent: number): RarityClass {
	if (percent < 5) return "epic";
	if (percent < 20) return "rare";
	if (percent < 50) return "uncommon";
	return "common";
}

export const RARITY_CLASS_COLORS: Record<RarityClass, string> = {
	common: "#9CA3AF",
	uncommon: "#4ADE80",
	rare: "#60A5FA",
	epic: "#F59E0B",
};

let cached: { at: number; value: AchievementRarity } | null = null;
let inflight: Promise<AchievementRarity | null> | null = null;

export async function fetchAchievementRarity(force = false): Promise<AchievementRarity | null> {
	if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
	if (inflight) return inflight;
	inflight = (async () => {
		try {
			const { data, error } = await supabase.rpc("get_achievement_rarity");
			if (error) return cached?.value ?? null;
			const parsed = parseAchievementRarity(data);
			if (parsed) cached = { at: Date.now(), value: parsed };
			return parsed ?? cached?.value ?? null;
		} catch {
			return cached?.value ?? null;
		} finally {
			inflight = null;
		}
	})();
	return inflight;
}

/** Reports the completed tiers of a signed-in player; guests and offline devices are skipped silently. */
export async function syncAchievementUnlocks(ids: string[]): Promise<void> {
	try {
		const { data: { session } } = await getAccountSession();
		if (!session?.user) return;
		await supabase.rpc("sync_achievement_unlocks", { p_ids: ids.slice(0, 200) });
	} catch {
		// the next unlock reports again
	}
}

export function useAchievementRarity(): AchievementRarity | null {
	const [rarity, setRarity] = useState<AchievementRarity | null>(cached?.value ?? null);
	useEffect(() => {
		let active = true;
		void fetchAchievementRarity().then((next) => {
			if (active && next) setRarity(next);
		});
		return () => {
			active = false;
		};
	}, []);
	return rarity;
}
