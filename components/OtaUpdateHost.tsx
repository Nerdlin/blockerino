import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import { useLanguage } from "@/constants/Localization";
import { gameAlert } from "@/constants/GameDialog";
import { MenuStateType, useAppStateValue } from "@/hooks/useAppState";
import { supabase } from "@/constants/Supabase";

/** app_config "ota" = {"mandatory": true}: a downloaded update must be installed, there is no "later". */
async function updateIsMandatory(): Promise<boolean> {
	try {
		const { data } = await supabase.from("app_config").select("value").eq("key", "ota").maybeSingle();
		return Boolean((data?.value as { mandatory?: boolean } | null)?.mandatory);
	} catch {
		return false;
	}
}

const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Updates over the air: the app downloads them in the background, but they only start after a restart, so players
 * could not tell whether they already had one. This looks for an update on start and whenever the app comes back
 * (at most every 10 minutes), downloads it, and once it is ready asks, in the menu (never during a game), to restart.
 * When the release is marked mandatory in app_config, the question has no "later" and comes back on every menu visit.
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
		const restart = { text: t("update.otaRestart"), onPress: () => void Updates.reloadAsync().catch(() => undefined) };
		void updateIsMandatory().then((mandatory) => {
			if (mandatory) {
				asked.current = null; // ask again next time the player is in the menu
				gameAlert(t("update.otaMandatoryTitle"), t("update.otaMandatoryMessage"), [restart]);
			} else {
				gameAlert(t("update.otaTitle"), t("update.otaMessage"), [{ text: t("update.otaLater"), style: "cancel" }, restart]);
			}
		});
	}, [enabled, isUpdatePending, inMenu, downloadedUpdate, t]);

	return null;
}
