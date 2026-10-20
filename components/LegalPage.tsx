import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import AnimatedBackground from "@/components/AnimatedBackground";

export const LegalHeading = ({ children }: { children: React.ReactNode }) => <Text style={styles.heading}>{children}</Text>;
export const LegalParagraph = ({ children }: { children: React.ReactNode }) => <Text style={styles.paragraph}>{children}</Text>;
export const LegalBullet = ({ children }: { children: React.ReactNode }) => (
	<View style={styles.bulletPoint}>
		<Text style={styles.bulletDot}>•</Text>
		<Text style={styles.bulletText}>{children}</Text>
	</View>
);
export const LegalMono = ({ children }: { children: React.ReactNode }) => <Text style={styles.mono}>{children}</Text>;

// Shared frame for text pages such as the licenses screen.
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
	const router = useRouter();

	return (
		<View style={styles.container}>
			<AnimatedBackground />
			<ScrollView contentContainerStyle={styles.scrollContent}>
				<TouchableOpacity onPress={() => router.push("/")} style={styles.backButton}>
					<Text style={styles.backText}>{"< BACK TO GAME"}</Text>
				</TouchableOpacity>
				<View style={styles.glassCard}>
					<Text style={styles.title}>{title}</Text>
					<View style={styles.divider} />
					{children}
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: "#050510" },
	scrollContent: { padding: 40, maxWidth: 900, alignSelf: "center", width: "100%" },
	backButton: {
		marginBottom: 30,
		paddingVertical: 12,
		paddingHorizontal: 20,
		backgroundColor: "rgba(255, 255, 255, 0.05)",
		alignSelf: "flex-start",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
	},
	backText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
	glassCard: {
		backgroundColor: "rgba(20, 20, 35, 0.85)",
		borderRadius: 24,
		padding: 40,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	title: { fontSize: 36, fontWeight: "900", color: "#ffffff", marginBottom: 8, letterSpacing: -0.5 },
	divider: { height: 1, backgroundColor: "rgba(255, 255, 255, 0.1)", marginVertical: 20 },
	heading: { fontSize: 20, fontWeight: "800", color: "#ffffff", marginTop: 24, marginBottom: 10 },
	paragraph: { fontSize: 15, lineHeight: 24, color: "#d1d5db", marginBottom: 10 },
	bulletPoint: { flexDirection: "row", marginBottom: 8, paddingLeft: 8 },
	bulletDot: { color: "#9ca3af", marginRight: 10, fontSize: 15 },
	bulletText: { flex: 1, fontSize: 15, lineHeight: 24, color: "#d1d5db" },
	mono: { fontFamily: "monospace", fontSize: 12, lineHeight: 18, color: "#9ca3af", marginBottom: 10 },
});
