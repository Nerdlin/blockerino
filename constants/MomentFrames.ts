// "Share a moment": draws the recorded moves (constants/MomentRecorder.ts) as pixel-art frames and turns them into a
// GIF (constants/GifEncoder.ts). Everything is computed from game data, nothing is captured from the screen, so it
// works the same on the web and on Android and needs no native module.
//
// Frames are palette-index buffers. The palette is built while drawing (a few dozen colours: board, piece shades,
// text, logo), so the GIF needs no colour quantising and flat pixel art compresses to a few KB per frame.

import { GifWriter, type GifFrame } from "./GifEncoder";
import { GLYPH_GAP, GLYPH_HEIGHT, GLYPH_WIDTH, getGlyph, measureText } from "./PixelFont";
import { EMPTY_CELL, findFullLines, placeMove, settleMove, type MomentLog, type MomentMove } from "./MomentRecorder";

/** Size of one picture before it is scaled up (the board is always BOARD_SIZE square, whatever the board length). */
export const FRAME_WIDTH = 192;
export const FRAME_HEIGHT = 232;
export const BOARD_SIZE = 160;
const BOARD_X = (FRAME_WIDTH - BOARD_SIZE) / 2;
const BOARD_Y = 38;

/** A GIF should stay a light thing to send: when it grows past this it is drawn at half size. */
export const MAX_GIF_BYTES = 1_800_000;
/** The animation lasts between 2 and 6 seconds (hundredths of a second). */
export const MIN_DURATION_CS = 200;
export const MAX_DURATION_CS = 600;

export const SITE_TEXT = "blockerino.aionerdlin.me";

const COLOR = {
	background: 0x0c0f18,
	boardFrame: 0x2f3652,
	emptyCell: 0x1a1e2e,
	white: 0xffffff,
	black: 0x000000,
	label: 0x8b93ad,
	score: 0xffffff,
	combo: 0xffd23f,
	popup: 0xffd23f,
	bannerFill: 0x10142a,
	bannerBorder: 0xffd23f,
	site: 0x9aa3c2,
};

// The logo: each letter in one of the piece colours, a little brighter than on the pieces so it reads on the dark footer.
const LOGO_COLORS = [0xffb020, 0xff4d5e, 0x3ddc6b, 0x4d8dff, 0xb070ff, 0x4dd2ff];

export interface MomentLabels {
	score: string;
	combo: string;
	/** Shown over the last frame, e.g. "GAME OVER" or "BIG COMBO". Leave empty for no banner. */
	caption: string;
	/** Shown under the caption together with the final score, e.g. "SCORE". Optional. */
	captionScore?: string;
}

export interface MomentRenderOptions {
	labels?: Partial<MomentLabels>;
	/** Maps a recorded piece colour (0xRRGGBB) to what the player's piece skin shows. Identity by default. */
	skinColor?: (packed: number) => number;
	/** Whole-number zoom of the finished GIF (2 by default). */
	scale?: number;
	/** Dim the board under the caption (a finished game); a big combo keeps the board bright. */
	dimLastFrame?: boolean;
	/** The file is drawn again at a smaller zoom when it passes this many bytes (MAX_GIF_BYTES by default). */
	maxBytes?: number;
}

const DEFAULT_LABELS: MomentLabels = { score: "SCORE", combo: "COMBO", caption: "", captionScore: "" };

/** Colours seen so far, in the order they were first used; index = palette slot. */
export class Palette {
	readonly colors: number[] = [];
	private slots = new Map<number, number>();

	constructor(private readonly limit = 256) {}

	index(rgb: number): number {
		const known = this.slots.get(rgb);
		if (known !== undefined) return known;
		if (this.colors.length < this.limit) {
			this.slots.set(rgb, this.colors.length);
			this.colors.push(rgb);
			return this.colors.length - 1;
		}
		// Out of slots (a skin with many shades): the closest colour we already have.
		let best = 0;
		let bestDistance = Infinity;
		for (let i = 0; i < this.colors.length; i++) {
			const dr = ((this.colors[i] >> 16) & 255) - ((rgb >> 16) & 255);
			const dg = ((this.colors[i] >> 8) & 255) - ((rgb >> 8) & 255);
			const db = (this.colors[i] & 255) - (rgb & 255);
			const distance = dr * dr + dg * dg + db * db;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = i;
			}
		}
		this.slots.set(rgb, best);
		return best;
	}
}

/** Blend two 0xRRGGBB colours: t = 0 gives a, t = 1 gives b. */
export function mixColors(a: number, b: number, t: number): number {
	const channel = (shift: number) => {
		const from = (a >> shift) & 255;
		const to = (b >> shift) & 255;
		return Math.max(0, Math.min(255, Math.round(from + (to - from) * t)));
	};
	return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

class Canvas {
	readonly pixels: Uint8Array;

	constructor(readonly width: number, readonly height: number, private palette: Palette, background: number) {
		this.pixels = new Uint8Array(width * height).fill(palette.index(background));
	}

	rect(x: number, y: number, w: number, h: number, rgb: number): void {
		const index = this.palette.index(rgb);
		const x0 = Math.max(0, Math.floor(x));
		const y0 = Math.max(0, Math.floor(y));
		const x1 = Math.min(this.width, Math.floor(x + w));
		const y1 = Math.min(this.height, Math.floor(y + h));
		for (let py = y0; py < y1; py++) this.pixels.fill(index, py * this.width + x0, py * this.width + Math.max(x0, x1));
	}

	/** One line of text in the bitmap font; `outline` draws a dark edge so it reads over the board. */
	text(text: string, x: number, y: number, scale: number, rgb: number, outline?: number): void {
		if (outline !== undefined) {
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) this.glyphs(text, x + dx, y + dy, scale, outline);
		}
		this.glyphs(text, x, y, scale, rgb);
	}

	private glyphs(text: string, x: number, y: number, scale: number, rgb: number): void {
		let cursor = x;
		for (const char of text) {
			const glyph = getGlyph(char);
			if (!glyph) continue;
			for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
				for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
					if (glyph[gy * GLYPH_WIDTH + gx]) this.rect(cursor + gx * scale, y + gy * scale, scale, scale, rgb);
				}
			}
			cursor += (GLYPH_WIDTH + GLYPH_GAP) * scale;
		}
	}
}

function textWidth(text: string, scale: number): number {
	return measureText(text) * scale;
}

/** The biggest of the given scales at which the text fits. */
function fitScale(text: string, maxWidth: number, scales: number[]): number {
	for (const scale of scales) if (textWidth(text, scale) <= maxWidth) return scale;
	return scales[scales.length - 1];
}

interface Scene {
	cells: Int32Array;
	boardLength: number;
	/** Cell indexes drawn brighter (the piece that was just put down). */
	highlight?: Set<number>;
	/** Cell indexes drawn white (a line about to go). */
	flash?: Set<number>;
	/** Cell indexes drawn small (a line vanishing). */
	shrink?: Set<number>;
	score: number;
	combo: number;
	popup?: { text: string; cellX: number; cellY: number };
	banner?: { title: string; sub?: string };
	dim?: boolean;
}

function drawScene(scene: Scene, palette: Palette, labels: MomentLabels, skinColor: (packed: number) => number): Uint8Array {
	const canvas = new Canvas(FRAME_WIDTH, FRAME_HEIGHT, palette, COLOR.background);
	const n = scene.boardLength;
	const cs = Math.floor(BOARD_SIZE / n);
	const boardPx = cs * n;
	const ox = BOARD_X + Math.floor((BOARD_SIZE - boardPx) / 2);
	const oy = BOARD_Y + Math.floor((BOARD_SIZE - boardPx) / 2);

	// header: score on the left, combo on the right
	const half = FRAME_WIDTH / 2 - 20;
	const scoreText = String(Math.max(0, Math.floor(scene.score)));
	canvas.text(labels.score.toUpperCase(), BOARD_X, 8, 1, COLOR.label);
	canvas.text(scoreText, BOARD_X, 19, fitScale(scoreText, half, [2, 1]), COLOR.score);
	if (scene.combo >= 2) {
		const comboText = `×${scene.combo}`;
		const label = labels.combo.toUpperCase();
		const labelX = FRAME_WIDTH - BOARD_X - textWidth(label, 1);
		canvas.text(label, labelX, 8, 1, COLOR.label);
		const scale = fitScale(comboText, half, [2, 1]);
		canvas.text(comboText, FRAME_WIDTH - BOARD_X - textWidth(comboText, scale), 19, scale, COLOR.combo);
	}

	// board
	canvas.rect(BOARD_X - 3, BOARD_Y - 3, BOARD_SIZE + 6, BOARD_SIZE + 6, COLOR.boardFrame);
	canvas.rect(BOARD_X - 1, BOARD_Y - 1, BOARD_SIZE + 2, BOARD_SIZE + 2, COLOR.background);
	const bevel = Math.max(1, Math.round(cs / 8));
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const at = y * n + x;
			const px = ox + x * cs;
			const py = oy + y * cs;
			const packed = scene.cells[at];
			const empty = packed === EMPTY_CELL;
			const dimmer = (rgb: number) => (scene.dim ? mixColors(rgb, COLOR.black, 0.6) : rgb);
			if (empty || scene.shrink?.has(at)) canvas.rect(px + 1, py + 1, cs - 2, cs - 2, dimmer(COLOR.emptyCell));
			if (empty) continue;
			const skinned = skinColor(packed);
			if (scene.flash?.has(at)) {
				canvas.rect(px + 1, py + 1, cs - 2, cs - 2, mixColors(skinned, COLOR.white, 0.88));
				continue;
			}
			if (scene.shrink?.has(at)) {
				const inset = Math.max(2, Math.round(cs * 0.3));
				canvas.rect(px + inset, py + inset, cs - inset * 2, cs - inset * 2, mixColors(skinned, COLOR.white, 0.45));
				continue;
			}
			const base = dimmer(scene.highlight?.has(at) ? mixColors(skinned, COLOR.white, 0.3) : skinned);
			canvas.rect(px + 1, py + 1, cs - 2, cs - 2, base);
			canvas.rect(px + 1, py + 1, cs - 2, bevel, mixColors(base, COLOR.white, 0.4));
			canvas.rect(px + 1, py + 1, bevel, cs - 2, mixColors(base, COLOR.white, 0.4));
			canvas.rect(px + 1, py + cs - 1 - bevel, cs - 2, bevel, mixColors(base, COLOR.black, 0.4));
			canvas.rect(px + cs - 1 - bevel, py + 1, bevel, cs - 2, mixColors(base, COLOR.black, 0.4));
		}
	}

	if (scene.popup) {
		const width = textWidth(scene.popup.text, 2);
		const x = Math.max(BOARD_X + 2, Math.min(BOARD_X + BOARD_SIZE - width - 2, ox + scene.popup.cellX * cs - Math.floor(width / 2)));
		const y = Math.max(BOARD_Y + 2, Math.min(BOARD_Y + BOARD_SIZE - 16, oy + scene.popup.cellY * cs - 8));
		canvas.text(scene.popup.text, x, y, 2, COLOR.popup, COLOR.black);
	}

	if (scene.banner) {
		const titleScale = fitScale(scene.banner.title, BOARD_SIZE - 20, [2, 1]);
		const height = scene.banner.sub ? 46 : 32;
		const top = BOARD_Y + Math.floor((BOARD_SIZE - height) / 2);
		canvas.rect(BOARD_X, top, BOARD_SIZE, height, COLOR.bannerBorder);
		canvas.rect(BOARD_X + 2, top + 2, BOARD_SIZE - 4, height - 4, COLOR.bannerFill);
		const titleY = scene.banner.sub ? top + 8 : top + Math.floor((height - GLYPH_HEIGHT * titleScale) / 2);
		canvas.text(scene.banner.title, Math.floor((FRAME_WIDTH - textWidth(scene.banner.title, titleScale)) / 2), titleY, titleScale, COLOR.combo);
		if (scene.banner.sub) {
			const subScale = fitScale(scene.banner.sub, BOARD_SIZE - 16, [2, 1]);
			canvas.text(scene.banner.sub, Math.floor((FRAME_WIDTH - textWidth(scene.banner.sub, subScale)) / 2), top + 8 + GLYPH_HEIGHT * titleScale + 6, subScale, COLOR.score);
		}
	}

	// footer: the logo and the site
	const logo = "BLOCKERINO";
	const logoX = Math.floor((FRAME_WIDTH - textWidth(logo, 2)) / 2);
	let cursor = logoX;
	let letter = 0;
	for (const char of logo) {
		canvas.text(char, cursor, FRAME_HEIGHT - 31, 2, LOGO_COLORS[letter % LOGO_COLORS.length], COLOR.black);
		cursor += (GLYPH_WIDTH + GLYPH_GAP) * 2;
		letter++;
	}
	const site = SITE_TEXT.toUpperCase();
	canvas.text(site, Math.floor((FRAME_WIDTH - textWidth(site, 1)) / 2), FRAME_HEIGHT - 12, 1, COLOR.site);
	return canvas.pixels;
}

/** Nearest-neighbour zoom of palette-index pixels. */
export function scaleFrame(pixels: Uint8Array, width: number, height: number, scale: number): Uint8Array {
	if (scale <= 1) return pixels;
	const out = new Uint8Array(width * scale * height * scale);
	const rowLength = width * scale;
	for (let y = 0; y < height; y++) {
		const first = y * scale * rowLength;
		for (let x = 0; x < width; x++) {
			out.fill(pixels[y * width + x], first + x * scale, first + x * scale + scale);
		}
		for (let k = 1; k < scale; k++) out.copyWithin(first + k * rowLength, first, first + rowLength);
	}
	return out;
}

export interface MomentFrames {
	width: number;
	height: number;
	/** The zoom the frames are at (already applied to width, height and pixels). */
	scale: number;
	palette: number[];
	frames: GifFrame[];
	/** Total play time in hundredths of a second. */
	durationCs: number;
	/** How many moves the animation shows. */
	moves: number;
}

const HOLD = { first: 36, placed: 14, flash: 8, shrink: 8, settled: 24, settledClear: 30, banner: 140, lastExtra: 100 };

function cellSet(indexes: number[]): Set<number> {
	return new Set(indexes);
}

function pieceCellIndexes(move: MomentMove, boardLength: number): number[] {
	const out: number[] = [];
	for (let py = 0; py < move.matrix.length; py++) {
		for (let px = 0; px < move.matrix[py].length; px++) {
			if (move.matrix[py][px] < 1) continue;
			const x = move.x + px;
			const y = move.y + py;
			if (x >= 0 && y >= 0 && x < boardLength && y < boardLength) out.push(y * boardLength + x);
		}
	}
	return out;
}

function clearedCellIndexes(cells: Int32Array, boardLength: number): number[] {
	const { rows, cols } = findFullLines(cells, boardLength);
	const out = new Set<number>();
	for (const y of rows) for (let x = 0; x < boardLength; x++) out.add(y * boardLength + x);
	for (const x of cols) for (let y = 0; y < boardLength; y++) out.add(y * boardLength + x);
	return Array.from(out);
}

/** The frames of the moment, before they are zoomed: one scene per step with how long it stays. */
export function buildScenes(log: MomentLog): { scene: Scene; delay: number }[] {
	const n = log.boardLength;
	const scenes: { scene: Scene; delay: number }[] = [];
	const moves = log.moves;
	if (moves.length === 0) return scenes;

	const first = moves[0];
	scenes.push({ scene: { cells: first.before, boardLength: n, score: Math.max(0, first.score - first.points), combo: 0 }, delay: HOLD.first });

	let scoreBefore = Math.max(0, first.score - first.points);
	let comboBefore = 0;
	for (const move of moves) {
		const placed = placeMove(move, n);
		const piece = pieceCellIndexes(move, n);
		scenes.push({ scene: { cells: placed, boardLength: n, highlight: cellSet(piece), score: scoreBefore, combo: comboBefore }, delay: HOLD.placed });

		const settled = settleMove(move, n);
		const cleared = clearedCellIndexes(placed, n);
		const centerX = move.x + Math.floor((move.matrix[0]?.length ?? 1) / 2);
		const popup = move.points > 0 ? { text: `+${move.points}`, cellX: centerX, cellY: move.y } : undefined;
		if (cleared.length > 0) {
			scenes.push({ scene: { cells: placed, boardLength: n, flash: cellSet(cleared), score: scoreBefore, combo: comboBefore }, delay: HOLD.flash });
			scenes.push({ scene: { cells: placed, boardLength: n, shrink: cellSet(cleared), score: move.score, combo: move.combo }, delay: HOLD.shrink });
		}
		scenes.push({ scene: { cells: settled, boardLength: n, score: move.score, combo: move.combo, popup }, delay: cleared.length > 0 ? HOLD.settledClear : HOLD.settled });
		scoreBefore = move.score;
		comboBefore = move.combo;
	}
	return scenes;
}

/** Draws all frames of a moment. Each move becomes: the piece lands, lines flash and shrink, the board settles. */
export function renderMomentFrames(log: MomentLog, options: MomentRenderOptions = {}): MomentFrames {
	const labels: MomentLabels = { ...DEFAULT_LABELS, ...options.labels };
	const skinColor = options.skinColor ?? ((packed: number) => packed);
	const scale = Math.max(1, Math.floor(options.scale ?? 2));
	const palette = new Palette();
	// slot 0 is the background, so a transparent-looking edge can never show a stray colour
	palette.index(COLOR.background);

	const scenes = buildScenes(log);
	if (scenes.length === 0) throw new Error("Moment: nothing was recorded");
	const last = log.moves[log.moves.length - 1];
	const finalScene = scenes[scenes.length - 1].scene;
	if (labels.caption) {
		scenes.push({
			scene: {
				...finalScene,
				popup: undefined,
				dim: Boolean(options.dimLastFrame),
				banner: { title: labels.caption.toUpperCase(), sub: `${labels.captionScore ? labels.captionScore.toUpperCase() + " " : ""}${Math.floor(last.score)}` },
			},
			delay: HOLD.banner,
		});
	} else {
		scenes[scenes.length - 1].delay += HOLD.lastExtra;
	}

	// stay inside 2..6 seconds: shorten the holds when there are many moves, lengthen the last one when there are few
	let total = scenes.reduce((sum, item) => sum + item.delay, 0);
	if (total > MAX_DURATION_CS) {
		const factor = MAX_DURATION_CS / total;
		for (const item of scenes) item.delay = Math.max(4, Math.floor(item.delay * factor));
		total = scenes.reduce((sum, item) => sum + item.delay, 0);
	}
	if (total < MIN_DURATION_CS) {
		scenes[scenes.length - 1].delay += MIN_DURATION_CS - total;
		total = MIN_DURATION_CS;
	}

	const frames: GifFrame[] = scenes.map(({ scene, delay }) => ({
		pixels: scaleFrame(drawScene(scene, palette, labels, skinColor), FRAME_WIDTH, FRAME_HEIGHT, scale),
		delay,
	}));
	return {
		width: FRAME_WIDTH * scale,
		height: FRAME_HEIGHT * scale,
		scale,
		palette: palette.colors.slice(),
		frames,
		durationCs: total,
		moves: log.moves.length,
	};
}

export interface MomentGif extends Omit<MomentFrames, "frames"> {
	bytes: Uint8Array;
	frameCount: number;
}

/**
 * Draws and encodes the moment. `yieldToUi` is awaited between frames so the app stays responsive while the GIF is
 * written. If the file would pass MAX_GIF_BYTES it is drawn again at half the zoom.
 */
export async function renderMomentGif(log: MomentLog, options: MomentRenderOptions = {}, yieldToUi?: () => Promise<void>): Promise<MomentGif> {
	let scale = Math.max(1, Math.floor(options.scale ?? 2));
	for (;;) {
		const drawn = renderMomentFrames(log, { ...options, scale });
		const writer = new GifWriter(drawn.width, drawn.height, drawn.palette);
		for (const frame of drawn.frames) {
			writer.addFrame(frame);
			if (yieldToUi) await yieldToUi();
		}
		const bytes = writer.finish();
		if (bytes.length > (options.maxBytes ?? MAX_GIF_BYTES) && scale > 1) {
			scale -= 1;
			continue;
		}
		const { frames, ...rest } = drawn;
		return { ...rest, bytes, frameCount: frames.length };
	}
}
