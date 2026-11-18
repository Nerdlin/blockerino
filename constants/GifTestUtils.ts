// A strict little GIF reader used only by the tests: it checks the structure the encoder writes and decodes the
// pixels back, so a wrong LZW code width or a broken block shows up as a failing test instead of a broken picture.

export interface DecodedGif {
	width: number;
	height: number;
	palette: number[];
	loop: number | null;
	frames: { delay: number; pixels: Uint8Array }[];
}

export function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
	const clearCode = 1 << minCodeSize;
	const endCode = clearCode + 1;
	const out = new Uint8Array(pixelCount);
	let outAt = 0;
	let codeSize = minCodeSize + 1;
	let nextCode = endCode + 1;
	let prev = -1;
	// each table entry: prefix code and last byte; its first byte is kept for the "code not yet known" case
	const prefix = new Int32Array(4096);
	const suffix = new Uint8Array(4096);
	const first = new Uint8Array(4096);
	for (let i = 0; i < clearCode; i++) {
		suffix[i] = i;
		first[i] = i;
		prefix[i] = -1;
	}
	let acc = 0;
	let accBits = 0;
	let at = 0;
	const stack = new Uint8Array(4097);
	for (;;) {
		while (accBits < codeSize) {
			if (at >= data.length) throw new Error("LZW: data ended before the end code");
			acc |= data[at++] << accBits;
			accBits += 8;
		}
		const code = acc & ((1 << codeSize) - 1);
		acc >>>= codeSize;
		accBits -= codeSize;
		if (code === clearCode) {
			codeSize = minCodeSize + 1;
			nextCode = endCode + 1;
			prev = -1;
			continue;
		}
		if (code === endCode) break;
		let cursor: number;
		let sp = 0;
		if (prev === -1) {
			if (code >= clearCode) throw new Error("LZW: first code after clear must be a literal");
			cursor = code;
		} else if (code < nextCode) {
			cursor = code;
		} else if (code === nextCode) {
			cursor = prev;
			stack[sp++] = first[prev];
		} else {
			throw new Error(`LZW: code ${code} is beyond the table (${nextCode})`);
		}
		for (let c = cursor; c !== -1; c = prefix[c]) stack[sp++] = suffix[c];
		const firstByte = stack[sp - 1];
		if (prev !== -1 && nextCode < 4096) {
			prefix[nextCode] = prev;
			suffix[nextCode] = firstByte;
			first[nextCode] = first[prev];
			nextCode++;
			if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
		}
		while (sp > 0) {
			if (outAt >= pixelCount) throw new Error("LZW: more pixels than the image holds");
			out[outAt++] = stack[--sp];
		}
		prev = code;
	}
	if (outAt !== pixelCount) throw new Error(`LZW: got ${outAt} pixels, wanted ${pixelCount}`);
	return out;
}

export function decodeGif(bytes: Uint8Array): DecodedGif {
	let at = 0;
	const u8 = () => {
		if (at >= bytes.length) throw new Error("GIF: ended early");
		return bytes[at++];
	};
	const u16 = () => u8() | (u8() << 8);
	const text = (n: number) => {
		let s = "";
		for (let i = 0; i < n; i++) s += String.fromCharCode(u8());
		return s;
	};
	const signature = text(6);
	if (signature !== "GIF89a" && signature !== "GIF87a") throw new Error("GIF: bad signature");
	const width = u16();
	const height = u16();
	const packed = u8();
	u8(); // background
	u8(); // aspect
	const palette: number[] = [];
	if (packed & 0x80) {
		const size = 1 << ((packed & 7) + 1);
		for (let i = 0; i < size; i++) palette.push((u8() << 16) | (u8() << 8) | u8());
	}
	let loop: number | null = null;
	let delay = 0;
	const frames: DecodedGif["frames"] = [];
	for (;;) {
		const block = u8();
		if (block === 0x3b) break;
		if (block === 0x21) {
			const label = u8();
			const first = u8();
			if (label === 0xf9) {
				if (first !== 4) throw new Error("GIF: bad graphic control size");
				u8();
				delay = u16();
				u8();
				if (u8() !== 0) throw new Error("GIF: graphic control not terminated");
			} else if (label === 0xff) {
				const name = text(first);
				let size = u8();
				while (size > 0) {
					const sub: number[] = [];
					for (let i = 0; i < size; i++) sub.push(u8());
					if (name === "NETSCAPE2.0" && sub[0] === 1) loop = sub[1] | (sub[2] << 8);
					size = u8();
				}
			} else {
				let size = first;
				while (size > 0) {
					at += size;
					size = u8();
				}
			}
			continue;
		}
		if (block !== 0x2c) throw new Error(`GIF: unknown block 0x${block.toString(16)}`);
		const left = u16();
		const top = u16();
		const w = u16();
		const h = u16();
		const flags = u8();
		if (left !== 0 || top !== 0 || w !== width || h !== height) throw new Error("GIF: frame does not cover the canvas");
		if (flags & 0x80) throw new Error("GIF: unexpected local palette");
		const minCodeSize = u8();
		const data: number[] = [];
		let size = u8();
		while (size > 0) {
			for (let i = 0; i < size; i++) data.push(u8());
			size = u8();
		}
		frames.push({ delay, pixels: lzwDecode(Uint8Array.from(data), minCodeSize, w * h) });
	}
	if (at !== bytes.length) throw new Error("GIF: extra bytes after the trailer");
	return { width, height, palette, loop, frames };
}
