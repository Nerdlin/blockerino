import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";

// What waits for the player in their profile: friend requests to answer and gift chests to open. The number shows on
// the profile button of the main menu and on the profile's tabs.

export interface ProfileBadge {
	friendRequests: number;
	giftChests: number;
}

export const EMPTY_BADGE: ProfileBadge = { friendRequests: 0, giftChests: 0 };
export const profileBadgeAtom = atom<ProfileBadge>(EMPTY_BADGE);

export function badgeTotal(badge: ProfileBadge): number {
	return badge.friendRequests + badge.giftChests;
}

/** "9+" past nine, so the dot stays small. */
export function badgeLabel(count: number): string {
	return count > 9 ? "9+" : String(count);
}

export async function fetchProfileBadge(): Promise<ProfileBadge> {
	try {
		const { data: { session } } = await getAccountSession();
		const me = session?.user?.id;
		if (!me) return EMPTY_BADGE;
		const [requests, chests] = await Promise.all([
			supabase.from("friends").select("id", { count: "exact", head: true }).eq("user_id_2", me).eq("status", "pending"),
			supabase.rpc("my_gift_chests"),
		]);
		return {
			friendRequests: requests.count ?? 0,
			giftChests: Array.isArray(chests.data) ? chests.data.length : 0,
		};
	} catch {
		return EMPTY_BADGE;
	}
}

const CHECK_EVERY_MS = 60_000;

/** The badge, kept fresh while the screen that shows it is open: on mount, every minute and when the app returns. */
export function useProfileBadge(): { badge: ProfileBadge; refresh: () => Promise<void> } {
	const [badge, setBadge] = useAtom(profileBadgeAtom);
	const refresh = useCallback(async () => {
		setBadge(await fetchProfileBadge());
	}, [setBadge]);
	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), CHECK_EVERY_MS);
		const sub = AppState.addEventListener("change", (next) => {
			if (next === "active") void refresh();
		});
		const { data: auth } = supabase.auth.onAuthStateChange(() => void refresh());
		return () => {
			clearInterval(timer);
			sub.remove();
			auth.subscription.unsubscribe();
		};
	}, [refresh]);
	return { badge, refresh };
}
