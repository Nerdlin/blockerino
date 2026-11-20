jest.mock("./GameInvite", () => ({ INVITE_GAMES: ["durak", "battleship", "tictactoe", "checkers"] }));
jest.mock("react-native", () => ({ Platform: { OS: "android" }, Share: { share: jest.fn() }, Clipboard: { setString: jest.fn() } }));

import { buildJoinLink, parseJoinLink } from "./JoinLink";

describe("room links", () => {
	it("builds a link to the join page", () => {
		expect(buildJoinLink("versus", "2ae841")).toBe("https://blockerino.aionerdlin.me/join.html?g=versus&c=2AE841");
	});

	it("reads the app link and the web game's address", () => {
		expect(parseJoinLink("com.nerdlin.blockerino://join?g=durak&c=AB12CD")).toEqual({ game: "durak", code: "AB12CD" });
		expect(parseJoinLink("?join=checkers%3Ax9y8z7")).toEqual({ game: "checkers", code: "X9Y8Z7" });
		expect(parseJoinLink("com.nerdlin.blockerino://join?g=chess&c=57YDJ")).toEqual({ game: "chess", code: "57YDJ" });
		expect(parseJoinLink("https://blockerino.aionerdlin.me/?join=versus:2AE841")).toEqual({ game: "versus", code: "2AE841" });
	});

	it("ignores other links and made-up games or codes", () => {
		expect(parseJoinLink("com.nerdlin.blockerino://email-confirmed?code=abc")).toBeNull();
		expect(parseJoinLink("com.nerdlin.blockerino://join?g=poker&c=AB12CD")).toBeNull();
		expect(parseJoinLink("?join=versus:<script>")).toBeNull();
		expect(parseJoinLink(null)).toBeNull();
	});
});
