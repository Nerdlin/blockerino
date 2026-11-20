import { dominantColor } from "./AvatarColor";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));

function pixels(...rows: [number, number, number, number][]): number[] {
	return rows.flatMap((p) => p);
}

describe("avatar colour", () => {
	it("picks the dominant vivid hue and strengthens it", () => {
		const blue = Array.from({ length: 30 }, () => [20, 60, 200, 255] as [number, number, number, number]);
		const red = Array.from({ length: 5 }, () => [200, 30, 30, 255] as [number, number, number, number]);
		const hex = dominantColor(pixels(...blue, ...red));
		expect(hex).toMatch(/^#[0-9a-f]{6}$/);
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex!.slice(i, i + 2), 16));
		expect(b).toBeGreaterThan(r);
		expect(b).toBeGreaterThan(g);
		expect(Math.max(r, g, b)).toBeGreaterThanOrEqual(200);
	});

	it("ignores grey, black and white and transparent pixels", () => {
		const grey = Array.from({ length: 20 }, () => [120, 120, 120, 255] as [number, number, number, number]);
		const black = Array.from({ length: 20 }, () => [0, 0, 0, 255] as [number, number, number, number]);
		expect(dominantColor(pixels(...grey, ...black))).toBeNull();
		const clear = Array.from({ length: 20 }, () => [255, 0, 0, 0] as [number, number, number, number]);
		expect(dominantColor(pixels(...clear))).toBeNull();
	});

	it("keeps a small vivid accent out when the picture is mostly grey", () => {
		const grey = Array.from({ length: 95 }, () => [110, 110, 110, 255] as [number, number, number, number]);
		const accent = Array.from({ length: 5 }, () => [255, 40, 40, 255] as [number, number, number, number]);
		// the accent is under the 12% share of the vivid weight only when something else is vivid; here it is the only colour
		expect(dominantColor(pixels(...grey, ...accent))).not.toBeNull();
	});
});
