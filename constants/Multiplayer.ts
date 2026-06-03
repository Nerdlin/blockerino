export type ActivePlayerRole = "player1" | "player2";
export type MultiplayerRole = ActivePlayerRole | "spectator";
export type MultiplayerGameViewMode = "active_player" | "opponent_watch" | "live_spectator";
export type MatchWinnerRole = ActivePlayerRole | "draw";
export type MatchmakingRoomStatus = "waiting" | "playing" | "finished";

export const ROOM_CLEANUP_RPC = "cleanup_matchmaking_rooms";

export const ROOM_RETENTION_MS = {
	publicWaiting: 5 * 60 * 1000,
	privateWaiting: 30 * 60 * 1000,
	playing: 90 * 60 * 1000,
	finished: 2 * 60 * 60 * 1000,
	absolute: 24 * 60 * 60 * 1000,
} as const;

export interface MatchmakingRoomSummary {
	created_at?: string | null;
	is_private?: boolean | null;
	status?: MatchmakingRoomStatus | string | null;
}

export function getStaleRoomCutoffs(nowMs: number = Date.now()) {
	return {
		publicWaiting: new Date(nowMs - ROOM_RETENTION_MS.publicWaiting).toISOString(),
		privateWaiting: new Date(nowMs - ROOM_RETENTION_MS.privateWaiting).toISOString(),
		playing: new Date(nowMs - ROOM_RETENTION_MS.playing).toISOString(),
		finished: new Date(nowMs - ROOM_RETENTION_MS.finished).toISOString(),
		absolute: new Date(nowMs - ROOM_RETENTION_MS.absolute).toISOString(),
	};
}

export function isVisiblePublicRoom(room: MatchmakingRoomSummary, nowMs: number = Date.now()): boolean {
	if (room.is_private) return false;
	if (!room.created_at) return false;

	const createdAt = new Date(room.created_at).getTime();
	if (!Number.isFinite(createdAt)) return false;

	if (room.status === "waiting") {
		return nowMs - createdAt <= ROOM_RETENTION_MS.publicWaiting;
	}

	if (room.status === "playing") {
		return nowMs - createdAt <= ROOM_RETENTION_MS.playing;
	}

	return false;
}

export function normalizePlayerName(playerName: string): string {
	return playerName.trim();
}

export function isPlayerNameReady(playerName: string): boolean {
	return normalizePlayerName(playerName).length > 0;
}

export function assertPlayerNameReady(playerName: string): string {
	const normalizedName = normalizePlayerName(playerName);
	if (!normalizedName) {
		throw new Error("Player name is required");
	}
	return normalizedName;
}

export function getJoinRoomUpdate(playerName: string, playerId: string) {
	return {
		player2_name: assertPlayerNameReady(playerName),
		player2_id: playerId,
		status: "playing",
		is_private: false,
	};
}

export function getOpponentPlayerRole(role: ActivePlayerRole): ActivePlayerRole {
	return role === "player1" ? "player2" : "player1";
}

export function getMultiplayerViewMode(
	role: MultiplayerRole,
	isWatchingOpponent: boolean
): MultiplayerGameViewMode {
	if (role === "spectator") return "live_spectator";
	return isWatchingOpponent ? "opponent_watch" : "active_player";
}

export function getWinnerRoleByScore(
	myRole: ActivePlayerRole,
	myScore: number,
	opponentScore: number
): MatchWinnerRole {
	if (myScore === opponentScore) return "draw";
	if (myScore > opponentScore) return myRole;
	return getOpponentPlayerRole(myRole);
}

export function getWinnerNameForRole(winnerRole: MatchWinnerRole): string {
	if (winnerRole === "player1") return "Player 1";
	if (winnerRole === "player2") return "Player 2";
	return "Draw";
}
