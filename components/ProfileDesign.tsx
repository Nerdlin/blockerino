import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import FadeInView from "./FadeInView";
import UiIcon from "./UiIcon";
import AchievementIcon from "./AchievementIcon";
import { useTheme } from "@/constants/Theme";
import { nameFontFamily } from "@/constants/NameFont";
import type { UiGlyphName } from "@/constants/UiGlyphs";
import { RARITY_CLASS_COLORS, formatRarityPercent, rarityClass, type RarityClass } from "@/constants/AchievementRarity";

// The pieces of another player's profile (components/PlayerProfileHost.tsx), in one look: a coloured banner with the
// hero, small grey section labels, big numbers with an icon and no frames around them, chunky score badges and a row
// of achievement medals. Everything eases in one after another.

/** The colour with the given opacity: hex or rgb() in, rgba() out (a plain "#RRGGBB" + "2E" breaks on rgb() colours). */
export function withAlpha(color: string, alpha: number): string {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (hex) {
		const h = hex[1].length === 3 ? hex[1].split("").map((ch) => ch + ch).join("") : hex[1];
		const n = parseInt(h, 16);
		return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
	}
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
	if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
	return color;
}

/** A number that counts up from zero when it appears. */
export function CountUp({ value, style, suffix = "" }: { value: number; style?: object; suffix?: string }) {
	const [shown, setShown] = useState(0);
	useEffect(() => {
		if (!Number.isFinite(value) || value <= 0) {
			setShown(0);
			return;
		}
		const start = Date.now();
		const duration = Math.min(900, 350 + Math.log10(value + 1) * 120);
		let frame = 0;
		const tick = () => {
			const k = Math.min(1, (Date.now() - start) / duration);
			setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
			if (k < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [value]);
	return <Text style={style} numberOfLines={1} adjustsFontSizeToFit>{shown}{suffix}</Text>;
}

/** Grows from the left to its full width. */
function Grow({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
	const progress = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		const animation = Animated.timing(progress, { toValue: 1, duration: 650, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
		animation.start();
		return () => animation.stop();
	}, [progress, delay]);
	return <Animated.View style={{ width: "100%", transformOrigin: "0% 50%", transform: [{ scaleX: progress }] }}>{children}</Animated.View>;
}

// ---------------------------------------------------------------- banner

// a few pixel squares in the banner's colour, placed by the name so every profile has its own pattern
function bannerSquares(name: string): { x: number; y: number; s: number; o: number }[] {
	let seed = 0;
	for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
	const next = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	return Array.from({ length: 14 }, () => ({ x: Math.round(next() * 22) * 4.5, y: Math.round(next() * 9) * 4.5, s: 6 + Math.round(next() * 3) * 3, o: 0.12 + next() * 0.2 }));
}

export function ProfileBanner({
	name,
	nameColor,
	color,
	avatarUrl,
	children,
	onAvatarPress,
	avatarBadge,
	nameNode,
}: {
	name: string;
	nameColor: string;
	color: string;
	avatarUrl: string | null;
	children?: ReactNode;
	/** Own profile: tapping the picture changes it. */
	onAvatarPress?: () => void;
	avatarBadge?: ReactNode;
	/** Own profile: replaces the plain name with an editable one. */
	nameNode?: ReactNode;
}) {
	const squares = useRef(bannerSquares(name)).current;
	return (
		<View style={[styles.banner, { borderColor: color, backgroundColor: withAlpha(color, 0.18) }]}>
			<View style={styles.bannerArt} pointerEvents="none">
				{squares.map((square, index) => (
					<View key={index} style={{ position: "absolute", left: `${(square.x / 100) * 100}%`, top: square.y * 3, width: square.s, height: square.s, backgroundColor: color, opacity: square.o }} />
				))}
			</View>
			<FadeInView pop>
				<Pressable disabled={!onAvatarPress} onPress={onAvatarPress} style={styles.avatarWrap}>
					<View style={[styles.avatarRing, { borderColor: color }]}>
						{avatarUrl && avatarUrl.startsWith("http") ? (
							<Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
						) : (
							<View style={styles.avatarFallback}>
								<Text style={styles.avatarText}>{avatarUrl || name.charAt(0).toUpperCase()}</Text>
							</View>
						)}
					</View>
					{avatarBadge}
				</Pressable>
			</FadeInView>
			<FadeInView delay={120} style={styles.bannerText}>
				{nameNode ?? (
					<Text style={[styles.name, { color: nameColor, fontFamily: nameFontFamily(name) }]} numberOfLines={1} adjustsFontSizeToFit>
						{name}
					</Text>
				)}
				{children}
			</FadeInView>
		</View>
	);
}

// ---------------------------------------------------------------- sections

export function SectionLabel({ children }: { children: string }) {
	const { currentTheme } = useTheme();
	return <Text style={[styles.sectionLabel, { color: currentTheme.textSecondary }]}>{children.toUpperCase()}</Text>;
}

export function Section({ label, index, children }: { label: string; index: number; children: ReactNode }) {
	return (
		<FadeInView index={index} delay={160} style={styles.section}>
			<SectionLabel>{label}</SectionLabel>
			{children}
		</FadeInView>
	);
}

/** An icon, a big number that counts up and a small caption. No frame. */
export function StatCell({ icon, value, label, text, color }: { icon: UiGlyphName; value?: number; text?: string; label: string; color?: string }) {
	const { currentTheme } = useTheme();
	return (
		<View style={styles.statCell}>
			<UiIcon name={icon} size={27} />
			<View style={styles.statText}>
				{value !== undefined ? (
					<CountUp value={value} style={[styles.statValue, { color: color ?? currentTheme.textPrimary }]} />
				) : (
					<Text style={[styles.statValue, { color: color ?? currentTheme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{text}</Text>
				)}
				<Text style={[styles.statLabel, { color: currentTheme.textSecondary }]} numberOfLines={1}>{label}</Text>
			</View>
		</View>
	);
}

/** A best score as a chunky badge: a thick lower edge like a pressed key. */
export function ScoreBadge({ value, label, color }: { value: number; label: string; color: string }) {
	const { currentTheme } = useTheme();
	return (
		<View style={[styles.scoreBadge, { borderColor: color, backgroundColor: withAlpha(color, 0.12) }]}>
			<CountUp value={value} style={[styles.scoreValue, { color }]} />
			<Text style={[styles.scoreLabel, { color: currentTheme.textSecondary }]} numberOfLines={1}>{label}</Text>
		</View>
	);
}

/** Wins, draws and losses of one game as a bar, with the share of wins. */
export function GameRow({ name, wins, draws, losses, delay = 0 }: { name: string; wins: number; draws: number; losses: number; delay?: number }) {
	const { currentTheme } = useTheme();
	const total = wins + draws + losses;
	const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
	return (
		<View style={styles.gameRow}>
			<View style={styles.gameHead}>
				<Text style={[styles.gameName, { color: currentTheme.textPrimary }]} numberOfLines={1}>{name}</Text>
				<Text style={[styles.gameScore, { color: currentTheme.textSecondary }]}>
					<Text style={{ color: "#4ADE80" }}>{wins}</Text> · {draws} · <Text style={{ color: "#F87171" }}>{losses}</Text>
				</Text>
				<Text style={[styles.gameRate, { color: rate >= 50 ? "#4ADE80" : currentTheme.textPrimary }]}>{rate}%</Text>
			</View>
			<View style={styles.barTrack}>
				<Grow delay={delay}>
					<View style={styles.bar}>
						{wins > 0 ? <View style={{ flex: wins, backgroundColor: "#4ADE80" }} /> : null}
						{draws > 0 ? <View style={{ flex: draws, backgroundColor: "#9CA3AF" }} /> : null}
						{losses > 0 ? <View style={{ flex: losses, backgroundColor: "#F87171" }} /> : null}
					</View>
				</Grow>
			</View>
		</View>
	);
}

/** A medal for an achievement: the icon in a frame coloured by how rare it is, its name and the share of players. */
export function AchievementMedal({ id, title, percent, tag }: { id: string; title: string; percent: number | null; tag: string | null }) {
	const { currentTheme } = useTheme();
	const kind: RarityClass | null = percent === null ? null : rarityClass(percent);
	const color = kind ? RARITY_CLASS_COLORS[kind] : currentTheme.gridBorder;
	return (
		<View style={styles.medal}>
			{tag ? (
				<View style={[styles.medalTag, { backgroundColor: color }]}>
					<Text style={styles.medalTagText}>{tag}</Text>
				</View>
			) : null}
			<View style={[styles.medalFrame, { borderColor: color, backgroundColor: withAlpha(color, 0.12) }]}>
				<AchievementIcon achievementId={id} size={45} />
			</View>
			<Text style={[styles.medalTitle, { color: currentTheme.textPrimary }]} numberOfLines={2}>{title}</Text>
			{percent !== null ? <Text style={[styles.medalPercent, { color }]}>{formatRarityPercent(percent)}%</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		width: "100%",
		alignItems: "center",
		gap: 10,
		paddingTop: 18,
		paddingBottom: 14,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 2,
		borderBottomWidth: 5,
		overflow: "hidden",
	},
	bannerArt: {
		...StyleSheet.absoluteFillObject,
	},
	bannerText: {
		width: "100%",
		alignItems: "center",
		gap: 8,
	},
	avatarWrap: {
		position: "relative",
	},
	avatarRing: {
		width: 104,
		height: 104,
		borderRadius: 52,
		borderWidth: 4,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#0B0817",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
	},
	avatarFallback: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	avatarText: {
		fontSize: 34,
		color: "#fff",
	},
	name: {
		fontSize: 24,
		maxWidth: "100%",
	},
	sectionLabel: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
		letterSpacing: 1,
	},
	section: {
		width: "100%",
		gap: 10,
		marginTop: 6,
	},
	statCell: {
		flexBasis: "46%",
		flexGrow: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 4,
	},
	statText: {
		flex: 1,
	},
	statValue: {
		fontFamily: "SilkscreenBold",
		fontSize: 18,
	},
	statLabel: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	scoreBadge: {
		flexGrow: 1,
		flexBasis: "28%",
		minWidth: 82,
		alignItems: "center",
		gap: 2,
		paddingVertical: 10,
		paddingHorizontal: 6,
		borderRadius: 12,
		borderWidth: 2,
		borderBottomWidth: 5,
	},
	scoreValue: {
		fontFamily: "SilkscreenBold",
		fontSize: 20,
		maxWidth: "100%",
	},
	scoreLabel: {
		fontFamily: "Silkscreen",
		fontSize: 10,
	},
	gameRow: {
		width: "100%",
		gap: 5,
	},
	gameHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	gameName: {
		flex: 1,
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	gameScore: {
		fontFamily: "Silkscreen",
		fontSize: 11,
	},
	gameRate: {
		width: 40,
		textAlign: "right",
		fontFamily: "SilkscreenBold",
		fontSize: 12,
	},
	barTrack: {
		width: "100%",
		height: 10,
		borderRadius: 5,
		overflow: "hidden",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	bar: {
		width: "100%",
		height: 10,
		flexDirection: "row",
	},
	medal: {
		width: 84,
		alignItems: "center",
		gap: 4,
		paddingTop: 8,
	},
	medalFrame: {
		width: 66,
		height: 66,
		borderRadius: 16,
		borderWidth: 2,
		borderBottomWidth: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	medalTag: {
		position: "absolute",
		top: 0,
		zIndex: 2,
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 4,
	},
	medalTagText: {
		fontFamily: "SilkscreenBold",
		fontSize: 8,
		color: "#0B0817",
	},
	medalTitle: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		textAlign: "center",
		minHeight: 26,
	},
	medalPercent: {
		fontFamily: "SilkscreenBold",
		fontSize: 11,
	},
});
