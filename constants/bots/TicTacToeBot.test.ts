import { chooseTicTacToeMove, Cell, Mark } from "./TicTacToeBot";

const seeded = (seed: number) => () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};

function winnerOf(board: Cell[]): Mark | null {
	const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
	for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
	return null;
}

describe("chooseTicTacToeMove", () => {
	it("returns -1 on a full board and always plays a free cell otherwise", () => {
		expect(chooseTicTacToeMove(["X", "O", "X", "X", "O", "O", "O", "X", "X"], "O", "hard")).toBe(-1);
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			const board: Cell[] = ["X", null, "O", null, "X", null, null, null, "O"];
			for (let i = 0; i < 40; i++) {
				const move = chooseTicTacToeMove(board, "O", difficulty, seeded(i + 1));
				expect(board[move]).toBeNull();
			}
		}
	});

	it("takes a winning move and blocks a losing one on every level above easy's random moves", () => {
		const win: Cell[] = ["O", "O", null, "X", "X", null, null, null, null];
		const block: Cell[] = ["X", "X", null, null, "O", null, null, null, null];
		for (const difficulty of ["medium", "hard"] as const) {
			let wins = 0;
			let blocks = 0;
			for (let i = 0; i < 50; i++) {
				if (chooseTicTacToeMove(win, "O", difficulty, seeded(i + 7)) === 2) wins++;
				if (chooseTicTacToeMove(block, "O", difficulty, seeded(i + 7)) === 2) blocks++;
			}
			if (difficulty === "hard") {
				expect(wins).toBe(50);
				expect(blocks).toBe(50);
			} else {
				expect(wins).toBeGreaterThan(30);
				expect(blocks).toBeGreaterThan(30);
			}
		}
	});

	it("hard never loses against a random player, as either mark", () => {
		for (const botMark of ["X", "O"] as const) {
			for (let game = 0; game < 200; game++) {
				const rng = seeded(game * 31 + 5);
				const board: Cell[] = Array(9).fill(null);
				let turn: Mark = "X";
				while (!winnerOf(board) && board.some((cell) => !cell)) {
					let move: number;
					if (turn === botMark) move = chooseTicTacToeMove(board, botMark, "hard", rng);
					else {
						const free = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
						move = free[Math.floor(rng() * free.length)];
					}
					board[move] = turn;
					turn = turn === "X" ? "O" : "X";
				}
				expect(winnerOf(board)).not.toBe(botMark === "X" ? "O" : "X");
			}
		}
	});

	it("easy loses to a random player sometimes (it is beatable) and medium beats easy more often than not", () => {
		let easyBotLosses = 0;
		let mediumWins = 0;
		for (let game = 0; game < 300; game++) {
			const rng = seeded(game + 99);
			const board: Cell[] = Array(9).fill(null);
			let turn: Mark = "X";
			while (!winnerOf(board) && board.some((cell) => !cell)) {
				const move = chooseTicTacToeMove(board, turn, turn === "X" ? "medium" : "easy", rng);
				board[move] = turn;
				turn = turn === "X" ? "O" : "X";
			}
			const winner = winnerOf(board);
			if (winner === "X") mediumWins++;
			if (winner === "X") easyBotLosses++;
		}
		expect(easyBotLosses).toBeGreaterThan(0);
		expect(mediumWins).toBeGreaterThan(150);
	});
});
