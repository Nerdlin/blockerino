import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { TEX, textureOf } from "@/constants/SkinTextures";

/**
 * A piece skin's themed surface (constants/SkinTextures.ts) laid over its block. It fills the block's inner box (inside
 * its border), so it lines up at any block size and border width; pixels stay crisp.
 */
function SkinTexture({ skinId }: { skinId: string }) {
	const layers = textureOf(skinId);
	if (!layers) return null;
	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill}>
			<Svg width="100%" height="100%" viewBox={`0 0 ${TEX} ${TEX}`} preserveAspectRatio="none">
				{layers.map((layer) => (
					<Path key={layer.color} d={layer.d} fill={layer.color} />
				))}
			</Svg>
		</View>
	);
}

export default memo(SkinTexture);
