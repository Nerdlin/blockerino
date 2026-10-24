import { SHARE_URL, buildShareText } from "./ShareScore";

describe("buildShareText", () => {
	it("fills the score, the mode and the link into the template", () => {
		const text = buildShareText(4200, "Classic", "I scored {score} in {mode}! {url}");
		expect(text).toBe(`I scored 4200 in Classic! ${SHARE_URL}`);
	});

	it("keeps a template without placeholders as it is", () => {
		expect(buildShareText(1, "Chaos", "Hello")).toBe("Hello");
	});
});
