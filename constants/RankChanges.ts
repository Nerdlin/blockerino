import { useEffect, useState } from "react";
import { supabase } from "./Supabase";

// Arrows on the leaderboards: the server keeps a daily snapshot of the top 100 (migration rank_snapshots) and
// get_rank_changes(board) says where each name stood in the last one older than today.

export type RankBoard = "season_classic" | "season_chaos" | "elo";
export type PrevRanks = ReadonlyMap<string, number>;

const NONE: PrevRanks = new Map();

/** Places gained since that snapshot: positive = moved up, negative = moved down, 0 = same, null = was not in the top 100. */
export function rankChange(prev: PrevRanks, name: string, rank: number): number | null {
	const before = prev.get(name);
	return before === undefined ? null : before - rank;
}

export async function fetchPrevRanks(board: RankBoard): Promise<PrevRanks> {
	try {
		const { data, error } = await supabase.rpc("get_rank_changes", { p_board: board });
		if (error || !Array.isArray(data)) return NONE;
		return new Map(data.map((row: { player_name: string; prev_rank: number }) => [row.player_name, row.prev_rank]));
	} catch {
		return NONE;
	}
}

/** The previous ranks of a board (empty while loading, for no board, or when there is no older snapshot yet). */
export function usePrevRanks(board: RankBoard | null): PrevRanks {
	const [prev, setPrev] = useState<PrevRanks>(NONE);
	useEffect(() => {
		let active = true;
		setPrev(NONE);
		if (!board) return undefined;
		void fetchPrevRanks(board).then((next) => active && setPrev(next));
		return () => {
			active = false;
		};
	}, [board]);
	return prev;
}
