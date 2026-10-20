import fs from "fs";
import path from "path";

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("./Supabase", () => ({ supabase: {} }));

import { SHOP_ITEMS } from "./Shop";

type CatalogRow = { price: number; kind: string };

// The server price list lives in a migration. Keep it identical to the client catalog, otherwise a player
// could be offered an item the server refuses to sell (or sold one at a different price).
function readServerCatalog(): Map<string, CatalogRow> {
	const dir = path.join(__dirname, "..", "supabase", "migrations");
	const file = fs.readdirSync(dir).find((name) => name.endsWith("_shop_catalog.sql"));
	if (!file) throw new Error("shop_catalog migration not found");
	const sql = fs.readFileSync(path.join(dir, file), "utf8");
	const rows = new Map<string, CatalogRow>();
	for (const match of sql.matchAll(/^\s*\('([a-z0-9_]+)', (\d+), '(free|paid|client_secret|server_only)'\)/gm)) {
		rows.set(match[1], { price: Number(match[2]), kind: match[3] });
	}
	return rows;
}

function expectedKind(item: (typeof SHOP_ITEMS)[number]): string {
	if (item.secret) return item.id.startsWith("background_season_") ? "server_only" : "client_secret";
	return item.price > 0 ? "paid" : "free";
}

describe("server shop catalog", () => {
	const server = readServerCatalog();

	it("lists every client item with the same price and kind", () => {
		for (const item of SHOP_ITEMS) {
			expect({ id: item.id, ...server.get(item.id) }).toEqual({ id: item.id, price: item.price, kind: expectedKind(item) });
		}
	});

	it("has no item the client does not know", () => {
		const clientIds = new Set(SHOP_ITEMS.map((item) => item.id));
		const unknown = [...server.keys()].filter((id) => !clientIds.has(id));
		expect(unknown).toEqual([]);
	});
});
