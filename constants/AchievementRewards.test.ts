const mockRpc = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("./Supabase", () => ({
	supabase: {
		rpc: (...args: unknown[]) => mockRpc(...args),
		auth: { getSession: () => mockGetSession() },
	},
}));

import fs from "fs";
import path from "path";
import { ACHIEVEMENT_CHAIN_GROUPS, ACHIEVEMENT_DEFINITIONS, buildAchievementRows, getDefaultAchievementStats } from "./Achievements";
import { buildChainViews, claimAchievements, getClaimableAchievementIds, parseAchievementClaim, readClaimedAchievements } from "./AchievementRewards";
import { GameModeType } from "@/hooks/useAppState";

beforeEach(() => {
	mockRpc.mockReset();
	mockGetSession.mockReset();
});

describe("achievement chains", () => {
	it("gives every achievement a chain, a positive reward and a tab", () => {
		for (const definition of ACHIEVEMENT_DEFINITIONS) {
			expect(definition.chain).toBeTruthy();
			expect(definition.reward).toBeGreaterThan(0);
			expect(ACHIEVEMENT_CHAIN_GROUPS[definition.chain]).toBeDefined();
		}
	});

	it("uses unique ids and strictly growing targets with growing rewards inside a chain", () => {
		const ids = ACHIEVEMENT_DEFINITIONS.map((definition) => definition.id);
		expect(new Set(ids).size).toBe(ids.length);
		const chains = new Map<string, typeof ACHIEVEMENT_DEFINITIONS>();
		for (const definition of ACHIEVEMENT_DEFINITIONS) chains.set(definition.chain, [...(chains.get(definition.chain) ?? []), definition]);
		for (const [chain, tiers] of chains) {
			const sorted = [...tiers].sort((a, b) => a.target - b.target);
			sorted.forEach((tier, index) => {
				if (index === 0) return;
				expect({ chain, grows: tier.target > sorted[index - 1].target }).toEqual({ chain, grows: true });
				expect({ chain, rewards: tier.reward >= sorted[index - 1].reward }).toEqual({ chain, rewards: true });
			});
		}
	});

	it("has the same rewards in the database function as in the app", () => {
		const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261021110000_achievement_rewards.sql"), "utf8");
		const body = migration.slice(migration.indexOf("FUNCTION public.achievement_reward"), migration.indexOf("FUNCTION public.achievement_streak_requirement"));
		const sqlRewards = new Map([...body.matchAll(/WHEN '([a-z_0-9]+)' THEN (\d+)/g)].map((match) => [match[1], Number(match[2])]));
		expect(sqlRewards.size).toBe(ACHIEVEMENT_DEFINITIONS.length);
		for (const definition of ACHIEVEMENT_DEFINITIONS) {
			expect({ id: definition.id, reward: sqlRewards.get(definition.id) }).toEqual({ id: definition.id, reward: definition.reward });
		}
	});

	it("checks the streak tiers on the server with the same lengths as the app", () => {
		const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261021110000_achievement_rewards.sql"), "utf8");
		const body = migration.slice(migration.indexOf("FUNCTION public.achievement_streak_requirement"), migration.indexOf("FUNCTION public.claim_achievements"));
		const required = new Map([...body.matchAll(/WHEN '([a-z_0-9]+)' THEN (\d+)/g)].map((match) => [match[1], Number(match[2])]));
		for (const definition of ACHIEVEMENT_DEFINITIONS.filter((item) => item.chain === "streak")) {
			expect(required.get(definition.id)).toBe(definition.target);
		}
	});
});

describe("progress for the new chains", () => {
	it("counts wins, high-water marks and different games won", () => {
		const rows = buildAchievementRows(
			[{ score: 100, date: 1, type: GameModeType.Classic }],
			{ ...getDefaultAchievementStats(), versusWins: 3, chessWins: 2, durakWins: 1, peakCoins: 5200, streakBest: 9, botWins: 4, botHardWins: 1 }
		);
		const current = (id: string) => rows.find((row) => row.id === id)?.progress.current;
		expect(current("first_duel")).toBe(3);
		expect(current("pawn_pusher")).toBe(2);
		expect(current("piggy_bank")).toBe(5200);
		expect(current("week_warrior")).toBe(9);
		expect(current("sparring_bot")).toBe(4);
		expect(current("tough_nut")).toBe(1);
		expect(current("game_hopper")).toBe(3);
		expect(rows.find((row) => row.id === "coin_stack")?.progress.complete).toBe(true);
		expect(rows.find((row) => row.id === "treasure_chest")?.progress.complete).toBe(false);
	});
});

describe("chain views", () => {
	const rows = buildAchievementRows([], { ...getDefaultAchievementStats(), soloGamesFinished: 12 });

	it("focuses the next unfinished tier and lists finished tiers that were not collected", () => {
		const view = buildChainViews(rows, ["first_steps"]).find((chain) => chain.chain === "solo_games")!;
		expect(view.completedTiers).toBe(2);
		expect(view.focus.id).toBe("marathoner");
		expect(view.claimable.map((tier) => tier.id)).toEqual(["regular_player"]);
		expect(view.claimableCoins).toBe(50);
		expect(view.allDone).toBe(false);
		expect(getClaimableAchievementIds(rows, ["first_steps"])).toContain("regular_player");
	});

	it("stays on the last tier when the chain is finished", () => {
		const finished = buildAchievementRows([], { ...getDefaultAchievementStats(), soloGamesFinished: 5000 });
		const view = buildChainViews(finished, []).find((chain) => chain.chain === "solo_games")!;
		expect(view.allDone).toBe(true);
		expect(view.focus.id).toBe("solo_legend");
	});
});

describe("claimAchievements", () => {
	it("returns null for guests without calling the server", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });
		expect(await claimAchievements(["first_steps"])).toBeNull();
		expect(mockRpc).not.toHaveBeenCalled();
	});

	it("sends the ids, parses the answer and remembers the claimed tiers", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
		mockRpc.mockResolvedValue({ data: { status: "ok", coins: 275, granted: ["first_steps"], claimed: ["first_steps", "good_habit"] }, error: null });
		const result = await claimAchievements(["first_steps"]);
		expect(mockRpc).toHaveBeenCalledWith("claim_achievements", { p_ids: ["first_steps"] });
		expect(result).toEqual({ coins: 275, granted: ["first_steps"], claimed: ["first_steps", "good_habit"] });
		expect(await readClaimedAchievements()).toEqual(["first_steps", "good_habit"]);
	});

	it("returns null on errors and on answers that are not ok", async () => {
		mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
		mockRpc.mockResolvedValue({ data: null, error: { message: "offline" } });
		expect(await claimAchievements(["first_steps"])).toBeNull();
		expect(parseAchievementClaim({ status: "no_profile" })).toBeNull();
		expect(parseAchievementClaim(null)).toBeNull();
	});
});
