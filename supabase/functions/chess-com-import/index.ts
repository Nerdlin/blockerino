// Moves a player's chess.com ratings over to Blockerino after proving the chess.com account is theirs: the player put
// the code from chess_com_import_status() into the "Location" field of their chess.com profile. This function reads
// the public profile, checks the code and the stats, and sets the ratings through chess_com_apply_import (service
// role only). Called by the signed-in player (verify_jwt on) with { "username": "..." }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,25}$/;
const CHESS_COM = "https://api.chess.com/pub/player";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function chessCom(path: string): Promise<Record<string, unknown> | null> {
	// chess.com asks API users to identify themselves
	const response = await fetch(`${CHESS_COM}/${path}`, { headers: { Accept: "application/json", "User-Agent": "Blockerino (https://blockerino.aionerdlin.me)" } });
	if (!response.ok) return null;
	return await response.json() as Record<string, unknown>;
}

function lastRating(stats: Record<string, unknown>, key: string): number | undefined {
	const rating = (stats[key] as { last?: { rating?: number } } | undefined)?.last?.rating;
	return typeof rating === "number" && rating > 0 ? rating : undefined;
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

	const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
	const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { persistSession: false },
	});
	const { data: userData } = await supabase.auth.getUser(token);
	if (!userData?.user) return json({ status: "signed_out" }, 401);

	let username = "";
	try {
		username = String((await req.json())?.username ?? "").trim();
	} catch {
		// an empty body is an invalid username below
	}
	if (!USERNAME_RE.test(username)) return json({ status: "invalid" });

	const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", userData.user.id).maybeSingle();
	if (!profile) return json({ status: "signed_out" }, 401);
	const { data: claim } = await supabase.from("chess_com_claims").select("code, imported_at").eq("profile_id", profile.id).maybeSingle();
	if (claim?.imported_at) return json({ status: "already_imported" });
	if (!claim?.code) return json({ status: "no_code" });

	const account = await chessCom(encodeURIComponent(username.toLowerCase()));
	if (!account) return json({ status: "not_found" });
	const location = typeof account.location === "string" ? account.location : "";
	if (!location.toUpperCase().includes(String(claim.code).toUpperCase())) return json({ status: "code_missing", code: claim.code });

	const stats = await chessCom(`${encodeURIComponent(username.toLowerCase())}/stats`);
	if (!stats) return json({ status: "failed" });
	const ratings: Record<string, number> = {};
	for (const [timeClass, key] of [["bullet", "chess_bullet"], ["blitz", "chess_blitz"], ["rapid", "chess_rapid"]]) {
		const rating = lastRating(stats, key);
		if (rating) ratings[timeClass] = rating;
	}
	if (Object.keys(ratings).length === 0) return json({ status: "no_ratings" });

	const { data: result, error } = await supabase.rpc("chess_com_apply_import", { p_profile: profile.id, p_username: String(account.username ?? username), p_ratings: ratings });
	if (error) return json({ status: "failed" }, 500);
	return json(result);
});
