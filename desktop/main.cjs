// Blockerino for Windows: an Electron window around the web build that ships inside the exe.
//
// The game is served from a small local HTTP server on a fixed port, so the page keeps one origin
// (and with it the saved progress in localStorage) between launches.
//
// Google and Discord refuse to sign in inside embedded windows, so sign-in pages open in the
// player's normal browser. Supabase then sends the browser back to http://127.0.0.1:PORT/?code=...;
// the local server answers that request with a "you can return to the game" page and hands the code
// to the game window, which finishes the PKCE sign-in with the verifier it saved before leaving.
const { app, BrowserWindow, Menu, session, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = 47823;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const UA_MARK = "BlockerinoDesktop";
const WEB_ROOT = path.join(__dirname, "web");

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".m4a": "audio/mp4",
	".mp4": "video/mp4",
	".wasm": "application/wasm",
};

let mainWindow = null;
// When the game last sent the player to a sign-in page. A browser coming back with ?code is believed only within
// 10 minutes of that and only once: otherwise any website could make the game window reload with a URL of its choice.
let signInStartedAt = 0;
const SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

function isAuthCallback(url) {
	return url.searchParams.has("code") || url.searchParams.has("error") || url.searchParams.has("error_description");
}

function callbackPage(ok) {
	const title = ok ? "Вход выполнен / Signed in" : "Вход не удался / Sign-in failed";
	const text = ok
		? "Вернитесь в окно Blockerino, эту вкладку можно закрыть.<br>Go back to the Blockerino window, you can close this tab."
		: "Вернитесь в Blockerino и попробуйте ещё раз.<br>Go back to Blockerino and try again.";
	return `<!doctype html><html><head><meta charset="utf-8"><title>Blockerino</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#130a17;color:#fff;font-family:system-ui,sans-serif;text-align:center}h1{font-size:22px}p{color:#bbb;line-height:1.5}</style>
</head><body><div><h1>${title}</h1><p>${text}</p></div></body></html>`;
}

function resolveFile(pathname) {
	let rel;
	try {
		rel = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	const candidates = [rel, `${rel}.html`, path.posix.join(rel, "index.html")];
	for (const candidate of candidates) {
		const full = path.normalize(path.join(WEB_ROOT, candidate));
		if (!full.startsWith(WEB_ROOT)) return null;
		try {
			if (fs.statSync(full).isFile()) return full;
		} catch {
			// try the next candidate
		}
	}
	return null;
}

function startServer() {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url || "/", ORIGIN);
		const fromGame = String(req.headers["user-agent"] || "").includes(UA_MARK);

		// The browser came back from Google/Discord: give the code to the game window.
		if (!fromGame && isAuthCallback(url)) {
			if (!signInStartedAt || Date.now() - signInStartedAt > SIGN_IN_WINDOW_MS) {
				res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
				res.end("No sign-in was started from the game.");
				return;
			}
			signInStartedAt = 0;
			const ok = url.searchParams.has("code");
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
			res.end(callbackPage(ok));
			if (mainWindow) {
				mainWindow.loadURL(`${ORIGIN}/${url.search}`);
				if (mainWindow.isMinimized()) mainWindow.restore();
				mainWindow.show();
				mainWindow.focus();
			}
			return;
		}

		// Missing files with an extension (e.g. the site's service worker, left out of the exe) are a plain 404;
		// any other path is a game screen and gets the app shell.
		let file = resolveFile(url.pathname);
		if (!file && path.extname(url.pathname)) {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("Not found");
			return;
		}
		file = file || path.join(WEB_ROOT, "index.html");
		const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
		res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(PORT, "127.0.0.1", () => resolve(server));
	});
}

function openOutside(url) {
	// a sign-in page (Supabase, Google or Discord): the answer may come back to the local server for a while
	if (/supabase\.co\/auth|accounts\.google\.com|discord\.com\/(api\/)?oauth2/i.test(url)) signInStartedAt = Date.now();
	if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
}

function isLocal(url) {
	return url.startsWith(`${ORIGIN}/`) || url === ORIGIN;
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 860,
		minWidth: 400,
		minHeight: 600,
		backgroundColor: "#130a17",
		title: "Blockerino",
		icon: path.join(__dirname, "icon.png"),
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	// the page sets a long SEO title; the window keeps the game name
	mainWindow.on("page-title-updated", (event) => event.preventDefault());
	mainWindow.webContents.setUserAgent(`${mainWindow.webContents.getUserAgent()} ${UA_MARK}`);

	// Links that open new tabs (Discord, Google Play, GitHub...) go to the normal browser.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		openOutside(url);
		return { action: "deny" };
	});
	// Sign-in pages and any other site the game navigates to also open in the normal browser.
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (isLocal(url)) return;
		event.preventDefault();
		openOutside(url);
	});
	mainWindow.webContents.on("before-input-event", (event, input) => {
		if (input.type === "keyDown" && input.key === "F11") {
			mainWindow.setFullScreen(!mainWindow.isFullScreen());
			event.preventDefault();
		}
	});
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
	mainWindow.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	Menu.setApplicationMenu(null);

	app.whenReady().then(async () => {
		// The web build registers a service worker for offline use on the site. Inside the exe the files
		// are already local, and a cached worker would keep serving an older build after an update.
		await session.defaultSession.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
		try {
			await startServer();
		} catch (error) {
			const { dialog } = require("electron");
			dialog.showErrorBox(
				"Blockerino",
				`Порт ${PORT} занят другой программой, игра не может запуститься.\nPort ${PORT} is in use by another program.\n\n${error.message}`
			);
			app.quit();
			return;
		}
		createWindow();
	});

	app.on("window-all-closed", () => app.quit());
}
