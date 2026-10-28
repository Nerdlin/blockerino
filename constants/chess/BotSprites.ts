// Pixel-art faces for the chess bots: a 12x12 grid built from a few parts (hair, accessory, mouth) and colors, so every
// bot looks different without a hand-drawn bitmap for each. Pure data: the screen only turns the grid into rectangles.

export type Hair = "bald" | "short" | "long" | "bob" | "spiky" | "curly" | "ponytail";
export type Accessory = "none" | "cap" | "headband" | "glasses" | "horns" | "antenna" | "crown" | "mustache" | "helm" | "scarf" | "freckles";
export type Mouth = "smile" | "flat" | "open";

export interface BotLook {
	skin: string;
	hair: Hair;
	hairColor: string;
	shirt: string;
	accessory: Accessory;
	accent: string;
	mouth: Mouth;
}

export const SPRITE_SIZE = 12;
export type Sprite = (string | null)[][];

const EYE = "#101018";
const MOUTH = "#8A2F3A";

/** The 12x12 grid of pixel colors (null is transparent) for a look. */
export function botSprite(look: BotLook): Sprite {
	const grid: Sprite = Array.from({ length: SPRITE_SIZE }, () => Array<string | null>(SPRITE_SIZE).fill(null));
	const set = (row: number, col: number, color: string) => {
		if (row >= 0 && row < SPRITE_SIZE && col >= 0 && col < SPRITE_SIZE) grid[row][col] = color;
	};
	const rect = (r0: number, c0: number, r1: number, c1: number, color: string) => {
		for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(r, c, color);
	};

	// shoulders, neck, head
	rect(10, 2, 11, 9, look.shirt);
	rect(9, 5, 9, 6, look.skin);
	rect(3, 3, 8, 8, look.skin);

	// hair
	const top = () => {
		rect(2, 3, 3, 8, look.hairColor);
		set(4, 3, look.hairColor);
		set(4, 8, look.hairColor);
	};
	switch (look.hair) {
		case "short":
			top();
			break;
		case "long":
			top();
			rect(3, 2, 9, 2, look.hairColor);
			rect(3, 9, 9, 9, look.hairColor);
			rect(5, 3, 7, 3, look.hairColor);
			rect(5, 8, 7, 8, look.hairColor);
			break;
		case "bob":
			top();
			rect(3, 2, 7, 2, look.hairColor);
			rect(3, 9, 7, 9, look.hairColor);
			rect(5, 3, 5, 3, look.hairColor);
			rect(5, 8, 5, 8, look.hairColor);
			break;
		case "spiky":
			top();
			for (const col of [3, 5, 7]) set(1, col, look.hairColor);
			set(1, 8, look.hairColor);
			break;
		case "curly":
			rect(1, 3, 1, 8, look.hairColor);
			rect(2, 2, 3, 9, look.hairColor);
			rect(4, 2, 5, 2, look.hairColor);
			rect(4, 9, 5, 9, look.hairColor);
			break;
		case "ponytail":
			top();
			rect(4, 9, 7, 9, look.hairColor);
			rect(5, 10, 8, 10, look.hairColor);
			break;
		case "bald":
			break;
	}

	// eyes and mouth
	set(6, 4, EYE);
	set(6, 7, EYE);
	if (look.mouth === "smile") rect(8, 4, 8, 7, MOUTH);
	else if (look.mouth === "flat") rect(8, 5, 8, 6, MOUTH);
	else rect(7, 5, 8, 6, MOUTH);

	// accessory on top of everything
	switch (look.accessory) {
		case "cap":
			rect(1, 3, 1, 8, look.accent);
			rect(2, 2, 2, 9, look.accent);
			rect(3, 2, 3, 9, look.accent);
			break;
		case "headband":
			rect(3, 3, 3, 8, look.accent);
			break;
		case "glasses":
			for (const [r, c] of [[5, 3], [5, 4], [5, 5], [6, 3], [6, 5], [7, 3], [7, 4], [7, 5], [5, 6], [5, 7], [5, 8], [6, 6], [6, 8], [7, 6], [7, 7], [7, 8]]) set(r, c, look.accent);
			break;
		case "horns":
			for (const [r, c] of [[0, 3], [1, 3], [0, 8], [1, 8], [2, 3], [2, 8]]) set(r, c, look.accent);
			break;
		case "antenna":
			rect(1, 6, 2, 6, look.accent);
			rect(0, 5, 0, 6, look.accent);
			break;
		case "crown":
			for (const col of [3, 5, 6, 8]) set(0, col, look.accent);
			rect(1, 3, 1, 8, look.accent);
			break;
		case "mustache":
			rect(7, 4, 7, 7, look.hairColor);
			break;
		case "helm":
			rect(1, 3, 3, 8, look.accent);
			rect(1, 5, 1, 6, EYE);
			break;
		case "scarf":
			rect(9, 3, 9, 8, look.accent);
			break;
		case "freckles":
			for (const [r, c] of [[7, 3], [7, 8], [7, 4]]) set(r, c, "#B86F50");
			break;
		case "none":
			break;
	}
	return grid;
}

/** Every non-empty pixel as [row, col, color], for drawing. */
export function spritePixels(sprite: Sprite): [number, number, string][] {
	const pixels: [number, number, string][] = [];
	sprite.forEach((row, r) => row.forEach((color, c) => color && pixels.push([r, c, color])));
	return pixels;
}
