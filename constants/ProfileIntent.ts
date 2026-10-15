// Lets other screens open the profile menu straight on "log in" or "create account".
export type ProfileAuthIntent = "login" | "register";

let pendingIntent: ProfileAuthIntent | null = null;

export function setProfileAuthIntent(intent: ProfileAuthIntent) {
	pendingIntent = intent;
}

export function consumeProfileAuthIntent(): ProfileAuthIntent | null {
	const intent = pendingIntent;
	pendingIntent = null;
	return intent;
}
