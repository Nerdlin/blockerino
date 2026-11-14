// Writes public/site-info.json for the web build: what the personal page (aionerdlin.me) shows about the latest
// release. Version and build come from app.json, the date and highlights from docs/site-info.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
const source = JSON.parse(fs.readFileSync(path.join(root, "docs", "site-info.json"), "utf8"));

const version = app.version;
const info = {
	version,
	build: app.android?.versionCode ?? null,
	date: source.date,
	apk: `https://github.com/Nerdlin/blockerino/releases/download/v${version}/blockerino-${version}.apk`,
	release: `https://github.com/Nerdlin/blockerino/releases/tag/v${version}`,
	levels: source.levels,
	miniGames: source.miniGames,
	highlights: source.highlights,
};
for (const lang of ["ru", "en"]) {
	if (!Array.isArray(info.highlights?.[lang]) || info.highlights[lang].length === 0) throw new Error(`docs/site-info.json: highlights.${lang} is empty`);
}
fs.writeFileSync(path.join(root, "public", "site-info.json"), JSON.stringify(info, null, "\t") + "\n");
console.log(`site-info.json: ${version} (build ${info.build})`);
