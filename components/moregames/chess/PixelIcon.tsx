import { useMemo } from "react";
import Svg, { Rect } from "react-native-svg";
import { ICON_SIZE, IconName, iconPixels } from "@/constants/chess/PixelIcons";

/** One of the pixel-art icons of the chess menus; `size` is the side in dp. */
export function PixelIcon({ name, size = 22 }: { name: IconName; size?: number }) {
	const pixels = useMemo(() => iconPixels(name), [name]);
	return (
		<Svg width={size} height={size} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}>
			{pixels.map(([row, col, fill]) => (
				<Rect key={`${row}-${col}`} x={col} y={row} width={1.02} height={1.02} fill={fill} />
			))}
		</Svg>
	);
}
