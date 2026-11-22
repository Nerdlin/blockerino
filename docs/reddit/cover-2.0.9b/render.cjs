// node render.cjs  ->  builds/cover-2.0.9b-en.png and -ru.png (1280x640), the layout of cover-2.0.9
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.LOCALAPPDATA, "npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright"));

const T = {
	en: { cls: "en", badge: "UPDATE 2.0.9b", sub: "<b>BACKGAMMON</b>, 60+ ANIMATED SKINS, FREE SEASON PASS, SHARE GIFS.", tags: ["BACKGAMMON", "SEASON PASS", "ANIMATED SKINS"], h2: "SEASON PASS", s1: "Free rewards every tier", l1: "Animated skins", l2: "Backgammon", bar: "Share your best moment" },
	ru: { cls: "ru", badge: "ВЕРСИЯ 2.0.9b", sub: "<b>НАРДЫ</b>, 60+ АНИМИРОВАННЫХ СКИНОВ, БЕСПЛАТНЫЙ ПРОПУСК, GIF МОМЕНТА.", tags: ["НАРДЫ", "ПРОПУСК", "АНИМАЦИИ"], h2: "СЕЗОННЫЙ ПРОПУСК", s1: "Бесплатные награды", l1: "Анимированных скинов", l2: "Нарды", bar: "Поделись моментом" },
};

(async () => {
	const html = fs.readFileSync(path.join(__dirname, "cover.html"), "utf8");
	const browser = await chromium.launch({ channel: "chrome" });
	for (const [lang, t] of Object.entries(T)) {
		const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
		const body = html
			.replace("LANG", t.cls).replace(">BADGE<", ">" + t.badge + "<").replace(">SUB<", ">" + t.sub + "<")
			.replace(">T1<", ">" + t.tags[0] + "<").replace(">T2<", ">" + t.tags[1] + "<").replace(">T3<", ">" + t.tags[2] + "<")
			.replace(">H2<", ">" + t.h2 + "<").replace(">S1<", ">" + t.s1 + "<")
			.replace(">L1<", ">" + t.l1 + "<").replace(">L2<", ">" + t.l2 + "<").replace(">BAR<", ">" + t.bar + "<");
		const file = path.join(__dirname, "_" + lang + ".html");
		fs.writeFileSync(file, body);
		await page.goto("file:///" + file.replace(/\\/g, "/"));
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(300);
		const out = path.join(__dirname, "..", "..", "..", "builds", "cover-2.0.9b-" + lang + ".png");
		await page.screenshot({ path: out });
		fs.copyFileSync(out, path.join(__dirname, "cover-2.0.9b-" + lang + ".png"));
		fs.unlinkSync(file);
	}
	await browser.close();
})();
