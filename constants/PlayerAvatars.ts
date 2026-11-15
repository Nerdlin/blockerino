import { useEffect, useState } from "react";
import { supabase } from "./Supabase";
import { getAccountSession } from "./AccountSession";

// The profile picture of a player, for game screens that only know a name (chess) or that the player is "me".
// Answers are kept for the app run: a game screen asks again on every render of a new game.

const byName = new Map<string, string | null>();
let mine: string | null | undefined;

async function loadMine(): Promise<string | null> {
	if (mine !== undefined) return mine;
	try {
		const { data } = await getAccountSession();
		const user = data.session?.user;
		if (!user) return null;
		const { data: rows } = await supabase.from("profiles").select("avatar_url").eq("auth_user_id", user.id).limit(1);
		mine = (rows?.[0]?.avatar_url as string | null | undefined) || (user.user_metadata?.avatar_url as string | undefined) || null;
		return mine;
	} catch {
		return null;
	}
}

async function loadByName(name: string): Promise<string | null> {
	if (byName.has(name)) return byName.get(name) ?? null;
	try {
		const { data: rows } = await supabase.from("profiles").select("avatar_url").eq("player_name", name).limit(1);
		const url = (rows?.[0]?.avatar_url as string | null | undefined) || null;
		byName.set(name, url);
		return url;
	} catch {
		return null;
	}
}

/** The picture of the signed-in player (self) or of the player with this nickname; null while loading or without one. */
export function usePlayerAvatar(name: string | null | undefined, self = false): string | null {
	const [url, setUrl] = useState<string | null>(() => (self ? mine ?? null : name ? byName.get(name) ?? null : null));
	useEffect(() => {
		let active = true;
		const load = self ? loadMine() : name ? loadByName(name) : Promise.resolve(null);
		void load.then((value) => { if (active) setUrl(value); });
		return () => { active = false; };
	}, [name, self]);
	return url;
}
