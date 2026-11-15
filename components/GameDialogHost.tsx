import { useEffect } from "react";
import { BackHandler, Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import StylizedButton from "./StylizedButton";
import { useTheme, opaqueColor } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { closeGameDialog, useGameDialog, type GameDialogButton } from "@/constants/GameDialog";

// The in-game message window (see constants/GameDialog.ts): dims the screen, grows in, always has a way out.
export default function GameDialogHost() {
	const dialog = useGameDialog();
	const { currentTheme } = useTheme();
	const { t } = useLanguage();

	const buttons: GameDialogButton[] = dialog && dialog.buttons.length > 0 ? dialog.buttons : [{ text: t("dialog.ok") }];
	// the system back button and Escape act like the cancel button (or OK when there is none)
	const backButton = !dialog?.cancelable ? undefined : buttons.find((button) => button.style === "cancel") ?? (buttons.length === 1 ? buttons[0] : undefined);

	useEffect(() => {
		if (!dialog) return;
		const close = () => {
			// a window that cannot be cancelled swallows the back button
			if (dialog.cancelable) closeGameDialog(dialog.id, backButton);
			return true;
		};
		const back = BackHandler.addEventListener("hardwareBackPress", close);
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
		if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("keydown", onKey);
		return () => {
			back.remove();
			if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("keydown", onKey);
		};
	}, [dialog, backButton]);

	if (!dialog) return null;

	return (
		<Animated.View key={dialog.id} entering={FadeIn.duration(180)} style={styles.backdrop}>
			<Animated.View
				entering={ZoomIn.springify().damping(16).stiffness(220)}
				style={[styles.card, { backgroundColor: opaqueColor(currentTheme.menuBackground) }]}
				accessibilityRole="alert"
			>
				<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{dialog.title}</Text>
				{dialog.message ? <Text style={[styles.message, { color: currentTheme.textSecondary }]}>{dialog.message}</Text> : null}
				<View style={[styles.buttons, buttons.length > 2 && styles.buttonsColumn]}>
					{buttons.map((button, index) => {
						const primary = button.style !== "cancel" && index === buttons.length - 1;
						return (
							<StylizedButton
								key={`${button.text ?? "ok"}-${index}`}
								text={button.text ?? t("dialog.ok")}
								onClick={() => closeGameDialog(dialog.id, button)}
								backgroundColor={button.style === "destructive" ? "#B91C1C" : primary ? currentTheme.buttonPrimary : "rgba(255,255,255,0.1)"}
								borderColor={primary || button.style === "destructive" ? undefined : "rgba(255,255,255,0.16)"}
								style={[styles.button, buttons.length > 2 && styles.buttonFull]}
								textStyle={styles.buttonText}
							/>
						);
					})}
				</View>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1000,
		elevation: 1000,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
	},
	card: {
		width: "100%",
		maxWidth: 380,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "rgb(90, 90, 90)",
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 16,
		gap: 10,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 18,
		textAlign: "center",
	},
	message: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		lineHeight: 19,
		textAlign: "center",
	},
	buttons: {
		flexDirection: "row",
		gap: 10,
		marginTop: 6,
	},
	buttonsColumn: {
		flexDirection: "column",
	},
	button: {
		flex: 1,
		minWidth: 0,
		height: 46,
		margin: 0,
		borderRadius: 12,
	},
	buttonFull: {
		flex: 0,
		alignSelf: "stretch",
	},
	buttonText: {
		fontSize: 14,
	},
});
