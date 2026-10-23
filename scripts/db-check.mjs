// Applies every migration to a clean LOCAL database and runs the checks in supabase/tests/*.sql against it.
//   npm run db:check
// Needs Docker running and the local stack up (npx supabase start). It resets the LOCAL database only.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const container = "supabase_db_blockerino";

function run(command, args, input) {
	const result = spawnSync(command, args, { cwd: root, encoding: "utf8", input, shell: process.platform === "win32" && command === "npx" });
	return { ok: result.status === 0, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const reset = run("npx", ["supabase", "db", "reset", "--local", "--no-seed"]);
if (!reset.ok) {
	console.error("FAIL  db reset (a migration does not apply on a clean database)\n" + reset.out.slice(-1500));
	process.exit(1);
}
console.log("PASS  all migrations apply on a clean database");

// The checks that existed before are printouts for reading; only the ones with asserts end with "ok".
let failed = false;
for (const file of readdirSync(join(root, "supabase", "tests")).filter((name) => name.endsWith(".sql")).sort()) {
	const { readFileSync } = await import("node:fs");
	const sql = readFileSync(join(root, "supabase", "tests", file), "utf8");
	const result = run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], sql);
	const asserting = /\bassert\b/i.test(sql);
	if (!result.ok) {
		failed = true;
		console.error(`FAIL  ${file}\n${result.out.slice(-1200)}`);
	} else if (asserting && !/ ok\b/.test(result.out)) {
		failed = true;
		console.error(`FAIL  ${file} (no "ok" line)\n${result.out.slice(-600)}`);
	} else {
		console.log(`PASS  ${file}`);
	}
}
process.exit(failed ? 1 : 0);
