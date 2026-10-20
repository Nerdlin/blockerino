

export type MoreGameId = "shop" | "battleship" | "durak" | "chess" | "sudoku" | "tictactoe" | "mahjong";
export type OnlineRole = "player1" | "player2" | "player3" | "player4" | "player5" | "player6";
export type DuelRole = "player1" | "player2";
export type RoomStatus = "offline" | "connecting" | "connected" | "error";
export type TicMark = "X" | "O";
export type ShipOrientation = "h" | "v";
export type DurakVariant = "throw_in" | "transfer" | "cheat" | "neighbors" | "classic" | "all" | "fair" | "draw";
export type RatedMoreGameId = Exclude<MoreGameId, "shop">;

export interface MoreGameCard {
	id: MoreGameId;
	title: string;
	color: string;
	description: string;
	tags: string[];
}

export interface BattleShip {
	id: string;
	name: string;
	length: number;
	x: number;
	y: number;
	orientation: ShipOrientation;
}

export interface MahjongTile {
	id: string;
	symbol: string;
	matchKey: string;
	x: number;
	y: number;
	z: number;
	removed: boolean;
}

export interface DurakBout {
	attack: string;
	defense: string | null;
}

export interface DurakState {
	deck: string[];
	trump: string;
	hands: Record<OnlineRole, string[]>;
	table: DurakBout[];
	attacker: OnlineRole;
	defender: OnlineRole;
	playerCount: number;
	variants: DurakVariant[];
	phase: "attack" | "defend" | "throw";
	discardCount: number;
	winner: OnlineRole | null;
	finished?: OnlineRole[];
	draw?: boolean;
	cancelled?: boolean;
	message: string;
	bet: number;
	deckSize: number;
	tableId: string;
	bustedCheaters?: OnlineRole[];
}