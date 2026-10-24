import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createFilledBlockStyle, pieceColors } from "@/constants/Piece";
import { SHARE_URL } from "@/constants/ShareScore";

export const SHARE_CARD_WIDTH = 320;
export const SHARE_CARD_HEIGHT = 400;

// The picture that gets shared: fixed size and colours (not the player's theme) so it looks the same everywhere.
// It is drawn off screen and captured; see constants/ShareScore.ts.
const ShareCard = forwardRef<View, {
	score: number;
	modeTitle: string;
	playerName: string;
	isRecord: boolean;
	recordText: string;
	tagline: string;
}>(function ShareCard({ score, modeTitle, playerName, isRecord, recordText, tagline }, ref) {
	return (
		<View ref={ref} collapsable={false} style={styles.card}>
			<Text style={styles.logo}>BLOCKERINO</Text>
			<View style={styles.blocks}>
				{pieceColors.map((color, index) => (
					<View key={index} style={[createFilledBlockStyle(color, 4), styles.block]} />
				))}
			</View>
			<Text style={styles.mode}>{modeTitle.toUpperCase()}</Text>
			<Text style={styles.score} numberOfLines={1} adjustsFontSizeToFit>
				{score}
			</Text>
			{isRecord && <Text style={styles.record}>{recordText}</Text>}
			{playerName ? (
				<Text style={styles.player} numberOfLines={1}>
					{playerName}
				</Text>
			) : null}
			<View style={styles.footer}>
				<Text style={styles.tagline}>{tagline}</Text>
				<Text style={styles.url}>{SHARE_URL.replace("https://", "")}</Text>
			</View>
		</View>
	);
});

export default ShareCard;

const styles = StyleSheet.create({
	card: {
		width: SHARE_CARD_WIDTH,
		height: SHARE_CARD_HEIGHT,
		backgroundColor: "#0D0B1A",
		borderWidth: 4,
		borderColor: "#FF3333",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 18,
		gap: 10,
	},
	logo: {
		fontFamily: "Silkscreen",
		fontSize: 26,
		color: "#FFFFFF",
		letterSpacing: 2,
	},
	blocks: {
		flexDirection: "row",
		gap: 4,
	},
	block: {
		width: 24,
		height: 24,
	},
	mode: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#A5A0C0",
		marginTop: 12,
	},
	score: {
		fontFamily: "SilkscreenBold",
		fontSize: 64,
		color: "#FFB000",
		maxWidth: "100%",
	},
	record: {
		fontFamily: "Silkscreen",
		fontSize: 14,
		color: "#FFD700",
	},
	player: {
		fontFamily: "Silkscreen",
		fontSize: 16,
		color: "#FFFFFF",
		maxWidth: "100%",
	},
	footer: {
		position: "absolute",
		bottom: 16,
		alignItems: "center",
		gap: 4,
	},
	tagline: {
		fontFamily: "Silkscreen",
		fontSize: 12,
		color: "#FFFFFF",
	},
	url: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		color: "#8E89AA",
	},
});
