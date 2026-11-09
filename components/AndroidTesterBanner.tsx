import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/constants/Localization";
import { TESTER_SIGNUP_URL, TESTER_OPT_IN_URL } from "@/constants/AndroidTesting";
import { openExternalLink } from "@/hooks/useDiscordSDK";

const DISMISSED_KEY = "ANDROID_TESTER_BANNER_DISMISSED";

// Web and Discord only: asks players with an Android phone to join the Google Play closed test.
export default function AndroidTesterBanner() {
	const { t } = useLanguage();
	const [visible, setVisible] = useState(false);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (Platform.OS !== "web" || !TESTER_SIGNUP_URL) return;
		let active = true;
		AsyncStorage.getItem(DISMISSED_KEY)
			.then((value) => { if (active && value !== "1") setVisible(true); })
			.catch(() => { if (active) setVisible(true); });
		return () => { active = false; };
	}, []);

	if (!visible) return null;

	const dismiss = () => {
		setVisible(false);
		AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => undefined);
	};

	return (
		<View style={styles.card}>
			<View style={styles.headerRow}>
				<Pressable style={styles.headerPress} onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
					<Text style={styles.title}>{t("tester.bannerTitle")}</Text>
				</Pressable>
				<Pressable onPress={dismiss} hitSlop={10} accessibilityLabel={t("tester.dismiss")}>
					<Text style={styles.close}>×</Text>
				</Pressable>
			</View>
			{expanded && (
				<View style={styles.body}>
					<Text style={styles.step}>{t("tester.step1")}</Text>
					<Pressable style={styles.linkButton} onPress={() => void openExternalLink(TESTER_SIGNUP_URL)}>
						<Text style={styles.linkText}>{t("tester.signUp")}</Text>
					</Pressable>
					<Text style={styles.step}>{t("tester.step2")}</Text>
					<Pressable style={styles.linkButton} onPress={() => void openExternalLink(TESTER_OPT_IN_URL)}>
						<Text style={styles.linkText}>{t("tester.optIn")}</Text>
					</Pressable>
					<Text style={styles.step}>{t("tester.step3")}</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "80%",
		maxWidth: 420,
		marginTop: 10,
		borderRadius: 8,
		borderWidth: 1.5,
		borderColor: "#3DDC84",
		backgroundColor: "rgba(61, 220, 132, 0.08)",
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	headerRow: { flexDirection: "row", alignItems: "center" },
	headerPress: { flex: 1, paddingVertical: 4 },
	title: { fontFamily: "Silkscreen", fontSize: 12, color: "#3DDC84" },
	close: { fontSize: 20, color: "rgba(255, 255, 255, 0.6)", paddingHorizontal: 4 },
	body: { marginTop: 6, gap: 6 },
	step: { fontSize: 12, color: "rgba(255, 255, 255, 0.85)" },
	linkButton: {
		alignSelf: "flex-start",
		borderRadius: 6,
		backgroundColor: "#3DDC84",
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	linkText: { fontFamily: "Silkscreen", fontSize: 11, color: "#0B1A10" },
});
