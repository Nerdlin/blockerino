import { memo } from "react";
import Svg, { Path } from "react-native-svg";

// Chunky pixel chess pieces for the pixel sets of the style shop. Each piece is a 12x12 silhouette with a one-pixel
// outline all around (dark around light pieces, light around dark ones), so it reads on any square at a glance. The
// glyph sets stay as they are; these only draw when a pixel set is equipped.

const SPRITES: Record<string, string[]> = {
	p: [
		"            ",
		"            ",
		"     ##     ",
		"    ####    ",
		"    ####    ",
		"     ##     ",
		"    ####    ",
		"     ##     ",
		"     ##     ",
		"    ####    ",
		"   ######   ",
		"   ######   ",
	],
	n: [
		"            ",
		"     # #    ",
		"    #####   ",
		"   ######## ",
		"  ##o#####  ",
		"  ########  ",
		"     #####  ",
		"    #####   ",
		"   #####    ",
		"   ######   ",
		"  ########  ",
		"  ########  ",
	],
	b: [
		"     ##     ",
		"    ####    ",
		"   ##o###   ",
		"   #o####   ",
		"   ######   ",
		"    ####    ",
		"     ##     ",
		"    ####    ",
		"     ##     ",
		"    ####    ",
		"  ########  ",
		"  ########  ",
	],
	r: [
		"            ",
		"  ## ## ##  ",
		"  ########  ",
		"  ########  ",
		"   ######   ",
		"   ######   ",
		"   ######   ",
		"   ######   ",
		"   ######   ",
		"  ########  ",
		"  ########  ",
		" ########## ",
	],
	q: [
		" #   ##   # ",
		" #  ####  # ",
		" ## #### ## ",
		" ########## ",
		"  ########  ",
		"   ######   ",
		"    ####    ",
		"    ####    ",
		"   ######   ",
		"  ########  ",
		" ########## ",
		" ########## ",
	],
	k: [
		"     ##     ",
		"    ####    ",
		"     ##     ",
		" ####  #### ",
		"############",
		"############",
		" ########## ",
		"  ########  ",
		"   ######   ",
		"   ######   ",
		"  ########  ",
		" ########## ",
	],
};

const N = 12;
const PAD = 1;

type Paths = { body: string; outline: string; mark: string; shade: string };
const CACHE = new Map<string, Paths>();

function cell(x: number, y: number) {
	return `M${x + PAD} ${y + PAD}h1v1h-1z`;
}

function pathsOf(type: string): Paths {
	const cached = CACHE.get(type);
	if (cached) return cached;
	const rows = SPRITES[type] ?? SPRITES.p;
	const filled = (x: number, y: number) => y >= 0 && y < N && x >= 0 && x < N && rows[y][x] !== " ";
	let body = "";
	let outline = "";
	let mark = "";
	let shade = "";
	for (let y = -1; y <= N; y++) {
		for (let x = -1; x <= N; x++) {
			if (filled(x, y)) {
				const ch = rows[y][x];
				if (ch === "o") mark += cell(x, y);
				else if (!filled(x + 1, y) || !filled(x, y + 1)) shade += cell(x, y);
				else body += cell(x, y);
				continue;
			}
			// an empty pixel touching the piece (sides or corners) becomes its outline
			let touches = false;
			for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) touches = true;
			if (touches) outline += cell(x, y);
		}
	}
	const paths = { body, outline, mark, shade };
	CACHE.set(type, paths);
	return paths;
}

function PixelChessPiece({ type, side, fill, size }: { type: "p" | "n" | "b" | "r" | "q" | "k"; side: "w" | "b"; fill: string; size: number }) {
	const p = pathsOf(type);
	const edge = side === "w" ? "#0F172A" : "rgba(255,255,255,0.88)";
	return (
		<Svg width={size} height={size} viewBox={`0 0 ${N + PAD * 2} ${N + PAD * 2}`}>
			<Path d={p.outline} fill={edge} />
			<Path d={p.body} fill={fill} />
			{/* the right and lower edge of the piece a shade darker, like the bevel of a game block */}
			<Path d={p.shade} fill={fill} />
			<Path d={p.shade} fill="rgba(0,0,0,0.28)" />
			<Path d={p.mark} fill={edge} />
		</Svg>
	);
}

export default memo(PixelChessPiece);
