import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/constants/Supabase";

const PLAYER_NAME_KEY = "PLAYER_NAME";

export interface AccountIdentity {
	/** False until the first session lookup finishes, so menus do not flash the guest UI. */
	checked: boolean;
	signedIn: boolean;
	/** The account's nickname. Signed-in players change it in the profile only. */
	name: string | null;
}

async function loadIdentity(): Promise<AccountIdentity> {
	try {
		const { data } = await supabase.auth.getSession();
		const user = data.session?.user;
		if (!user) return { checked: true, signedIn: false, name: null };

		let name: string | null = null;
		try {
			const { data: rows } = await supabase.from("profiles").select("player_name").eq("auth_user_id", user.id).limit(1);
			name = (rows?.[0]?.player_name as string | undefined)?.trim() || null;
		} catch {}
		if (!name) name = (await AsyncStorage.getItem(PLAYER_NAME_KEY))?.trim() || null;
		if (!name) {
			const metadata = user.user_metadata || {};
			name = [metadata.player_name, metadata.name, metadata.full_name, user.email?.split("@")[0]]
				.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || null;
		}
		if (name) await AsyncStorage.setItem(PLAYER_NAME_KEY, name);
		return { checked: true, signedIn: true, name };
	} catch {
		// Offline or storage trouble: treat as signed in so a nickname field never replaces a known account.
		return { checked: true, signedIn: true, name: null };
	}
}

export function useAccountIdentity(): AccountIdentity {
	const [identity, setIdentity] = useState<AccountIdentity>({ checked: false, signedIn: false, name: null });

	useEffect(() => {
		let active = true;
		const refresh = () => {
			void loadIdentity().then((next) => { if (active) setIdentity(next); });
		};
		refresh();
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") refresh();
		});
		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, []);

	return identity;
}
