import AsyncStorage from "@react-native-async-storage/async-storage";

// The last answer the server gave for a screen (a leaderboard, the season pass), kept on the device so that the
// screen can show it, marked with its age, while there is no network.

const PREFIX = "LAST_KNOWN:";

export interface LastKnown<T> {
	value: T;
	savedAt: number;
}

export async function saveLastKnown<T>(key: string, value: T): Promise<void> {
	try {
		await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ value, savedAt: Date.now() }));
	} catch {
		// a missing copy only means nothing to show offline
	}
}

export async function loadLastKnown<T>(key: string): Promise<LastKnown<T> | null> {
	try {
		const raw = await AsyncStorage.getItem(PREFIX + key);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.savedAt === "number" && "value" in parsed) return parsed as LastKnown<T>;
	} catch {
		// unreadable: treated as nothing saved
	}
	return null;
}

export type AgeLabel = { key: "offline.saved.today" | "offline.saved.yesterday" | "offline.saved.date"; time?: string; date?: string };

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** How to word the age of saved data: today (with the time), yesterday, or a date. Pure; uses the local calendar. */
export function ageLabel(savedAt: number, now: number): AgeLabel {
	const saved = new Date(savedAt);
	const today = new Date(now);
	const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((dayStart(today) - dayStart(saved)) / 86400000);
	if (days <= 0) return { key: "offline.saved.today", time: `${pad(saved.getHours())}:${pad(saved.getMinutes())}` };
	if (days === 1) return { key: "offline.saved.yesterday" };
	return { key: "offline.saved.date", date: `${pad(saved.getDate())}.${pad(saved.getMonth() + 1)}` };
}
