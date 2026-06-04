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
		expect(getShopItemsByCategory("piece_skin").filter((item) => !item.secret)).toHaveLength(25);
		expect(getShopItemsByCategory("background").filter((item) => !item.secret)).toHaveLength(25);
		expect(getShopItemsByCategory("music").filter((item) => !item.secret)).toHaveLength(25);
		expect(getShopItemsByCategory("sfx").filter((item) => !item.secret)).toHaveLength(25);
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

	it("uses real background scenes and quieter particles outside classic", () => {
		expect(getBackgroundScene("background_classic")).toBe("classic");
		expect(getBackgroundScene("background_ender")).toBe("ender");

		const classic = getBackgroundParticleConfig("background_classic", false);
		const ender = getBackgroundParticleConfig("background_ender", false);

		expect(ender.count).toBe(0);
		expect(ender.count).toBeLessThan(classic.count);
		expect(ender.maxOpacity).toBeLessThan(classic.maxOpacity);
	});
});
