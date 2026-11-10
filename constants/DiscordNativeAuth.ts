import * as WebBrowser from "expo-web-browser";
import { supabase } from "./Supabase";

// Sign-in with Discord in the Android app. It ends in the same account as the Discord Activity: the browser
// gets a Discord code for our Discord app, discord-token-exchange turns it into an access token, and
// discord-activity-auth (also used by the Activity) finds the player's account by Discord id and returns a
// one-time login. Supabase's own Discord provider is not used here, because it would open a second, empty
// account for every player who started in the Activity.

/** Where the app is opened at the end (watched by expo-web-browser). */
export const DISCORD_NATIVE_REDIRECT = "com.nerdlin.blockerino://discord-auth";
/** Discord accepts only http(s) redirects; this function bounces the browser to DISCORD_NATIVE_REDIRECT. */
export const DISCORD_WEB_REDIRECT = "https://ptcglecvavdvpxadqfqd.supabase.co/functions/v1/discord-app-return";

export type DiscordNativeSignIn =
	| { status: "signed_in" }
	| { status: "cancelled" }
	| { status: "error"; message: string };

function randomState(): string {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// No prompt=none: Chrome only follows the jump back to the app after a tap, so Discord shows its Authorize button.
export function buildDiscordAuthorizeUrl(clientId: string, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: "code",
		redirect_uri: DISCORD_WEB_REDIRECT,
		scope: "identify",
		state,
	});
	return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Reads the code from the URL Discord sent the browser back to; null when it is not ours or carries an error. */
export function readDiscordReturn(url: string, expectedState: string): { code: string } | { error: string } {
	const query = url.includes("?") ? url.slice(url.indexOf("?") + 1).split("#")[0] : "";
	const params = new URLSearchParams(query);
	const error = params.get("error_description") || params.get("error");
	if (error) return { error };
	if (params.get("state") !== expectedState) return { error: "state_mismatch" };
	const code = params.get("code");
	return code ? { code } : { error: "no_code" };
}

export async function signInWithDiscordNative(): Promise<DiscordNativeSignIn> {
	const clientId = process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;
	if (!clientId) return { status: "error", message: "Discord sign-in is not configured" };

	const state = randomState();
	const result = await WebBrowser.openAuthSessionAsync(buildDiscordAuthorizeUrl(clientId, state), DISCORD_NATIVE_REDIRECT);
	if (result.type !== "success") return { status: "cancelled" };

	const returned = readDiscordReturn(result.url, state);
	if ("error" in returned) {
		return returned.error === "access_denied" ? { status: "cancelled" } : { status: "error", message: returned.error };
	}

	const { data: exchange, error: exchangeError } = await supabase.functions.invoke("discord-token-exchange", {
		body: { code: returned.code, redirect_uri: DISCORD_WEB_REDIRECT },
	});
	if (exchangeError || exchange?.error || typeof exchange?.access_token !== "string") {
		return { status: "error", message: String(exchange?.error || exchangeError?.message || "Discord did not return a token") };
	}

	const { data: login, error: loginError } = await supabase.functions.invoke("discord-activity-auth", {
		body: { access_token: exchange.access_token },
	});
	if (loginError || login?.error || typeof login?.token_hash !== "string") {
		return { status: "error", message: String(login?.error || loginError?.message || "Discord account was not found") };
	}

	const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: login.token_hash, type: "magiclink" });
	if (otpError) return { status: "error", message: otpError.message };
	return { status: "signed_in" };
}
