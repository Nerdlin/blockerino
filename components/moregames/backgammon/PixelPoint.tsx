import { memo } from "react";
import { View } from "react-native";

/**
 * One point of the backgammon board as a pixel-art triangle: a stack of bars that get narrower towards the tip, the way
 * the block puzzle draws everything. `down` points hang from the top edge, the others stand on the bottom edge.
 */
function PixelPointView({ width, height, color, down, steps = 9 }: { width: number; height: number; color: string; down: boolean; steps?: number }) {
	const stepHeight = height / steps;
	const bars = Array.from({ length: steps }, (_, index) => {
		// the base bar is the widest; the tip is a quarter of the width
		const share = 1 - (index / steps) * 0.78;
		// whole pixels, and the same parity as the point, so every bar sits exactly in the middle
		let barWidth = Math.max(2, Math.round(width * share));
		if ((width - barWidth) % 2 !== 0) barWidth += 1;
		return <View key={index} style={{ width: Math.min(width, barWidth), height: stepHeight + 0.5, backgroundColor: color }} />;
	});
	return (
		<View pointerEvents="none" style={{ width, height, alignItems: "center", flexDirection: down ? "column" : "column-reverse", overflow: "hidden" }}>
			{bars}
		</View>
	);
}

export const PixelPoint = memo(PixelPointView);
