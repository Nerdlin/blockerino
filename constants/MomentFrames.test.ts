import { decodeGif } from "./GifTestUtils";
import {
	BOARD_SIZE,
	FRAME_HEIGHT,
	FRAME_WIDTH,
	MAX_DURATION_CS,
	MIN_DURATION_CS,
	Palette,
	buildScenes,
	mixColors,
	renderMomentFrames,
	renderMomentGif,
	scaleFrame,
} from "./MomentFrames";
import { MOMENT_CAPACITY, type MomentLog } from "./MomentRecorder";
import { PIECE_COLORS, bestMoment, simulateGame } from "./MomentTestUtils";
import { GLYPH_HEIGHT, GLYPH_WIDTH, getGlyph, measureText } from "./PixelFont";

function logOf(boardLength: number, seed = 3, count = MOMENT_CAPACITY): MomentLog {
	const moves = bestMoment(simulateGame(seed, boardLength, 80), count);
	return { boardLength, moves, bestCombo: Math.max(...moves.map((m) => m.combo)) };
}

describe("renderMomentFrames", () => {
	it("makes frames of one size, in palette indexes, scaled as asked", () => {
		for (const scale of [1, 2, 3]) {
			const drawn = renderMomentFrames(logOf(10), { scale });
			expect(drawn.width).toBe(FRAME_WIDTH * scale);
			expect(drawn.height).toBe(FRAME_HEIGHT * scale);
			for (const frame of drawn.frames) {
				expect(frame.pixels.length).toBe(drawn.width * drawn.height);
				expect(Math.max(...Array.from(new Set(frame.pixels)))).toBeLessThan(drawn.palette.length);
			}
		}
	});

	it("draws the board with 8 and 10 cells a side, filling the same board area", () => {
		for (const boardLength of [8, 10]) {
			const drawn = renderMomentFrames(logOf(boardLength), { scale: 1 });
			expect(drawn.frames.length).toBeGreaterThan(4);
			expect(Math.floor(BOARD_SIZE / boardLength) * boardLength).toBe(BOARD_SIZE);
		}
	});

	it("uses the colours of the pieces on the board", () => {
		const log = logOf(10);
		const drawn = renderMomentFrames(log, { scale: 1 });
		const used = new Set<number>();
		for (const move of log.moves) for (const cell of move.before) if (cell >= 0) used.add(cell);
		expect(used.size).toBeGreaterThan(0);
		for (const colour of used) expect(drawn.palette).toContain(colour);
	});

	it("paints the player's skin colours instead of the recorded ones", () => {
		const log = logOf(10);
		const skin = (packed: number) => (packed === PIECE_COLORS[0] ? 0x00aa77 : packed);
		const plain = renderMomentFrames(log, { scale: 1 });
		const skinned = renderMomentFrames(log, { scale: 1, skinColor: skin });
		const hasFirstColour = log.moves.some((m) => Array.from(m.before).includes(PIECE_COLORS[0]) || m.color === PIECE_COLORS[0]);
		expect(hasFirstColour).toBe(true);
		expect(plain.palette).toContain(PIECE_COLORS[0]);
		expect(skinned.palette).toContain(0x00aa77);
		expect(skinned.palette).not.toContain(PIECE_COLORS[0]);
	});

	it("puts a filled cell's colour at the cell's centre and the empty colour elsewhere", () => {
		const log: MomentLog = {
			boardLength: 10,
			bestCombo: 0,
			moves: [{ before: new Int32Array(100).fill(-1), matrix: [[1]], color: 0x3366cc, x: 4, y: 5, lines: 0, points: 1, score: 1, combo: 0 }],
		};
		const drawn = renderMomentFrames(log, { scale: 1 });
		const cell = Math.floor(BOARD_SIZE / 10);
		const originX = (FRAME_WIDTH - BOARD_SIZE) / 2;
		const originY = 38;
		const at = (x: number, y: number) => drawn.palette[drawn.frames[drawn.frames.length - 1].pixels[(originY + y * cell + cell / 2) * FRAME_WIDTH + originX + x * cell + cell / 2]];
		expect(at(4, 5)).toBe(0x3366cc);
		expect(at(0, 0)).not.toBe(0x3366cc);
		// the first frame shows the board before the piece: the same cell is still empty
		const firstFrame = drawn.frames[0].pixels;
		expect(drawn.palette[firstFrame[(originY + 5 * cell + cell / 2) * FRAME_WIDTH + originX + 4 * cell + cell / 2]]).not.toBe(0x3366cc);
	});

	it("lasts between 2 and 6 seconds for one move and for a full buffer", () => {
		for (const count of [1, 2, MOMENT_CAPACITY, 12]) {
			const log = logOf(10, 5, count);
			for (const caption of ["", "GAME OVER"]) {
				const drawn = renderMomentFrames(log, { labels: { caption } });
				expect(drawn.durationCs).toBeGreaterThanOrEqual(MIN_DURATION_CS);
				expect(drawn.durationCs).toBeLessThanOrEqual(MAX_DURATION_CS);
				expect(drawn.frames.reduce((sum, f) => sum + f.delay, 0)).toBe(drawn.durationCs);
			}
		}
	});

	it("shows the score at each step and flashes the lines a move clears", () => {
		const log = logOf(10);
		const scenes = buildScenes(log);
		expect(scenes[0].scene.score).toBeLessThanOrEqual(log.moves[0].score);
		expect(scenes[scenes.length - 1].scene.score).toBe(log.moves[log.moves.length - 1].score);
		const clears = log.moves.filter((m) => m.lines > 0).length;
		expect(scenes.filter((s) => s.scene.flash).length).toBe(clears);
		expect(scenes.filter((s) => s.scene.shrink).length).toBe(clears);
	});

	it("adds a caption frame when asked, including Russian text", () => {
		const log = logOf(10);
		const without = renderMomentFrames(log);
		const english = renderMomentFrames(log, { labels: { caption: "Game over", captionScore: "Score" } });
		const russian = renderMomentFrames(log, { labels: { score: "Счёт", combo: "Комбо", caption: "Игра окончена", captionScore: "Счёт" }, dimLastFrame: true });
		expect(english.frames.length).toBe(without.frames.length + 1);
		expect(russian.frames.length).toBe(without.frames.length + 1);
		expect(russian.palette.length).toBeLessThanOrEqual(256);
	});

	it("refuses an empty log", () => {
		expect(() => renderMomentFrames({ boardLength: 8, moves: [], bestCombo: 0 })).toThrow();
	});

	it("keeps to 256 colours however many skin shades come in", () => {
		const log = logOf(10);
		let n = 0;
		const drawn = renderMomentFrames(log, { scale: 1, skinColor: () => ((n++ * 2654435761) >>> 8) & 0xffffff });
		expect(drawn.palette.length).toBeLessThanOrEqual(256);
	});
});

describe("renderMomentGif", () => {
	it("makes a valid, looping GIF under 2 MB with the frames and delays of the moment", async () => {
		const log = logOf(10);
		const gif = await renderMomentGif(log, { labels: { caption: "BIG COMBO", captionScore: "SCORE" } });
		expect(gif.bytes.length).toBeLessThan(2 * 1024 * 1024);
		expect(String.fromCharCode(...gif.bytes.slice(0, 6))).toBe("GIF89a");
		expect(gif.bytes[gif.bytes.length - 1]).toBe(0x3b);
		const decoded = decodeGif(gif.bytes);
		expect(decoded.width).toBe(gif.width);
		expect(decoded.height).toBe(gif.height);
		expect(decoded.loop).toBe(0);
		expect(decoded.frames.length).toBe(gif.frameCount);
		expect(decoded.frames.reduce((sum, f) => sum + f.delay, 0)).toBe(gif.durationCs);
		expect(decoded.palette.slice(0, gif.palette.length)).toEqual(gif.palette);
	});

	it("decodes to the pixels that were drawn", async () => {
		const log = logOf(8, 9);
		const drawn = renderMomentFrames(log, { scale: 1 });
		const decoded = decodeGif((await renderMomentGif(log, { scale: 1 })).bytes);
		decoded.frames.forEach((frame, i) => expect(Array.from(frame.pixels)).toEqual(Array.from(drawn.frames[i].pixels)));
	});

	it("draws again at a smaller zoom when the file would be too big", async () => {
		const log = logOf(10);
		const big = await renderMomentGif(log, { scale: 3 });
		const squeezed = await renderMomentGif(log, { scale: 3, maxBytes: big.bytes.length - 1 });
		expect(big.width).toBe(FRAME_WIDTH * 3);
		expect(squeezed.width).toBe(FRAME_WIDTH * 2);
		expect(squeezed.bytes.length).toBeLessThan(big.bytes.length);
	});

	it("hands control back between frames", async () => {
		let calls = 0;
		const gif = await renderMomentGif(logOf(10), {}, async () => {
			calls++;
		});
		expect(calls).toBe(gif.frameCount);
	});
});

describe("helpers", () => {
	it("mixes colours", () => {
		expect(mixColors(0x000000, 0xffffff, 0.5)).toBe(0x808080);
		expect(mixColors(0x102030, 0x102030, 0.7)).toBe(0x102030);
	});

	it("scales a frame by whole pixels", () => {
		const out = scaleFrame(Uint8Array.from([1, 2, 3, 4]), 2, 2, 2);
		expect(Array.from(out)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
	});

	it("reuses the closest colour once the palette is full", () => {
		const palette = new Palette(2);
		expect(palette.index(0x000000)).toBe(0);
		expect(palette.index(0xffffff)).toBe(1);
		expect(palette.index(0x101010)).toBe(0);
		expect(palette.index(0xf0f0f0)).toBe(1);
		expect(palette.colors).toHaveLength(2);
	});
});

describe("PixelFont", () => {
	it("has glyphs for digits, Latin, Cyrillic and the signs the GIF uses", () => {
		for (const char of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ+-!.,:/?'×#% ") {
			const glyph = getGlyph(char);
			expect(glyph).toBeDefined();
			expect(glyph!.length).toBe(GLYPH_WIDTH * GLYPH_HEIGHT);
		}
		for (const word of ["blockerino.aionerdlin.me", "Игра окончена", "Счёт", "Комбо"]) {
			for (const char of word) expect(getGlyph(char)).toBeDefined();
		}
	});

	it("draws lower case as upper case and measures text", () => {
		expect(getGlyph("a")).toEqual(getGlyph("A"));
		expect(getGlyph("я")).toEqual(getGlyph("Я"));
		expect(measureText("")).toBe(0);
		expect(measureText("A")).toBe(GLYPH_WIDTH);
		expect(measureText("AB")).toBe(GLYPH_WIDTH * 2 + 1);
		expect(measureText("A\u{1F600}B")).toBe(measureText("AB"));
	});

	it("gives every letter some ink and no two distinct letters the same shape", () => {
		const seen = new Map<string, string>();
		for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789БГДЖЗИЙЛПУФЦЧШЩЪЫЬЭЮЯ") {
			const glyph = getGlyph(char)!;
			expect(glyph.some((bit) => bit === 1)).toBe(true);
			const key = Array.from(glyph).join("");
			if (seen.has(key)) throw new Error(`${char} looks like ${seen.get(key)}`);
			seen.set(key, char);
		}
	});
});
