import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/constants/Localization";
import { PLAY_STORE_URL } from "@/constants/PlayStore";
import { openExternalLink } from "@/hooks/useDiscordSDK";

const DISMISSED_KEY = "ANDROID_PLAY_BANNER_DISMISSED";

// Web and Discord only: points players on an Android phone to the game's page in Google Play.
export default function AndroidPlayBanner() {
	const { t } = useLanguage();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (Platform.OS !== "web" || typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return;
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
			<Pressable style={styles.headerPress} onPress={() => void openExternalLink(PLAY_STORE_URL)} accessibilityRole="link">
				<Text style={styles.title}>{t("play.bannerTitle")}</Text>
			</Pressable>
			<Pressable onPress={dismiss} hitSlop={10} accessibilityLabel={t("play.dismiss")}>
				<Text style={styles.close}>×</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		alignItems: "center",
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
	headerPress: { flex: 1, paddingVertical: 4 },
	title: { fontFamily: "Silkscreen", fontSize: 12, color: "#3DDC84" },
	close: { fontSize: 20, color: "rgba(255, 255, 255, 0.6)", paddingHorizontal: 4 },
});
