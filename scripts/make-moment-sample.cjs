// Writes docs/share-moment-sample.gif: a "Share a moment" GIF made from a pretend game, with the same code the app
// uses. Run: node scripts/make-moment-sample.cjs [out.gif]
require("sucrase/register");
const fs = require("fs");
const path = require("path");
const { renderMomentGif } = require("../constants/MomentFrames");
const { simulateGame, bestMoment } = require("../constants/MomentTestUtils");

(async () => {
	const out = path.resolve(process.argv[2] || path.join(__dirname, "..", "docs", "share-moment-sample.gif"));
	// look for a pretend game with a big combo, so the sample shows line clears and the combo counter
	let best = null;
	for (let seed = 1; seed < 40; seed++) {
		const moves = bestMoment(simulateGame(seed, 10, 120), 6);
		const top = Math.max(...moves.map((move) => move.combo));
		if (!best || top > best.top) best = { moves, top, seed };
	}
	const log = { boardLength: 10, moves: best.moves, bestCombo: best.top };
	const started = Date.now();
	const gif = await renderMomentGif(log, { labels: { caption: "BIG COMBO", captionScore: "SCORE" }, scale: 2 });
	fs.writeFileSync(out, gif.bytes);
	console.log(`seed ${best.seed}, best combo ${best.top}: ${gif.width}x${gif.height}, ${gif.frameCount} frames, ${(gif.durationCs / 100).toFixed(1)} s, ${gif.palette.length} colours, ${gif.bytes.length} bytes, ${Date.now() - started} ms -> ${out}`);
})();
