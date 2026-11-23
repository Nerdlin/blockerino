// What the player is told, per screen, when the server cannot be reached. Pure: returns dictionary keys.

export type OfflineFeature = "shop" | "records" | "profile" | "pass" | "duel" | "daily" | "friends" | "chessOnline";

export interface OfflineNotice {
	titleKey: string;
	bodyKey: string;
	/** Whether the "Try again" button makes sense (a check can succeed later). */
	canRetry: boolean;
}

const BODY: Record<OfflineFeature, string> = {
	shop: "offline.body.shop",
	records: "offline.body.records",
	profile: "offline.body.profile",
	pass: "offline.body.pass",
	duel: "offline.body.duel",
	daily: "offline.body.daily",
	friends: "offline.body.friends",
	chessOnline: "offline.body.chessOnline",
};

export function offlineNotice(feature: OfflineFeature): OfflineNotice {
	return { titleKey: "offline.title", bodyKey: BODY[feature], canRetry: true };
}

/** The status chip on the main menu: nothing while online or still unknown. */
export function offlineBadgeKey(online: boolean | null): string | null {
	return online === false ? "offline.badge" : null;
}

/**
 * The text of the streak/reward chip's popup when the reward cannot be fetched.
 * Offline and signed in (or not known yet): "needs the network"; a guest has no streak at all.
 */
export function dailyRewardOfflineKey(online: boolean | null, signedIn: boolean | null): string | null {
	if (online !== false) return null;
	return signedIn === false ? null : "offline.body.daily";
}
