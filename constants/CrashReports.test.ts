const mockStore = new Map<string, string>();
const mockRpc = jest.fn();
let mockUuid = 0;

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
		setItem: jest.fn((key: string, value: string) => {
			mockStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: jest.fn((key: string) => {
			mockStore.delete(key);
			return Promise.resolve();
		}),
	},
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "2.0.0" } } }));
jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
	},
}));

import { resetAnalyticsForTests, setAnalyticsEnabled } from "./Analytics";
import { fingerprintOf, flushCrashReports, normalizeError, reportError, resetCrashReportsForTests, setCrashScreen } from "./CrashReports";

beforeEach(() => {
	mockStore.clear();
	mockRpc.mockReset();
	mockRpc.mockResolvedValue({ error: null });
	mockUuid = 0;
	resetAnalyticsForTests();
	resetCrashReportsForTests();
});

describe("fingerprintOf", () => {
	it("is stable for the same error and differs between errors", () => {
		expect(fingerprintOf("boom", "a\nb")).toBe(fingerprintOf("boom", "a\nb"));
		expect(fingerprintOf("boom", "a\nb")).not.toBe(fingerprintOf("bang", "a\nb"));
		expect(fingerprintOf("boom")).toMatch(/^[a-z0-9]{4,24}$/);
	});
});

describe("normalizeError", () => {
	it("handles errors, strings and odd values without throwing", () => {
		expect(normalizeError(new Error("x")).message).toBe("x");
		expect(normalizeError("plain").message).toBe("plain");
		expect(normalizeError({ code: 1 }).message).toBe('{"code":1}');
		expect(normalizeError(undefined).message).toBeTruthy();
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(normalizeError(circular).message).toBe("Unknown error");
	});

	it("cuts long messages and stacks", () => {
		const error = new Error("m".repeat(1000));
		error.stack = "s".repeat(5000);
		const { message, stack } = normalizeError(error);
		expect(message).toHaveLength(300);
		expect(stack).toHaveLength(2000);
	});
});

describe("reportError and flushCrashReports", () => {
	it("stores a report first and sends it with screen, version and device id", async () => {
		setCrashScreen("classic");
		await reportError(new Error("kaboom"), true);
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(true);

		await flushCrashReports();
		expect(mockRpc).toHaveBeenCalledTimes(1);
		const [fn, args] = mockRpc.mock.calls[0];
		expect(fn).toBe("report_crashes");
		expect(args.p_reports).toHaveLength(1);
		expect(args.p_reports[0]).toMatchObject({ message: "kaboom", screen: "classic", fatal: true, app_version: "2.0.0" });
		expect(args.p_reports[0].device_id).toBeTruthy();
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(false);
	});

	it("keeps reports when sending fails", async () => {
		mockRpc.mockResolvedValue({ error: { message: "offline" } });
		await reportError(new Error("kaboom"));
		await flushCrashReports();
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(true);
	});

	it("does not repeat the same non-fatal error in one session", async () => {
		const error = new Error("loop");
		await reportError(error);
		await reportError(error);
		await reportError(error);
		await flushCrashReports();
		expect(mockRpc.mock.calls[0][1].p_reports).toHaveLength(1);
	});

	it("sends nothing and drops the queue once usage statistics are switched off", async () => {
		await reportError(new Error("kaboom"));
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(true);
		await setAnalyticsEnabled(false);
		await flushCrashReports();
		expect(mockRpc).not.toHaveBeenCalled();
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(false);

		await reportError(new Error("another"));
		expect(mockStore.has("CRASH_REPORT_QUEUE")).toBe(false);
	});
});
