import type { UiGlyphName } from "./UiGlyphs";

export type LeaderboardTierId = "gold" | "silver" | "bronze" | "top5" | "top10";

export interface LeaderboardTier {
	id: LeaderboardTierId;
	/** Accent colour used for the rank text, border and glow. */
	color: string;
	/** Row background tint. */
	background: string;
	/** Border width; 0 means no border. */
	borderWidth: number;
	/** Pixel icon shown instead of the rank number, if any. */
	icon?: UiGlyphName;
}

const TIERS: Record<LeaderboardTierId, LeaderboardTier> = {
	gold: { id: "gold", color: "#FFD700", background: "rgba(255,215,0,0.16)", borderWidth: 2, icon: "crown" },
	silver: { id: "silver", color: "#D7DEE8", background: "rgba(215,222,232,0.13)", borderWidth: 2, icon: "medalSilver" },
	bronze: { id: "bronze", color: "#E0924F", background: "rgba(224,146,79,0.13)", borderWidth: 2, icon: "medalBronze" },
	top5: { id: "top5", color: "#8B5CF6", background: "rgba(139,92,246,0.12)", borderWidth: 1 },
	top10: { id: "top10", color: "#64748B", background: "rgba(100,116,139,0.10)", borderWidth: 0 },
};

/** Visual tier for a 1-based leaderboard rank; undefined below the top 10. */
export function getLeaderboardTier(rank: number): LeaderboardTier | undefined {
	if (!Number.isInteger(rank) || rank < 1) return undefined;
	if (rank === 1) return TIERS.gold;
	if (rank === 2) return TIERS.silver;
	if (rank === 3) return TIERS.bronze;
	if (rank <= 5) return TIERS.top5;
	if (rank <= 10) return TIERS.top10;
	return undefined;
}
