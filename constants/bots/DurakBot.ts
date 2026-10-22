import { BLUNDER_RATE, BotDifficulty, pickRandom, Rng } from "./Difficulty";

// The computer's play for Durak. It sees only what a seated player sees: its own hand, the table, the trump, the size
// of the deck and how many cards the defender holds. It never cheats, never transfers and does not accuse anyone.

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export interface DurakBotBout {
	attack: string;
	defense: string | null;
}

export interface DurakBotView {
	hand: string[];
	table: DurakBotBout[];
	trump: string;
	deckCount: number;
	/** The bot is the one attacking (or throwing in) this round. */
	isAttacker: boolean;
	/** The bot is the one who has to answer the attack. */
	isDefender: boolean;
	defenderHandSize: number;
}

export type DurakBotAction =
	| { type: "attack"; card: string }
	| { type: "defend"; card: string; index: number }
	| { type: "take" }
	| { type: "pass" }
	| { type: "wait" };

const rankOf = (card: string) => card.slice(0, -1);
const suitOf = (card: string) => card.slice(-1);
const valueOf = (card: string) => RANKS.indexOf(rankOf(card));

function beats(defense: string, attack: string, trump: string): boolean {
	if (suitOf(defense) === suitOf(attack)) return valueOf(defense) > valueOf(attack);
	return suitOf(defense) === trump && suitOf(attack) !== trump;
}

/** Cheaper cards first: plain cards by rank, trumps always after them. */
function byCost(trump: string) {
	return (a: string, b: string) => {
		const trumpA = suitOf(a) === trump ? 1 : 0;
		const trumpB = suitOf(b) === trump ? 1 : 0;
		if (trumpA !== trumpB) return trumpA - trumpB;
		return valueOf(a) - valueOf(b);
	};
}

/** The most the table may hold: six cards, and never more attacks than the defender could answer. */
export function maxTableCards(table: DurakBotBout[], defenderHandSize: number): number {
	return Math.min(6, defenderHandSize + table.filter((bout) => bout.defense).length);
}

export function chooseDurakAction(view: DurakBotView, difficulty: BotDifficulty, rng: Rng = Math.random): DurakBotAction {
	const { hand, table, trump } = view;
	if (hand.length === 0) return { type: "wait" };
	const cheapest = [...hand].sort(byCost(trump));

	if (view.isDefender) {
		const index = table.findIndex((bout) => !bout.defense);
		if (index < 0) return { type: "wait" };
		const options = cheapest.filter((card) => beats(card, table[index].attack, trump));
		if (options.length === 0) return { type: "take" };

		if (difficulty === "easy") {
			// Careless: sometimes takes although it could answer, and does not pick the cheapest answer.
			if (rng() < BLUNDER_RATE.easy * 0.5) return { type: "take" };
			return { type: "defend", card: pickRandom(rng, options), index };
		}
		const answer = options[0];
		if (difficulty === "medium") {
			if (rng() < BLUNDER_RATE.medium * 0.5) return { type: "take" };
			return { type: "defend", card: answer, index };
		}
		// Hard: does not waste a high trump on a small plain attack while the deck still has cards to refill from.
		const attack = table[index].attack;
		const expensive = suitOf(answer) === trump && suitOf(attack) !== trump && valueOf(answer) >= RANKS.indexOf("J") && valueOf(attack) <= RANKS.indexOf("9");
		const cardsLeftInDeck = view.deckCount > 4;
		if (expensive && cardsLeftInDeck && hand.length >= 5) return { type: "take" };
		return { type: "defend", card: answer, index };
	}

	if (view.isAttacker) {
		if (table.length === 0) {
			if (difficulty === "easy") return { type: "attack", card: pickRandom(rng, hand) };
			if (difficulty === "medium") return { type: "attack", card: cheapest[0] };
			// Hard: lead with a cheap card whose rank it holds twice, so it can throw the pair in later.
			const counts = new Map<string, number>();
			hand.forEach((card) => counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1));
			const plain = cheapest.filter((card) => suitOf(card) !== trump);
			const pool = plain.length > 0 ? plain : cheapest;
			const pair = pool.find((card) => (counts.get(rankOf(card)) ?? 0) >= 2);
			return { type: "attack", card: pair ?? pool[0] };
		}

		const allDefended = table.every((bout) => bout.defense);
		if (!allDefended) return { type: "wait" };

		const ranksOnTable = new Set(table.flatMap((bout) => [bout.attack, bout.defense]).filter(Boolean).map((card) => rankOf(card as string)));
		const canAdd = table.length < maxTableCards(table, view.defenderHandSize);
		const throwable = cheapest.filter((card) => ranksOnTable.has(rankOf(card)));
		if (!canAdd || throwable.length === 0) return { type: "pass" };

		const next = throwable[0];
		if (difficulty === "easy") return rng() < 0.35 ? { type: "attack", card: next } : { type: "pass" };
		// Medium and hard throw in cheap plain cards; only hard also keeps its trumps for later.
		if (suitOf(next) === trump && (difficulty === "hard" || view.deckCount > 0)) return { type: "pass" };
		if (difficulty === "medium" && rng() < BLUNDER_RATE.medium) return { type: "pass" };
		return { type: "attack", card: next };
	}

	return { type: "wait" };
}
