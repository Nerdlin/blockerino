import { GameModeType } from "@/hooks/useAppState";

export const MOVE_LIMIT_STARTING_MOVES = 30;

export type PlannedChallengeId = "rescue" | "combo_trial";
export type GameOverReason = "moves" | "time" | "move_limit";

export interface GameModeConfig {
	id: GameModeType;
	title: string;
	shortTitle: string;
	leaderboardTitle: string;
	boardLength: number;
	handSize: number;
	allowSecondChance: boolean;
	timeLimitSeconds?: number;
	moveLimit?: number;
	seedKind?: "daily";
	seedSalt?: string;
	challenge?: {
		color: string;
		buttonText: string;
		description: string;
		tags: string[];
	};
}

export interface PlannedChallengeCard {
	type: "planned";
	id: PlannedChallengeId;
	title: string;
	color: string;
	description: string;
	tags: string[];
}

export interface PlayableChallengeCard {
	type: "playable";
	mode: GameModeType;
}

export type ChallengeCard = PlayableChallengeCard | PlannedChallengeCard;

export const GAME_MODE_CONFIGS: Record<GameModeType, GameModeConfig> = {
	[GameModeType.Classic]: {
		id: GameModeType.Classic,
		title: "Classic",
		shortTitle: "Classic",
		leaderboardTitle: "Classic",
		boardLength: 8,
		handSize: 3,
		allowSecondChance: true,
	},
	[GameModeType.Chaos]: {
		id: GameModeType.Chaos,
		title: "Chaos",
		shortTitle: "Chaos",
		leaderboardTitle: "Chaos",
		boardLength: 10,
		handSize: 5,
		allowSecondChance: true,
	},
	[GameModeType.DailyPuzzle]: {
		id: GameModeType.DailyPuzzle,
		title: "Daily Puzzle",
		shortTitle: "Daily",
		leaderboardTitle: "Daily Puzzle",
		boardLength: 8,
		handSize: 3,
		allowSecondChance: true,
		seedKind: "daily",
		seedSalt: "daily-puzzle-v2",
		challenge: {
			color: "#FFD700",
			buttonText: "Play Daily",
			description: "Today's seeded board and piece order.",
			tags: ["daily", "seeded", "8x8"],
		},
	},
	[GameModeType.TimeAttack]: {
		id: GameModeType.TimeAttack,
		title: "Speed Game",
		shortTitle: "Speed",
		leaderboardTitle: "Speed Game",
		boardLength: 8,
		handSize: 3,
		allowSecondChance: true,
		timeLimitSeconds: 60,
		challenge: {
			color: "#00FFCC",
			buttonText: "Play Speed",
			description: "60 seconds. Lines and points extend time.",
			tags: ["60 sec", "time+", "fast"],
		},
	},
	[GameModeType.MoveLimit]: {
		id: GameModeType.MoveLimit,
		title: "Move Limit",
		shortTitle: "Move Limit",
		leaderboardTitle: "Move Limit",
		boardLength: 8,
		handSize: 3,
		allowSecondChance: false,
		moveLimit: MOVE_LIMIT_STARTING_MOVES,
		challenge: {
			color: "#FF5A66",
			buttonText: "Play Limit",
			description: "30 moves. Clear lines to earn bonus moves.",
			tags: ["30 moves", "line +1", "combo +3"],
		},
	},
};

export const CHALLENGE_MODE_CARDS: ChallengeCard[] = [
	{ type: "playable", mode: GameModeType.DailyPuzzle },
	{ type: "playable", mode: GameModeType.TimeAttack },
	{ type: "playable", mode: GameModeType.MoveLimit },
	{
		type: "planned",
		id: "rescue",
		title: "Rescue",
		color: "#FF8A3D",
		description: "Start from a crowded board and dig out.",
		tags: ["crowded", "survive", "soon"],
	},
	{
		type: "planned",
		id: "combo_trial",
		title: "Combo Trial",
		color: "#B57CFF",
		description: "Score big by keeping line clears chained.",
		tags: ["combo", "streak", "soon"],
	},
];

export const LEADERBOARD_GAME_MODES = [
	GameModeType.Classic,
	GameModeType.Chaos,
	GameModeType.DailyPuzzle,
	GameModeType.TimeAttack,
	GameModeType.MoveLimit,
] as const;

export const MAIN_LEADERBOARD_GAME_MODES = [
	GameModeType.Classic,
	GameModeType.Chaos,
] as const;

export const CHALLENGE_LEADERBOARD_GAME_MODES = [
	GameModeType.DailyPuzzle,
	GameModeType.TimeAttack,
	GameModeType.MoveLimit,
] as const;

export function getGameModeConfig(mode: GameModeType): GameModeConfig {
	return GAME_MODE_CONFIGS[mode];
}

export function getInitialTimeRemaining(mode: GameModeType): number {
	return getGameModeConfig(mode).timeLimitSeconds ?? 0;
}

export function getInitialMovesRemaining(mode: GameModeType): number {
	return getGameModeConfig(mode).moveLimit ?? 0;
}

export function consumeMoveLimitMove(
	mode: GameModeType,
	movesRemaining: number,
	linesBroken: number = 0,
	comboCount: number = 0,
): number {
	if (getGameModeConfig(mode).moveLimit === undefined) {
		return movesRemaining;
	}

	const bonusMoves = linesBroken > 0 ? (comboCount >= 2 ? 3 : 1) : 0;
	return Math.max(0, movesRemaining - 1 + bonusMoves);
}

export function isMoveLimitComplete(mode: GameModeType, movesRemaining: number): boolean {
	return getGameModeConfig(mode).moveLimit !== undefined && movesRemaining <= 0;
}

export function getGameOverMessage(mode: GameModeType, reason?: GameOverReason | null): string {
	if (reason === "time") return "Time ran out!";
	if (reason === "move_limit") return "Move limit reached.";
	if (reason === "moves") return "No more space for blocks on the board.";
	if (getGameModeConfig(mode).timeLimitSeconds !== undefined) return "Time ran out!";
	return "No more space for blocks on the board.";
}
