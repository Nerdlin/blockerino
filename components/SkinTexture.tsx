import { memo } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { TEX, textureOf } from "@/constants/SkinTextures";
import { SKIN_TEXTURE_IMAGES } from "@/constants/SkinTextureImages";

/**
 * A piece skin's themed surface (constants/SkinTextures.ts) laid over its block. It fills the block's inner box (inside
 * its border), so it lines up at any block size and border width; pixels stay crisp.
 *
 * On a phone it is a pre-rendered PNG (scripts/build-skin-textures.ts): one decoded image shared by every block of the
 * skin. An SVG per block cost a bitmap of its own each on Android, and a board holds 64-100 of them.
 */
function SkinTexture({ skinId }: { skinId: string }) {
	const image = Platform.OS === "web" ? undefined : SKIN_TEXTURE_IMAGES[skinId];
	if (image !== undefined) {
		// width and height must be given: without them an Image takes the PNG's own size and the block crops it
		return (
			<View pointerEvents="none" style={StyleSheet.absoluteFill}>
				<Image source={image} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
			</View>
		);
	}
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

const styles = StyleSheet.create({ fill: { width: "100%", height: "100%" } });

export default memo(SkinTexture);
