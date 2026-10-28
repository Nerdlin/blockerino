jest.mock("@/constants/Supabase", () => ({ supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() }, channel: jest.fn(), removeChannel: jest.fn() } }));

import { makeInviteCode, parseChessInvite } from "./ChessInvite";
import { parseFriendRatings } from "./ChessRatingsApi";

describe("chess challenge", () => {
	it("makes an eight-character code without look-alike characters", () => {
		let seed = 7;
		const rng = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		for (let i = 0; i < 50; i++) {
			const code = makeInviteCode(rng);
			expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
		}
		expect(makeInviteCode()).toHaveLength(8);
	});

	it("accepts a well-formed invite and normalises it", () => {
		const invite = parseChessInvite({ code: "abc23xyz", hostName: "  Ann  ", control: "180+2" });
		expect(invite).toEqual({ code: "ABC23XYZ", hostName: "Ann", control: expect.objectContaining({ id: "180+2", timeClass: "blitz" }) });
		expect(parseChessInvite({ code: "ABCD", control: "60+0" })?.hostName).toBe("Player");
	});

	it("refuses a bad code, a bad control or a payload that is not an object", () => {
		expect(parseChessInvite({ code: "no way!", hostName: "x", control: "180+2" })).toBeNull();
		expect(parseChessInvite({ code: "ABC", hostName: "x", control: "180+2" })).toBeNull();
		expect(parseChessInvite({ code: "ABCD1234", hostName: "x", control: "0+0" })).toBeNull();
		expect(parseChessInvite({ code: "ABCD1234", hostName: "x" })).toBeNull();
		expect(parseChessInvite(null)).toBeNull();
		expect(parseChessInvite("ABCD1234")).toBeNull();
	});

	it("cuts a very long host name", () => {
		expect(parseChessInvite({ code: "ABCD1234", hostName: "n".repeat(100), control: "180+2" })?.hostName).toHaveLength(24);
	});
});

describe("friend ratings", () => {
	it("groups the rows by friend and class", () => {
		expect(
			parseFriendRatings([
				{ friend_ref: "f1", time_class: "blitz", rating: 1234, games_played: 12 },
				{ friend_ref: "f1", time_class: "rapid", rating: 1400, games_played: 20 },
				{ friend_ref: "f2", time_class: "bullet", rating: 900, games_played: 3 },
				{ friend_ref: "f3", time_class: "hyper", rating: 900, games_played: 3 },
				{ friend_ref: 5, time_class: "blitz", rating: 1, games_played: 1 },
				null,
			])
		).toEqual({
			f1: { bullet: null, blitz: { rating: 1234, games: 12 }, rapid: { rating: 1400, games: 20 } },
			f2: { bullet: { rating: 900, games: 3 }, blitz: null, rapid: null },
		});
		expect(parseFriendRatings("nope")).toEqual({});
	});
});
