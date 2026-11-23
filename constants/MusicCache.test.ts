jest.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
jest.mock("./NetworkStatus", () => ({ isOnline: jest.fn() }));

import { chooseMusicSource, musicCacheFileName } from "./MusicCache";

describe("chooseMusicSource", () => {
	it("prefers the saved copy, online or not", () => {
		expect(chooseMusicSource(true, true)).toBe("cache");
		expect(chooseMusicSource(true, false)).toBe("cache");
	});

	it("plays from the cloud when there is no copy and the network is up", () => {
		expect(chooseMusicSource(false, true)).toBe("remote");
	});

	it("has nothing to play offline without a copy", () => {
		expect(chooseMusicSource(false, false)).toBe("none");
	});
});

describe("musicCacheFileName", () => {
	it("keeps ids as they are and makes odd characters safe", () => {
		expect(musicCacheFileName("oga-001-synthwave-4k-0")).toBe("oga-001-synthwave-4k-0.mp3");
		expect(musicCacheFileName("../a b/c")).toBe("___a_b_c.mp3");
	});
});
