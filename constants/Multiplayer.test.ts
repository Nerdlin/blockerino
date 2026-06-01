import {
	getJoinRoomUpdate,
	getOpponentPlayerRole,
	getWinnerNameForRole,
} from "./Multiplayer";

describe("multiplayer room helpers", () => {
	it("publishes code rooms once the second player joins", () => {
		expect(getJoinRoomUpdate("Nerdlin", "player-2")).toEqual({
			player2_name: "Nerdlin",
			player2_id: "player-2",
			status: "playing",
			is_private: false,
		});
	});

	it("uses Anonymous when the joining player name is blank", () => {
		expect(getJoinRoomUpdate("   ", "player-2").player2_name).toBe("Anonymous");
	});

	it("awards a forfeit win to the other active player", () => {
		expect(getOpponentPlayerRole("player1")).toBe("player2");
		expect(getOpponentPlayerRole("player2")).toBe("player1");
	});

	it("formats room winner names consistently", () => {
		expect(getWinnerNameForRole("player1")).toBe("Player 1");
		expect(getWinnerNameForRole("player2")).toBe("Player 2");
		expect(getWinnerNameForRole("draw")).toBe("Draw");
	});
});
