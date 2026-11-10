// Links that open the app go through here before the router sees them. The Discord sign-in returns to
// com.nerdlin.blockerino://discord-auth; expo-web-browser hands that URL to the sign-in screen, so the router
// stays on the game instead of opening a page that does not exist.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
	try {
		if (path.includes("discord-auth")) return "/";
	} catch {
		// fall through to the original path
	}
	return path;
}
