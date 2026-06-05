import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./Supabase";

const DEFAULT_CONNECTION_TIMEOUT_MS = 12000;

export interface SupabaseConnectionResult {
	online: boolean;
	reason?: "timeout" | "supabase_error" | "network_error";
	message?: string;
	code?: string;
}

async function fetchWithTimeout(
	url: string,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, {
			method: "GET",
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			},
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function checkSupabaseConnectionDetails(
	timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS
): Promise<SupabaseConnectionResult> {
	try {
		const url = `${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
		const response = await fetchWithTimeout(url, timeoutMs);

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			return {
				online: false,
				reason: "supabase_error",
				message: body || `Supabase REST responded with HTTP ${response.status}.`,
				code: String(response.status),
			};
		}

		return { online: true };
	} catch (error: any) {
		if (error?.name === "AbortError") {
			return {
				online: false,
				reason: "timeout",
				message: `Supabase did not respond within ${Math.round(timeoutMs / 1000)}s.`,
			};
		}

		return {
			online: false,
			reason: "network_error",
			message: error?.message || "Network request failed.",
		};
	}
}

export async function checkSupabaseConnection(
	timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS
): Promise<boolean> {
	const result = await checkSupabaseConnectionDetails(timeoutMs);
	return result.online;
}
