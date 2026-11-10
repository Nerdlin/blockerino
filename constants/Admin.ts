import { useEffect } from "react";
import { atom, useAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./Supabase";

// The game's administrator (the accounts in public.admins). The client only decides what to show; every admin
// function on the server checks is_admin() itself, so a modified client gains nothing.

const isAdminAtom = atom<boolean | null>(null);
const WIN_BUTTON_KEY = "ADMIN_WIN_BUTTON";
export const adminWinButtonAtom = atom<boolean>(false);

let checkedFor: string | null = null;

/** True when the signed-in account is an admin. Asked once per account, then cached. */
export function useIsAdmin(): boolean {
	const [isAdmin, setIsAdmin] = useAtom(isAdminAtom);
	useEffect(() => {
		let active = true;
		const check = async () => {
			const { data: { session } } = await supabase.auth.getSession();
			const userId = session?.user.id ?? null;
			if (!userId) {
				checkedFor = null;
				if (active) setIsAdmin(false);
				return;
			}
			if (checkedFor === userId && isAdmin !== null) return;
			checkedFor = userId;
			const { data, error } = await supabase.rpc("is_admin");
			if (active) setIsAdmin(!error && data === true);
		};
		void check();
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
				checkedFor = null;
				void check();
			}
		});
		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, [isAdmin, setIsAdmin]);
	return isAdmin === true;
}

/** The "Win" button in games against a bot: an admin testing tool, off until switched on in the panel. */
export function useAdminWinButton(): [boolean, (on: boolean) => void] {
	const isAdmin = useIsAdmin();
	const [enabled, setEnabled] = useAtom(adminWinButtonAtom);
	useEffect(() => {
		AsyncStorage.getItem(WIN_BUTTON_KEY).then((value) => setEnabled(value === "1")).catch(() => undefined);
	}, [setEnabled]);
	const set = (on: boolean) => {
		setEnabled(on);
		AsyncStorage.setItem(WIN_BUTTON_KEY, on ? "1" : "0").catch(() => undefined);
	};
	return [isAdmin && enabled, set];
}

export interface AdminOverview {
	players: number;
	accounts: number;
	new_today: number;
	active_today: number;
	active_week: number;
	coins_total: number;
	season_players: number;
	duels_today: number;
	android_version: AndroidVersionConfig | null;
}

export interface AndroidVersionConfig {
	latestVersion: string;
	latestBuildNumber: number;
	downloadUrl: string;
	releaseNotes?: string;
	isMandatory?: boolean;
}

export interface AdminPlayer {
	id: string;
	player_name: string;
	avatar_url: string | null;
	coins: number;
	elo: number;
	highscore_classic: number;
	highscore_chaos: number;
	streak_count: number;
	created_at: string;
	login_providers: string[] | null;
	last_login_at: string | null;
	last_seen: string | null;
	has_account: boolean;
	is_admin: boolean;
}

export interface AdminSeasonRow {
	profile_id: string;
	player_name: string;
	score: number;
	updated_at: string;
	account_created: string;
}

export interface AdminLogRow {
	action: string;
	details: Record<string, unknown>;
	created_at: string;
	target: string | null;
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.rpc(name, args);
	if (error) throw new Error(error.message);
	return data as T;
}

export const adminApi = {
	overview: () => call<AdminOverview>("admin_overview"),
	findPlayers: (query: string) => call<AdminPlayer[]>("admin_find_players", { p_query: query }),
	adjustCoins: (profileId: string, delta: number, reason: string) =>
		call<{ coins: number }>("admin_adjust_coins", { p_profile_id: profileId, p_delta: delta, p_reason: reason }),
	resetRecord: (profileId: string, mode: "classic" | "chaos") => call<{ ok: boolean }>("admin_reset_record", { p_profile_id: profileId, p_mode: mode }),
	seasonTop: (board: "classic" | "chaos") => call<AdminSeasonRow[]>("admin_season_top", { p_board: board }),
	setAndroidVersion: (value: AndroidVersionConfig) => call<AndroidVersionConfig>("admin_set_android_version", { p_value: value }),
	recentLog: () => call<AdminLogRow[]>("admin_recent_log"),
};
