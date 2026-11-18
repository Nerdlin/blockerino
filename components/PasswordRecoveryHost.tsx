import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/constants/Supabase";
import { useLanguage } from "@/constants/Localization";
import StylizedButton from "./StylizedButton";

const MIN_PASSWORD_LENGTH = 6;

/**
 * The last step of "forgot password": the reset link signs the player in with a recovery session and Supabase emits
 * PASSWORD_RECOVERY; this asks for the new password and saves it.
 */
export default function PasswordRecoveryHost() {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	useEffect(() => {
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "PASSWORD_RECOVERY") {
				setPassword("");
				setConfirm("");
				setError("");
				setDone(false);
				setOpen(true);
			}
		});
		return () => data.subscription.unsubscribe();
	}, []);

	if (!open) return null;

	const save = async () => {
		if (password.length < MIN_PASSWORD_LENGTH) return setError(t("profile.newPasswordShort", { count: MIN_PASSWORD_LENGTH }));
		if (password !== confirm) return setError(t("profile.newPasswordMismatch"));
		setBusy(true);
		setError("");
		try {
			const { error: updateError } = await supabase.auth.updateUser({ password });
			if (updateError) setError(updateError.message || t("profile.newPasswordFailed"));
			else setDone(true);
		} catch {
			setError(t("profile.newPasswordFailed"));
		}
		setBusy(false);
	};

	return (
		<View style={styles.overlay}>
			<View style={styles.card}>
				<Text style={styles.title}>{t("profile.newPasswordTitle")}</Text>
				{done ? (
					<>
						<Text style={styles.ok}>{t("profile.newPasswordDone")}</Text>
						<StylizedButton text={t("dialog.ok")} backgroundColor="#10B981" onClick={() => setOpen(false)} />
					</>
				) : (
					<>
						<TextInput
							style={styles.input}
							placeholder={t("profile.newPasswordPlaceholder")}
							placeholderTextColor="#9CA3AF"
							value={password}
							onChangeText={setPassword}
							secureTextEntry
						/>
						<TextInput
							style={styles.input}
							placeholder={t("profile.newPasswordConfirm")}
							placeholderTextColor="#9CA3AF"
							value={confirm}
							onChangeText={setConfirm}
							secureTextEntry
						/>
						{error ? <Text style={styles.error}>{error}</Text> : null}
						<StylizedButton text={busy ? "..." : t("profile.newPasswordSave")} backgroundColor="#10B981" disabled={busy} onClick={() => void save()} />
						<StylizedButton text={t("common.cancel")} backgroundColor="rgb(90, 90, 90)" onClick={() => setOpen(false)} />
					</>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFillObject,
		zIndex: 10000,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	card: {
		width: "100%",
		maxWidth: 380,
		padding: 16,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.3)",
		backgroundColor: "#16161f",
		alignItems: "center",
		gap: 8,
	},
	title: { fontFamily: "Silkscreen", fontSize: 16, color: "#FFFFFF", textAlign: "center", marginBottom: 6 },
	input: {
		width: "100%",
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#FFFFFF",
		padding: 10,
		borderWidth: 2,
		borderRadius: 8,
		borderColor: "rgba(255, 255, 255, 0.4)",
	},
	error: { fontFamily: "Silkscreen", fontSize: 11, color: "#FF6B6B", textAlign: "center" },
	ok: { fontFamily: "Silkscreen", fontSize: 12, color: "#86EFAC", textAlign: "center", marginBottom: 6 },
});
