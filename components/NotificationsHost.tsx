import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useAtomValue } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import { useTheme } from "@/constants/Theme";
import { useLanguage } from "@/constants/Localization";
import { supabase } from "@/constants/Supabase";
import { MenuStateType, useAppStateValue, useSetAppState } from "@/hooks/useAppState";
import { dailyRewardOpenAtom } from "@/constants/DailyReward";
import { track } from "@/constants/Analytics";
import {
	fetchNotifications,
	markNotificationsRead,
	refreshPushRegistration,
	type AppNotification,
} from "@/constants/Notifications";
import { describeNotification, pointsToRankings } from "@/constants/NotificationText";

const MAX_LINES = 3;

// "News" popup with the player's unread notifications (overtaken, streak, season ending). It is the in-app twin
// of the push messages, so web and Discord players see them too, and a tap on a push lands here as well.
// Shown from the main menu only, and not on top of the daily reward popup.
export default function NotificationsHost() {
	const { t } = useLanguage();
	const { currentTheme } = useTheme();
	const appState = useAppStateValue();
	const [, appendAppState] = useSetAppState();
	const dailyOpen = useAtomValue(dailyRewardOpenAtom);
	const [items, setItems] = useState<AppNotification[]>([]);
	const running = useRef(false);

	const check = useCallback(async () => {
		if (running.current) return;
		running.current = true;
		try {
			const unread = await fetchNotifications();
			if (unread.length > 0) {
				setItems((current) => (current.length > 0 ? current : unread));
				track("notifications_shown", { count: unread.length });
			}
		} finally {
			running.current = false;
		}
	}, []);

	useEffect(() => {
		// After the season (2.5 s) and daily reward (4.5 s) popups.
		const startTimer = setTimeout(() => {
			void check();
			void refreshPushRegistration();
		}, 7000);
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "active") void check();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN") {
				void check();
				void refreshPushRegistration();
			}
			if (event === "SIGNED_OUT") setItems([]);
		});

		return () => {
			clearTimeout(startTimer);
			appStateSub.remove();
			authSub.subscription.unsubscribe();
		};
	}, [check]);

	if (items.length === 0 || appState.current !== MenuStateType.MENU || dailyOpen) return null;

	const dismiss = (openRankings: boolean) => {
		void markNotificationsRead(items.map((item) => item.id));
		setItems([]);
		if (openRankings) appendAppState(MenuStateType.HIGH_SCORES);
	};

	const shown = items.slice(0, MAX_LINES);
	const hasRankings = items.some(pointsToRankings);

	return (
		<SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
			<Text style={[styles.title, { color: currentTheme.buttonPrimary }]}>{t("notif.title")}</Text>

			<View style={styles.block}>
				{shown.map((item) => (
					<Text key={item.id} style={[styles.line, { color: currentTheme.textPrimary }]}>
						{describeNotification(item, t)}
					</Text>
				))}
				{items.length > shown.length && (
					<Text style={[styles.note, { color: currentTheme.textSecondary }]}>+{items.length - shown.length}</Text>
				)}
			</View>

			<View style={styles.buttons}>
				{hasRankings && (
					<StylizedButton text={t("notif.viewRankings")} onClick={() => dismiss(true)} backgroundColor={currentTheme.buttonPrimary} />
				)}
				<StylizedButton text={t("notif.ok")} onClick={() => dismiss(false)} backgroundColor={currentTheme.buttonSecondary} />
			</View>
		</SimplePopupView>
	);
}

const styles = StyleSheet.create({
	title: {
		fontFamily: "Silkscreen",
		fontSize: 24,
		textAlign: "center",
		marginBottom: 16,
	},
	block: {
		alignItems: "center",
		gap: 10,
		marginBottom: 16,
	},
	line: {
		fontFamily: "Silkscreen",
		fontSize: 13,
		textAlign: "center",
		lineHeight: 20,
	},
	note: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	buttons: {
		gap: 8,
		alignItems: "center",
		marginTop: 8,
	},
});
