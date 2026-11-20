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
	const rowPattern = /^\s*\('([a-z0-9_]+)', (\d+), '(free|paid|client_secret|server_only)'\)/gm;
	for (const match of sql.matchAll(rowPattern)) {
		rows.set(match[1], { price: Number(match[2]), kind: match[3] });
	}
	// items added later (chest exclusives): the same rows in an INSERT INTO public.shop_catalog of a later migration
	for (const name of fs.readdirSync(dir).sort()) {
		if (name === file) continue;
		const later = fs.readFileSync(path.join(dir, name), "utf8");
		for (const block of later.matchAll(/INSERT INTO public\.shop_catalog[^;]*;/g)) {
			for (const match of block[0].matchAll(rowPattern)) rows.set(match[1], { price: Number(match[2]), kind: match[3] });
		}
	}
	// items removed from the game later: DELETE FROM public.shop_catalog WHERE item_id IN ('a', 'b');
	for (const name of fs.readdirSync(dir).sort()) {
		const later = fs.readFileSync(path.join(dir, name), "utf8");
		for (const del of later.matchAll(/DELETE FROM public\.shop_catalog WHERE item_id IN \(([^)]*)\)/g)) {
			for (const id of del[1].matchAll(/'([a-z0-9_]+)'/g)) rows.delete(id[1]);
		}
		// prices changed later: UPDATE public.shop_catalog SET price = 1400 WHERE item_id = 'a';
		for (const upd of later.matchAll(/UPDATE public\.shop_catalog SET price = (\d+) WHERE item_id = '([a-z0-9_]+)'/g)) {
			const row = rows.get(upd[2]);
			if (row) rows.set(upd[2], { ...row, price: Number(upd[1]) });
		}
	}
	return rows;
}

function expectedKind(item: (typeof SHOP_ITEMS)[number]): string {
	if (item.chestOnly || item.seasonOnly) return "server_only";
	// podium backgrounds and the season pass cosmetics (piece_season_*, background_season_*) come from the server only
	if (item.secret) return /^(piece|background)_season_/.test(item.id) ? "server_only" : "client_secret";
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
