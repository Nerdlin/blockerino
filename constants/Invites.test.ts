jest.mock("./Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } } }));

import { parseOnlineIds, parsePendingInvites } from "./Invites";

describe("parsePendingInvites", () => {
	it("reads the invites the server returns", () => {
		const list = parsePendingInvites([
			{ id: 7, room_id: "room-1", from: "Nina", mode: "chaos", created_at: "2026-10-25T10:00:00Z" },
			{ id: 8, room_id: "room-2", from: "Max", mode: "whatever" },
		]);
		expect(list).toEqual([
			{ id: 7, roomId: "room-1", from: "Nina", mode: "chaos" },
			{ id: 8, roomId: "room-2", from: "Max", mode: "classic" },
		]);
	});

	it("drops rows without a room or an id and anything that is not a list", () => {
		expect(parsePendingInvites([{ id: 1 }, { room_id: "x" }, null, "text"])).toEqual([]);
		expect(parsePendingInvites(null)).toEqual([]);
		expect(parsePendingInvites({ id: 1, room_id: "r" })).toEqual([]);
	});
});

describe("parseOnlineIds", () => {
	it("keeps only string ids", () => {
		expect([...parseOnlineIds(["a", 5, null, "b"])]).toEqual(["a", "b"]);
		expect(parseOnlineIds("a").size).toBe(0);
	});
});
