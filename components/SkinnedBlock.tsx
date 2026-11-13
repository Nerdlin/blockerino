import { View } from "react-native";
import { createFilledBlockStyle } from "@/constants/Piece";
import { Color, colorToHex } from "@/constants/Color";
import { getSkinKindId, skinBlockShape, skinDecorStyle } from "@/constants/SkinFx";

/** One filled block drawn with a piece skin: colors, the skin's block shape and its surface layer. */
export default function SkinnedBlock({ color, size, skinId, borderWidth, style }: { color: Color; size: number; skinId: string; borderWidth?: number; style?: object }) {
	const kind = getSkinKindId(skinId);
	const hex = colorToHex(color);
	const decor = skinDecorStyle(kind, size, hex);
	return (
		<View style={[createFilledBlockStyle(color, borderWidth ?? Math.max(1, Math.round(size * 0.15)), skinId), skinBlockShape(kind, size, hex), { width: size, height: size }, style]}>
			{decor && <View pointerEvents="none" style={decor} />}
		</View>
	);
}
