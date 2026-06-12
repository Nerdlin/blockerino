import {
	SHOP_ITEMS,
	calculateCoinsForScore,
	createDefaultShopState,
	equipShopItem,
	getBackgroundParticleConfig,
	getBackgroundScene,
	getShopItemsByCategory,
	getVisibleShopItemsByCategory,
	isSecretShopItem,
	mergeShopStates,
	normalizeShopState,
	purchaseShopItem,
	shouldPushLocalShopBalance,
	shouldPushLocalShopField,
} from "./Shop";

jest.mock("@react-native-async-storage/async-storage", () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}));

describe("shop catalog and wallet", () => {
	it("offers expanded cosmetic variants without duplicate ids", () => {
		const ids = SHOP_ITEMS.map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(getShopItemsByCategory("piece_skin").filter((item) => !item.secret)).toHaveLength(35);
		expect(getShopItemsByCategory("background").filter((item) => !item.secret)).toHaveLength(35);
		expect(getShopItemsByCategory("music").filter((item) => !item.secret)).toHaveLength(35);
		expect(getShopItemsByCategory("sfx").filter((item) => !item.secret)).toHaveLength(35);
	});

	it("starts with free classic cosmetics already owned and equipped", () => {
		const state = createDefaultShopState();

		expect(state.balance).toBeGreaterThanOrEqual(200);
		expect(state.ownedItemIds).toEqual(expect.arrayContaining([
			"piece_classic",
			"background_classic",
			"music_classic",
			"sfx_classic",
		]));
		expect(state.equipped.piece_skin).toBe("piece_classic");
		expect(state.equipped.background).toBe("background_classic");
	});

	it("deducts coins when buying and requires ownership before equipping", () => {
		const state = { ...createDefaultShopState(), balance: 250 };

		const missingOwnership = equipShopItem(state, "piece_minecraft");
		expect(missingOwnership.ok).toBe(false);

		const purchase = purchaseShopItem(state, "piece_minecraft");
		expect(purchase.ok).toBe(true);
		expect(purchase.state.balance).toBe(130);
		expect(purchase.state.ownedItemIds).toContain("piece_minecraft");

		const equip = equipShopItem(purchase.state, "piece_minecraft");
		expect(equip.ok).toBe(true);
		expect(equip.state.equipped.piece_skin).toBe("piece_minecraft");
	});

	it("hides secret URL items until they are unlocked", () => {
		const state = createDefaultShopState();

		expect(isSecretShopItem("music_custom")).toBe(true);
		expect(isSecretShopItem("sfx_custom")).toBe(true);
		expect(getVisibleShopItemsByCategory("music", state.ownedItemIds).some((item) => item.id === "music_custom")).toBe(false);
		expect(getVisibleShopItemsByCategory("sfx", state.ownedItemIds).some((item) => item.id === "sfx_custom")).toBe(false);

		const directPurchase = purchaseShopItem({ ...state, balance: 9999 }, "music_custom");
		expect(directPurchase.ok).toBe(false);
		expect(directPurchase.state.ownedItemIds).not.toContain("music_custom");

		const unlocked = normalizeShopState({
			...state,
			ownedItemIds: [...state.ownedItemIds, "music_custom"],
		});
		expect(getVisibleShopItemsByCategory("music", unlocked.ownedItemIds).some((item) => item.id === "music_custom")).toBe(true);
		expect(getVisibleShopItemsByCategory("music", unlocked.ownedItemIds)[0].id).toBe("music_custom");
	});

	it("grants starter coins when migrating an older saved shop state", () => {
		const migrated = normalizeShopState({
			balance: 0,
			ownedItemIds: ["piece_classic", "background_classic", "music_classic", "sfx_classic"],
			equipped: {
				piece_skin: "piece_classic",
				background: "background_classic",
				music: "music_classic",
				sfx: "sfx_classic",
			},
		});

		expect(migrated.balance).toBeGreaterThanOrEqual(200);
	});

	it("converts final score into spendable shop coins", () => {
		expect(calculateCoinsForScore(0)).toBe(0);
		expect(calculateCoinsForScore(249)).toBe(9);
		expect(calculateCoinsForScore(2500)).toBe(100);
	});

	it("merges remote shop profiles without dropping local purchases", () => {
		const local = normalizeShopState({
			...createDefaultShopState(),
			balance: 130,
			ownedItemIds: ["piece_classic", "background_classic", "music_classic", "sfx_classic", "piece_minecraft"],
			equipped: {
				piece_skin: "piece_minecraft",
				background: "background_classic",
				music: "music_classic",
				sfx: "sfx_classic",
			},
		});

		const merged = mergeShopStates(local, {
			balance: 500,
			ownedItemIds: ["background_ender", "music_arcade"],
			equipped: {
				piece_skin: "piece_classic",
				background: "background_ender",
				music: "music_arcade",
				sfx: "sfx_classic",
			},
			starterGrantClaimed: true,
			updatedAt: local.updatedAt + 1,
		});

		expect(merged.balance).toBe(500);
		expect(merged.ownedItemIds).toEqual(expect.arrayContaining(["piece_minecraft", "background_ender", "music_arcade"]));
		expect(merged.equipped.piece_skin).toBe("piece_minecraft");
		expect(merged.equipped.background).toBe("background_classic");
	});

	it("allows remote profile coin edits to override a clean local cache", () => {
		const local = normalizeShopState({
			...createDefaultShopState(),
			balance: 125,
			pendingProfileSync: false,
			updatedAt: 5000,
		});

		const merged = mergeShopStates(local, {
			balance: 777,
			ownedItemIds: ["background_ender"],
			equipped: {
				piece_skin: "piece_classic",
				background: "background_ender",
				music: "music_classic",
				sfx: "sfx_classic",
			},
			starterGrantClaimed: true,
			updatedAt: 1000,
		}, {
			preferRemoteBalance: true,
			preferRemoteEquipped: true,
		});

		expect(merged.balance).toBe(777);
		expect(merged.equipped.background).toBe("background_ender");
		expect(merged.ownedItemIds).toContain("background_ender");
	});

	it("does not push stale local coins over a newer remote profile edit", () => {
		const local = normalizeShopState({
			...createDefaultShopState(),
			balance: 125,
			pendingProfileSync: true,
			updatedAt: 1000,
		});

		expect(shouldPushLocalShopBalance(local, {
			balance: 999,
			ownedItemIds: [],
			equipped: local.equipped,
			starterGrantClaimed: true,
			updatedAt: 2000,
		})).toBe(false);

		expect(shouldPushLocalShopBalance({
			...local,
			balance: 1200,
			dirtyProfileFields: ["coins"],
			updatedAt: 3000,
		}, {
			balance: 999,
			ownedItemIds: [],
			equipped: local.equipped,
			starterGrantClaimed: true,
			updatedAt: 2000,
		})).toBe(true);
	});

	it("pushes only the profile fields that changed locally", () => {
		const local = normalizeShopState({
			...createDefaultShopState(),
			balance: 1200,
			ownedItemIds: ["piece_classic", "background_classic", "music_classic", "sfx_classic", "music_arcade"],
			dirtyProfileFields: ["coins"],
			updatedAt: 3000,
		});
		const remote = {
			balance: 999,
			ownedItemIds: ["piece_classic", "background_classic", "music_classic", "sfx_classic"],
			equipped: local.equipped,
			starterGrantClaimed: true,
			updatedAt: 2000,
		};

		expect(shouldPushLocalShopBalance(local, remote)).toBe(true);
		expect(shouldPushLocalShopField(local, remote, "owned_item_ids")).toBe(false);
	});

	it("uses real background scenes and quieter particles outside classic", () => {
		expect(getBackgroundScene("background_classic")).toBe("classic");
		expect(getBackgroundScene("background_ender")).toBe("ender");

		const classic = getBackgroundParticleConfig("background_classic", false);
		const ender = getBackgroundParticleConfig("background_ender", false);

		expect(ender.count).toBeGreaterThan(0);
		expect(ender.count).toBeLessThan(classic.count);
		expect(ender.maxOpacity).toBeLessThan(classic.maxOpacity);
	});
});
