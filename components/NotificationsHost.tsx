import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useAtomValue } from "jotai";
import SimplePopupView from "./SimplePopupView";
import StylizedButton from "./StylizedButton";
import UiIcon from "./UiIcon";
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
import { describeNotification, notificationStyle, pointsToRankings } from "@/constants/NotificationText";

const MAX_CARDS = 3;

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

	const shown = items.slice(0, MAX_CARDS);
	const hidden = items.length - shown.length;
	const hasRankings = items.some(pointsToRankings);

	return (
		<SimplePopupView style={[{ backgroundColor: currentTheme.menuBackground }]}>
			<View style={styles.header}>
				<Text style={[styles.title, { color: currentTheme.textPrimary }]}>{t("notif.title")}</Text>
				<View style={[styles.countPill, { backgroundColor: currentTheme.buttonPrimary }]}>
					<Text style={styles.countText}>{items.length}</Text>
				</View>
			</View>

			<View style={styles.cards}>
				{shown.map((item) => {
					const { glyph, color } = notificationStyle(item.kind);
					const lines = describeNotification(item, t);
					return (
						<View key={item.id} style={styles.card}>
							<View style={[styles.accentBar, { backgroundColor: color }]} />
							<View style={[styles.iconBox, { borderColor: color }]}>
								<UiIcon name={glyph} size={27} />
							</View>
							<View style={styles.cardText}>
								<Text style={[styles.cardTitle, { color: currentTheme.textPrimary }]}>{lines.title}</Text>
								<Text style={[styles.cardDetail, { color: currentTheme.textSecondary }]}>{lines.detail}</Text>
							</View>
						</View>
					);
				})}
				{hidden > 0 && (
					<Text style={[styles.more, { color: currentTheme.textSecondary }]}>{t("notif.more", { count: hidden })}</Text>
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
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginBottom: 18,
	},
	title: {
		fontFamily: "Silkscreen",
		fontSize: 22,
	},
	countPill: {
		minWidth: 26,
		height: 26,
		borderRadius: 13,
		paddingHorizontal: 7,
		alignItems: "center",
		justifyContent: "center",
	},
	countText: {
		fontFamily: "SilkscreenBold",
		fontSize: 12,
		color: "#FFFFFF",
	},
	cards: {
		width: "100%",
		gap: 10,
		marginBottom: 18,
	},
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingRight: 12,
		borderRadius: 10,
		backgroundColor: "rgba(255, 255, 255, 0.06)",
		overflow: "hidden",
	},
	accentBar: {
		alignSelf: "stretch",
		width: 4,
	},
	iconBox: {
		width: 44,
		height: 44,
		borderRadius: 10,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.35)",
	},
	cardText: {
		flex: 1,
		gap: 4,
	},
	cardTitle: {
		fontFamily: "SilkscreenBold",
		fontSize: 13,
	},
	cardDetail: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		lineHeight: 16,
	},
	more: {
		fontFamily: "Silkscreen",
		fontSize: 11,
		textAlign: "center",
	},
	buttons: {
		gap: 8,
		alignItems: "center",
	},
});
