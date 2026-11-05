import AsyncStorage from "@react-native-async-storage/async-storage";

// Remembers the Versus rank the player last saw, so a climb into a higher rank is celebrated once.

const LAST_RANK_KEY = "LAST_SEEN_ELO_TIER";

/** Index of the rank an Elo falls into, given each rank's lower bound (ascending). */
export function rankIndexFor(elo: number, rankMins: number[]): number {
	let index = 0;
	rankMins.forEach((min, i) => {
		if (elo >= min) index = i;
	});
	return index;
}

/**
 * Called with each rating the server reports. Returns the new rank index when the player climbed since the rank
 * they last saw, otherwise null. The first rating ever seen is only remembered: nothing to celebrate yet.
 */
export async function checkRankUp(elo: number, rankMins: number[]): Promise<number | null> {
	if (!Number.isFinite(elo)) return null;
	const index = rankIndexFor(elo, rankMins);
	let previous: number | null = null;
	try {
		const raw = await AsyncStorage.getItem(LAST_RANK_KEY);
		previous = raw === null ? null : Number(raw);
	} catch {
		previous = null;
	}
	if (previous === index) return null;
	try {
		await AsyncStorage.setItem(LAST_RANK_KEY, String(index));
	} catch {
		// the rank is checked again next time
	}
	return previous !== null && Number.isFinite(previous) && index > previous ? index : null;
}
