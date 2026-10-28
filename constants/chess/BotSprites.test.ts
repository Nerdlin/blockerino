import { ADAPTIVE_BOT, CHESS_BOTS } from "./BotRoster";
import { SPRITE_SIZE, botSprite, spritePixels } from "./BotSprites";

describe("bot sprites", () => {
	it("draws a 12x12 face with a head, eyes and shoulders", () => {
		const bot = CHESS_BOTS[0];
		const sprite = botSprite(bot.look);
		expect(sprite).toHaveLength(SPRITE_SIZE);
		expect(sprite.every((row) => row.length === SPRITE_SIZE)).toBe(true);
		expect(sprite[6][4]).toBe("#101018");
		expect(sprite[6][7]).toBe("#101018");
		expect(sprite[11][5]).toBe(bot.look.shirt);
		expect(spritePixels(sprite).length).toBeGreaterThan(50);
	});

	it("gives every bot, including Echo, a different face", () => {
		const faces = [...CHESS_BOTS, { ...ADAPTIVE_BOT, elo: 1000 }].map((bot) => JSON.stringify(botSprite(bot.look)));
		expect(new Set(faces).size).toBe(faces.length);
	});

	it("keeps every pixel inside the grid for every hair and accessory", () => {
		const base = CHESS_BOTS[0].look;
		for (const hair of ["bald", "short", "long", "bob", "spiky", "curly", "ponytail"] as const) {
			for (const accessory of ["none", "cap", "headband", "glasses", "horns", "antenna", "crown", "mustache", "helm", "scarf", "freckles"] as const) {
				for (const mouth of ["smile", "flat", "open"] as const) {
					const sprite = botSprite({ ...base, hair, accessory, mouth });
					expect(sprite).toHaveLength(SPRITE_SIZE);
					for (const [row, col] of spritePixels(sprite)) {
						expect(row).toBeGreaterThanOrEqual(0);
						expect(row).toBeLessThan(SPRITE_SIZE);
						expect(col).toBeLessThan(SPRITE_SIZE);
					}
				}
			}
		}
	});
});
