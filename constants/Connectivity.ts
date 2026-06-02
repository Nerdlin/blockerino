import { supabase } from "./Supabase";

const DEFAULT_CONNECTION_TIMEOUT_MS = 4500;

export async function checkSupabaseConnection(
	timeoutMs: number = DEFAULT_CONNECTION_TIMEOUT_MS
): Promise<boolean> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		const timeout = new Promise<"timeout">((resolve) => {
			timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
		});

		const ping = supabase
			.from("high_scores")
			.select("id")
			.limit(1);

		const result = await Promise.race([ping, timeout]);
		if (result === "timeout") return false;

		return !result.error;
	} catch {
		return false;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}
