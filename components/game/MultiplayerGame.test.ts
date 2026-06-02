import { readFileSync } from "fs";
import { join } from "path";

describe("multiplayer game mechanics", () => {
	it("does not keep garbage attack broadcasts in multiplayer", () => {
		const source = readFileSync(join(__dirname, "MultiplayerGame.tsx"), "utf8");

		expect(source).not.toContain("garbage_attack");
		expect(source).not.toContain("sendGarbageAttack");
		expect(source).not.toContain("addGarbageLines");
	});
});
