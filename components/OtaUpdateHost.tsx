import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import { useLanguage } from "@/constants/Localization";
import { gameAlert } from "@/constants/GameDialog";
import { MenuStateType, useAppStateValue } from "@/hooks/useAppState";

const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Updates over the air: the app downloads them in the background, but they only start after a restart, so players
 * could not tell whether they already had one. This looks for an update on start and whenever the app comes back
 * (at most every 10 minutes), downloads it, and once it is ready asks, in the menu (never during a game), to restart.
 */
export default function OtaUpdateHost() {
	const enabled = Platform.OS !== "web" && !__DEV__ && Updates.isEnabled;
	const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
	const { t } = useLanguage();
	const appState = useAppStateValue();
	const inMenu = appState.current === MenuStateType.MENU;
	const lastCheck = useRef(0);
	// the update the player already said "later" to, until the next start
	const asked = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled) return;
		const check = async () => {
			if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
			lastCheck.current = Date.now();
			try {
				const result = await Updates.checkForUpdateAsync();
				if (result.isAvailable) await Updates.fetchUpdateAsync();
			} catch {
				// offline or the update server is busy: the next check tries again
			}
		};
		void check();
		const subscription = AppState.addEventListener("change", (next) => {
			if (next === "active") void check();
		});
		return () => subscription.remove();
	}, [enabled]);

	useEffect(() => {
		if (!enabled || !isUpdatePending || !inMenu) return;
		const id = downloadedUpdate?.updateId ?? "pending";
		if (asked.current === id) return;
		asked.current = id;
		gameAlert(t("update.otaTitle"), t("update.otaMessage"), [
			{ text: t("update.otaLater"), style: "cancel" },
			{ text: t("update.otaRestart"), onPress: () => void Updates.reloadAsync().catch(() => undefined) },
		]);
	}, [enabled, isUpdatePending, inMenu, downloadedUpdate, t]);

	return null;
}
