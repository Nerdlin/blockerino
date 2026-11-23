import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import { cssColors } from "@/constants/Color";
import { offlineNotice, type OfflineFeature } from "@/constants/OfflineMessages";
import StylizedButton from "./StylizedButton";

// A short, calm "no connection" card for a screen that needs the server, instead of a spinner or silence.
export default function OfflineNotice({ feature, onRetry, checking = false, compact = false }: { feature: OfflineFeature; onRetry?: () => void; checking?: boolean; compact?: boolean }) {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const notice = offlineNotice(feature);

	return (
		<View style={[styles.card, compact && styles.compact, { borderColor: currentTheme.accent }]} accessibilityRole="alert">
			<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t(notice.titleKey)}</Text>
			<Text style={[styles.body, { color: currentTheme.textSecondary }]}>{t(notice.bodyKey)}</Text>
			{!compact && <Text style={[styles.hint, { color: currentTheme.textSecondary }]}>{t("offline.hint")}</Text>}
			{onRetry && notice.canRetry && (
				<StylizedButton
					text={checking ? t("offline.checking") : t("offline.retry")}
					onClick={checking ? () => undefined : onRetry}
					backgroundColor={cssColors.spaceGray}
					style={styles.button}
					textStyle={styles.buttonText}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { width: "92%", alignSelf: "center", borderWidth: 2, borderRadius: 14, padding: 16, marginVertical: 12, alignItems: "center", gap: 10 },
	compact: { padding: 10, marginVertical: 6, gap: 6 },
	title: { fontFamily: "Silkscreen", fontSize: 18, textAlign: "center" },
	body: { fontFamily: "Silkscreen", fontSize: 12, lineHeight: 18, textAlign: "center" },
	hint: { fontFamily: "Silkscreen", fontSize: 10, lineHeight: 15, textAlign: "center", opacity: 0.8 },
	button: { width: "70%", maxWidth: 240 },
	buttonText: { fontSize: 13 },
});
