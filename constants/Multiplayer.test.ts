import {
	getJoinRoomUpdate,
	getOpponentPlayerRole,
	getWinnerNameForRole,
	isPlayerNameReady,
	normalizePlayerName,
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

	it("trims player names without assigning Anonymous", () => {
		expect(normalizePlayerName("  Nerdlin  ")).toBe("Nerdlin");
		expect(normalizePlayerName("   ")).toBe("");
	});

	it("rejects blank player names before joining rooms", () => {
		expect(isPlayerNameReady("Nerdlin")).toBe(true);
		expect(isPlayerNameReady("   ")).toBe(false);
		expect(() => getJoinRoomUpdate("   ", "player-2")).toThrow("Player name is required");
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
