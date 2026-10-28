// Elo for chess, one rating per time class. The server applies the same formula (see the chess_ratings migration);
// this copy drives the preview on the result screen and the tests.

export const START_RATING = 1000;
export const MIN_RATING = 100;
/** A rating is shown as "?" until this many games were played in the class. */
export const PROVISIONAL_GAMES = 5;

export function expectedScore(rating: number, opponent: number): number {
	return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/** New players move fast, strong players slowly. */
export function kFactor(gamesPlayed: number, rating: number): number {
	if (gamesPlayed < 10) return 40;
	return rating < 2300 ? 20 : 10;
}

/** `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function ratingChange(rating: number, opponent: number, score: number, gamesPlayed: number): number {
	return Math.round(kFactor(gamesPlayed, rating) * (score - expectedScore(rating, opponent)));
}

export function newRating(rating: number, opponent: number, score: number, gamesPlayed: number): number {
	return Math.max(MIN_RATING, rating + ratingChange(rating, opponent, score, gamesPlayed));
}

export function isProvisional(gamesPlayed: number): boolean {
	return gamesPlayed < PROVISIONAL_GAMES;
}
