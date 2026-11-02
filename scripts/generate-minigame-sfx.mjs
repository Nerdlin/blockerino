// Synthesizes the sound effects of the card and board mini-games (Durak cards, Sea Battle shots, Tic-Tac-Toe marks)
// and writes them as MP3 into assets/sounds/minigames. No samples are used, so there is nothing to license. Needs
// ffmpeg. Checkers uses the chess sounds (scripts/generate-chess-sfx.mjs).
//   node scripts/generate-minigame-sfx.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "sounds", "minigames");
const SR = 44100;
fs.mkdirSync(outDir, { recursive: true });

let seed = 24680;
const noise = () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return (seed / 4294967296) * 2 - 1;
};

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

// noise through a one-pole low-pass whose cutoff follows `cutoff(t, k)`; a high-pass is the noise minus that
function filteredNoise(track, start, seconds, { cutoff, envelope, highPass = false, gain = 1 }) {
	let lp = 0;
	track.add(start, seconds, (t, k) => {
		const raw = noise();
		lp += (raw - lp) * cutoff(t, k);
		return (highPass ? raw - lp : lp) * envelope(t, k);
	}, gain);
}

// a sine whose pitch glides from `from` to `to` (exponentially, at `speed`)
function glide(track, start, seconds, { from, to, speed = 30, decay = 8, gain = 0.8, attack = 0.002 }) {
	let phase = 0;
	track.add(start, seconds, (t) => {
		const freq = to + (from - to) * Math.exp(-t * speed);
		phase += freq / SR;
		return Math.sin(2 * Math.PI * phase) * Math.min(1, t / attack) * Math.exp(-t * decay);
	}, gain);
}

// a card leaving the pack: a short airy flick
function flick(track, start, gain = 1) {
	filteredNoise(track, start, 0.07, { highPass: true, cutoff: () => 0.18, envelope: (t) => Math.min(1, t / 0.004) * Math.exp(-t * 55), gain: 0.9 * gain });
	filteredNoise(track, start, 0.05, { cutoff: () => 0.35, envelope: (t) => Math.exp(-t * 90), gain: 0.35 * gain });
}

const sounds = {
	"card-deal": () => {
		const t = new Track(0.09);
		flick(t, 0);
		return t;
	},
	"card-play": () => {
		const t = new Track(0.12);
		filteredNoise(t, 0, 0.03, { highPass: true, cutoff: () => 0.08, envelope: (x) => Math.exp(-x * 160), gain: 1 });
		glide(t, 0, 0.1, { from: 260, to: 140, speed: 60, decay: 45, gain: 0.7 });
		return t;
	},
	"card-sweep": () => {
		const t = new Track(0.42);
		filteredNoise(t, 0, 0.4, { cutoff: (x, k) => 0.04 + k * 0.3, envelope: (x, k) => Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 1.5, gain: 1 });
		return t;
	},
	"card-take": () => {
		const t = new Track(0.32);
		[0, 0.055, 0.11, 0.16].forEach((at, i) => flick(t, at, 1 - i * 0.12));
		glide(t, 0.2, 0.1, { from: 180, to: 110, speed: 50, decay: 40, gain: 0.5 });
		return t;
	},
	"shot-fire": () => {
		const t = new Track(0.36);
		glide(t, 0, 0.3, { from: 120, to: 45, speed: 18, decay: 14, gain: 1 });
		filteredNoise(t, 0, 0.32, { cutoff: (x, k) => 0.5 - k * 0.45, envelope: (x) => Math.min(1, x / 0.003) * Math.exp(-x * 16), gain: 0.7 });
		return t;
	},
	"shot-splash": () => {
		const t = new Track(0.6);
		filteredNoise(t, 0, 0.55, { cutoff: (x, k) => 0.35 - k * 0.3, envelope: (x) => Math.min(1, x / 0.012) * Math.exp(-x * 7), gain: 0.9 });
		// a few bubbles rising out of the water
		[[0.08, 520], [0.15, 760], [0.21, 640], [0.3, 900]].forEach(([at, freq]) => glide(t, at, 0.07, { from: freq * 0.7, to: freq * 1.4, speed: 40, decay: 45, gain: 0.22 }));
		return t;
	},
	"shot-hit": () => {
		const t = new Track(0.75);
		glide(t, 0, 0.7, { from: 95, to: 38, speed: 9, decay: 6, gain: 1 });
		filteredNoise(t, 0, 0.7, { cutoff: (x, k) => 0.6 - k * 0.55, envelope: (x) => Math.min(1, x / 0.002) * Math.exp(-x * 6.5), gain: 1 });
		// crackle of the fire
		filteredNoise(t, 0.08, 0.5, { highPass: true, cutoff: () => 0.3, envelope: (x) => (noise() > 0.82 ? 1 : 0.05) * Math.exp(-x * 7), gain: 0.35 });
		return t;
	},
	"ship-sunk": () => {
		const t = new Track(1.3);
		glide(t, 0, 0.9, { from: 80, to: 30, speed: 6, decay: 4, gain: 1 });
		filteredNoise(t, 0, 1.0, { cutoff: (x, k) => 0.55 - k * 0.5, envelope: (x) => Math.min(1, x / 0.002) * Math.exp(-x * 4), gain: 1 });
		// the hull going down: a long falling groan and the water closing over it
		glide(t, 0.35, 0.8, { from: 220, to: 70, speed: 3, decay: 3, gain: 0.35, attack: 0.08 });
		filteredNoise(t, 0.6, 0.65, { cutoff: () => 0.12, envelope: (x, k) => Math.sin(Math.PI * k) * 0.8, gain: 0.5 });
		return t;
	},
	"tic-x": () => {
		const t = new Track(0.12);
		glide(t, 0, 0.11, { from: 1250, to: 720, speed: 45, decay: 32, gain: 0.7 });
		filteredNoise(t, 0, 0.02, { highPass: true, cutoff: () => 0.2, envelope: (x) => Math.exp(-x * 200), gain: 0.4 });
		return t;
	},
	"tic-o": () => {
		const t = new Track(0.14);
		glide(t, 0, 0.13, { from: 520, to: 780, speed: 30, decay: 26, gain: 0.75, attack: 0.004 });
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minigame-sfx-"));
for (const [name, build] of Object.entries(sounds)) {
	const wav = path.join(tmp, `${name}.wav`);
	fs.writeFileSync(wav, wavBytes(build().data));
	const out = path.join(outDir, `${name}.mp3`);
	const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "acompressor=threshold=-24dB:ratio=6:attack=1:release=50:makeup=8,alimiter=limit=0.89:level=false", "-codec:a", "libmp3lame", "-b:a", "96k", out], { encoding: "utf8" });
	if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${result.stderr}`);
	console.log(`${name}.mp3  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}
fs.rmSync(tmp, { recursive: true, force: true });
