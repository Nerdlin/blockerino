// Two-player smoke test for the realtime games. It builds the web app against the LOCAL Supabase, starts two headless
// Chrome windows (player A hosts, player B joins with the room code) and checks that every online game starts for both.
//
//   npx supabase start                      (once, Docker must be running)
//   npm run e2e:two-player                  (add --skip-build to reuse the last build in dist-e2e/)
//
// It never talks to the live Supabase project: the app is built with the local URL and key only.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDirName = "dist-e2e";
const outDir = path.join(root, outDirName);
const profilesDir = path.join(root, "dist-e2e-profiles");
const PORT = 8099;
const LOCAL_API = "http://127.0.0.1:54321";
const skipBuild = process.argv.includes("--skip-build");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isWindows = process.platform === "win32";

function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	].filter(Boolean);
	const found = candidates.find((candidate) => fs.existsSync(candidate));
	if (!found) throw new Error("Chrome not found. Set CHROME_PATH to the browser executable.");
	return found;
}

function localAnonKey() {
	const result = spawnSync("npx", ["supabase", "status", "-o", "env"], { cwd: root, encoding: "utf8", shell: isWindows });
	const line = (result.stdout || "").split("\n").find((entry) => entry.startsWith("ANON_KEY"));
	if (!line) throw new Error("Local Supabase is not running. Start it with: npx supabase start");
	return line.split("=")[1].replace(/"/g, "").trim();
}

async function assertLocalSupabase() {
	try {
		const response = await fetch(`${LOCAL_API}/auth/v1/health`);
		if (!response.ok && response.status !== 401) throw new Error(String(response.status));
	} catch {
		throw new Error("Local Supabase is not reachable on 127.0.0.1:54321. Start it with: npx supabase start");
	}
}

function buildWeb(anonKey) {
	console.log("Building the web app against the local Supabase...");
	const result = spawnSync("npx", ["expo", "export", "--platform", "web", "--clear", "--output-dir", outDirName], {
		cwd: root,
		stdio: "inherit",
		shell: isWindows,
		env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: LOCAL_API, EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey },
	});
	if (result.status !== 0) throw new Error("Web export failed.");
	assertBundleIsLocal();
}

// A cached transform from an ordinary build can keep the live project address inside this bundle; the scenarios
// sign people up, so refuse to run unless the bundle really points at the local database.
function assertBundleIsLocal() {
	const dir = path.join(outDir, "_expo", "static", "js", "web");
	const bundles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".js")) : [];
	const local = bundles.some((name) => fs.readFileSync(path.join(dir, name), "utf8").includes(LOCAL_API));
	if (!local) throw new Error("The e2e bundle does not point at the local Supabase (127.0.0.1:54321). Refusing to run: it could sign people up on the live project.");
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

function serve() {
	const server = http.createServer((request, response) => {
		const url = decodeURIComponent(request.url.split("?")[0]);
		let file = path.join(outDir, url);
		if (!file.startsWith(outDir)) { response.writeHead(403); return response.end(); }
		if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
		if (!fs.existsSync(file)) file = fs.existsSync(`${file}.html`) ? `${file}.html` : path.join(outDir, "index.html");
		response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
		fs.createReadStream(file).pipe(response);
	});
	return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// One headless Chrome per player, driven over the DevTools protocol.
async function launchPlayer(name, port, chromePath) {
	const profile = path.join(profilesDir, name);
	fs.rmSync(profile, { recursive: true, force: true });
	const chrome = spawn(chromePath, [
		"--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
		"--window-size=390,844", "--lang=en-US", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
	], { stdio: "ignore" });
	let targets;
	for (let attempt = 0; attempt < 80 && !targets; attempt += 1) {
		try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
	}
	const page = targets?.find((target) => target.type === "page");
	if (!page) throw new Error(`Chrome for ${name} did not start.`);
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve) => ws.addEventListener("open", resolve));
	let nextId = 0;
	const pending = new Map();
	ws.addEventListener("message", (message) => {
		const data = JSON.parse(message.data);
		if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
	});
	const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
	const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
	await send("Page.enable");
	await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });

	const mouse = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };
	const player = {
		name, send, evalJs, mouse,
		body: async () => ((await evalJs("document.body.innerText")) || "").split("\n").join(" | "),
		clickText: async (text, nth = 0) => {
			const rect = await evalJs(`(() => { const all = [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())}); const el = all[${nth}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
			if (!rect) throw new Error(`${name}: no element "${text}"`);
			await mouse(rect.x, rect.y);
		},
		clickSel: async (selector) => {
			const box = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
			if (!box) throw new Error(`${name}: no ${selector}`);
			await mouse(box.x, box.y);
		},
		typeInto: async (index, text) => {
			const box = await evalJs(`(() => { const el = document.querySelectorAll('input')[${index}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
			if (!box) throw new Error(`${name}: no input ${index}`);
			await mouse(box.x, box.y);
			await send("Input.insertText", { text });
		},
		inputCount: () => evalJs("document.querySelectorAll('input').length"),
		open: async () => {
			const url = `http://localhost:${PORT}/`;
			await send("Page.navigate", { url }); await sleep(2500);
			await evalJs("localStorage.setItem('FIRST_RUN_DONE','true')");
			await send("Page.navigate", { url }); await sleep(3500);
		},
		reload: async () => { await send("Page.navigate", { url: `http://localhost:${PORT}/` }); await sleep(3500); },
		waitFor: async (test, timeoutMs = 15000) => {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				if (test(await player.body())) return true;
				await sleep(400);
			}
			return false;
		},
		close: () => { try { ws.close(); } catch { /* already closed */ } chrome.kill(); },
	};
	return player;
}

// ---- helpers shared by the scenarios ----

const MORE_GAME_INDEX = { battleship: 0, durak: 1, chess: 2, tictactoe: 4 };

async function openGame(player, game) {
	await player.clickText("More Games"); await sleep(1500);
	await player.clickText("Play", MORE_GAME_INDEX[game]); await sleep(2000);
}

async function hostAndJoin(a, b) {
	await a.clickText("Host", 0); await sleep(3000);
	const text = await a.body();
	const code = (text.match(/Share code[^|]*\|\s*([0-9A-Z]{4,6})/i) || text.match(/\|\s*([0-9A-Z]{5,6})\s*\|\s*Copy/i))?.[1];
	if (!code) throw new Error("the host never got a room code");
	const inputs = await b.inputCount();
	await b.typeInto(inputs - 1, code); await sleep(400);
	await b.clickText("Join", 0);
	return code;
}

async function register(player, label) {
	const tag = Date.now().toString(36);
	await player.clickSel('[aria-label="Profile"]'); await sleep(1500);
	await player.clickText("Need an account?"); await sleep(800);
	const nickname = `${label}${tag.slice(-4)}`;
	await player.typeInto(0, nickname);
	await player.typeInto(1, `e2e-${label.toLowerCase()}-${tag}@example.test`);
	await player.typeInto(2, "Qa-test-pass-123");
	await player.clickText("Register", 0); await sleep(4500);
	return nickname;
}

// Local sign-up emails are rate limited (a couple per hour), so scenarios that only need two accounts make them
// with the local admin API and sign in through the normal Log In screen.
function localServiceKey() {
	const result = spawnSync("npx", ["supabase", "status", "-o", "env"], { cwd: root, encoding: "utf8", shell: isWindows });
	const line = (result.stdout || "").split(String.fromCharCode(10)).find((entry) => entry.startsWith("SERVICE_ROLE_KEY"));
	if (!line) throw new Error("Local Supabase has no service key. Start it with: npx supabase start");
	return line.split("=")[1].replace(/"/g, "").trim();
}

async function createAndLogIn(player, label) {
	const tag = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 36).toString(36)}`;
	const nickname = `${label}${tag}`;
	const email = `e2e-${label.toLowerCase()}-${tag}@example.test`;
	const key = localServiceKey();
	const response = await fetch(`${LOCAL_API}/auth/v1/admin/users`, {
		method: "POST",
		headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "Qa-test-pass-123", email_confirm: true, user_metadata: { player_name: nickname } }),
	});
	if (!response.ok) throw new Error(`could not create ${nickname}: ${response.status} ${(await response.text()).slice(0, 200)}`);
	await player.clickSel('[aria-label="Profile"]'); await sleep(1500);
	await player.typeInto(0, email);
	await player.typeInto(1, "Qa-test-pass-123");
	await player.clickText("Log In", 0); await sleep(4500);
	const after = await player.body();
	if (/Invalid login|Log In/.test(after) && !/Log Out/i.test(after)) throw new Error(`${player.name}: login of ${email} failed: ${after.slice(0, 200)} | inputs: ${await player.evalJs("JSON.stringify([...document.querySelectorAll('input')].map((el) => el.value))")}`);
	return nickname;
}

// Runs SQL on the LOCAL database (the same container db:check uses) to set up what the UI cannot, like a friendship.
function sql(statement) {
	const result = spawnSync("docker", ["exec", "-i", "supabase_db_blockerino", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" });
	if (result.status !== 0) throw new Error("sql failed: " + (result.stderr || result.stdout).slice(0, 300));
	return result.stdout.trim();
}

// ---- scenarios: each throws when something is wrong ----

const scenarios = {
	async tictactoe(a, b) {
		await Promise.all([a.open(), b.open()]);
		for (const player of [a, b]) await openGame(player, "tictactoe");
		await hostAndJoin(a, b);
		for (const player of [a, b]) {
			if (!(await player.waitFor((text) => /X turn/i.test(text) && !/waiting for opponent/i.test(text)))) throw new Error(`${player.name} never saw the board start`);
		}
	},

	async chess(a, b) {
		await Promise.all([a.open(), b.open()]);
		for (const player of [a, b]) await openGame(player, "chess");
		await hostAndJoin(a, b);
		for (const player of [a, b]) {
			if (!(await player.waitFor((text) => /White turn/i.test(text)))) throw new Error(`${player.name} never saw the board start`);
		}
		// White moves a pawn two squares; black must see it.
		const pawns = await a.evalJs("(() => [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && e.textContent.trim() === '\u2659').map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }))()");
		if (!pawns || pawns.length < 5) throw new Error("could not find the white pawns");
		const size = pawns[4].x - pawns[3].x;
		await a.mouse(pawns[4].x, pawns[4].y); await sleep(500);
		await a.mouse(pawns[4].x, pawns[4].y - 2 * size);
		if (!(await b.waitFor((text) => /Black turn/i.test(text)))) throw new Error("the move never reached player B");
	},

	async battleship(a, b) {
		await Promise.all([a.open(), b.open()]);
		for (const player of [a, b]) {
			await openGame(player, "battleship");
			await player.mouse(221, 215); await sleep(800); // dice button: random fleet
		}
		await hostAndJoin(a, b);
		for (const player of [a, b]) {
			if (!(await player.waitFor((text) => /\bReady\b/i.test(text)))) throw new Error(`${player.name} never reached the Ready screen`);
		}
		await a.clickText("Ready", 0); await sleep(1200);
		await b.clickText("Ready", 0);
		for (const player of [a, b]) {
			if (!(await player.waitFor((text) => /Target/i.test(text) && /My Fleet/i.test(text)))) throw new Error(`${player.name} never saw the battle start`);
		}
	},

	async durak(a, b) {
		await Promise.all([a.open(), b.open()]);
		// A bet needs a signed-in account; new accounts hold 50 coins, below the 100 minimum, so the table has no bet.
		await register(a, "DurA"); await register(b, "DurB");
		await Promise.all([a.reload(), b.reload()]);
		for (const player of [a, b]) {
			await sleep(4000);
			try { await player.clickText("Collect"); await sleep(1500); await player.clickText("OK"); } catch { /* already collected */ }
			await sleep(500);
			await openGame(player, "durak");
		}
		await hostAndJoin(a, b);
		for (const player of [a, b]) {
			if (!(await player.waitFor((text) => /Attack with any card/i.test(text)))) throw new Error(`${player.name} never saw the table start`);
		}
	},
};

// ---- solo scenarios: one player against a bot, plus a few screens that need no opponent ----

const byTestId = (id) => `document.querySelector('[data-testid="${id}"]')`;
async function clickTestId(player, id) {
	const box = await player.evalJs(`(() => { const el = ${byTestId(id)}; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!box) throw new Error(`${player.name}: no element ${id}`);
	await player.mouse(box.x, box.y);
}
async function chooseBot(player, difficulty = "Easy") {
	await player.clickText("Bot", 0); await sleep(900);
	await player.clickText(difficulty, 0); await sleep(500);
}

const soloScenarios = {
	async bot_tictactoe(a) {
		await a.open();
		await openGame(a, "tictactoe");
		await chooseBot(a);
		await clickTestId(a, "ttt-cell-4");
		const answered = await (async () => {
			const deadline = Date.now() + 8000;
			while (Date.now() < deadline) {
				if ((await a.evalJs(`[...document.querySelectorAll('[data-testid^="ttt-cell-"]')].filter((el) => el.textContent.trim() === "O").length`)) > 0) return true;
				await sleep(400);
			}
			return false;
		})();
		if (!answered) throw new Error("the bot never answered with an O");
		// A hint costs coins; a new guest has none, so it must say so instead of marking a cell.
		await a.clickText("Hint (-20 coins)", 0); await sleep(600);
		// With coins the hint marks a cell green; without them it says so.
		const hinted = await (async () => {
			const deadline = Date.now() + 4000;
			while (Date.now() < deadline) {
				if (/Not enough coins for a hint/i.test(await a.body())) return true;
				if (await a.evalJs(`[...document.querySelectorAll('[data-testid^="ttt-cell-"]')].some((el) => getComputedStyle(el).backgroundColor.includes("74, 222, 128"))`)) return true;
				await sleep(300);
			}
			return false;
		})();
		if (!hinted) throw new Error("the hint neither marked a cell nor explained the missing coins");
	},

	async bot_chess(a) {
		await a.open();
		await openGame(a, "chess");
		await chooseBot(a);
		await clickTestId(a, "chess-sq-e2"); await sleep(400);
		await clickTestId(a, "chess-sq-e4");
		if (!(await a.waitFor((text) => /Bot is thinking/i.test(text), 6000))) throw new Error("the bot never started thinking");
		if (!(await a.waitFor((text) => /White turn/i.test(text), 20000))) throw new Error("the bot never replied");
	},

	async bot_battleship(a) {
		await a.open();
		await openGame(a, "battleship");
		await a.mouse(221, 215); await sleep(800); // dice button: random fleet
		await chooseBot(a);
		await a.clickText("Play", 0); await sleep(1500);
		await clickTestId(a, "sea-target-0,0");
		const colors = async (prefix) => a.evalJs(`new Set([...document.querySelectorAll('[data-testid^="${prefix}-"]')].map((el) => getComputedStyle(el).backgroundColor)).size`);
		const deadline = Date.now() + 10000;
		let shotsLanded = false;
		while (Date.now() < deadline && !shotsLanded) {
			shotsLanded = (await colors("sea-target")) > 1 && (await colors("sea-mine")) > 1;
			if (!shotsLanded) await sleep(500);
		}
		if (!shotsLanded) throw new Error("my shot or the bot reply never showed on the boards");
	},

	async bot_durak(a) {
		await a.open();
		await openGame(a, "durak");
		await chooseBot(a);
		await a.clickText("Play", 0);
		if (!(await a.waitFor((text) => /Attack with any card|Bot is thinking|Pass|Take/i.test(text), 12000))) throw new Error("the Durak table never started");
	},

	async quests(a) {
		await a.open();
		await a.clickSel('[aria-label="Achievements"]'); await sleep(2000);
		const text = await a.body();
		if (!/Today.s quests/i.test(text)) throw new Error("the daily quests card is missing");
		const rows = (text.match(/Clear [0-9]+ lines|Finish [0-9]+ solo games|Place [0-9]+ blocks|Beat a bot: [0-9]+|Play [0-9]+ duel|Win in More Games: [0-9]+/g) || []).length;
		if (rows !== 3) throw new Error(`expected 3 quests, saw ${rows}: ${text.slice(0, 300)}`);
	},
};
for (const fn of Object.values(soloScenarios)) fn.solo = true;
Object.assign(scenarios, soloScenarios);

// Two accounts: B opens A's profile from the friends list; A's privacy choice decides what B sees.
scenarios.profiles = async (a, b) => {
	await a.open(); await b.open();
	const nameA = await createAndLogIn(a, "ProA");
	const nameB = await createAndLogIn(b, "ProB");
	sql(`insert into friends (user_id_1, user_id_2, status) select pa.auth_user_id, pb.auth_user_id, 'accepted' from profiles pa, profiles pb where pa.player_name = '${nameA}' and pb.player_name = '${nameB}'`);
	sql(`update profiles set highscore_classic = 4242, elo = 1234 where player_name = '${nameA}'`);
	sql(`insert into achievement_claims (user_id, achievement_id, reward) select auth_user_id, x.id, x.r from profiles, (values ('score_myth', 2000), ('first_steps', 25)) as x(id, r) where player_name = '${nameA}'`);
	sql(`insert into player_game_records (user_id, game_id, wins, losses, draws) select auth_user_id, 'chess', 7, 2, 1 from profiles where player_name = '${nameA}'`);

	const openFromFriends = async () => {
		try { await b.clickText("Friends", 0); } catch (error) { throw new Error(`${error.message}; page: ${(await b.body()).slice(0, 300)}`); }
		await sleep(2500);
		await b.clickText(nameA, 0); await sleep(2500);
	};

	await openFromFriends();
	let text = await b.body();
	for (const needle of [nameA, "Versus rating 1234", "4242", "Rarest achievements", "Record"]) {
		if (!text.includes(needle)) throw new Error(`friend profile lacks "${needle}": ${text.slice(0, 400)}`);
	}
	if (!/Remove friend/.test(text)) throw new Error("a friend's profile should offer Remove friend");
	if (/@example\.test|owned_item|coins/i.test(text)) throw new Error("the profile leaked a private field");
	await b.clickText("Close", 0); await sleep(500);

	// A changes the setting in Options, like a player would.
	await a.clickText("Back", 0); await sleep(1200);
	await a.clickText("Options", 0); await sleep(1500);
	// The switch only shows once the app knows the player is signed in.
	if (!(await a.waitFor((text) => /Nobody/.test(text), 10000))) throw new Error("the profile visibility switch never appeared in Options");
	await a.clickText("Nobody", 0); await sleep(1500);
	const stored = sql(`select pp.visibility from profile_privacy pp join profiles p on p.auth_user_id = pp.user_id where p.player_name = '${nameA}'`);
	if (stored !== "nobody") throw new Error(`the Options switch saved "${stored}", not nobody`);

	await openFromFriends();
	text = await b.body();
	if (!/keeps their profile private/i.test(text)) throw new Error("a hidden profile should say so: " + text.slice(0, 300));
	if (text.includes("Versus rating") || text.includes("4242")) throw new Error("a hidden profile still showed details");
	await b.clickText("Close", 0); await sleep(500);

	sql(`update profile_privacy set visibility = 'friends' where user_id = (select auth_user_id from profiles where player_name = '${nameA}')`);
	await openFromFriends();
	text = await b.body();
	if (!text.includes("Versus rating 1234")) throw new Error("a friend should see a friends-only profile");
};

// A friend invites a friend to a Chaos 1v1: the host picks the mode in the game's own popup, the friend sees the
// invite (host name and mode) and accepts, which leaves the menu for the game.
scenarios.invite = async (a, b) => {
	await a.open(); await b.open();
	const nameA = await createAndLogIn(a, "InvA");
	const nameB = await createAndLogIn(b, "InvB");
	sql(`insert into friends (user_id_1, user_id_2, status) select pa.auth_user_id, pb.auth_user_id, 'accepted' from profiles pa, profiles pb where pa.player_name = '${nameA}' and pb.player_name = '${nameB}'`);
	await b.clickText("Back", 0); await sleep(1500); // B waits on the main menu
	await a.clickText("Friends", 0); await sleep(2500);
	await a.clickText("1v1", 0); await sleep(1200);
	if (!(await a.waitFor((text) => /Choose the game mode/.test(text), 6000))) throw new Error("the host never saw the mode popup: " + (await a.body()).slice(0, 300));
	await a.clickText("Chaos 10x10", 0);
	const seen = await b.waitFor((text) => text.includes(nameA) && /Chaos 10x10/.test(text) && /Accept/.test(text), 15000);
	if (!seen) throw new Error("the friend never saw the invite: " + (await b.body()).slice(0, 300));
	await b.clickText("Accept", 0); await sleep(4500);
	const after = await b.body();
	if (/Classic 8x8/.test(after)) throw new Error("the friend is still on the main menu after accepting: " + after.slice(0, 300));
};

async function main() {
	const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
	const names = wanted.length > 0 ? wanted : Object.keys(scenarios);
	for (const name of names) if (!scenarios[name]) throw new Error(`Unknown scenario "${name}". Known: ${Object.keys(scenarios).join(", ")}`);

	await assertLocalSupabase();
	if (!skipBuild) buildWeb(localAnonKey());
	else if (!fs.existsSync(outDir)) throw new Error("No build in dist-e2e/. Run without --skip-build first.");
	assertBundleIsLocal();

	const server = await serve();
	const chromePath = findChrome();
	const results = [];
	for (const name of names) {
		const a = await launchPlayer(`${name}-A`, 9401, chromePath);
		const b = scenarios[name].solo ? { name: `${name}-B`, close() {} } : await launchPlayer(`${name}-B`, 9402, chromePath);
		const started = Date.now();
		try {
			await scenarios[name](a, b);
			results.push({ name, ok: true, seconds: Math.round((Date.now() - started) / 1000) });
		} catch (error) {
			results.push({ name, ok: false, error: error.message, seconds: Math.round((Date.now() - started) / 1000) });
		}
		a.close(); b.close();
		await sleep(500);
	}
	server.close();
	fs.rmSync(profilesDir, { recursive: true, force: true });

	console.log("\nTwo-player results");
	for (const result of results) console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${result.name} (${result.seconds}s)${result.ok ? "" : `: ${result.error}`}`);
	process.exit(results.every((result) => result.ok) ? 0 : 1);
}

main().catch((error) => { console.error(error.message); process.exit(1); });

