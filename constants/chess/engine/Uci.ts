// A small UCI client for the Stockfish engine that runs as a separate program (a Web Worker on the web, an invisible
// WebView on phones). It only sends text commands and reads the engine's text answers; jobs run one at a time.

export interface UciTransport {
	send: (command: string) => void;
}

export interface EngineEval {
	/** Centipawns from the side to move's point of view; absent when a mate is found. */
	cp?: number;
	/** Moves to mate, positive when the side to move mates. */
	mate?: number;
	bestMove: string | null;
	pv: string[];
	depth: number;
}

export interface SearchOptions {
	depth?: number;
	movetimeMs?: number;
	/** Stockfish's "Skill Level", 0-20: below 20 it deliberately picks weaker moves. */
	skill?: number;
}

/** Reads the score, depth and principal variation from one "info" line; null for lines without a score. */
export function parseInfoLine(line: string): Omit<EngineEval, "bestMove"> | null {
	if (!line.startsWith("info ") || !line.includes(" score ")) return null;
	const tokens = line.split(/\s+/);
	const at = (name: string) => tokens.indexOf(name);
	const depth = Number(tokens[at("depth") + 1]);
	const scoreAt = at("score");
	const kind = tokens[scoreAt + 1];
	const value = Number(tokens[scoreAt + 2]);
	const pvAt = at("pv");
	const pv = pvAt >= 0 ? tokens.slice(pvAt + 1) : [];
	if (kind === "cp") return { cp: value, depth, pv };
	if (kind === "mate") return { mate: value, depth, pv };
	return null;
}

interface Job {
	commands: string[];
	resolve: (result: EngineEval) => void;
	last: Omit<EngineEval, "bestMove"> | null;
}

export class UciEngine {
	private queue: Job[] = [];
	private current: Job | null = null;
	private ready = false;

	constructor(private readonly transport: UciTransport) {}

	/** Feeds one line printed by the engine. */
	onLine(line: string): void {
		const text = line.trim();
		if (text === "uciok" || text === "readyok") {
			if (!this.ready) {
				this.ready = true;
				this.pump();
			}
			return;
		}
		const job = this.current;
		if (!job) return;
		const info = parseInfoLine(text);
		// the multipv 1 line is the main one; with a single pv every line is
		if (info && (!text.includes(" multipv ") || text.includes(" multipv 1 "))) job.last = info;
		if (text.startsWith("bestmove")) {
			const move = text.split(/\s+/)[1];
			const result: EngineEval = {
				...(job.last ?? { depth: 0, pv: [] }),
				bestMove: move && move !== "(none)" ? move : null,
			};
			this.current = null;
			job.resolve(result);
			this.pump();
		}
	}

	start(): void {
		this.transport.send("uci");
		this.transport.send("isready");
	}

	/** Searches a position and returns the best move with its evaluation. */
	search(fen: string, options: SearchOptions = {}): Promise<EngineEval> {
		const commands = [
			`setoption name Skill Level value ${Math.max(0, Math.min(20, Math.round(options.skill ?? 20)))}`,
			`position fen ${fen}`,
			options.movetimeMs && !options.depth ? `go movetime ${options.movetimeMs}` : `go depth ${options.depth ?? 12}${options.movetimeMs ? ` movetime ${options.movetimeMs}` : ""}`,
		];
		return new Promise((resolve) => {
			this.queue.push({ commands, resolve, last: null });
			this.pump();
		});
	}

	private pump(): void {
		if (!this.ready || this.current || this.queue.length === 0) return;
		this.current = this.queue.shift()!;
		for (const command of this.current.commands) this.transport.send(command);
	}
}

/** The white-relative evaluation in pawns (mates clamped to ±10), for bars and charts. */
export function whiteScore(evaluation: Pick<EngineEval, "cp" | "mate">, sideToMove: "w" | "b"): number {
	const raw = evaluation.mate !== undefined ? (evaluation.mate > 0 ? 10 : -10) : Math.max(-10, Math.min(10, (evaluation.cp ?? 0) / 100));
	return sideToMove === "w" ? raw : -raw;
}
