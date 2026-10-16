import { useEffect, useState } from "react";
import { getLeaderboardTier, type LeaderboardTier } from "./LeaderboardTiers";
import { getSeasonLeaderboard } from "./SeasonScores";
import { getTopEloRatings } from "./Supabase";

// Cosmetic rewards for the top of a leaderboard: holders of a top-5 place get a coloured name
// (and a title); a perk lasts only while the place is held, so it follows the live ranking.
// Boards: Classic and Chaos (current season) and Versus elo.

export type PerkBoard = "classic" | "chaos" | "elo";

export const PERK_MAX_RANK = 5;

export interface LeaderboardPerk {
	board: PerkBoard;
	rank: number;
	tier: LeaderboardTier;
}

export function getPerkTier(rank: number): LeaderboardTier | undefined {
	return rank >= 1 && rank <= PERK_MAX_RANK ? getLeaderboardTier(rank) : undefined;
}

/** The most valuable perk (lowest rank) among a player's places on all boards. */
export function pickBestPerk(perks: LeaderboardPerk[] | undefined): LeaderboardPerk | undefined {
	if (!perks || perks.length === 0) return undefined;
	return perks.reduce((best, perk) => (perk.rank < best.rank ? perk : best));
}

function perkKey(playerName: string): string {
	return playerName.trim().toLowerCase();
}

/** Builds name -> perks from the ranked names of each board (best first). */
export function buildPerkMap(boards: { board: PerkBoard; names: string[] }[]): Map<string, LeaderboardPerk[]> {
	const map = new Map<string, LeaderboardPerk[]>();
	for (const { board, names } of boards) {
		const seen = new Set<string>();
		names.forEach((name, index) => {
			const key = perkKey(name);
			const tier = getPerkTier(index + 1);
			if (!key || !tier || seen.has(key)) return;
			seen.add(key);
			map.set(key, [...(map.get(key) ?? []), { board, rank: index + 1, tier }]);
		});
	}
	return map;
}

const CACHE_MS = 60_000;
let cache: { at: number; map: Map<string, LeaderboardPerk[]> } | null = null;
let inFlight: Promise<Map<string, LeaderboardPerk[]>> | null = null;

async function loadPerkMap(): Promise<Map<string, LeaderboardPerk[]>> {
	const [classic, chaos, elo] = await Promise.all([
		getSeasonLeaderboard("classic", PERK_MAX_RANK),
		getSeasonLeaderboard("chaos", PERK_MAX_RANK),
		getTopEloRatings(PERK_MAX_RANK),
	]);
	return buildPerkMap([
		{ board: "classic", names: classic.map((row) => row.player_name) },
		{ board: "chaos", names: chaos.map((row) => row.player_name) },
		{ board: "elo", names: elo.filter((row) => row.elo > 0).map((row) => row.player_name) },
	]);
}

export async function getPerkMap(): Promise<Map<string, LeaderboardPerk[]>> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
	if (!inFlight) {
		inFlight = loadPerkMap()
			.then((map) => {
				cache = { at: Date.now(), map };
				return map;
			})
			.finally(() => {
				inFlight = null;
			});
	}
	return inFlight;
}

export function clearPerkCache(): void {
	cache = null;
}

/** Best current perk of a player, or undefined when they hold no top-5 place. */
export function useLeaderboardPerk(playerName: string | null | undefined): LeaderboardPerk | undefined {
	const [perk, setPerk] = useState<LeaderboardPerk | undefined>(undefined);

	useEffect(() => {
		const name = playerName?.trim();
		if (!name) {
			setPerk(undefined);
			return;
		}
		let cancelled = false;
		getPerkMap()
			.then((map) => {
				if (!cancelled) setPerk(pickBestPerk(map.get(perkKey(name))));
			})
			.catch(() => {
				if (!cancelled) setPerk(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [playerName]);

	return perk;
}
