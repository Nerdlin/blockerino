// Fills the LOCAL Supabase with a few players so the profile screens have something to show on a phone or in a browser
// that is pointed at the local stack (see docs/two-player-test.md). It never touches the live project.
//   node scripts/seed-local-profiles.mjs
// Sign in on the phone with the TESTER account below; the others are the people you can open from lists.
//   Nina  - open profile, a friend of Tester, strong scores, a top-5 place in Classic
//   Max   - "friends only" profile, a friend of Tester
//   Zed   - "nobody" profile, sent Tester a friend request (accept it from his profile)
//   Ivy   - open profile, not a friend (add her from her profile)
import { spawnSync } from "node:child_process";

const API = "http://127.0.0.1:54321";
const PASSWORD = "Local-seed-pass-1";
const PEOPLE = [
	{ name: "Tester", email: "tester@seed.example.test", elo: 1000, classic: 320, chaos: 0 },
	{ name: "Nina", email: "nina@seed.example.test", elo: 1480, classic: 24650, chaos: 9100, visibility: "everyone" },
	{ name: "Max", email: "max@seed.example.test", elo: 1210, classic: 7400, chaos: 3300, visibility: "friends" },
	{ name: "Zed", email: "zed@seed.example.test", elo: 1090, classic: 2900, chaos: 800, visibility: "nobody" },
	{ name: "Ivy", email: "ivy@seed.example.test", elo: 1330, classic: 12100, chaos: 5200, visibility: "everyone" },
];

function sql(statement) {
	const result = spawnSync("docker", ["exec", "-i", "supabase_db_blockerino", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" });
	if (result.status !== 0) throw new Error("sql failed: " + (result.stderr || result.stdout).slice(0, 300));
	return result.stdout.trim();
}

function serviceKey() {
	const result = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: process.platform === "win32" });
	const line = (result.stdout || "").split(String.fromCharCode(10)).find((entry) => entry.startsWith("SERVICE_ROLE_KEY"));
	if (!line) throw new Error("Local Supabase is not running. Start it with: npx supabase start");
	return line.split("=")[1].replace(/"/g, "").trim();
}

async function ensureUser(key, person) {
	const existing = sql(`select id from auth.users where email = '${person.email}'`);
	if (existing) return existing;
	const response = await fetch(`${API}/auth/v1/admin/users`, {
		method: "POST",
		headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify({ email: person.email, password: PASSWORD, email_confirm: true, user_metadata: { player_name: person.name } }),
	});
	if (!response.ok) throw new Error(`could not create ${person.name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
	return (await response.json()).id;
}

const key = serviceKey();
const ids = {};
for (const person of PEOPLE) {
	const id = await ensureUser(key, person);
	ids[person.name] = id;
	sql(`insert into profiles (player_name, auth_user_id, player_id, coins, elo, highscore_classic, highscore_chaos)
	     values ('${person.name}', '${id}', '${id}', 500, ${person.elo}, ${person.classic}, ${person.chaos})
	     on conflict (player_name) do update set auth_user_id = excluded.auth_user_id, player_id = excluded.player_id,
	       elo = excluded.elo, highscore_classic = excluded.highscore_classic, highscore_chaos = excluded.highscore_chaos`);
	if (person.visibility) sql(`insert into profile_privacy (user_id, visibility) values ('${id}', '${person.visibility}') on conflict (user_id) do update set visibility = excluded.visibility`);
}

sql(`delete from friends where user_id_1 in ('${ids.Tester}', '${ids.Zed}') or user_id_2 in ('${ids.Tester}', '${ids.Zed}')`);
sql(`insert into friends (user_id_1, user_id_2, status) values
  ('${ids.Tester}', '${ids.Nina}', 'accepted'),
  ('${ids.Max}', '${ids.Tester}', 'accepted'),
  ('${ids.Zed}', '${ids.Tester}', 'pending')`);

const claims = {
	Nina: [["score_myth", 2000], ["royal_mint", 10000], ["tycoon", 2500], ["first_steps", 25]],
	Max: [["chess_master", 750], ["first_steps", 25]],
	Ivy: [["coin_stack", 250], ["first_steps", 25]],
};
for (const [name, rows] of Object.entries(claims)) {
	for (const [id, reward] of rows) sql(`insert into achievement_claims (user_id, achievement_id, reward) values ('${ids[name]}', '${id}', ${reward}) on conflict do nothing`);
}

const records = {
	Nina: [["versus", 40, 12, 3, 0, 0, 0], ["chess", 31, 9, 4, 12, 1, 0], ["tictactoe", 18, 6, 9, 20, 2, 3]],
	Max: [["chess", 12, 15, 2, 8, 2, 1], ["durak", 9, 11, 0, 5, 3, 0]],
	Ivy: [["battleship", 14, 10, 0, 6, 1, 0], ["sudoku", 22, 0, 0, 0, 0, 0]],
};
for (const [name, rows] of Object.entries(records)) {
	for (const [game, wins, losses, draws, botWins, botLosses, botDraws] of rows) {
		sql(`insert into player_game_records (user_id, game_id, wins, losses, draws, bot_wins, bot_losses, bot_draws)
		     values ('${ids[name]}', '${game}', ${wins}, ${losses}, ${draws}, ${botWins}, ${botLosses}, ${botDraws})
		     on conflict (user_id, game_id) do update set wins = excluded.wins, losses = excluded.losses, draws = excluded.draws,
		       bot_wins = excluded.bot_wins, bot_losses = excluded.bot_losses, bot_draws = excluded.bot_draws`);
	}
}

console.log("Seeded the local database. Sign in as tester@seed.example.test (password is PASSWORD in this script).");
