import { rankFriendSuggestions } from "./FriendSearch";

describe("friend search suggestions", () => {
	it("puts exact matches first, then prefix matches, then shorter names", () => {
		const names = ["xAlctraz_9637", "Alctraz_9637", "alctraz", "Alctrazz"].map((player_name) => ({ player_name }));
		expect(rankFriendSuggestions(names, "Alctraz").map((p) => p.player_name)).toEqual(["alctraz", "Alctrazz", "Alctraz_9637", "xAlctraz_9637"]);
	});
});
