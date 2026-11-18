import { encodeGif, lzwEncode } from "./GifEncoder";
import { decodeGif, lzwDecode } from "./GifTestUtils";

// small deterministic random numbers so a failure can be repeated
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

describe("lzwEncode", () => {
	it("round-trips flat, noisy and patterned data for several code sizes", () => {
		const random = rng(7);
		for (const minCodeSize of [2, 3, 4, 8]) {
			const colours = 1 << minCodeSize;
			const cases: Uint8Array[] = [
				new Uint8Array(0),
				new Uint8Array(1),
				new Uint8Array(5000).fill(colours - 1),
				Uint8Array.from({ length: 20000 }, () => Math.floor(random() * colours)),
				Uint8Array.from({ length: 30000 }, (_, i) => ((i >> 4) ^ (i >> 9)) % colours),
			];
			for (const pixels of cases) {
				const decoded = lzwDecode(lzwEncode(pixels, minCodeSize), minCodeSize, pixels.length);
				expect(Array.from(decoded)).toEqual(Array.from(pixels));
			}
		}
	});

	it("round-trips every length around the code width changes and the 4096 entry limit", () => {
		const random = rng(11);
		const noise = Uint8Array.from({ length: 9000 }, () => Math.floor(random() * 4));
		for (let length = 1; length < 600; length += 1) {
			const pixels = noise.subarray(0, length);
			expect(Array.from(lzwDecode(lzwEncode(pixels, 2), 2, length))).toEqual(Array.from(pixels));
		}
		for (const length of [4090, 4095, 4096, 4097, 4098, 6000, 9000]) {
			const pixels = noise.subarray(0, length);
			expect(Array.from(lzwDecode(lzwEncode(pixels, 2), 2, length))).toEqual(Array.from(pixels));
		}
	});

	it("compresses flat colour well", () => {
		expect(lzwEncode(new Uint8Array(100000), 2).length).toBeLessThan(1500);
	});
});

describe("encodeGif", () => {
	const palette = [0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffffff];

	function sampleFrames(width: number, height: number, count: number) {
		return Array.from({ length: count }, (_, f) => ({
			delay: 10 + f,
			pixels: Uint8Array.from({ length: width * height }, (_, i) => (i + f) % palette.length),
		}));
	}

	it("writes a valid GIF89a: header, size, palette, loop, frames, trailer", () => {
		const bytes = encodeGif({ width: 13, height: 9, palette, frames: sampleFrames(13, 9, 3) });
		expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
		expect(bytes[6] | (bytes[7] << 8)).toBe(13);
		expect(bytes[8] | (bytes[9] << 8)).toBe(9);
		expect(bytes[bytes.length - 1]).toBe(0x3b);
		const gif = decodeGif(bytes);
		expect(gif.width).toBe(13);
		expect(gif.height).toBe(9);
		expect(gif.palette.slice(0, 5)).toEqual(palette);
		// padded to a power of two with black
		expect(gif.palette).toHaveLength(8);
		expect(gif.loop).toBe(0);
		expect(gif.frames.map((frame) => frame.delay)).toEqual([10, 11, 12]);
	});

	it("decodes back to the same pixels", () => {
		const frames = sampleFrames(40, 30, 4);
		const gif = decodeGif(encodeGif({ width: 40, height: 30, palette, frames }));
		gif.frames.forEach((frame, i) => expect(Array.from(frame.pixels)).toEqual(Array.from(frames[i].pixels)));
	});

	it("supports a full 256 colour palette", () => {
		const big = Array.from({ length: 256 }, (_, i) => (i << 16) | (i << 8) | i);
		const pixels = Uint8Array.from({ length: 64 * 64 }, (_, i) => (i * 7) & 255);
		const gif = decodeGif(encodeGif({ width: 64, height: 64, palette: big, frames: [{ pixels, delay: 5 }] }));
		expect(gif.palette).toHaveLength(256);
		expect(Array.from(gif.frames[0].pixels)).toEqual(Array.from(pixels));
	});

	it("honours a finite loop count", () => {
		const gif = decodeGif(encodeGif({ width: 2, height: 2, palette, frames: sampleFrames(2, 2, 1), loop: 3 }));
		expect(gif.loop).toBe(3);
	});

	it("rejects a frame of the wrong size, no frames and a palette that is too big", () => {
		expect(() => encodeGif({ width: 4, height: 4, palette, frames: [{ pixels: new Uint8Array(3), delay: 1 }] })).toThrow();
		expect(() => encodeGif({ width: 4, height: 4, palette, frames: [] })).toThrow();
		expect(() => encodeGif({ width: 4, height: 4, palette: new Array(257).fill(0), frames: sampleFrames(4, 4, 1) })).toThrow();
	});
});
