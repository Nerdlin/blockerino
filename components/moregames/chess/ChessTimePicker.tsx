import Slider from "@react-native-community/slider";
import { ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useLanguage } from "@/constants/Localization";
import { useTheme } from "@/constants/Theme";
import {
	CUSTOM_BONUS_SECONDS,
	CUSTOM_MINUTES,
	EXTRA_TIME_CONTROLS,
	TIME_CLASSES,
	TIME_CONTROLS,
	TimeControl,
	customTimeControl,
	formatTimeControl,
} from "@/constants/chess/TimeControls";
import StylizedButton from "../../StylizedButton";
import { PixelIcon } from "./PixelIcon";

const OPEN_MS = 280;

/**
 * Opens and closes like an accordion: the height grows from 0 to the content's own height while the content fades
 * and slides in, and everything below is pushed down smoothly instead of jumping. The content stays mounted, so it is
 * measured once.
 */
function Accordion({ open, children }: { open: boolean; children: ReactNode }) {
	const [height, setHeight] = useState(0);
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) });
	}, [open, progress]);
	const outer = useAnimatedStyle(() => ({ height: height * progress.value, opacity: progress.value, overflow: "hidden" }));
	const inner = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * -10 }] }));
	return (
		<Animated.View style={outer} pointerEvents={open ? "auto" : "none"}>
			<Animated.View style={[local.measured, inner]} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
				{children}
			</Animated.View>
		</Animated.View>
	);
}

/**
 * The "Time" screen, like chess.com's: three presets per class, a "more time controls" fold-out with longer and
 * shorter games and a custom pair of sliders (starting minutes and bonus seconds).
 */
export function ChessTimePicker({ selected, onPick, onBack }: { selected: TimeControl; onPick: (control: TimeControl) => void; onBack: () => void }) {
	const { currentTheme } = useTheme();
	const { t } = useLanguage();
	const [more, setMore] = useState(false);
	const [minutes, setMinutes] = useState(Math.min(CUSTOM_MINUTES.max, Math.max(CUSTOM_MINUTES.min, Math.round(selected.baseSeconds / 60))));
	const [bonus, setBonus] = useState(Math.min(CUSTOM_BONUS_SECONDS.max, selected.incrementSeconds));
	const custom = customTimeControl(minutes, bonus);

	// the arrow beside "more time controls" turns as the panel opens and closes
	const turn = useSharedValue(0);
	useEffect(() => {
		turn.value = withTiming(more ? 1 : 0, { duration: OPEN_MS });
	}, [more, turn]);
	const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(turn.value, [0, 1], [90, -90])}deg` }] }));

	const chip = (control: TimeControl) => {
		const on = control.id === selected.id;
		return (
			<Pressable
				key={control.id}
				testID={`chess-tc-${control.id}`}
				accessibilityRole="button"
				accessibilityState={{ selected: on }}
				accessibilityLabel={formatTimeControl(control)}
				onPress={() => onPick(control)}
				style={[local.chip, { borderColor: on ? currentTheme.accent : "rgba(255,255,255,0.18)" }]}
			>
				<Text style={[local.chipText, { color: on ? currentTheme.accent : currentTheme.textPrimary }]}>{formatTimeControl(control)}</Text>
			</Pressable>
		);
	};

	return (
		<View style={local.screen}>
			<Text style={[local.title, { color: currentTheme.textPrimary }]}>{t("chess.time")}</Text>
			{TIME_CLASSES.map((timeClass) => {
				const base = TIME_CONTROLS.filter((control) => control.timeClass === timeClass);
				const extra = EXTRA_TIME_CONTROLS.filter((control) => control.timeClass === timeClass);
				return (
					<View key={timeClass} style={{ width: "100%" }}>
						<View style={local.heading}>
							<PixelIcon name={timeClass === "bullet" ? "bullet" : timeClass === "blitz" ? "blitz" : "rapid"} size={22} />
							<Text style={[local.headingText, { color: currentTheme.accent }]}>{t(`chess.${timeClass}`)}</Text>
						</View>
						<View style={local.grid}>{base.map(chip)}</View>
						<Accordion open={more}>
							<View style={[local.grid, { marginTop: 6 }]}>{extra.map(chip)}</View>
						</Accordion>
					</View>
				);
			})}

			<Pressable testID="chess-more-time" accessibilityRole="button" onPress={() => setMore((value) => !value)} style={local.more}>
				<Text style={[local.moreText, { color: currentTheme.textPrimary }]}>{more ? t("chess.fewerTimeControls") : t("chess.moreTimeControls")}</Text>
				<Animated.Text style={[local.arrow, { color: currentTheme.accent }, arrowStyle]}>{">"}</Animated.Text>
			</Pressable>

			<Accordion open={more}>
				<View style={[local.custom, { borderColor: "rgba(255,255,255,0.18)" }]} testID="chess-custom-time">
					<Text style={[local.label, { color: currentTheme.accent }]}>{t("chess.custom")}</Text>
					<Text style={[local.sliderLabel, { color: currentTheme.textPrimary }]}>{t("chess.initialTime", { n: minutes })}</Text>
					<Slider
						style={local.slider}
						minimumValue={CUSTOM_MINUTES.min}
						maximumValue={CUSTOM_MINUTES.max}
						step={1}
						value={minutes}
						onValueChange={(value) => setMinutes(Math.round(value))}
						minimumTrackTintColor={currentTheme.accent}
						maximumTrackTintColor="rgba(255,255,255,0.25)"
						thumbTintColor={currentTheme.accent}
					/>
					<Text style={[local.sliderLabel, { color: currentTheme.textPrimary }]}>{t("chess.bonusTime", { n: bonus })}</Text>
					<Slider
						style={local.slider}
						minimumValue={CUSTOM_BONUS_SECONDS.min}
						maximumValue={CUSTOM_BONUS_SECONDS.max}
						step={1}
						value={bonus}
						onValueChange={(value) => setBonus(Math.round(value))}
						minimumTrackTintColor={currentTheme.accent}
						maximumTrackTintColor="rgba(255,255,255,0.25)"
						thumbTintColor={currentTheme.accent}
					/>
					<Text style={[local.small, { color: currentTheme.textSecondary }]}>{formatTimeControl(custom)} · {t(`chess.${custom.timeClass}`)}</Text>
					<StylizedButton text={t("chess.select")} onClick={() => onPick(custom)} backgroundColor="#2E9E4F" style={local.button} textStyle={{ fontSize: 12 }} />
				</View>
			</Accordion>

			<StylizedButton text={t("chess.back")} onClick={onBack} backgroundColor={currentTheme.buttonSecondary} style={local.button} textStyle={{ fontSize: 12 }} />
		</View>
	);
}

const local = StyleSheet.create({
	screen: { width: "100%", maxWidth: 360, alignItems: "stretch", gap: 4 },
	measured: { position: "absolute", left: 0, right: 0, top: 0 },
	title: { fontFamily: "SilkscreenBold", fontSize: 14, textAlign: "center", marginTop: 4 },
	label: { fontFamily: "SilkscreenBold", fontSize: 11, marginTop: 10, marginBottom: 6 },
	heading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 8 },
	headingText: { fontFamily: "SilkscreenBold", fontSize: 12 },
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	chip: { flexBasis: "31%", flexGrow: 1, borderWidth: 2, borderRadius: 6, paddingVertical: 10, alignItems: "center" },
	chipText: { fontFamily: "SilkscreenBold", fontSize: 11 },
	more: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginTop: 4 },
	moreText: { fontFamily: "SilkscreenBold", fontSize: 11 },
	arrow: { fontFamily: "SilkscreenBold", fontSize: 14 },
	custom: { borderWidth: 2, borderRadius: 8, padding: 12, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", gap: 2 },
	sliderLabel: { fontFamily: "Silkscreen", fontSize: 10, marginTop: 8 },
	slider: { width: "100%", height: 36 },
	small: { fontFamily: "Silkscreen", fontSize: 10, marginTop: 6 },
	button: { minWidth: 120, height: 38, minHeight: 38, margin: 0, marginTop: 12, alignSelf: "center" },
});
