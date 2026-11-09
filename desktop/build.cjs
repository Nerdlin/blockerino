// Builds the Windows exe: exports the web game, copies it into desktop/web and runs electron-builder.
// Usage (from desktop/): npm run build
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const web = path.join(__dirname, "web");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: process.env });

// The exe's version follows the game's version in app.json.
const appVersion = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo.version;
const pkgPath = path.join(__dirname, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.version !== appVersion) {
	pkg.version = appVersion;
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

run("npx expo export -p web", root);

fs.rmSync(web, { recursive: true, force: true });
fs.cpSync(dist, web, { recursive: true });
// Site-only files that mean nothing inside the exe.
for (const name of ["CNAME", "service-worker.js", "robots.txt", "sitemap.xml", "llms.txt"]) {
	fs.rmSync(path.join(web, name), { force: true });
}
for (const name of fs.readdirSync(web)) {
	if (/^google[0-9a-f]+\.html$/.test(name)) fs.rmSync(path.join(web, name));
}
fs.copyFileSync(path.join(root, "assets", "images", "icon.png"), path.join(__dirname, "icon.png"));

run("npx electron-builder --win", __dirname);
