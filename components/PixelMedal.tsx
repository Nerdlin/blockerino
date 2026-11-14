import { memo } from "react";
import Svg, { Rect } from "react-native-svg";

export type PixelMedalKind = "bronze" | "silver" | "gold";

// 12 x 15 pixels: a two-colour ribbon over a round medal with a rim, a highlight, a shade and a star.
// R/B ribbon, O rim, M face, L highlight, D shade, S star.
const MAP = [
	".RRR....BBB.",
	".RRR....BBB.",
	"..RRR..BBB..",
	"..RRR..BBB..",
	"...RRRBBB...",
	"....RRBB....",
	"...OOOOOO...",
	"..OMMMMMMO..",
	".OMLMSSMMDO.",
	".OMSSSSSSDO.",
	".OMLSSSSMDO.",
	".OMMSMMSMDO.",
	".OMMMMMMDDO.",
	"..ODMMMDDO..",
	"...OOOOOO...",
];

type Palette = Record<"R" | "B" | "O" | "M" | "L" | "D" | "S", string>;

const PALETTES: Record<PixelMedalKind, Palette> = {
	bronze: { R: "#D9343A", B: "#2F6FDB", O: "#5A2D0C", M: "#C8752F", L: "#F2B072", D: "#8E4A16", S: "#FFE2B8" },
	silver: { R: "#D9343A", B: "#2F6FDB", O: "#3E4652", M: "#B9C2CD", L: "#F4F7FA", D: "#7D8794", S: "#FFFFFF" },
	gold: { R: "#D9343A", B: "#2F6FDB", O: "#6B4A00", M: "#F2C230", L: "#FFF2A6", D: "#B88300", S: "#FFFBE0" },
};

// a medal not earned yet: the same shape in dim greys
const LOCKED: Palette = { R: "#3A3A44", B: "#34343E", O: "#1E1E26", M: "#4A4A55", L: "#5C5C68", D: "#3A3A44", S: "#62626E" };

const RECTS = (() => {
	const out: { x: number; y: number; key: keyof Palette }[] = [];
	MAP.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const c = row[x];
			if (c !== ".") out.push({ x, y, key: c as keyof Palette });
		}
	});
	return out;
})();

/** A pixel-art medal. `size` is its width; it is 15/12 as tall. */
function PixelMedal({ kind, size = 24, locked = false }: { kind: PixelMedalKind; size?: number; locked?: boolean }) {
	const palette = locked ? LOCKED : PALETTES[kind];
	return (
		<Svg width={size} height={(size * 15) / 12} viewBox="0 0 12 15">
			{RECTS.map((r) => (
				<Rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1.02} height={1.02} fill={palette[r.key]} />
			))}
		</Svg>
	);
}

export default memo(PixelMedal);
