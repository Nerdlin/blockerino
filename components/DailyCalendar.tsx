import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import type { CalendarDay, ChestSize } from "@/constants/DailyReward";

const GOLD = "#FFD700";

/** A pixel chest drawn from boxes: wooden body, a lid, a gold band and lock. The big one is golden. */
export function PixelChest({ size, kind = "small", open = false }: { size: number; kind?: ChestSize; open?: boolean }) {
	const big = kind === "big";
	const wood = big ? "#B8860B" : "#8B5A2B";
	const woodDark = big ? "#7A5A00" : "#5C3A1A";
	const band = big ? "#FFF3B0" : GOLD;
	const u = size / 12;
	return (
		<View style={{ width: size, height: size }}>
			{/* lid */}
			<View style={{ position: "absolute", left: u, top: open ? 0 : 2 * u, width: 10 * u, height: 4 * u, backgroundColor: wood, borderWidth: Math.max(1, u * 0.6), borderColor: woodDark, transform: open ? [{ rotate: "-14deg" }, { translateY: -u }] : [] }} />
			{/* body */}
			<View style={{ position: "absolute", left: u, top: 6 * u, width: 10 * u, height: 5 * u, backgroundColor: wood, borderWidth: Math.max(1, u * 0.6), borderColor: woodDark }} />
			{/* band and lock */}
			<View style={{ position: "absolute", left: 5.25 * u, top: open ? 1 * u : 3 * u, width: 1.5 * u, height: open ? 9.5 * u : 7.5 * u, backgroundColor: band }} />
			<View style={{ position: "absolute", left: 4.75 * u, top: 6.25 * u, width: 2.5 * u, height: 2.5 * u, backgroundColor: band, borderWidth: Math.max(1, u * 0.4), borderColor: woodDark }} />
			{open && <View style={{ position: "absolute", left: 2 * u, top: 5.2 * u, width: 8 * u, height: 1.2 * u, backgroundColor: "#FFF6C8", opacity: 0.9 }} />}
		</View>
	);
}

function TodayGlow({ children }: { children: React.ReactNode }) {
	const pulse = useSharedValue(1);
	useEffect(() => {
		pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1, false);
	}, [pulse]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
	return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The season calendar: 4 weeks of 7 days. Collected days are ticked, today glows, chests sit on days 7, 14, 21, 28.
 * `collected` is how many days are already taken; `today` is the day the claim button takes (or took).
 */
/** The calendar date of streak day `day` when `today` is the streak day of the current date. */
export function dateOfStreakDay(day: number, today: number, now: Date = new Date()): Date {
	const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	date.setDate(date.getDate() + (day - today));
	return date;
}

export default function DailyCalendar({ calendar, collected, today, weekdays }: { calendar: CalendarDay[]; collected: number; today: number; weekdays: string[] }) {
	const { width } = useWindowDimensions();
	const cell = Math.max(30, Math.min(48, Math.floor((Math.min(width * 0.9, 480) - 56) / 7)));
	const weeks: CalendarDay[][] = [];
	for (let i = 0; i < calendar.length; i += 7) weeks.push(calendar.slice(i, i + 7));

	return (
		<View style={styles.wrap} testID="daily-calendar">
			{weeks.map((week, w) => (
				<View key={w} style={styles.week}>
					{week.map((entry) => {
						const done = entry.day <= collected;
						const isToday = entry.day === today && !done;
						const big = entry.chest === "big";
						const content = (
							<View
								style={[
									styles.cell,
									{ width: cell, height: cell + 20 },
									entry.chest && styles.chestCell,
									big && styles.bigCell,
									done && styles.doneCell,
									isToday && styles.todayCell,
								]}
							>
								{(() => {
									const date = dateOfStreakDay(entry.day, today);
									return (
										<View style={styles.dateBox}>
											<Text style={[styles.weekday, done && styles.dimText, (date.getDay() === 0 || date.getDay() === 6) && styles.weekend]} numberOfLines={1}>{weekdays[(date.getDay() + 6) % 7]}</Text>
											<Text style={[styles.dayLabel, done && styles.dimText]} numberOfLines={1}>{date.getDate()}</Text>
										</View>
									);
								})()}
								{entry.chest ? (
									<PixelChest size={Math.round(cell * 0.62)} kind={entry.chest} open={done} />
								) : (
									<Text style={[styles.coins, { fontSize: cell >= 40 ? 11 : 9 }, done && styles.dimText]} numberOfLines={1}>{entry.coins}</Text>
								)}
								{done && <Text style={styles.tick}>✓</Text>}
							</View>
						);
						return <View key={entry.day}>{isToday ? <TodayGlow>{content}</TodayGlow> : content}</View>;
					})}
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		gap: 6,
		alignItems: "center",
	},
	week: {
		flexDirection: "row",
		gap: 4,
	},
	cell: {
		borderRadius: 6,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.14)",
		backgroundColor: "rgba(255,255,255,0.05)",
		alignItems: "center",
		justifyContent: "space-evenly",
		paddingVertical: 2,
	},
	chestCell: {
		borderColor: "rgba(255,215,0,0.45)",
		backgroundColor: "rgba(255,215,0,0.08)",
	},
	bigCell: {
		borderColor: GOLD,
		backgroundColor: "rgba(255,215,0,0.16)",
	},
	doneCell: {
		backgroundColor: "rgba(0,200,80,0.12)",
		borderColor: "rgba(0,200,80,0.45)",
	},
	todayCell: {
		borderColor: GOLD,
		backgroundColor: "rgba(255,215,0,0.22)",
	},
	dateBox: {
		alignItems: "center",
	},
	weekday: {
		fontFamily: "Silkscreen",
		fontSize: 7,
		color: "rgba(255,255,255,0.55)",
	},
	weekend: {
		color: "#FF8A8A",
	},
	dayLabel: {
		fontFamily: "Silkscreen",
		fontSize: 8,
		color: "rgba(255,255,255,0.7)",
	},
	coins: {
		fontFamily: "Silkscreen",
		color: GOLD,
	},
	dimText: {
		opacity: 0.45,
	},
	tick: {
		position: "absolute",
		right: 2,
		top: 0,
		fontSize: 10,
		color: "#00C850",
		fontWeight: "bold",
	},
});
