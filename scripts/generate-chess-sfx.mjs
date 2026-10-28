// Synthesizes the chess sound effects (wooden knocks, check chime, castle, promotion, result jingles, clock tick) and
// writes them as MP3 into assets/sounds/chess. No samples are used, so there is nothing to license. Needs ffmpeg.
//   node scripts/generate-chess-sfx.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "sounds", "chess");
const SR = 44100;
fs.mkdirSync(outDir, { recursive: true });

let seed = 12345;
const noise = () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return (seed / 4294967296) * 2 - 1;
};
const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);

class Track {
	constructor(seconds) {
		this.data = new Float32Array(Math.ceil(seconds * SR));
	}
	add(start, seconds, fn, gain = 1) {
		const from = Math.floor(start * SR);
		const count = Math.floor(seconds * SR);
		for (let i = 0; i < count && from + i < this.data.length; i++) this.data[from + i] += fn(i / SR, i / count) * gain;
	}
}

// a wooden knock: a short band of filtered noise plus a quickly falling sine
function knock(track, start, { pitch = 190, drop = 110, noiseGain = 0.55, bodyGain = 0.8, length = 0.11, cutoff = 0.3 } = {}) {
	let lp = 0;
	track.add(start, length, (t) => {
		lp += (noise() - lp) * cutoff;
		const body = Math.sin(2 * Math.PI * (drop + (pitch - drop) * Math.exp(-t * 60)) * t) * Math.exp(-t * 42);
		return lp * Math.exp(-t * 95) * noiseGain + body * bodyGain;
	});
}

function note(track, start, freq, seconds, { shape = "tri", gain = 0.4, attack = 0.005, decay = 6 } = {}) {
	track.add(start, seconds, (t) => {
		const phase = (t * freq) % 1;
		const wave = shape === "sine" ? Math.sin(2 * Math.PI * phase) : shape === "square" ? (phase < 0.5 ? 1 : -1) * 0.6 : 4 * Math.abs(phase - 0.5) - 1;
		return wave * Math.min(1, t / attack) * Math.exp(-t * decay);
	}, gain);
}

const sounds = {
	"chess-move": () => {
		const t = new Track(0.14);
		knock(t, 0);
		return t;
	},
	"chess-capture": () => {
		const t = new Track(0.24);
		knock(t, 0, { pitch: 150, drop: 70, noiseGain: 0.9, bodyGain: 1, length: 0.18, cutoff: 0.5 });
		knock(t, 0.055, { pitch: 120, drop: 60, noiseGain: 0.5, bodyGain: 0.7, length: 0.15 });
		return t;
	},
	"chess-check": () => {
		const t = new Track(0.4);
		knock(t, 0);
		note(t, 0.05, 740, 0.15, { shape: "sine", gain: 0.33, decay: 14 });
		note(t, 0.14, 988, 0.24, { shape: "sine", gain: 0.33, decay: 11 });
		return t;
	},
	"chess-castle": () => {
		const t = new Track(0.3);
		knock(t, 0);
		knock(t, 0.1, { pitch: 230, drop: 130 });
		return t;
	},
	"chess-promote": () => {
		const t = new Track(0.6);
		knock(t, 0, { bodyGain: 0.5, noiseGain: 0.35 });
		[72, 76, 79, 84].forEach((n, i) => note(t, 0.05 + i * 0.07, midi(n), 0.32, { shape: "square", gain: 0.22, decay: 8 }));
		return t;
	},
	"chess-start": () => {
		const t = new Track(0.6);
		note(t, 0, midi(67), 0.5, { shape: "tri", gain: 0.3, attack: 0.04, decay: 5 });
		note(t, 0.04, midi(72), 0.5, { shape: "tri", gain: 0.3, attack: 0.04, decay: 5 });
		knock(t, 0.18, { bodyGain: 0.5, noiseGain: 0.4 });
		return t;
	},
	"chess-win": () => {
		const t = new Track(1.1);
		[72, 76, 79].forEach((n, i) => note(t, i * 0.1, midi(n), 0.3, { shape: "square", gain: 0.24, decay: 7 }));
		note(t, 0.3, midi(84), 0.8, { shape: "square", gain: 0.26, decay: 3.2 });
		note(t, 0.3, midi(88), 0.8, { shape: "tri", gain: 0.2, decay: 3.2 });
		return t;
	},
	"chess-lose": () => {
		const t = new Track(1.0);
		note(t, 0, midi(64), 0.35, { shape: "tri", gain: 0.4, decay: 6 });
		note(t, 0.22, midi(60), 0.35, { shape: "tri", gain: 0.4, decay: 6 });
		note(t, 0.44, midi(57), 0.55, { shape: "tri", gain: 0.42, decay: 4 });
		return t;
	},
	"chess-draw": () => {
		const t = new Track(0.8);
		note(t, 0, midi(69), 0.35, { shape: "sine", gain: 0.4, decay: 6 });
		note(t, 0.2, midi(64), 0.5, { shape: "sine", gain: 0.4, decay: 5 });
		return t;
	},
	"chess-lowtime": () => {
		const t = new Track(0.08);
		t.add(0, 0.06, (x) => (Math.sin(2 * Math.PI * 1600 * x) * 0.7 + noise() * 0.15) * Math.exp(-x * 80));
		return t;
	},
	"chess-select": () => {
		const t = new Track(0.06);
		note(t, 0, 760, 0.05, { shape: "sine", gain: 0.3, decay: 70, attack: 0.001 });
		return t;
	},
};

function wavBytes(data) {
	let peak = 0;
	for (const v of data) peak = Math.max(peak, Math.abs(v));
	const scale = peak > 0 ? 0.85 / peak : 1;
	const pcm = Buffer.alloc(data.length * 2);
	for (let i = 0; i < data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * scale)) * 32767), i * 2);
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write("WAVEfmt ", 8);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(SR, 24);
	header.writeUInt32LE(SR * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36);
	header.writeUInt32LE(pcm.length, 40);
	return Buffer.concat([header, pcm]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chess-sfx-"));
for (const [name, build] of Object.entries(sounds)) {
	const wav = path.join(tmp, `${name}.wav`);
	fs.writeFileSync(wav, wavBytes(build().data));
	const out = path.join(outDir, `${name}.mp3`);
	const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", out], { encoding: "utf8" });
	if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${result.stderr}`);
	console.log(`${name}.mp3  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}
fs.rmSync(tmp, { recursive: true, force: true });
