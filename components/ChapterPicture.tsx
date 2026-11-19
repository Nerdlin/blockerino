import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CHAPTER_PICTURES, pictureComplete, rowReveal } from "@/constants/ChapterArt";

const CELL = 15;

/**
 * The pixel picture of a chapter: each of its ten levels opens one row, in full colour at three stars and dimmed at
 * one or two. Rows that are still closed show a dark outline, so the player can see what is waiting.
 */
function ChapterPicture({ chapter, rowStars, caption, doneLabel }: { chapter: number; rowStars: number[]; caption: string; doneLabel: string }) {
	const picture = CHAPTER_PICTURES[chapter];
	if (!picture) return null;
	const done = pictureComplete(rowStars);
	return (
		<View style={styles.wrap} testID={`chapter-picture-${chapter}`}>
			<View style={[styles.frame, done && styles.frameDone]}>
				{picture.rows.map((row, y) => {
					const reveal = rowReveal(rowStars[y] ?? 0);
					return (
						<View key={y} style={styles.row} testID={`chapter-picture-${chapter}-row-${y}`}>
							{[...row].map((ch, x) => {
								const color = picture.palette[ch];
								if (!color) return <View key={x} style={styles.cell} />;
								return <View key={x} style={[styles.cell, reveal > 0 ? { backgroundColor: color, opacity: reveal } : styles.closed]} />;
							})}
						</View>
					);
				})}
			</View>
			<Text style={[styles.caption, done && styles.captionDone]}>{done ? doneLabel : caption}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignItems: "center",
		gap: 6,
		marginVertical: 10,
	},
	frame: {
		padding: 6,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.12)",
		borderRadius: 6,
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	frameDone: {
		borderColor: "#FFD700",
		backgroundColor: "rgba(255,215,0,0.08)",
	},
	row: {
		flexDirection: "row",
	},
	cell: {
		width: CELL,
		height: CELL,
	},
	closed: {
		backgroundColor: "rgba(255,255,255,0.07)",
	},
	caption: {
		fontFamily: "Silkscreen",
		fontSize: 10,
		color: "rgba(255,255,255,0.55)",
		textAlign: "center",
	},
	captionDone: {
		color: "#FFD700",
	},
});

export default memo(ChapterPicture);
