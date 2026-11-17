import { View } from "react-native";
import { createFilledBlockStyle, getPieceSkinColor } from "@/constants/Piece";
import { Color, colorToHex } from "@/constants/Color";
import { getSkinKindId, skinBlockShape } from "@/constants/SkinFx";
import SkinTexture from "./SkinTexture";

/** One filled block drawn with a piece skin: colors, the skin's block shape and its themed surface. */
export default function SkinnedBlock({ color, size, skinId, borderWidth, style }: { color: Color; size: number; skinId: string; borderWidth?: number; style?: object }) {
	const kind = getSkinKindId(skinId);
	const hex = colorToHex(getPieceSkinColor(color, skinId));
	return (
		<View style={[createFilledBlockStyle(color, borderWidth ?? Math.max(1, Math.round(size * 0.15)), skinId), skinBlockShape(kind, size, hex), { width: size, height: size, overflow: "hidden" }, style]}>
			<SkinTexture skinId={skinId} />
		</View>
	);
}
