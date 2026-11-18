import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/constants/Supabase";
import {
	flushSeasonPassReports,
	publishSeasonPass,
	startSeasonPassTracking,
	syncSeasonPass,
	useSeasonPass,
} from "@/constants/SeasonPass";

const FIRST_SYNC_DELAY_MS = 6000;
/** Coming back to the app asks the server again, but not more often than this. */
const RESYNC_MIN_GAP_MS = 60_000;

/**
 * Keeps the season pass alive without drawing anything: it counts the finished More Games matches, Versus matches and
 * daily tasks, sends the games waiting in the queue, and asks the server for the pass at start, on sign-in and when the
 * app comes back, so the menu dot knows when a tier is waiting.
 */
export default function SeasonPassHost() {
	// always mounted, so the menu dot holds the latest answer even while a game is on screen
	useSeasonPass();
	useEffect(() => {
		const stopTracking = startSeasonPassTracking();
		let lastSync = 0;
		const sync = () => {
			lastSync = Date.now();
			void flushSeasonPassReports().then(() => syncSeasonPass());
		};

		const startTimer = setTimeout(sync, FIRST_SYNC_DELAY_MS);
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "active" && Date.now() - lastSync > RESYNC_MIN_GAP_MS) sync();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") sync();
			if (event === "SIGNED_OUT") publishSeasonPass(null);
		});

		return () => {
			clearTimeout(startTimer);
			appStateSub.remove();
			authSub.subscription.unsubscribe();
			stopTracking();
		};
	}, []);

	return null;
}
