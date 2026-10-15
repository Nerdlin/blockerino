import { memo, useMemo } from "react";
import Svg, { Path } from "react-native-svg";
import type { GlyphPalette, PixelGlyph } from "@/constants/AchievementIcons";

type PaletteKey = keyof GlyphPalette;
const PALETTE_KEYS: PaletteKey[] = ["a", "b", "c", "d"];

// One path per palette colour, built from horizontal pixel runs. Rendering the
// glyph as SVG keeps it identical on web, Discord and the native apps.
export function buildGlyphPaths(glyph: PixelGlyph): Record<PaletteKey, string> {
	const paths: Record<PaletteKey, string> = { a: "", b: "", c: "", d: "" };

	glyph.rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const cell = row[x];
			if (cell === "." || !(cell in paths)) {
				x += 1;
				continue;
			}
			let end = x + 1;
			while (end < row.length && row[end] === cell) end += 1;
			paths[cell as PaletteKey] += `M${x} ${y}h${end - x}v1h-${end - x}z`;
			x = end;
		}
	});

	return paths;
}

interface PixelGlyphViewProps {
	glyph: PixelGlyph;
	/** Overrides the glyph's own palette. */
	palette?: GlyphPalette;
	/** Use a multiple of the grid size (9) so every pixel lands on the device pixel grid. */
	size?: number;
	dimmed?: boolean;
}

function PixelGlyphViewComponent({ glyph, palette, size = 27, dimmed = false }: PixelGlyphViewProps) {
	const paths = useMemo(() => buildGlyphPaths(glyph), [glyph]);
	const colors = palette ?? glyph.palette;
	const grid = glyph.rows.length;

	return (
		<Svg width={size} height={size} viewBox={`0 0 ${grid} ${grid}`} opacity={dimmed ? 0.5 : 1}>
			{PALETTE_KEYS.map((key) => (paths[key] ? <Path key={key} d={paths[key]} fill={colors[key]} /> : null))}
		</Svg>
	);
}

export default memo(PixelGlyphViewComponent);
