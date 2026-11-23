jest.mock("./Supabase", () => ({ supabase: { auth: {} } }));
jest.mock("./NetworkStatus", () => ({ isOnline: jest.fn() }));

import { sessionFromStoredValue } from "./AccountSession";

const session = { access_token: "a", refresh_token: "r", user: { id: "u1" } };

describe("sessionFromStoredValue", () => {
	it("reads a session saved by the auth client", () => {
		expect(sessionFromStoredValue(JSON.stringify(session))?.user.id).toBe("u1");
	});

	it("reads the older wrapped format", () => {
		expect(sessionFromStoredValue(JSON.stringify({ currentSession: session }))?.user.id).toBe("u1");
	});

	it("returns null for nothing, garbage or an incomplete session", () => {
		expect(sessionFromStoredValue(null)).toBeNull();
		expect(sessionFromStoredValue("not json")).toBeNull();
		expect(sessionFromStoredValue(JSON.stringify({ access_token: "a" }))).toBeNull();
	});
});
