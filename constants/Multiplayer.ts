export type ActivePlayerRole = "player1" | "player2";
export type MatchWinnerRole = ActivePlayerRole | "draw";

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
