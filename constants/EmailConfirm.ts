import { Platform } from "react-native";

// The sign-up letter's link lands on a small page of the site (public/email-confirmed.html) that says the email
// is confirmed and has a "back to the game" button for the place the player signed up from: the Android app
// (com.nerdlin.blockerino://email-confirmed?code=...) or the web game (/?code=...). The page must be listed in
// Supabase > Authentication > URL Configuration > Redirect URLs.

export const EMAIL_CONFIRMED_PAGE = "https://blockerino.aionerdlin.me/email-confirmed.html";

/** Where the confirm link of a sign-up made here should land. */
export function emailConfirmRedirect(language: string, platform: string = Platform.OS): string {
	const from = platform === "android" ? "android" : platform === "ios" ? "ios" : "web";
	return `${EMAIL_CONFIRMED_PAGE}?from=${from}&lang=${language === "ru" ? "ru" : "en"}`;
}

/**
 * Where a password-reset link should land. On the web it is the game itself (the client reads the code from the
 * address and emits PASSWORD_RECOVERY); on a phone it goes through the same page and deep link as the sign-up letter.
 */
export function passwordResetRedirect(language: string, platform: string = Platform.OS): string {
	if (platform === "web" && typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}/`;
	return emailConfirmRedirect(language, platform);
}

/** The one-time code of a link that opened the app from the page, or null when the URL is something else. */
export function emailConfirmCode(url: string | null | undefined): { code: string | null } | null {
	if (!url || !url.includes("email-confirmed")) return null;
	const match = /[?&]code=([^&#]+)/.exec(url);
	return { code: match ? decodeURIComponent(match[1]) : null };
}
