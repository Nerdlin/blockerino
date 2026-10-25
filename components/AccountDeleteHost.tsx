import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { atom, useAtom } from "jotai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { opaqueColor, useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { useSoundSettings } from "@/constants/Sound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { MenuStateType, useSetAppState } from "@/hooks/useAppState";
import { supabase } from "@/constants/Supabase";
import { track } from "@/constants/Analytics";

/** The Profile screen sets this to true; the host below asks for confirmation and deletes the account. */
export const deleteAccountOpenAtom = atom(false);

const PLAYER_ID_KEY = "PLAYER_ID";
const PLAYER_NAME_KEY = "PLAYER_NAME";

// Deleting the account is final: the server (delete_my_account) removes the profile and everything tied to it, then
// the device signs out. Scores and settings kept on the phone itself stay, as they do after a normal log out.
export default function AccountDeleteHost() {
	const [open, setOpen] = useAtom(deleteAccountOpenAtom);
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const { playSfx } = useSoundSettings();
	const [setAppState] = useSetAppState();
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const close = () => {
		if (busy) return;
		void playSfx("menuClick");
		setFailed(false);
		setOpen(false);
	};
	useEscapeKey(close);

	if (!open) return null;

	const confirm = async () => {
		if (busy) return;
		void playSfx("menuClick");
		setBusy(true);
		setFailed(false);
		try {
			const { data, error } = await supabase.rpc("delete_my_account");
			if (error || !data || (data as { status?: unknown }).status !== "ok") throw error ?? new Error("not deleted");
			track("account_deleted");
			await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
			await AsyncStorage.multiRemove([PLAYER_ID_KEY, PLAYER_NAME_KEY]).catch(() => undefined);
			setBusy(false);
			setOpen(false);
			// Back to the main menu: the Profile screen would still show the old account.
			setAppState(MenuStateType.MENU);
		} catch {
			setBusy(false);
			setFailed(true);
		}
	};

	return (
		<>
			<Pressable accessibilityLabel={t("acct.cancel")} onPress={close} style={styles.scrim} />
			<SimplePopupView style={[{ backgroundColor: opaqueColor(currentTheme.menuBackground), height: "auto", maxHeight: 480 }]}>
				<View style={styles.column}>
					<Text style={[styles.title, { color: "#F87171" }]}>{t("acct.title")}</Text>
					<Text style={[styles.body, { color: currentTheme.textPrimary }]}>{t("acct.body")}</Text>
					<Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("acct.keeps")}</Text>
					{failed && <Text style={[styles.hint, { color: "#F87171" }]}>{t("acct.failed")}</Text>}
					<StylizedButton text={busy ? "..." : t("acct.confirm")} onClick={confirm} disabled={busy} backgroundColor="rgb(200,50,50)" style={styles.button} />
					<StylizedButton text={t("acct.cancel")} onClick={close} disabled={busy} backgroundColor={currentTheme.buttonSecondary} style={styles.button} />
				</View>
			</SimplePopupView>
		</>
	);
}

const styles = StyleSheet.create({
	scrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 100,
		backgroundColor: "rgba(4, 3, 10, 0.92)",
	},
	column: {
		width: "100%",
		alignItems: "center",
		gap: 10,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	body: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
		lineHeight: 18,
	},
	hint: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
		marginBottom: 6,
	},
	button: {
		minWidth: 220,
		margin: 0,
	},
});
