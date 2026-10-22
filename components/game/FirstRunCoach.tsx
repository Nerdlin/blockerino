import { StyleSheet, Text, View } from "react-native";
import StylizedButton from "../StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";

// Shown in the very first game only: two lines on how to play, gone after the first placed block.
export default function FirstRunCoach({ onDismiss }: { onDismiss: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	return (
		<View style={styles.wrapper} pointerEvents="box-none">
			<View style={[styles.card, { backgroundColor: currentTheme.menuBackground, borderColor: currentTheme.accent }]}>
				<Text style={[styles.title, { color: currentTheme.accent }]}>{t("firstrun.title")}</Text>
				<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("firstrun.drag")}</Text>
				<Text style={[styles.line, { color: currentTheme.textPrimary }]}>{t("firstrun.clear")}</Text>
				<Text style={[styles.line, { color: currentTheme.textSecondary }]}>{t("firstrun.combo")}</Text>
				<StylizedButton
					text={t("firstrun.gotIt")}
					onClick={onDismiss}
					backgroundColor={currentTheme.buttonPrimary}
					style={{ minWidth: 140, height: 40, marginTop: 6 }}
					textStyle={{ fontSize: 13 }}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 28,
		alignItems: "center",
		zIndex: 50,
	},
	card: {
		width: "88%",
		maxWidth: 420,
		borderWidth: 2,
		borderRadius: 14,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: "center",
		gap: 6,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		textAlign: "center",
	},
	line: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		textAlign: "center",
		lineHeight: 18,
	},
});
