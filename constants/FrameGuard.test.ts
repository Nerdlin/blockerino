import { FRAME_GUARD_SCRIPT } from "./FrameGuard";

// Runs the inline script against a fake window/location/document and reports whether it blocked the page.
function run(opts: { framed: boolean; hostname?: string; search?: string; ancestors?: string[] }): boolean {
	let blocked = false;
	const self = {};
	const win = { self, top: opts.framed ? {} : self, stop: () => {} };
	const location = { hostname: opts.hostname ?? "blockerino.aionerdlin.me", search: opts.search ?? "", ancestorOrigins: opts.ancestors };
	const doc = { open: () => { blocked = true; }, write: () => {}, close: () => {} };
	new Function("window", "location", "document", FRAME_GUARD_SCRIPT)(win, location, doc);
	return blocked;
}

describe("frame guard", () => {
	it("leaves the normal page alone", () => {
		expect(run({ framed: false })).toBe(false);
	});

	it("blocks a foreign page that frames the game", () => {
		expect(run({ framed: true, ancestors: ["https://www.jungleyard.com"] })).toBe(true);
		expect(run({ framed: true, ancestors: ["https://discord.com.evil.example"] })).toBe(true);
		expect(run({ framed: true })).toBe(true); // browsers without ancestorOrigins
	});

	it("blocks when any ancestor in the chain is foreign", () => {
		expect(run({ framed: true, ancestors: ["https://discord.com", "https://www.jungleyard.com"] })).toBe(true);
	});

	it("allows Discord Activities", () => {
		expect(run({ framed: true, hostname: "123456.discordsays.com", ancestors: ["https://discord.com"] })).toBe(false);
		expect(run({ framed: true, search: "?frame_id=1&instance_id=2" })).toBe(false);
	});

	it("allows our own domain to frame it", () => {
		expect(run({ framed: true, ancestors: ["https://aionerdlin.me"] })).toBe(false);
		expect(run({ framed: true, ancestors: ["https://blockerino.aionerdlin.me"] })).toBe(false);
	});
});

describe("frame guard script as an inline <script>", () => {
	it("contains nothing the HTML exporter or the HTML parser would rewrite", () => {
		// the exporter injects its scripts at "</body>"; a stray "</script" would end the tag early
		expect(FRAME_GUARD_SCRIPT.toLowerCase()).not.toContain("</body");
		expect(FRAME_GUARD_SCRIPT.toLowerCase()).not.toContain("</script");
		expect(FRAME_GUARD_SCRIPT.toLowerCase()).not.toContain("<script");
		expect(() => new Function(FRAME_GUARD_SCRIPT)).not.toThrow();
	});
});
