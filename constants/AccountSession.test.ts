const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();
jest.mock("./Supabase", () => ({ supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a), signInAnonymously: (...a: unknown[]) => mockSignInAnonymously(...a) } } }));

import { accountSessionOf, ensureOnlineIdentity, getAccountSession, isAnonymousSession } from "./AccountSession";

const real = { user: { id: "u-real", is_anonymous: false } } as any;
const guest = { user: { id: "u-guest", is_anonymous: true } } as any;

beforeEach(() => {
	mockGetSession.mockReset();
	mockSignInAnonymously.mockReset();
});

test("a guest's anonymous session reads as signed out", async () => {
	expect(isAnonymousSession(guest)).toBe(true);
	expect(accountSessionOf(guest)).toBeNull();
	expect(accountSessionOf(real)).toBe(real);
	mockGetSession.mockResolvedValue({ data: { session: guest }, error: null });
	expect((await getAccountSession()).data.session).toBeNull();
	mockGetSession.mockResolvedValue({ data: { session: real }, error: null });
	expect((await getAccountSession()).data.session).toBe(real);
});

test("online identity: the existing session, else a new anonymous account, else none", async () => {
	mockGetSession.mockResolvedValue({ data: { session: real } });
	expect(await ensureOnlineIdentity()).toBe("u-real");
	expect(mockSignInAnonymously).not.toHaveBeenCalled();

	mockGetSession.mockResolvedValue({ data: { session: null } });
	mockSignInAnonymously.mockResolvedValue({ data: { user: { id: "u-new" } }, error: null });
	expect(await ensureOnlineIdentity()).toBe("u-new");

	// the server does not allow anonymous sign-ins yet: the caller keeps its device id
	mockSignInAnonymously.mockResolvedValue({ data: { user: null }, error: { message: "Anonymous sign-ins are disabled" } });
	expect(await ensureOnlineIdentity()).toBeNull();
});

test("two callers at once make one anonymous account", async () => {
	mockGetSession.mockResolvedValue({ data: { session: null } });
	mockSignInAnonymously.mockResolvedValue({ data: { user: { id: "u-once" } }, error: null });
	const [a, b] = await Promise.all([ensureOnlineIdentity(), ensureOnlineIdentity()]);
	expect([a, b]).toEqual(["u-once", "u-once"]);
	expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
});
