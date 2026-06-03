import { GameModeType } from "@/hooks/useAppState";
import { shouldCheckConnectionBeforeStart } from "./GameStart";

describe("solo game start policy", () => {
	it("starts solo modes without a Supabase connectivity gate", () => {
		expect(shouldCheckConnectionBeforeStart(GameModeType.Classic)).toBe(false);
		expect(shouldCheckConnectionBeforeStart(GameModeType.Chaos)).toBe(false);
		expect(shouldCheckConnectionBeforeStart(GameModeType.DailyPuzzle)).toBe(false);
		expect(shouldCheckConnectionBeforeStart(GameModeType.TimeAttack)).toBe(false);
	});
});
