import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { glyphOf } from "@/constants/SkinFx";

function glyphPath(rows: string[]): string {
	let d = "";
	rows.forEach((row, y) => {
		[...row].forEach((cell, x) => {
			if (cell === "#") d += `M${x} ${y}h1v1h-1z`;
		});
	});
	return d;
}

const PATHS = new Map<string, string>();
function pathOf(rows: string[]): string {
	const key = rows.join("");
	let d = PATHS.get(key);
	if (!d) {
		d = glyphPath(rows);
		PATHS.set(key, d);
	}
	return d;
}

/**
 * A piece skin's own pixel badge, centred on its block. It fills the block's inner box (inside its border) and
 * centres itself there, so it sits in the middle at any block size and border width.
 */
function SkinGlyph({ code, size }: { code: number; size: number }) {
	const rows = glyphOf(code);
	if (!rows) return null;
	const d = pathOf(rows);
	const side = Math.max(8, Math.round(size * 0.5));
	return (
		<View pointerEvents="none" style={styles.box}>
			<Svg width={side} height={side} viewBox="-0.3 -0.3 5.6 5.6">
				{/* a dark copy one step down and right keeps the badge readable on light blocks */}
				<Path d={d} fill="rgba(0,0,0,0.35)" transform="translate(0.22 0.22)" />
				<Path d={d} fill="rgba(255,255,255,0.82)" />
			</Svg>
		</View>
	);
}

export default memo(SkinGlyph);

const styles = StyleSheet.create({
	box: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
});
