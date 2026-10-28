// Chess server check against the LOCAL Supabase: two seeded players sign in through the real API and play through
// matchmaking, a reported game, the Elo change and the friends' ratings. It never touches the live project.
//
//   npx supabase start                       (Docker must be running)
//   node scripts/seed-local-profiles.mjs     (Tester and Nina, friends; the script runs it for you)
//   npm run e2e:chess-rpc
//
// It cleans the chess rows of the two players before and after, so it can be run again and again.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = "http://127.0.0.1:54321";
const PASSWORD = "Local-seed-pass-1";
const isWindows = process.platform === "win32";

function sql(statement) {
	const result = spawnSync("docker", ["exec", "-i", "supabase_db_blockerino", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" });
	if (result.status !== 0) throw new Error("sql failed: " + (result.stderr || result.stdout).slice(0, 300));
	return result.stdout.trim();
}

function localAnonKey() {
	const result = spawnSync("npx", ["supabase", "status", "-o", "env"], { cwd: root, encoding: "utf8", shell: isWindows });
	const line = (result.stdout || "").split("\n").find((entry) => entry.startsWith("ANON_KEY"));
	if (!line) throw new Error("Local Supabase is not running. Start it with: npx supabase start");
	return line.split("=")[1].replace(/"/g, "").trim();
}

let failures = 0;
function check(name, condition, detail = "") {
	console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : "  " + detail}`);
	if (!condition) failures += 1;
}

const seed = spawnSync("node", ["scripts/seed-local-profiles.mjs"], { cwd: root, encoding: "utf8", shell: isWindows });
if (seed.status !== 0) throw new Error("seeding failed: " + (seed.stderr || seed.stdout).slice(0, 300));

const anonKey = localAnonKey();
async function login(email) {
	const client = createClient(API, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
	const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
	if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
	return client;
}

const ids = {
	tester: sql("select id from profiles where player_name = 'Tester'"),
	nina: sql("select id from profiles where player_name = 'Nina'"),
};
function clean() {
	const both = `'${ids.tester}', '${ids.nina}'`;
	sql(`delete from chess_ratings where profile_id in (${both})`);
	sql(`delete from chess_match_reports where reporter_id in (${both})`);
	sql(`delete from chess_matches where white_id in (${both}) or black_id in (${both})`);
	sql(`delete from chess_queue where profile_id in (${both})`);
	sql(`delete from chess_pairings where profile_id in (${both})`);
}
clean();

try {
	const tester = await login("tester@seed.example.test");
	const nina = await login("nina@seed.example.test");
	const guest = createClient(API, anonKey, { auth: { persistSession: false } });

	// a guest cannot queue
	const denied = await guest.rpc("chess_quick_match", { p_control: "180+2" });
	check("a guest cannot call chess_quick_match", Boolean(denied.error), JSON.stringify(denied.data));

	// matchmaking
	const first = await tester.rpc("chess_quick_match", { p_control: "180+2" });
	check("Tester waits alone", first.data?.status === "searching", JSON.stringify(first));
	const wrongControl = await nina.rpc("chess_quick_match", { p_control: "300+0" });
	check("another control does not match", wrongControl.data?.status === "searching", JSON.stringify(wrongControl));
	await nina.rpc("chess_cancel_search");
	const ninaMatch = await nina.rpc("chess_quick_match", { p_control: "180+2" });
	check("Nina is paired with Tester", ninaMatch.data?.status === "matched" && ninaMatch.data?.opponent === "Tester", JSON.stringify(ninaMatch));
	const testerMatch = await tester.rpc("chess_quick_match", { p_control: "180+2" });
	check("Tester gets the same room, the other color", testerMatch.data?.status === "matched" && testerMatch.data?.code === ninaMatch.data?.code && testerMatch.data?.color !== ninaMatch.data?.color && testerMatch.data?.opponent === "Nina", JSON.stringify(testerMatch));
	check("the room code has eight characters", String(ninaMatch.data?.code).length === 8);

	// a game: White wins, both report
	const room = `${ninaMatch.data.code}-1`;
	const white = testerMatch.data.color === "w" ? { client: tester, name: "Tester", opponent: "Nina" } : { client: nina, name: "Nina", opponent: "Tester" };
	const black = white.client === tester ? { client: nina, name: "Nina", opponent: "Tester" } : { client: tester, name: "Tester", opponent: "Nina" };
	const whiteReport = await white.client.rpc("report_chess_match", { p_room_code: room, p_time_class: "blitz", p_my_color: "w", p_opponent_name: white.opponent, p_result: "1-0", p_plies: 30 });
	check("the winner's lone report stays pending", whiteReport.data?.status === "pending", JSON.stringify(whiteReport));
	const blackReport = await black.client.rpc("report_chess_match", { p_room_code: room, p_time_class: "blitz", p_my_color: "b", p_opponent_name: black.opponent, p_result: "1-0", p_plies: 30 });
	check("the matching report applies the result", blackReport.data?.status === "applied" && blackReport.data?.before === 1000 && blackReport.data?.after === 980, JSON.stringify(blackReport));

	const whiteRatings = await white.client.rpc("get_my_chess_ratings");
	check("the winner is at 1020 in blitz after one game", whiteRatings.data?.some((row) => row.time_class === "blitz" && row.rating === 1020 && row.games_played === 1), JSON.stringify(whiteRatings));
	const friendRatings = await black.client.rpc("get_friend_chess_ratings");
	check("a friend's rating is visible to the other friend", friendRatings.data?.some((row) => row.time_class === "blitz" && row.rating === 1020), JSON.stringify(friendRatings));

	// the same report again changes nothing
	const again = await white.client.rpc("report_chess_match", { p_room_code: room, p_time_class: "blitz", p_my_color: "w", p_opponent_name: white.opponent, p_result: "1-0", p_plies: 30 });
	check("a repeated report is only a read", again.data?.status === "applied" && again.data?.after === 1020, JSON.stringify(again));

	// a loser's own report counts at once; a game under four half-moves is not rated
	const lost = await white.client.rpc("report_chess_match", { p_room_code: `${ninaMatch.data.code}-2`, p_time_class: "rapid", p_my_color: "w", p_opponent_name: white.opponent, p_result: "0-1", p_plies: 40 });
	check("a reported loss counts at once", lost.data?.status === "applied", JSON.stringify(lost));
	const short = await white.client.rpc("report_chess_match", { p_room_code: `${ninaMatch.data.code}-3`, p_time_class: "blitz", p_my_color: "w", p_opponent_name: white.opponent, p_result: "1-0", p_plies: 2 });
	check("a very short game is not rated", short.data?.status === "too_short", JSON.stringify(short));

	// clients cannot read the tables
	const direct = await tester.from("chess_ratings").select("*");
	check("the ratings table is closed to clients", Boolean(direct.error) || (direct.data ?? []).length === 0, JSON.stringify(direct));
} finally {
	clean();
}

console.log(failures === 0 ? "\nAll chess server checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
