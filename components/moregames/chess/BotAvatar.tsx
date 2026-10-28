import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { BotLook, SPRITE_SIZE, botSprite, spritePixels } from "@/constants/chess/BotSprites";

/** A bot's pixel face. `locked` draws only the dark silhouette, so a closed bot is a shape and not a spoiler. */
export function BotAvatar({ look, color, size = 30, locked = false }: { look: BotLook; color: string; size?: number; locked?: boolean }) {
	const pixels = useMemo(() => spritePixels(botSprite(look)), [look]);
	return (
		<View style={[local.frame, { width: size, height: size, backgroundColor: locked ? "#1B1B2B" : `${color}33`, borderColor: locked ? "#2A2A3C" : color }]}>
			<Svg width={size - 4} height={size - 4} viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}>
				{pixels.map(([row, col, fill]) => (
					<Rect key={`${row}-${col}`} x={col} y={row} width={1.02} height={1.02} fill={locked ? "#2E2E44" : fill} />
				))}
			</Svg>
		</View>
	);
}

const local = StyleSheet.create({
	frame: { borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
