jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { SHOP_ITEMS } from "../Shop";
import { SHOP_ITEM_IDS_WITH_RU, shopItemText } from "./shopItems";

describe("shop item text", () => {
	it("has a Russian name and description for every item", () => {
		const missing = SHOP_ITEMS.map((item) => item.id).filter((id) => !SHOP_ITEM_IDS_WITH_RU.includes(id));
		expect(missing).toEqual([]);
	});

	it("keeps the English text in English", () => {
		const item = SHOP_ITEMS.find((entry) => entry.id === "piece_lava")!;
		expect(shopItemText(item, "en").title).toBe("Lava Forge");
		expect(shopItemText(item, "ru").title).toBe("Лавовая кузня");
	});
});
