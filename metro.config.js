const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Build outputs and agent worktrees at the project root hold gigabytes of files (and whole copies of
// the project). Metro does not need them, and crawling them can exhaust file handles on Windows (EMFILE).
// Anchored to the root so packages in node_modules keep their own dist/ and android/ folders.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ignored = [".claude", "android", "builds", "dist"].map(
	(dir) => new RegExp(`^${escapeRegExp(path.join(__dirname, dir))}[\\\\/].*`)
);
const current = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(current) ? current : current ? [current] : []), ...ignored];

module.exports = config;
