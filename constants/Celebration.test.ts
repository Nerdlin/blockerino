import { celebrate, newPassTier, passTierKey, subscribeToCelebrations, type CelebrationEvent } from "./Celebration";

describe("celebrations", () => {
	it("celebrates a pass level only after the first look, and only the newest", () => {
		expect(newPassTier(null, 5)).toBeNull();
		expect(newPassTier(3, 3)).toBeNull();
		expect(newPassTier(3, 2)).toBeNull();
		expect(newPassTier(3, 6)).toBe(6);
		expect(passTierKey("2026-11")).toBe("CELEBRATED_PASS_TIER:2026-11");
	});

	it("hands events to subscribers until they leave", () => {
		const seen: string[] = [];
		const stop = subscribeToCelebrations((event: CelebrationEvent) => seen.push(event.id));
		celebrate({ id: "a", icon: "star", accent: "#fff", title: "A" });
		stop();
		celebrate({ id: "b", icon: "star", accent: "#fff", title: "B" });
		expect(seen).toEqual(["a"]);
	});
});
