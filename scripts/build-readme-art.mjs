// Draws the animated pictures of README.md into docs/readme/*.svg. GitHub shows an SVG from the repository as an
// image, so there is no script in them: everything moves with CSS keyframes inside the file. Run: node scripts/build-readme-art.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "readme");
fs.mkdirSync(OUT, { recursive: true });

const COLORS = ["#ff3b4e", "#f0af0c", "#22c55e", "#22c7d8", "#8b5cf6", "#ff6b1a", "#ec4899"];
const BG = "#0b0714";

// a seeded random, so the pictures are the same on every run
function seeded(seed) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

function shade(hex, amount) {
	const n = parseInt(hex.slice(1), 16);
	const mix = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
	return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/** One game block: a face with a light top-left edge and a dark bottom-right one. */
function block(x, y, size, color, extra = "") {
	const e = Math.max(2, Math.round(size * 0.16));
	return `<g${extra}><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.12)}" fill="${shade(color, -0.38)}"/>` +
		`<rect x="${x}" y="${y}" width="${size - e}" height="${size - e}" rx="${Math.round(size * 0.12)}" fill="${shade(color, 0.32)}"/>` +
		`<rect x="${x + e}" y="${y + e}" width="${size - e * 2}" height="${size - e * 2}" fill="${color}"/></g>`;
}

const FONT = {
	B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
	L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
	O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
	C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
	K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
	E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
	R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
	I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
	N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
	P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
	X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
	D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
	U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
	S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
	" ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

/** Outlined squares drifting down, like the menu background of the game. */
function rain(width, height, count, random) {
	let css = "";
	let nodes = "";
	for (let i = 0; i < count; i++) {
		const size = 14 + Math.floor(random() * 22);
		const x = Math.floor(random() * (width - size));
		const duration = (9 + random() * 12).toFixed(1);
		const delay = (-random() * 20).toFixed(1);
		nodes += `<rect class="rain r${i}" x="${x}" y="${-size - 10}" width="${size}" height="${size}" rx="3" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="3"/>`;
		css += `.r${i}{animation-duration:${duration}s;animation-delay:${delay}s}`;
	}
	css += `.rain{opacity:.22;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}` +
		`@keyframes fall{to{transform:translateY(${height + 80}px)}}`;
	return { nodes, css };
}

function hero() {
	const W = 1200;
	const H = 380;
	const random = seeded(7);
	const word = "BLOCKERINO";
	const cell = 13;
	const gap = 2;
	const step = cell + gap;
	const letterW = 5 * step - gap;
	const letterGap = 16;
	const total = word.length * letterW + (word.length - 1) * letterGap;
	const startX = Math.round((W - total) / 2);
	const startY = 84;
	const drops = rain(W, H, 22, random);
	let blocks = "";
	let css = drops.css;
	let index = 0;
	[...word].forEach((letter, li) => {
		const color = COLORS[li % COLORS.length];
		FONT[letter].forEach((row, ry) => {
			[...row].forEach((on, rx) => {
				if (on !== "1") return;
				const x = startX + li * (letterW + letterGap) + rx * step;
				const y = startY + ry * step;
				const delay = (0.15 + li * 0.09 + (6 - ry) * 0.035 + random() * 0.08).toFixed(2);
				const blink = random() < 0.16 ? ` b${index % 5}` : "";
				blocks += block(x, y, cell, color, ` class="drop${blink}" style="animation-delay:${delay}s${blink ? `,${(2.5 + random() * 5).toFixed(1)}s` : ""}"`);
				index++;
			});
		});
	});
	css += `.drop{animation:drop .7s cubic-bezier(.2,1.25,.4,1) both}` +
		`@keyframes drop{from{transform:translateY(-${startY + 140}px);opacity:0}60%{opacity:1}to{transform:none;opacity:1}}` +
		[0, 1, 2, 3, 4].map((n) => `.b${n}{animation:drop .7s cubic-bezier(.2,1.25,.4,1) both,glint ${5 + n}s ease-in-out infinite}`).join("") +
		`@keyframes glint{0%,86%,100%{filter:none}90%{filter:brightness(1.9)}}`;

	// "PIXEL DUELS" in small blocks under the word
	const sub = "PIXEL DUELS";
	const sc = 5;
	const sStep = sc + 1;
	const sLetter = 5 * sStep - 1;
	const sGap = 8;
	const sTotal = sub.length * sLetter + (sub.length - 1) * sGap;
	const sX = Math.round((W - sTotal) / 2);
	const sY = startY + 7 * step + 26;
	let subBlocks = "";
	[...sub].forEach((letter, li) => {
		FONT[letter].forEach((row, ry) => {
			[...row].forEach((on, rx) => {
				if (on === "1") subBlocks += `<rect x="${sX + li * (sLetter + sGap) + rx * sStep}" y="${sY + ry * sStep}" width="${sc}" height="${sc}" fill="#ffd700"/>`;
			});
		});
	});
	css += `.sub{animation:rise .8s 1.5s ease-out both}.tag{animation:rise .8s 1.9s ease-out both}.chips{animation:rise .8s 2.2s ease-out both}` +
		`@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}` +
		`.sweep{animation:sweep 6s 2.6s ease-in-out infinite}@keyframes sweep{0%,55%{transform:translateX(-300px)}100%{transform:translateX(${W + 300}px)}}`;

	const chips = ["Classic 8×8", "Chaos 10×10", "Versus 1v1", "50 уровней", "Сундуки", "8 мини-игр"];
	let chipNodes = "";
	const chipW = 150;
	const chipGap = 14;
	const chipsX = Math.round((W - (chips.length * chipW + (chips.length - 1) * chipGap)) / 2);
	chips.forEach((text, i) => {
		const x = chipsX + i * (chipW + chipGap);
		const color = COLORS[i % COLORS.length];
		chipNodes += `<rect x="${x}" y="318" width="${chipW}" height="34" rx="9" fill="${color}22" stroke="${color}" stroke-width="1.5"/>` +
			`<text x="${x + chipW / 2}" y="340" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${text}</text>`;
	});

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Blockerino: Pixel Duels">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0714"/><stop offset=".55" stop-color="#170b26"/><stop offset="1" stop-color="#0a0a18"/></linearGradient>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="22"/></clipPath>
</defs>
<style>text{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif}${css}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${drops.nodes}
<g>${blocks}</g>
<g class="sub">${subBlocks}</g>
<text class="tag" x="${W / 2}" y="${sY + 78}" text-anchor="middle" font-size="21" fill="#c9c2dc">Ставь фигуры, рви линии, лови комбо. Один, с друзьями и против всего мира.</text>
<g class="chips">${chipNodes}</g>
<rect class="sweep" x="0" y="0" width="220" height="${H}" fill="url(#shine)" transform="skewX(-18)"/>
</g>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="2"/>
</svg>`;
}

/** A looping mini game: a piece falls into the gap, the line flashes and clears, the score pops. */
function gameplay() {
	const N = 8;
	const cell = 46;
	const gap = 4;
	const pad = 22;
	const size = pad * 2 + N * cell + (N - 1) * gap;
	const H = size + 74;
	const at = (i) => pad + i * (cell + gap);
	const random = seeded(21);
	let grid = "";
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grid += `<rect x="${at(x)}" y="${at(y) + 60}" width="${cell}" height="${cell}" rx="6" fill="#1a1426" stroke="#2c2340" stroke-width="2"/>`;

	// what lies on the board: rows 6 and 7 are full except the hole the piece fills (an L of four cells)
	const hole = new Set(["3,6", "3,7", "4,7", "5,7"]);
	let rest = "";
	let lines = "";
	const scatter = [[0, 5], [1, 5], [6, 5], [7, 5], [7, 4], [0, 4], [1, 3]];
	for (const [x, y] of scatter) rest += block(at(x), at(y) + 60, cell, COLORS[Math.floor(random() * COLORS.length)]);
	for (const y of [6, 7]) for (let x = 0; x < N; x++) {
		if (hole.has(`${x},${y}`)) continue;
		lines += block(at(x), at(y) + 60, cell, COLORS[Math.floor(random() * COLORS.length)]);
	}
	let piece = "";
	for (const key of hole) {
		const [x, y] = key.split(",").map(Number);
		piece += block(at(x), at(y) + 60, cell, "#ffd700");
	}
	const lineY = at(6) + 60;
	const css = `.piece{animation:piece 6s infinite}.lines{animation:lines 6s infinite}.flash{animation:flash 6s infinite}.score{animation:score 6s infinite}.combo{animation:combo 6s infinite}` +
		`@keyframes piece{0%,6%{transform:translateY(-${lineY + 40}px);opacity:0}9%{opacity:1}26%{transform:translateY(-${lineY + 40 - 260}px);opacity:1}34%,46%{transform:none;opacity:1;animation-timing-function:step-end}52%,100%{transform:none;opacity:0}}` +
		`@keyframes lines{0%,46%{opacity:1;transform:none}52%{opacity:0;transform:scale(1.04)}88%{opacity:0}96%,100%{opacity:1;transform:none}}` +
		`@keyframes flash{0%,38%{opacity:0}42%{opacity:.95}52%,100%{opacity:0}}` +
		`@keyframes score{0%,44%{opacity:0;transform:translateY(20px) scale(.7)}52%{opacity:1;transform:translateY(0) scale(1.15)}60%{transform:translateY(-6px) scale(1)}80%{opacity:1;transform:translateY(-26px)}88%,100%{opacity:0;transform:translateY(-40px)}}` +
		`@keyframes combo{0%,48%{opacity:0;transform:scale(.4)}56%{opacity:1;transform:scale(1.12)}62%{transform:scale(1)}82%{opacity:1}90%,100%{opacity:0}}` +
		`.lines,.score,.combo{transform-box:fill-box;transform-origin:center}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${H}" width="${size}" height="${H}" role="img" aria-label="Фигура встаёт на место, две линии сгорают">
<style>text{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif}${css}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<rect width="${size}" height="${H}" rx="20" fill="${BG}"/>
<rect x="1" y="1" width="${size - 2}" height="${H - 2}" rx="20" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>
<text x="${pad}" y="40" font-size="20" font-weight="700" fill="#fff">Classic 8×8</text>
<text x="${size - pad}" y="40" text-anchor="end" font-size="20" font-weight="700" fill="#ffd700">12 480</text>
${grid}${rest}
<g class="lines">${lines}</g>
<g class="piece">${piece}</g>
<rect class="flash" x="${pad - 6}" y="${lineY - 6}" width="${N * cell + (N - 1) * gap + 12}" height="${cell * 2 + gap + 12}" rx="10" fill="#fff"/>
<text class="score" x="${size / 2}" y="${lineY + 30}" text-anchor="middle" font-size="46" font-weight="800" fill="#ffd700" stroke="#3b2a00" stroke-width="2" paint-order="stroke">+240</text>
<text class="combo" x="${size / 2}" y="${lineY + 84}" text-anchor="middle" font-size="24" font-weight="800" fill="#ff3b4e" stroke="#1a0006" stroke-width="2" paint-order="stroke">COMBO ×2</text>
</svg>`;
}

/** The chest roulette: a strip of prizes in rarity colours slows down on a legendary one. */
function chest() {
	const W = 1200;
	const H = 250;
	const tile = 110;
	const gap = 12;
	const step = tile + gap;
	const rarity = { common: "#b8c0cc", rare: "#4da3ff", epic: "#b46cff", legendary: "#ffc93c" };
	const random = seeded(99);
	const count = 30;
	const win = 22;
	let tiles = "";
	for (let i = 0; i < count; i++) {
		const roll = random();
		const kind = i === win ? "legendary" : roll < 0.4 ? "common" : roll < 0.75 ? "rare" : roll < 0.93 ? "epic" : "legendary";
		const color = rarity[kind];
		const x = i * step;
		const inner = COLORS[Math.floor(random() * COLORS.length)];
		tiles += `<g${i === win ? ' class="win"' : ""}><rect x="${x}" y="70" width="${tile}" height="${tile}" rx="14" fill="${color}22" stroke="${color}" stroke-width="3"/>` +
			`<rect x="${x + 3}" y="${70 + tile - 12}" width="${tile - 6}" height="9" rx="4" fill="${color}"/>` +
			(i % 4 === 1
				? `<circle cx="${x + tile / 2}" cy="${70 + tile / 2 - 4}" r="24" fill="#f5b50c" stroke="#b87608" stroke-width="5"/><rect x="${x + tile / 2 - 5}" y="${70 + tile / 2 - 18}" width="10" height="28" fill="#ffe680"/>`
				: block(x + 24, 70 + 20, 28, inner) + block(x + 56, 70 + 20, 28, shade(inner, 0.2)) + block(x + 24, 70 + 52, 28, shade(inner, -0.15)) + block(x + 56, 70 + 52, 28, inner)) +
			`</g>`;
	}
	const target = win * step + tile / 2 - W / 2;
	const css = `.strip{animation:spin 8s infinite}` +
		`@keyframes spin{0%,4%{transform:translateX(0);animation-timing-function:cubic-bezier(.1,.72,.12,1)}62%,92%{transform:translateX(-${target}px)}100%{transform:translateX(0)}}` +
		`.win{transform-box:fill-box;transform-origin:center;animation:win 8s infinite}@keyframes win{0%,62%{transform:none;filter:none}66%{transform:scale(1.14);filter:brightness(1.5)}72%,90%{transform:scale(1.07);filter:brightness(1.2)}94%,100%{transform:none;filter:none}}` +
		`.label{animation:label 8s infinite}@keyframes label{0%,63%{opacity:0;transform:translateY(8px)}68%,90%{opacity:1;transform:none}94%,100%{opacity:0}}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Рулетка сундука останавливается на легендарном призе">
<defs>
<linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="${BG}"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></linearGradient>
<linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="${BG}" stop-opacity="0"/><stop offset="1" stop-color="${BG}"/></linearGradient>
<clipPath id="c"><rect width="${W}" height="${H}" rx="20"/></clipPath>
</defs>
<style>text{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif}${css}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<g clip-path="url(#c)">
<rect width="${W}" height="${H}" fill="${BG}"/>
<text x="32" y="44" font-size="22" font-weight="700" fill="#fff">Сундуки</text>
<text x="${W - 32}" y="44" text-anchor="end" font-size="16" fill="#a79fbd">обычный · редкий · эпический · легендарный</text>
<g class="strip">${tiles}</g>
<rect x="0" y="60" width="150" height="130" fill="url(#l)"/><rect x="${W - 150}" y="60" width="150" height="130" fill="url(#r)"/>
<rect x="${W / 2 - 2}" y="58" width="4" height="134" fill="#ffd700"/>
<path d="M${W / 2 - 11} 52h22l-11 14z" fill="#ffd700"/><path d="M${W / 2 - 11} 198h22l-11-14z" fill="#ffd700"/>
<text class="label" x="${W / 2}" y="232" text-anchor="middle" font-size="22" font-weight="800" fill="#ffc93c">ЛЕГЕНДАРНЫЙ!</text>
</g>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="20" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>
</svg>`;
}

/** A thin row of blocks that bob in a wave: the section divider. */
function divider() {
	const W = 1200;
	const H = 34;
	const size = 14;
	const count = 40;
	const stepX = W / count;
	let nodes = "";
	for (let i = 0; i < count; i++) {
		nodes += block(Math.round(i * stepX + (stepX - size) / 2), 10, size, COLORS[i % COLORS.length], ` class="w" style="animation-delay:${(i * -0.09).toFixed(2)}s"`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="">
<style>.w{animation:w 3.6s ease-in-out infinite}@keyframes w{0%,100%{transform:translateY(5px);opacity:.45}50%{transform:translateY(-5px);opacity:1}}@media (prefers-reduced-motion:reduce){.w{animation:none}}</style>
${nodes}
</svg>`;
}

const files = { "hero.svg": hero(), "gameplay.svg": gameplay(), "chest.svg": chest(), "divider.svg": divider() };
for (const [name, svg] of Object.entries(files)) {
	fs.writeFileSync(path.join(OUT, name), svg);
	console.log(name, `${(svg.length / 1024).toFixed(1)} KiB`);
}
