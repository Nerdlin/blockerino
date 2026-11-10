jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("./Supabase", () => ({ supabase: {} }));

import { buildDiscordAuthorizeUrl, DISCORD_NATIVE_REDIRECT, DISCORD_WEB_REDIRECT, readDiscordReturn } from "./DiscordNativeAuth";

describe("Discord sign-in in the app", () => {
	it("asks Discord for a code sent back to the app", () => {
		const url = new URL(buildDiscordAuthorizeUrl("123", "s1"));
		expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
		expect(url.searchParams.get("redirect_uri")).toBe(DISCORD_WEB_REDIRECT);
		expect(url.searchParams.get("scope")).toBe("identify");
		expect(url.searchParams.get("state")).toBe("s1");
	});

	it("takes the code only with the state it sent", () => {
		expect(readDiscordReturn(`${DISCORD_NATIVE_REDIRECT}?code=abc&state=s1`, "s1")).toEqual({ code: "abc" });
		expect(readDiscordReturn(`${DISCORD_NATIVE_REDIRECT}?code=abc&state=other`, "s1")).toEqual({ error: "state_mismatch" });
		expect(readDiscordReturn(`${DISCORD_NATIVE_REDIRECT}?error=access_denied&state=s1`, "s1")).toEqual({ error: "access_denied" });
	});
});
