jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { checkSupabaseConnectionDetails } from "./Connectivity";

describe("checkSupabaseConnectionDetails", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	it("returns online when Supabase REST responds", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: jest.fn().mockResolvedValue("[]"),
		}) as any;

		await expect(checkSupabaseConnectionDetails(1000)).resolves.toEqual({ online: true });
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/rest/v1/profiles"),
			expect.objectContaining({
				headers: expect.objectContaining({
					apikey: expect.any(String),
					Authorization: expect.stringContaining("Bearer "),
				}),
			})
		);
	});

	it("reports Supabase HTTP errors separately from offline errors", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 403,
			text: jest.fn().mockResolvedValue("permission denied"),
		}) as any;

		await expect(checkSupabaseConnectionDetails(1000)).resolves.toMatchObject({
			online: false,
			reason: "supabase_error",
			code: "403",
			message: "permission denied",
		});
	});

	it("reports aborts as timeouts", async () => {
		const abortError = new Error("Aborted");
		abortError.name = "AbortError";
		global.fetch = jest.fn().mockRejectedValue(abortError) as any;

		await expect(checkSupabaseConnectionDetails(1000)).resolves.toMatchObject({
			online: false,
			reason: "timeout",
		});
	});
});
