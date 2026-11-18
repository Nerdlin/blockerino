import { Platform } from "react-native";
import { buildMomentGif, buildMomentShareText, canShareFiles, createMomentFile, shareMomentFile, shareMomentLink, skinColorMapper, type MomentFile } from "./ShareMoment";
import { decodeGif } from "./GifTestUtils";
import { bestMoment, simulateGame } from "./MomentTestUtils";
import type { MomentLog } from "./MomentRecorder";

const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockFileCtor = jest.fn();
jest.mock("expo-file-system", () => ({
	Paths: { cache: { uri: "file:///cache/" } },
	File: class {
		uri: string;
		constructor(...parts: unknown[]) {
			mockFileCtor(...parts);
			this.uri = `file:///cache/${String(parts[parts.length - 1])}`;
		}
		create = mockCreate;
		write = mockWrite;
		delete = mockDelete;
	},
}));
const mockShareAsync = jest.fn();
const mockIsAvailable = jest.fn();
jest.mock("expo-sharing", () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args), isAvailableAsync: () => mockIsAvailable() }));

const g = globalThis as Record<string, unknown>;
const realOS = Platform.OS;

function setOS(os: string) {
	(Platform as { OS: string }).OS = os;
}

function logOf(): MomentLog {
	const moves = bestMoment(simulateGame(4, 10, 60), 4);
	return { boardLength: 10, moves, bestCombo: 1 };
}

function fakeFile(overrides: Partial<MomentFile> = {}): MomentFile {
	return { uri: "blob:fake", fileName: "moment.gif", bytes: Uint8Array.from([71, 73, 70]), width: 10, height: 10, durationCs: 300, release: jest.fn(), ...overrides };
}

afterEach(() => {
	setOS(realOS);
	for (const key of ["navigator", "document", "URL_createObjectURL"]) delete g[key];
	jest.clearAllMocks();
});

describe("skinColorMapper", () => {
	it("maps a recorded colour through the piece skin and remembers the answer", () => {
		const classic = skinColorMapper("piece_classic");
		const crystal = skinColorMapper("piece_crystal_aqua");
		for (const colour of [0xe38f10, 0xba1326, 0x1fa5de]) {
			const mapped = classic(colour);
			expect(mapped).toBeGreaterThanOrEqual(0);
			expect(mapped).toBeLessThanOrEqual(0xffffff);
			expect(classic(colour)).toBe(mapped);
		}
		expect(crystal(0xba1326)).not.toBe(classic(0xba1326));
	});
});

describe("buildMomentGif", () => {
	it("makes a decodable GIF in the colours of the equipped skin", async () => {
		const gif = await buildMomentGif(logOf(), "piece_crystal_aqua", { labels: { caption: "Game over" } });
		const decoded = decodeGif(gif.bytes);
		expect(decoded.frames.length).toBe(gif.frameCount);
		expect(gif.durationCs).toBeGreaterThanOrEqual(200);
		expect(gif.durationCs).toBeLessThanOrEqual(600);
		expect(gif.bytes.length).toBeLessThan(2 * 1024 * 1024);
	});
});

describe("web", () => {
	beforeEach(() => setOS("web"));

	it("creates a blob URL for the preview and frees it", async () => {
		const create = jest.fn(() => "blob:abc");
		const revoke = jest.fn();
		(URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
		(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
		const gif = await buildMomentGif(logOf(), "piece_classic");
		const file = await createMomentFile(gif);
		expect(file.uri).toBe("blob:abc");
		expect(file.fileName).toMatch(/^blockerino-moment-\d+\.gif$/);
		expect((create.mock.calls[0] as unknown[])[0]).toBeInstanceOf(Blob);
		file.release();
		expect(revoke).toHaveBeenCalledWith("blob:abc");
	});

	function stubNavigator(share?: (data: unknown) => Promise<void>, canShare = true) {
		Object.defineProperty(g, "navigator", { value: { share, canShare: share ? () => canShare : undefined }, configurable: true });
	}

	function stubDocument() {
		const link = { click: jest.fn(), style: {} as Record<string, string>, href: "", download: "", rel: "" };
		const body = { appendChild: jest.fn(), removeChild: jest.fn() };
		Object.defineProperty(g, "document", { value: { createElement: jest.fn(() => link), body }, configurable: true });
		return link;
	}

	it("shares the file with the Web Share API when the browser can", async () => {
		const share = jest.fn(async () => {});
		stubNavigator(share);
		const file = fakeFile();
		expect(canShareFiles(file)).toBe(true);
		expect(await shareMomentFile(file, { text: "hi", dialogTitle: "Share" })).toBe("shared");
		const data = (share.mock.calls[0] as unknown[])[0] as { files: File[]; text: string };
		expect(data.files[0].type).toBe("image/gif");
		expect(data.files[0].name).toBe("moment.gif");
		expect(data.text).toBe("hi");
	});

	it("treats closing the share sheet as cancelled, not as a failure", async () => {
		stubNavigator(async () => {
			throw Object.assign(new Error("closed"), { name: "AbortError" });
		});
		expect(await shareMomentFile(fakeFile(), { text: "hi", dialogTitle: "Share" })).toBe("cancelled");
	});

	it("downloads when the browser refuses to share (an iframe such as a Discord Activity)", async () => {
		stubNavigator(async () => {
			throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
		});
		const link = stubDocument();
		expect(await shareMomentFile(fakeFile(), { text: "hi", dialogTitle: "Share" })).toBe("saved");
		expect(link.click).toHaveBeenCalledTimes(1);
		expect(link.download).toBe("moment.gif");
		expect(link.href).toBe("blob:fake");
	});

	it("downloads when there is no file sharing at all (desktop browsers)", async () => {
		stubNavigator(undefined);
		const link = stubDocument();
		const file = fakeFile();
		expect(canShareFiles(file)).toBe(false);
		expect(await shareMomentFile(file, { text: "hi", dialogTitle: "Share" })).toBe("saved");
		expect(link.click).toHaveBeenCalled();
	});

	it("shares the text with the link as a fallback", async () => {
		const share = jest.fn(async () => {});
		stubNavigator(share);
		expect(await shareMomentLink({ text: "see https://x", dialogTitle: "t" })).toBe("link");
		expect(share).toHaveBeenCalledWith({ text: "see https://x" });
	});
});

describe("android", () => {
	beforeEach(() => setOS("android"));

	it("writes the GIF to the cache folder and shares it with the share sheet", async () => {
		mockIsAvailable.mockResolvedValue(true);
		mockShareAsync.mockResolvedValue(undefined);
		const gif = await buildMomentGif(logOf(), "piece_classic");
		const file = await createMomentFile(gif);
		expect(file.uri).toMatch(/^file:\/\/\/cache\/blockerino-moment-\d+\.gif$/);
		expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
		expect(mockWrite).toHaveBeenCalledWith(gif.bytes);
		expect(await shareMomentFile(file, { text: "hi", dialogTitle: "Share a moment" })).toBe("shared");
		expect(mockShareAsync).toHaveBeenCalledWith(file.uri, expect.objectContaining({ mimeType: "image/gif", dialogTitle: "Share a moment" }));
		file.release();
		expect(mockDelete).toHaveBeenCalled();
	});

	it("reports a failure when sharing is not available", async () => {
		mockIsAvailable.mockResolvedValue(false);
		expect(await shareMomentFile(fakeFile({ uri: "file:///x.gif" }), { text: "hi", dialogTitle: "t" })).toBe("failed");
		expect(mockShareAsync).not.toHaveBeenCalled();
	});
});

describe("buildMomentShareText", () => {
	it("fills the score, the mode and the link", () => {
		const text = buildMomentShareText("{score} in {mode}: {url}", 120, "Classic");
		expect(text).toMatch(/^120 in Classic: https:\/\//);
	});
});
