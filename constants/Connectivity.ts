import { supabase } from "./Supabase";

const DEFAULT_CONNECTION_TIMEOUT_MS = 12000;

export interface SupabaseConnectionResult {
	online: boolean;
	reason?: "timeout" | "supabase_error" | "network_error";
	message?: string;
	code?: string;
}

export async function checkSupabaseConnectionDetails(
	timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS
): Promise<SupabaseConnectionResult> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		const timeout = new Promise<"timeout">((resolve) => {
			timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
		});

		const ping = supabase
			.from("profiles")
			.select("id")
			.limit(1);

		const result = await Promise.race([ping, timeout]);
		if (result === "timeout") {
			return {
				online: false,
				reason: "timeout",
				message: `Supabase did not respond within ${Math.round(timeoutMs / 1000)}s.`,
			};
		}

		if (result.error) {
			return {
				online: false,
				reason: "supabase_error",
				message: result.error.message,
				code: result.error.code,
			};
		}

		return { online: true };
	} catch (error: any) {
		return {
			online: false,
			reason: "network_error",
			message: error?.message || "Network request failed.",
		};
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

export async function checkSupabaseConnection(
	timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS
): Promise<boolean> {
	const result = await checkSupabaseConnectionDetails(timeoutMs);
	return result.online;
}
