// Avatar storage and report check against the LOCAL Supabase (never the live project): the real Storage API with two
// signed-in players. Expected: each player writes only into their own folder, files over 300 KB and non-images are
// refused, the bucket is readable by link, a report is accepted once per pair, and nobody can read the reports table.
//
//   npx supabase start        (Docker must be running)
//   npm run e2e:avatar-storage

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = "http://127.0.0.1:54321";
const PASSWORD = "Local-seed-pass-1";
const isWindows = process.platform === "win32";

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
	const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
	if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
	return { client, id: data.user.id };
}

const tester = await login("tester@seed.example.test");
const nina = await login("nina@seed.example.test");

// 1x1 JPEG
const jpeg = Buffer.from(
	"/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
	"base64"
);
const mine = `${tester.id}/avatar-test.jpg`;
const theirs = `${nina.id}/avatar-test.jpg`;

const own = await tester.client.storage.from("avatars").upload(mine, jpeg, { contentType: "image/jpeg", upsert: true });
check("a player uploads into their own folder", !own.error, own.error?.message);

const foreign = await tester.client.storage.from("avatars").upload(theirs, jpeg, { contentType: "image/jpeg", upsert: true });
check("a player cannot write into another player's folder", !!foreign.error);

const big = await tester.client.storage.from("avatars").upload(`${tester.id}/big.jpg`, Buffer.alloc(400 * 1024, 1), { contentType: "image/jpeg", upsert: true });
check("a file over 300 KB is refused", !!big.error);

const svg = await tester.client.storage.from("avatars").upload(`${tester.id}/x.svg`, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), { contentType: "image/svg+xml", upsert: true });
check("a non-raster type is refused", !!svg.error);

const publicUrl = tester.client.storage.from("avatars").getPublicUrl(mine).data.publicUrl;
const fetched = await fetch(publicUrl);
check("the picture is readable by its public link", fetched.status === 200 && (fetched.headers.get("content-type") || "").includes("image/jpeg"), `status ${fetched.status}`);

const strangerRemove = await nina.client.storage.from("avatars").remove([mine]);
const stillThere = await fetch(publicUrl);
check("another player cannot delete the file", stillThere.status === 200 && (strangerRemove.data ?? []).length === 0);

const ownRemove = await tester.client.storage.from("avatars").remove([mine]);
check("the owner can delete the file", !ownRemove.error && (ownRemove.data ?? []).length === 1);

// The same listing and clean-up the app does (constants/AvatarUpload.ts removeAvatarFiles): replacing keeps only the new file,
// removing the photo leaves the folder empty.
async function cleanFolder(client, userId, keep) {
	const { data } = await client.storage.from("avatars").list(userId, { limit: 100 });
	const stale = (data ?? []).map((file) => `${userId}/${file.name}`).filter((p) => p !== keep);
	if (stale.length > 0) await client.storage.from("avatars").remove(stale);
}
async function files(client, userId) {
	const { data } = await client.storage.from("avatars").list(userId, { limit: 100 });
	return (data ?? []).map((file) => file.name);
}
const oldPath = `${tester.id}/avatar-1.jpg`;
const newPath = `${tester.id}/avatar-2.jpg`;
await tester.client.storage.from("avatars").upload(oldPath, jpeg, { contentType: "image/jpeg", upsert: true });
await tester.client.storage.from("avatars").upload(newPath, jpeg, { contentType: "image/jpeg", upsert: true });
const before = await files(tester.client, tester.id);
check("both files are visible to the owner before the clean-up", before.length === 2, JSON.stringify(before));
await cleanFolder(tester.client, tester.id, newPath);
const afterReplace = await files(tester.client, tester.id);
check("replacing a photo leaves only the new file", afterReplace.length === 1 && afterReplace[0] === "avatar-2.jpg", JSON.stringify(afterReplace));
await cleanFolder(tester.client, tester.id, undefined);
check("removing the photo (or the account) empties the folder", (await files(tester.client, tester.id)).length === 0);
check("another player sees no files in that folder", (await files(nina.client, tester.id)).length === 0);

const first = await nina.client.rpc("report_avatar", { p_target: tester.id, p_reason: "inappropriate" });
check("a report is accepted", first.data?.status === "ok", JSON.stringify(first));
const self = await nina.client.rpc("report_avatar", { p_target: nina.id, p_reason: "other" });
check("reporting yourself is refused", self.data?.status === "self");
const anon = createClient(API, anonKey, { auth: { persistSession: false } });
const anonReport = await anon.rpc("report_avatar", { p_target: tester.id, p_reason: "other" });
check("a signed-out visitor cannot report", !!anonReport.error);
const read = await nina.client.from("avatar_reports").select("*");
check("players cannot read the reports table", !!read.error || (read.data ?? []).length === 0);

// clean up what this run created
spawnSync("docker", ["exec", "-i", "supabase_db_blockerino", "psql", "-U", "postgres", "-d", "postgres", "-c", "delete from public.avatar_reports"], { encoding: "utf8" });

if (failures > 0) {
	console.log(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log("\nAll avatar storage checks passed.");
