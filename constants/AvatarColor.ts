import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
// pure JavaScript JPEG decoder (no native module, so it also reaches phones through an OTA update)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decodeJpeg: (data: Uint8Array, options: { useTArray: boolean; formatAsRGBA: boolean; maxMemoryUsageInMB: number }) => { width: number; height: number; data: Uint8Array } = require("jpeg-js/lib/decoder");

// The colour of a profile's banner and frame comes from the avatar picture: the dominant vivid hue of the image.

const SAMPLE = 24;
const CACHE_PREFIX = "AVATAR_COLOR_V1:";
const memory = new Map<string, string | null>();

function toHex(r: number, g: number, b: number): string {
	return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
	const max = Math.max(r, g, b) / 255;
	const min = Math.min(r, g, b) / 255;
	const d = max - min;
	let h = 0;
	if (d > 0) {
		if (max === r / 255) h = ((g - b) / 255 / d) % 6;
		else if (max === g / 255) h = (b - r) / 255 / d + 2;
		else h = (r - g) / 255 / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * The dominant vivid colour of RGBA pixels: pixels are grouped by hue, grey, dark and washed-out ones count little, the
 * heaviest hue wins and is brought to a clearly visible strength (a banner and a frame must read on the dark menu).
 * Returns null for a picture with no colour at all (grey scale): the caller keeps its own colour then.
 */
export function dominantColor(rgba: ArrayLike<number>): string | null {
	const BUCKETS = 12;
	const weight = new Array<number>(BUCKETS).fill(0);
	const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0]);
	let total = 0;
	for (let i = 0; i + 3 < rgba.length; i += 4) {
		if (rgba[i + 3] < 128) continue;
		const r = rgba[i];
		const g = rgba[i + 1];
		const b = rgba[i + 2];
		const { h, s, v } = rgbToHsv(r, g, b);
		const w = s * s * v; // vivid and bright pixels dominate
		total += w;
		if (s < 0.18 || v < 0.15) continue;
		const bucket = Math.min(BUCKETS - 1, Math.floor(h / (360 / BUCKETS)));
		weight[bucket] += w;
		sum[bucket][0] += r * w;
		sum[bucket][1] += g * w;
		sum[bucket][2] += b * w;
	}
	let best = 0;
	for (let i = 1; i < BUCKETS; i++) if (weight[i] > weight[best]) best = i;
	if (weight[best] <= 0 || total <= 0 || weight[best] / total < 0.12) return null;
	const r = sum[best][0] / weight[best];
	const g = sum[best][1] / weight[best];
	const b = sum[best][2] / weight[best];
	const { h, s, v } = rgbToHsv(r, g, b);
	const [rr, gg, bb] = hsvToRgb(h, Math.max(0.72, s), Math.max(0.93, Math.min(1, v)));
	return toHex(rr, gg, bb);
}

function base64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

function mimeOf(bytes: Uint8Array): string {
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
	if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
	return "image/jpeg";
}

async function readColor(url: string): Promise<string | null> {
	const response = await fetch(url);
	if (!response.ok) return null;
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.length === 0 || bytes.length > 2_000_000) return null;
	// shrink to a tiny JPEG on the native side (any format in), then decode only that
	const small = await ImageManipulator.manipulateAsync(
		`data:${mimeOf(bytes)};base64,${base64(bytes)}`,
		[{ resize: { width: SAMPLE, height: SAMPLE } }],
		{ compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
	);
	if (!small.base64) return null;
	const raw = atob(small.base64);
	const jpeg = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) jpeg[i] = raw.charCodeAt(i);
	const image = decodeJpeg(jpeg, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 32 });
	return dominantColor(image.data);
}

/** Colour of an avatar picture (remembered on the device), or null for an emoji/letter avatar, a grey picture or any failure. */
export async function getAvatarColor(url: string | null | undefined): Promise<string | null> {
	if (!url || !url.startsWith("http")) return null;
	if (memory.has(url)) return memory.get(url) ?? null;
	try {
		const stored = await AsyncStorage.getItem(CACHE_PREFIX + url);
		if (stored !== null) {
			const value = stored === "" ? null : stored;
			memory.set(url, value);
			return value;
		}
	} catch {
		// the picture is read again
	}
	let color: string | null = null;
	try {
		color = await readColor(url);
	} catch {
		return null; // do not remember a failure: the next visit tries again
	}
	memory.set(url, color);
	try {
		await AsyncStorage.setItem(CACHE_PREFIX + url, color ?? "");
	} catch {
		// ignored
	}
	return color;
}

/** The avatar's colour for a banner: `fallback` until it is known (and for pictures without a colour). */
export function useAvatarColor(url: string | null | undefined, fallback: string): string {
	const [color, setColor] = useState<string | null>(url && memory.has(url) ? memory.get(url) ?? null : null);
	useEffect(() => {
		let active = true;
		void getAvatarColor(url).then((next) => {
			if (active) setColor(next);
		});
		return () => {
			active = false;
		};
	}, [url]);
	return color ?? fallback;
}
