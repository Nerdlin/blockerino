import AsyncStorage from "@react-native-async-storage/async-storage";
import { ACHIEVEMENT_DEFINITIONS, AchievementRow } from "./Achievements";
import { supabase } from "./Supabase";

// Coins for finished achievement tiers. The server owns the wallet and the reward table (achievement_rewards
// migration); this file asks it to pay and remembers which tiers were paid. Signed-in players only.

const CLAIMED_KEY = "ACHIEVEMENT_CLAIMED";

export interface AchievementClaimResult {
	/** Wallet balance the server answers with. */
	coins: number | null;
	/** Tiers paid by this call. */
	granted: string[];
	/** Every tier this account has claimed so far. */
	claimed: string[];
}

function asStringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function parseAchievementClaim(data: unknown): AchievementClaimResult | null {
	if (!data || typeof data !== "object") return null;
	const row = data as Record<string, unknown>;
	if (row.status !== "ok") return null;
	return {
		coins: typeof row.coins === "number" && Number.isFinite(row.coins) ? row.coins : null,
		granted: asStringList(row.granted),
		claimed: asStringList(row.claimed),
	};
}

export async function readClaimedAchievements(): Promise<string[]> {
	try {
		const raw = await AsyncStorage.getItem(CLAIMED_KEY);
		return asStringList(raw ? JSON.parse(raw) : []);
	} catch {
		return [];
	}
}

async function rememberClaimed(claimed: string[]): Promise<void> {
	try {
		await AsyncStorage.setItem(CLAIMED_KEY, JSON.stringify(claimed));
	} catch {
		// the server keeps the truth
	}
}

/** Null for guests and when the server cannot be reached. An empty list only reads which tiers were claimed. */
export async function claimAchievements(ids: string[]): Promise<AchievementClaimResult | null> {
	try {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session?.user) return null;
		const { data, error } = await supabase.rpc("claim_achievements", { p_ids: ids });
		if (error) return null;
		const result = parseAchievementClaim(data);
		if (result) await rememberClaimed(result.claimed);
		return result;
	} catch {
		return null;
	}
}

/** Coins a finished, unclaimed tier is worth. */
export function getAchievementReward(id: string): number {
	return ACHIEVEMENT_DEFINITIONS.find((definition) => definition.id === id)?.reward ?? 0;
}

export function getClaimableAchievementIds(rows: Pick<AchievementRow, "id" | "progress">[], claimed: string[]): string[] {
	const done = new Set(claimed);
	return rows.filter((row) => row.progress.complete && !done.has(row.id)).map((row) => row.id);
}

export interface AchievementChainView {
	chain: string;
	/** Tiers easiest first. */
	tiers: AchievementRow[];
	/** The tier the player is working on; the last one once everything is done. */
	focus: AchievementRow;
	completedTiers: number;
	/** Finished tiers whose coins were not collected yet. */
	claimable: AchievementRow[];
	claimableCoins: number;
	allDone: boolean;
}

/** Groups rows into chains in the order the chains first appear. */
export function buildChainViews(rows: AchievementRow[], claimed: string[]): AchievementChainView[] {
	const byChain = new Map<string, AchievementRow[]>();
	for (const row of rows) {
		const list = byChain.get(row.chain) ?? [];
		list.push(row);
		byChain.set(row.chain, list);
	}
	const done = new Set(claimed);
	return [...byChain.entries()].map(([chain, list]) => {
		const tiers = [...list].sort((a, b) => a.target - b.target);
		const next = tiers.find((tier) => !tier.progress.complete);
		const claimable = tiers.filter((tier) => tier.progress.complete && !done.has(tier.id));
		return {
			chain,
			tiers,
			focus: next ?? tiers[tiers.length - 1],
			completedTiers: tiers.filter((tier) => tier.progress.complete).length,
			claimable,
			claimableCoins: claimable.reduce((sum, tier) => sum + tier.reward, 0),
			allDone: !next,
		};
	});
}
