import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/**
 * One small setting that lives in AsyncStorage, can be read anywhere (a worklet callback, a timer) with get(), and
 * re-renders whoever uses it through use(). It loads itself the first time something asks for it.
 */
export function createPersistedSetting<T extends string | number | boolean>(key: string, initial: T, parse: (raw: string) => T | null) {
	let value = initial;
	let loaded = false;
	const listeners = new Set<() => void>();
	const emit = () => listeners.forEach((listener) => listener());
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	async function load(): Promise<void> {
		if (loaded) return;
		loaded = true;
		try {
			const raw = await AsyncStorage.getItem(key);
			if (raw == null) return;
			const next = parse(raw);
			if (next !== null && next !== value) {
				value = next;
				emit();
			}
		} catch {
			// a setting that cannot be read keeps its default
		}
	}

	function set(next: T): void {
		loaded = true; // a choice made now wins over a stored value that has not been read yet
		if (next === value) return;
		value = next;
		emit();
		void Promise.resolve(AsyncStorage.setItem(key, String(next))).catch(() => undefined);
	}

	function use(): T {
		useEffect(() => {
			void load();
		}, []);
		return useSyncExternalStore(subscribe, () => value, () => value);
	}

	return { get: () => value, set, load, use, subscribe };
}

export const parseBoolean = (raw: string): boolean | null => (raw === "true" ? true : raw === "false" ? false : null);
export const parseIntIn = (min: number, max: number) => (raw: string): number | null => {
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
