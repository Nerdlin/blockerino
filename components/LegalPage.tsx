import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { useFonts } from "expo-font";
import AnimatedBackground from "@/components/AnimatedBackground";

export const LegalHeading = ({ children }: { children: React.ReactNode }) => <Text style={styles.heading}>{children}</Text>;
export const LegalParagraph = ({ children }: { children: React.ReactNode }) => <Text style={styles.paragraph}>{children}</Text>;
export const LegalBullet = ({ children }: { children: React.ReactNode }) => (
	<View style={styles.bulletPoint}>
		<View style={styles.bulletDot} />
		<Text style={styles.bulletText}>{children}</Text>
	</View>
);
export const LegalMono = ({ children }: { children: React.ReactNode }) => <Text style={styles.mono}>{children}</Text>;

// Shared frame for text pages (licenses, terms, privacy), dressed like the game menus: dark card, pixel font for
// titles, a plain readable font for the long text.
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
	const router = useRouter();
	const { width } = useWindowDimensions();
	// Opened straight from a link the game has not loaded its fonts yet, so the pixel font is requested here as well.
	useFonts({ Silkscreen: require("../assets/fonts/Silkscreen-Regular.ttf") });
	const compact = width < 600;

	return (
		<View style={styles.container}>
			<Head>
				<title>{`${title} | Blockerino`}</title>
			</Head>
			<AnimatedBackground />
			<ScrollView contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}>
				<View style={styles.topRow}>
					<TouchableOpacity onPress={() => router.push("/")} style={styles.backButton} accessibilityRole="button">
						<Text style={styles.backText}>BACK</Text>
					</TouchableOpacity>
				</View>
				<View style={[styles.card, compact && styles.cardCompact]}>
					<Text style={[styles.title, compact && { fontSize: 20 }]}>{title}</Text>
					<View style={styles.blocks}>
						{["#FF3333", "#7C3AED", "#1FA4E0", "#FFD700"].map((color) => (
							<View key={color} style={[styles.block, { backgroundColor: color }]} />
						))}
					</View>
					{children}
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#050510" },
	scrollContent: { padding: 32, maxWidth: 820, alignSelf: "center", width: "100%" },
	scrollContentCompact: { padding: 16 },
	topRow: { marginBottom: 14 },
	backButton: {
		alignSelf: "flex-start",
		minWidth: 90,
		height: 38,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#555555",
		borderRadius: 8,
	},
	backText: { color: "#fff", fontSize: 12, fontFamily: "Silkscreen", letterSpacing: 1 },
	card: {
		backgroundColor: "#0b0b16",
		borderRadius: 14,
		padding: 28,
		borderWidth: 1.5,
		borderColor: "rgba(255, 255, 255, 0.18)",
	},
	cardCompact: { padding: 16 },
	title: { fontSize: 26, fontFamily: "Silkscreen", color: "#ffffff", marginBottom: 12 },
	blocks: { flexDirection: "row", gap: 6, marginBottom: 8 },
	block: { width: 14, height: 14, borderWidth: 2, borderColor: "rgba(255, 255, 255, 0.3)", borderRadius: 2 },
	heading: { fontSize: 14, fontFamily: "Silkscreen", color: "#FFD700", marginTop: 22, marginBottom: 8 },
	paragraph: { fontSize: 14, lineHeight: 22, color: "#cbd2e0", marginBottom: 10 },
	bulletPoint: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8, paddingLeft: 4 },
	bulletDot: { width: 7, height: 7, marginTop: 8, marginRight: 10, backgroundColor: "#7C3AED" },
	bulletText: { flex: 1, fontSize: 14, lineHeight: 22, color: "#cbd2e0" },
	mono: {
		fontFamily: "monospace",
		fontSize: 11,
		lineHeight: 17,
		color: "#9ca3af",
		marginBottom: 10,
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.12)",
		backgroundColor: "rgba(255, 255, 255, 0.03)",
	},
});
