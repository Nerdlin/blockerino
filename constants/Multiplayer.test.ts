import {
	getJoinRoomUpdate,
	getStaleRoomCutoffs,
	getOpponentPlayerRole,
	getWinnerNameForRole,
	isPlayerNameReady,
	isVisiblePublicRoom,
	normalizePlayerName,
	ROOM_RETENTION_MS,
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

	it("computes stale room cutoffs for matchmaking cleanup", () => {
		const now = new Date("2026-06-02T18:00:00.000Z").getTime();
		const cutoffs = getStaleRoomCutoffs(now);

		expect(cutoffs.publicWaiting).toBe(new Date(now - ROOM_RETENTION_MS.publicWaiting).toISOString());
		expect(cutoffs.privateWaiting).toBe(new Date(now - ROOM_RETENTION_MS.privateWaiting).toISOString());
		expect(cutoffs.playing).toBe(new Date(now - ROOM_RETENTION_MS.playing).toISOString());
		expect(cutoffs.finished).toBe(new Date(now - ROOM_RETENTION_MS.finished).toISOString());
		expect(cutoffs.absolute).toBe(new Date(now - ROOM_RETENTION_MS.absolute).toISOString());
	});

	it("hides stale or finished public rooms from the lobby", () => {
		const now = new Date("2026-06-02T18:00:00.000Z").getTime();

		expect(isVisiblePublicRoom({
			status: "waiting",
			is_private: false,
			created_at: new Date(now - ROOM_RETENTION_MS.publicWaiting + 1000).toISOString(),
		}, now)).toBe(true);

		expect(isVisiblePublicRoom({
			status: "waiting",
			is_private: false,
			created_at: new Date(now - ROOM_RETENTION_MS.publicWaiting - 1000).toISOString(),
		}, now)).toBe(false);

		expect(isVisiblePublicRoom({
			status: "playing",
			is_private: false,
			created_at: new Date(now - ROOM_RETENTION_MS.playing + 1000).toISOString(),
		}, now)).toBe(true);

		expect(isVisiblePublicRoom({
			status: "finished",
			is_private: false,
			created_at: new Date(now).toISOString(),
		}, now)).toBe(false);

		expect(isVisiblePublicRoom({
			status: "waiting",
			is_private: true,
			created_at: new Date(now).toISOString(),
		}, now)).toBe(false);
	});
});
