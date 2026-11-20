import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import UiIcon from "@/components/UiIcon";
import { nameFontFamily } from "@/constants/NameFont";

// The top three of a leaderboard on a podium (second, first, third), shared by the More Games and Versus tables.

export function LeaderboardAvatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
	// a picture that does not load (a deleted Discord avatar) falls back to the initial, like an account without one
	const [broken, setBroken] = useState(false);
	if (url && url.startsWith("http") && !broken) {
		return <Image onError={() => setBroken(true)} source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.08)" }} />;
	}
	// an emoji avatar (a few characters), or the first letter of the name
	const emoji = url && url.length <= 8 ? url : null;
	return (
		<View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
			<Text style={{ fontSize: emoji ? size * 0.55 : size * 0.42, color: "#FFFFFF", fontFamily: emoji ? undefined : "SilkscreenBold" }}>{emoji || name.charAt(0).toUpperCase() || "?"}</Text>
		</View>
	);
}

/** A small arrow and the number of places gained (green, up) or lost (red, down) since the last snapshot; nothing when unchanged or unknown. */
export function RankChange({ change }: { change: number | null | undefined }) {
	if (!change) return null;
	const up = change > 0;
	const color = up ? "#4ADE80" : "#F87171";
	const triangle = { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderLeftColor: "transparent", borderRightColor: "transparent" } as const;
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessibilityLabel={`${up ? "+" : "-"}${Math.abs(change)}`}>
			<View style={up ? { ...triangle, borderBottomWidth: 6, borderBottomColor: color } : { ...triangle, borderTopWidth: 6, borderTopColor: color }} />
			<Text style={{ fontFamily: "SilkscreenBold", fontSize: 10, color }}>{Math.abs(change)}</Text>
		</View>
	);
}

export interface PodiumEntry {
	key: string;
	name: string;
	avatarUrl?: string | null;
	/** One short line under the name: wins, a rating... */
	meta: string;
	isMe?: boolean;
	/** Places gained since the last snapshot (see RankChange). */
	change?: number | null;
}

// second place on the left, first in the middle and highest, third on the right
const PODIUM = [
	{ place: 2, medal: "medalSilver" as const, color: "#CBD5E1", height: 58 },
	{ place: 1, medal: "medalGold" as const, color: "#FACC15", height: 76 },
	{ place: 3, medal: "medalBronze" as const, color: "#D97706", height: 46 },
];

export function LeaderboardPodium({ top, onOpen, metaColor }: { top: PodiumEntry[]; onOpen: (name: string) => void; metaColor?: string }) {
	return (
		<View style={styles.podium}>
			{PODIUM.map(({ place, medal, color, height }) => {
				const entry = top[place - 1];
				// a free place still gets its step, so the podium keeps its shape with one or two players
				if (!entry) {
					return (
						<View key={place} style={styles.column}>
							<View style={[styles.step, styles.stepEmpty, { height }]}>
								<Text style={[styles.place, { color: "rgba(255,255,255,0.25)" }]}>{place}</Text>
							</View>
						</View>
					);
				}
				return (
					<Pressable key={entry.key} onPress={() => onOpen(entry.name)} style={styles.column}>
						<View style={[styles.avatar, { borderColor: color }]}>
							<LeaderboardAvatar name={entry.name} url={entry.avatarUrl} size={place === 1 ? 46 : 38} />
						</View>
						<Text style={[styles.name, { color: entry.isMe ? color : "#F3F4F6", fontFamily: nameFontFamily(entry.name) }]} numberOfLines={1}>
							{entry.name}
						</Text>
						<Text style={[styles.meta, metaColor ? { color: metaColor } : null]} numberOfLines={1}>{entry.meta}</Text>
						<View style={[styles.step, { height, borderColor: color }]}>
							<UiIcon name={medal} size={place === 1 ? 27 : 18} />
							<Text style={[styles.place, { color }]}>{place}</Text>
							<RankChange change={entry.change} />
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

/** The player's own line above a table: avatar, name, a hint (local best...), and the place with its score. */
export function LeaderboardMeCard({ name, avatarUrl, hint, place, placeHint, color }: { name: string; avatarUrl?: string | null; hint: string; place: number | null; placeHint: string; color: string }) {
	return (
		<View style={[styles.meCard, { borderColor: color }]}>
			<LeaderboardAvatar name={name || "?"} url={avatarUrl} size={40} />
			<View style={{ flex: 1, gap: 3 }}>
				<Text style={[styles.meName, { fontFamily: nameFontFamily(name || "?") }]} numberOfLines={1}>{name}</Text>
				<Text style={styles.meHint} numberOfLines={1}>{hint}</Text>
			</View>
			<View style={styles.mePlace}>
				<Text style={[styles.mePlaceNumber, { color }]}>{place ? `#${place}` : "—"}</Text>
				<Text style={styles.meHint} numberOfLines={1}>{placeHint}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	podium: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 16, paddingTop: 4, borderBottomWidth: 2, borderColor: "rgba(255,255,255,0.18)" },
	column: { flex: 1, alignItems: "center", gap: 3 },
	avatar: { borderWidth: 2, borderRadius: 999, padding: 2 },
	name: { fontSize: 11, maxWidth: "100%" },
	meta: { fontFamily: "Silkscreen", fontSize: 10, color: "#C4C9D4" },
	step: { width: "100%", borderWidth: 2, borderBottomWidth: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6, gap: 2, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
	stepEmpty: { borderColor: "rgba(255,255,255,0.12)", borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.02)" },
	place: { fontFamily: "SilkscreenBold", fontSize: 12 },
	meCard: { width: "94%", flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderRadius: 10, padding: 10, marginTop: 4, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.04)" },
	meName: { fontSize: 14, color: "#F3F4F6" },
	meHint: { fontFamily: "Silkscreen", fontSize: 10, color: "#C4C9D4" },
	mePlace: { alignItems: "center", minWidth: 56 },
	mePlaceNumber: { fontFamily: "SilkscreenBold", fontSize: 20 },
});
