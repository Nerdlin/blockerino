import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/constants/Supabase";
import { useLanguage } from "@/constants/Localization";
import { gameAlert } from "@/constants/GameDialog";
import { emailConfirmCode } from "@/constants/EmailConfirm";
import { AppState, MenuStateType, useSetAppState } from "@/hooks/useAppState";

/**
 * The app half of "confirm email": the page's "back to the game" button opens the app with the one-time code.
 * On the device that signed up the code signs the player in (the profile screen then loads the account); on another
 * device it cannot, so the player is asked to sign in. The web game gets the code in its own address instead.
 */
export default function EmailConfirmHost() {
	const url = Linking.useURL();
	const { t } = useLanguage();
	const [setAppState] = useSetAppState();
	const handled = useRef<string | null>(null);

	useEffect(() => {
		if (Platform.OS === "web") return;
		const link = emailConfirmCode(url);
		if (!link || handled.current === url) return;
		handled.current = url;
		void (async () => {
			let signedIn = false;
			if (link.code) {
				try {
					const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
					signedIn = !error && Boolean(data.session);
				} catch {
					signedIn = false;
				}
			}
			// a password-reset link: the recovery session opens the new-password window (PasswordRecoveryHost), nothing to confirm
			if (link.recovery && signedIn) return;
			gameAlert(t("profile.emailConfirmedTitle"), t(signedIn ? "profile.emailConfirmedIn" : "profile.emailConfirmedSignIn"), [
				// the profile opens on top of the menu, so its Back button has somewhere to return to
				{ text: t("dialog.ok"), onPress: () => setAppState(new AppState(MenuStateType.PROFILE, new AppState(MenuStateType.MENU))) },
			]);
		})();
	}, [url, t, setAppState]);

	return null;
}
