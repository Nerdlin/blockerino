import { dailyRewardOfflineKey, offlineBadgeKey, offlineNotice, type OfflineFeature } from "./OfflineMessages";
import { moduleTranslations } from "./i18n";

const FEATURES: OfflineFeature[] = ["shop", "records", "profile", "pass", "duel", "daily", "friends", "chessOnline"];

describe("offline messages", () => {
	it("every feature has a title and body in both languages", () => {
		for (const feature of FEATURES) {
			const { titleKey, bodyKey } = offlineNotice(feature);
			for (const language of ["en", "ru"] as const) {
				expect(moduleTranslations[language][titleKey]).toBeTruthy();
				expect(moduleTranslations[language][bodyKey]).toBeTruthy();
			}
		}
	});

	it("each feature gets its own body", () => {
		expect(new Set(FEATURES.map((feature) => offlineNotice(feature).bodyKey)).size).toBe(FEATURES.length);
	});

	it("the badge shows only when known offline", () => {
		expect(offlineBadgeKey(null)).toBeNull();
		expect(offlineBadgeKey(true)).toBeNull();
		expect(offlineBadgeKey(false)).toBe("offline.badge");
	});

	it("the reward message appears offline, except for a known guest", () => {
		expect(dailyRewardOfflineKey(true, true)).toBeNull();
		expect(dailyRewardOfflineKey(null, true)).toBeNull();
		expect(dailyRewardOfflineKey(false, true)).toBe("offline.body.daily");
		expect(dailyRewardOfflineKey(false, null)).toBe("offline.body.daily");
		expect(dailyRewardOfflineKey(false, false)).toBeNull();
	});
});
