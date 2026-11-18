// A small animated-GIF encoder in plain JS (no native module, no dependency), used by "Share a moment".
// It writes GIF89a with one global palette, a looping animation and frames given as palette indices, which is what the
// moment frames are drawn in (see constants/MomentFrames.ts), so nothing has to be quantised.

export interface GifFrame {
	/** width * height palette indices, row by row. */
	pixels: Uint8Array;
	/** How long the frame stays, in hundredths of a second. */
	delay: number;
}

export interface GifOptions {
	width: number;
	height: number;
	/** Up to 256 colours as 0xRRGGBB. */
	palette: ArrayLike<number>;
	frames: GifFrame[];
	/** How many times to play: 0 = forever (the default). */
	loop?: number;
}

/** Grows as bytes are pushed; a plain array of numbers would be several times heavier for a few hundred KB. */
class ByteSink {
	private buf: Uint8Array;
	length = 0;

	constructor(initial = 4096) {
		this.buf = new Uint8Array(initial);
	}

	byte(value: number): void {
		if (this.length === this.buf.length) {
			const bigger = new Uint8Array(this.buf.length * 2);
			bigger.set(this.buf);
			this.buf = bigger;
		}
		this.buf[this.length++] = value;
	}

	push(...bytes: number[]): void {
		for (let i = 0; i < bytes.length; i++) this.byte(bytes[i]);
	}

	u16(value: number): void {
		this.byte(value & 255);
		this.byte((value >> 8) & 255);
	}

	toBytes(): Uint8Array {
		return this.buf.slice(0, this.length);
	}
}

const HASH_SIZE = 5003;
const MAX_CODES = 4096;

/**
 * The GIF flavour of LZW: variable-width codes (min code size + 1 up to 12 bits), a clear code to reset the table
 * and an end code. Returns the code stream as plain bytes (not yet cut into 255 byte blocks).
 */
export function lzwEncode(pixels: Uint8Array, minCodeSize: number): Uint8Array {
	const clearCode = 1 << minCodeSize;
	const endCode = clearCode + 1;
	const out = new ByteSink(Math.max(256, pixels.length >> 3));

	let acc = 0;
	let accBits = 0;
	let codeSize = minCodeSize + 1;
	let nextCode = endCode + 1;
	const keys = new Int32Array(HASH_SIZE).fill(-1);
	const codes = new Int32Array(HASH_SIZE);

	const emit = (code: number) => {
		acc |= code << accBits;
		accBits += codeSize;
		while (accBits >= 8) {
			out.byte(acc & 255);
			acc >>>= 8;
			accBits -= 8;
		}
	};
	const resetTable = () => {
		keys.fill(-1);
		codeSize = minCodeSize + 1;
		nextCode = endCode + 1;
	};

	emit(clearCode);
	if (pixels.length > 0) {
		let prefix = pixels[0];
		for (let i = 1; i < pixels.length; i++) {
			const value = pixels[i];
			const key = (prefix << 8) | value;
			let slot = key % HASH_SIZE;
			let found = -1;
			while (keys[slot] !== -1) {
				if (keys[slot] === key) {
					found = codes[slot];
					break;
				}
				slot++;
				if (slot === HASH_SIZE) slot = 0;
			}
			if (found !== -1) {
				prefix = found;
				continue;
			}
			emit(prefix);
			if (nextCode === MAX_CODES) {
				emit(clearCode);
				resetTable();
			} else {
				// The decoder is one table entry behind the encoder, so the code gets wider one step later than it looks.
				if (nextCode >= 1 << codeSize) codeSize++;
				keys[slot] = key;
				codes[slot] = nextCode++;
			}
			prefix = value;
		}
		emit(prefix);
		// The decoder adds an entry for the last code too, so it may widen before reading the end code.
		if (nextCode < MAX_CODES && nextCode >= 1 << codeSize) codeSize++;
	}
	emit(endCode);
	if (accBits > 0) out.byte(acc & 255);
	return out.toBytes();
}

/** Smallest number of palette bits (1..8) that holds this many colours. */
function paletteBits(colors: number): number {
	let bits = 1;
	while (1 << bits < colors) bits++;
	return bits;
}

/** Writes a looping GIF89a frame by frame, so a caller can hand control back to the UI between frames. */
export class GifWriter {
	private out = new ByteSink(1 << 16);
	private minCodeSize: number;
	private frameCount = 0;

	constructor(private width: number, private height: number, palette: ArrayLike<number>, loop = 0) {
		if (!(width > 0 && width < 65536 && height > 0 && height < 65536)) throw new Error("GIF: bad size");
		if (palette.length < 1 || palette.length > 256) throw new Error("GIF: palette needs 1 to 256 colours");
		const bits = paletteBits(palette.length);
		const tableSize = 1 << bits;
		this.minCodeSize = Math.max(2, bits);
		const out = this.out;

		// header + logical screen descriptor + global colour table
		for (const ch of "GIF89a") out.push(ch.charCodeAt(0));
		out.u16(width);
		out.u16(height);
		out.push(0x80 | ((bits - 1) << 4) | (bits - 1)); // global table present, colour resolution, table size
		out.push(0); // background colour index
		out.push(0); // pixel aspect ratio
		for (let i = 0; i < tableSize; i++) {
			const colour = i < palette.length ? palette[i] : 0;
			out.push((colour >> 16) & 255, (colour >> 8) & 255, colour & 255);
		}

		// Netscape extension: loop count
		out.push(0x21, 0xff, 0x0b);
		for (const ch of "NETSCAPE2.0") out.push(ch.charCodeAt(0));
		out.push(0x03, 0x01);
		out.u16(Math.max(0, Math.min(65535, loop)));
		out.push(0x00);
	}

	get size(): number {
		return this.out.length;
	}

	addFrame(frame: GifFrame): void {
		const { out, width, height } = this;
		if (frame.pixels.length !== width * height) throw new Error("GIF: frame size does not match");
		// graphic control extension: keep the previous frame (every frame is complete anyway), no transparency
		out.push(0x21, 0xf9, 0x04, 0x04);
		out.u16(Math.max(0, Math.min(65535, Math.round(frame.delay))));
		out.push(0x00, 0x00);
		// image descriptor: whole canvas, no local table, not interlaced
		out.push(0x2c);
		out.u16(0);
		out.u16(0);
		out.u16(width);
		out.u16(height);
		out.push(0x00);
		out.push(this.minCodeSize);
		const data = lzwEncode(frame.pixels, this.minCodeSize);
		for (let at = 0; at < data.length; at += 255) {
			const size = Math.min(255, data.length - at);
			out.byte(size);
			for (let i = 0; i < size; i++) out.byte(data[at + i]);
		}
		out.push(0x00);
		this.frameCount++;
	}

	finish(): Uint8Array {
		if (this.frameCount === 0) throw new Error("GIF: no frames");
		this.out.push(0x3b);
		return this.out.toBytes();
	}
}

/** Encodes frames as a looping GIF89a. Throws on a frame of the wrong size or a palette that is too big. */
export function encodeGif(options: GifOptions): Uint8Array {
	const writer = new GifWriter(options.width, options.height, options.palette, options.loop ?? 0);
	for (const frame of options.frames) writer.addFrame(frame);
	return writer.finish();
}
