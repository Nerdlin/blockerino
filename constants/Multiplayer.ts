export type ActivePlayerRole = "player1" | "player2";
export type MatchWinnerRole = ActivePlayerRole | "draw";

export function normalizePlayerName(playerName: string): string {
	return playerName.trim() || "Anonymous";
}

export function getJoinRoomUpdate(playerName: string, playerId: string) {
	return {
		player2_name: normalizePlayerName(playerName),
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
