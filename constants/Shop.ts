import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { supabase } from "./Supabase";

export type ShopCategory = "piece_skin" | "background" | "music" | "sfx";
export type BackgroundScene = "classic" | "ender" | "sunset" | "ice" | "cyber";

export interface ShopItem {
	id: string;
	category: ShopCategory;
	title: string;
	description: string;
	price: number;
	accent: string;
	previewColors: string[];
	gradient?: [string, string, string];
	scene?: BackgroundScene;
	secret?: boolean;
}

export interface EquippedCosmetics {
	piece_skin: string;
	background: string;
	music: string;
	sfx: string;
}

export interface ShopState {
	balance: number;
	ownedItemIds: string[];
	equipped: EquippedCosmetics;
	starterGrantClaimed: boolean;
	updatedAt: number;
}

const SHOP_STATE_KEY = "SHOP_STATE_V1";
const PLAYER_NAME_KEY = "PLAYER_NAME";
const PLAYER_ID_KEY = "PLAYER_ID";
export const STARTER_SHOP_COINS = 250;

export const DEFAULT_EQUIPPED_COSMETICS: EquippedCosmetics = {
	piece_skin: "piece_classic",
	background: "background_classic",
	music: "music_classic",
	sfx: "sfx_classic",
};

export const FREE_SHOP_ITEM_IDS = Object.values(DEFAULT_EQUIPPED_COSMETICS);

const BASE_SHOP_ITEMS: ShopItem[] = [
	{
		id: "piece_classic",
		category: "piece_skin",
		title: "Classic Pixels",
		description: "Original bright blockerino pieces.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#E38F10", "#BA1326", "#109E28", "#1438B8"],
	},
	{
		id: "piece_minecraft",
		category: "piece_skin",
		title: "Mine Blocks",
		description: "Grass, dirt, stone and gem colors with chunky cube edges.",
		price: 120,
		accent: "#5DBB3F",
		previewColors: ["#6BBF45", "#8A5A2B", "#808080", "#2CCED2"],
	},
	{
		id: "piece_crystal",
		category: "piece_skin",
		title: "Crystal Gems",
		description: "Sharp glossy blocks with cold jewel tones.",
		price: 220,
		accent: "#7DEBFF",
		previewColors: ["#7DEBFF", "#C77DFF", "#FF7DDD", "#8DFFB2"],
	},
	{
		id: "piece_lava",
		category: "piece_skin",
		title: "Lava Forge",
		description: "Hot magma palette with darker forged edges.",
		price: 320,
		accent: "#FF6B1A",
		previewColors: ["#FFB000", "#FF4D00", "#8B1E00", "#3A0B00"],
	},
	{
		id: "piece_circuit",
		category: "piece_skin",
		title: "Circuit Tiles",
		description: "Clean tech blocks with electric green and cyan traces.",
		price: 420,
		accent: "#00FF9D",
		previewColors: ["#00FF9D", "#00D4FF", "#4D5BFF", "#D5FF3F"],
	},
	{
		id: "background_classic",
		category: "background",
		title: "Classic Night",
		description: "The original dark animated gradient.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#0A0A14", "#140A1E", "#1E0A14"],
		gradient: ["rgb(10, 10, 20)", "rgb(20, 10, 30)", "rgb(30, 10, 20)"],
		scene: "classic",
	},
	{
		id: "background_ender",
		category: "background",
		title: "Ender Depths",
		description: "Deep violet caves with a green shimmer.",
		price: 160,
		accent: "#6BFFB8",
		previewColors: ["#090716", "#251047", "#0E3D37"],
		gradient: ["rgb(9, 7, 22)", "rgb(37, 16, 71)", "rgb(14, 61, 55)"],
		scene: "ender",
	},
	{
		id: "background_sunset",
		category: "background",
		title: "Sunset Grid",
		description: "Warm arcade sunset without washing out the board.",
		price: 240,
		accent: "#FFD166",
		previewColors: ["#231942", "#FF6B6B", "#FFD166"],
		gradient: ["rgb(35, 25, 66)", "rgb(255, 107, 107)", "rgb(255, 209, 102)"],
		scene: "sunset",
	},
	{
		id: "background_ice",
		category: "background",
		title: "Ice Cave",
		description: "Cold blues and glassy shadows.",
		price: 300,
		accent: "#90E0EF",
		previewColors: ["#061A2D", "#0A4D68", "#90E0EF"],
		gradient: ["rgb(6, 26, 45)", "rgb(10, 77, 104)", "rgb(144, 224, 239)"],
		scene: "ice",
	},
	{
		id: "background_cyber",
		category: "background",
		title: "Cyber Alley",
		description: "Dark city neon with cyan and pink motion.",
		price: 380,
		accent: "#FF2BD6",
		previewColors: ["#050816", "#00D4FF", "#FF2BD6"],
		gradient: ["rgb(5, 8, 22)", "rgb(0, 85, 132)", "rgb(86, 14, 96)"],
		scene: "cyber",
	},
	{
		id: "music_classic",
		category: "music",
		title: "Classic Loop",
		description: "The original background mix.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "music_lofi",
		category: "music",
		title: "Lo-fi Builder",
		description: "Softer mix preset for longer solo runs.",
		price: 140,
		accent: "#BDE0FE",
		previewColors: ["#BDE0FE", "#FFC8DD", "#A2D2FF"],
	},
	{
		id: "music_arcade",
		category: "music",
		title: "Arcade Rush",
		description: "A brighter, louder arcade-style mix preset.",
		price: 220,
		accent: "#FF006E",
		previewColors: ["#FF006E", "#FBFF12", "#3A86FF"],
	},
	{
		id: "music_cave",
		category: "music",
		title: "Cave Echoes",
		description: "A darker mix preset for mining-style themes.",
		price: 280,
		accent: "#8D99AE",
		previewColors: ["#2B2D42", "#8D99AE", "#EDF2F4"],
	},
	{
		id: "music_space",
		category: "music",
		title: "Space Drift",
		description: "A quieter floating mix preset.",
		price: 360,
		accent: "#9D4EDD",
		previewColors: ["#10002B", "#5A189A", "#E0AAFF"],
	},
	{
		id: "sfx_classic",
		category: "sfx",
		title: "Classic Clicks",
		description: "The original placement, combo and menu sounds.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "sfx_wood",
		category: "sfx",
		title: "Wooden Blocks",
		description: "Chunkier placement emphasis for blocky skins.",
		price: 140,
		accent: "#B08968",
		previewColors: ["#7F5539", "#B08968", "#E6CCB2"],
	},
	{
		id: "music_classic",
		category: "music",
		title: "Classic Loop",
		description: "The original background mix.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "music_lofi",
		category: "music",
		title: "Lo-fi Builder",
		description: "Softer mix preset for longer solo runs.",
		price: 140,
		accent: "#BDE0FE",
		previewColors: ["#BDE0FE", "#FFC8DD", "#A2D2FF"],
	},
	{
		id: "music_arcade",
		category: "music",
		title: "Arcade Rush",
		description: "A brighter, louder arcade-style mix preset.",
		price: 220,
		accent: "#FF006E",
		previewColors: ["#FF006E", "#FBFF12", "#3A86FF"],
	},
	{
		id: "music_cave",
		category: "music",
		title: "Cave Echoes",
		description: "A darker mix preset for mining-style themes.",
		price: 280,
		accent: "#8D99AE",
		previewColors: ["#2B2D42", "#8D99AE", "#EDF2F4"],
	},
	{
		id: "music_space",
		category: "music",
		title: "Space Drift",
		description: "A quieter floating mix preset.",
		price: 360,
		accent: "#9D4EDD",
		previewColors: ["#10002B", "#5A189A", "#E0AAFF"],
	},
	{
		id: "sfx_classic",
		category: "sfx",
		title: "Classic Clicks",
		description: "The original placement, combo and menu sounds.",
		price: 0,
		accent: "#F0AF0C",
		previewColors: ["#F0AF0C", "#FFFFFF", "#777777"],
	},
	{
		id: "sfx_wood",
		category: "sfx",
		title: "Wooden Blocks",
		description: "Chunkier placement emphasis for blocky skins.",
		price: 140,
		accent: "#B08968",
		previewColors: ["#7F5539", "#B08968", "#E6CCB2"],
	},
	{
		id: "sfx_glass",
		category: "sfx",
		title: "Glass Pops",
		description: "Brighter feedback for clears and combos.",
		price: 220,
		accent: "#A9DEF9",
		previewColors: ["#A9DEF9", "#E4C1F9", "#FCF6BD"],
	},
	{
		id: "sfx_retro",
		category: "sfx",
		title: "Retro Beeps",
		description: "Sharper arcade event mapping.",
		price: 300,
		accent: "#06D6A0",
		previewColors: ["#06D6A0", "#FFD166", "#EF476F"],
	},
	{
		id: "sfx_metal",
		category: "sfx",
		title: "Metal Clanks",
		description: "Heavier feedback for intense runs.",
		price: 380,
		accent: "#ADB5BD",
		previewColors: ["#343A40", "#ADB5BD", "#F8F9FA"],
	},
	{
		id: "music_custom",
		category: "music",
		title: "Custom Stream URL",
		description: "Secret! Play your own music stream URL. Configure in Options.",
		price: 0,
		accent: "#FFFFFF",
		previewColors: ["#FF0000", "#00FF00", "#0000FF"],
		secret: true,
	},
	{
		id: "sfx_custom",
		category: "sfx",
		title: "Custom SFX URL",
		description: "Secret! Play your own SFX stream URL. Configure in Options.",
		price: 0,
		accent: "#FFFFFF",
		previewColors: ["#FF00FF", "#00FFFF", "#FFFF00"],
		secret: true,
	},
];

const EXTRA_PIECE_SKINS: ShopItem[] = [
	["piece_minecraft_moss", "Moss Mine", "Soft green mine-style blocks.", 180, "#7AC74F", ["#4D8B31", "#6BBF45", "#A7C957"]],
	["piece_minecraft_deepslate", "Deepslate Cubes", "Dense stone blocks with muted gems.", 210, "#6C757D", ["#2F3437", "#495057", "#2CCED2"]],
	["piece_minecraft_gold", "Gold Mine", "Chunky ore colors with warm edges.", 240, "#FFD166", ["#D4A017", "#B08968", "#6BBF45"]],
	["piece_minecraft_nether", "Nether Blocks", "Dark red mine blocks for intense runs.", 270, "#C1121F", ["#3A0B00", "#8B1E00", "#FF4D00"]],
	["piece_minecraft_prismarine", "Prismarine", "Aquatic cube colors with gem highlights.", 300, "#48CAE4", ["#006D77", "#48CAE4", "#90BE6D"]],
	["piece_crystal_aqua", "Aqua Crystal", "Clean blue crystal refraction.", 260, "#7DEBFF", ["#7DEBFF", "#A2D2FF", "#BDE0FE"]],
	["piece_crystal_amethyst", "Amethyst Crystal", "Purple gemstone blocks with soft glow.", 300, "#C77DFF", ["#5A189A", "#9D4EDD", "#E0AAFF"]],
	["piece_crystal_rose", "Rose Crystal", "Pink crystal set with bright highlights.", 320, "#FF7DDD", ["#FF7DDD", "#FFC8DD", "#FFFFFF"]],
	["piece_crystal_emerald", "Emerald Crystal", "Green gem blocks for clean clears.", 340, "#8DFFB2", ["#00FF9D", "#8DFFB2", "#D5FF3F"]],
	["piece_crystal_sun", "Sun Crystal", "Yellow-white crystals with high contrast.", 360, "#FFF599", ["#FFF599", "#FFD166", "#FFFFFF"]],
	["piece_lava_obsidian", "Obsidian Forge", "Black-hot lava blocks with glowing seams.", 300, "#FF4D00", ["#1A0500", "#8B1E00", "#FF4D00"]],
	["piece_lava_solar", "Solar Forge", "Bright sun-fired lava palette.", 330, "#FFB000", ["#FFB000", "#FF6B1A", "#FFD54A"]],
	["piece_lava_ember", "Ember Forge", "Small ember tones for darker boards.", 360, "#FF6B1A", ["#3A0B00", "#B8320C", "#FF6B1A"]],
	["piece_lava_basalt", "Basalt Forge", "Gray-black stone with molten cores.", 390, "#ADB5BD", ["#343A40", "#8B1E00", "#ADB5BD"]],
	["piece_lava_magma", "Magma Forge", "High heat orange blocks for big combos.", 420, "#FF9500", ["#FF9500", "#FF4D00", "#FFD54A"]],
	["piece_circuit_matrix", "Matrix Circuit", "Green terminal blocks with thin traces.", 320, "#00FF9D", ["#003B2F", "#00FF9D", "#D5FF3F"]],
	["piece_circuit_neon", "Neon Circuit", "Cyan and magenta tech blocks.", 350, "#00D4FF", ["#00D4FF", "#FF2BD6", "#4D5BFF"]],
	["piece_circuit_plasma", "Plasma Circuit", "Bright electric blocks for fast modes.", 380, "#4D5BFF", ["#4D5BFF", "#00D4FF", "#D5FF3F"]],
	["piece_circuit_terminal", "Terminal Circuit", "Low-glow hacker terminal colors.", 410, "#06D6A0", ["#081C15", "#06D6A0", "#00FF9D"]],
	["piece_circuit_candy", "Candy Circuit", "Playful pink-blue circuitry.", 440, "#FFC8DD", ["#FFC8DD", "#A2D2FF", "#FF2BD6"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "piece_skin" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

const EXTRA_BACKGROUNDS: ShopItem[] = [
	["background_aurora", "Aurora Vault", "Green-blue night sky without block clutter.", 180, "#6BFFB8", ["#020617", "#064E3B", "#38BDF8"], ["rgb(2, 6, 23)", "rgb(6, 78, 59)", "rgb(56, 189, 248)"], "ender"],
	["background_midnight", "Midnight Glass", "Clean blue-black depth for focused play.", 200, "#93C5FD", ["#020617", "#0F172A", "#1D4ED8"], ["rgb(2, 6, 23)", "rgb(15, 23, 42)", "rgb(29, 78, 216)"], "ice"],
	["background_volcano", "Volcano Core", "Dark heat with a restrained red pulse.", 220, "#F97316", ["#180403", "#7F1D1D", "#F97316"], ["rgb(24, 4, 3)", "rgb(127, 29, 29)", "rgb(249, 115, 22)"], "sunset"],
	["background_mint", "Mint Grid", "Soft mint shadows for calmer sessions.", 240, "#5EEAD4", ["#042F2E", "#0F766E", "#5EEAD4"], ["rgb(4, 47, 46)", "rgb(15, 118, 110)", "rgb(94, 234, 212)"], "ice"],
	["background_plum", "Plum Signal", "Purple signal bands with deep contrast.", 260, "#C084FC", ["#12051F", "#581C87", "#C084FC"], ["rgb(18, 5, 31)", "rgb(88, 28, 135)", "rgb(192, 132, 252)"], "ender"],
	["background_copper", "Copper Dusk", "Warm copper sunset with dark edges.", 280, "#FDBA74", ["#1C0A00", "#9A3412", "#FDBA74"], ["rgb(28, 10, 0)", "rgb(154, 52, 18)", "rgb(253, 186, 116)"], "sunset"],
	["background_lagoon", "Deep Lagoon", "Blue lagoon depth with readable boards.", 300, "#22D3EE", ["#02111B", "#164E63", "#22D3EE"], ["rgb(2, 17, 27)", "rgb(22, 78, 99)", "rgb(34, 211, 238)"], "ice"],
	["background_ruby", "Ruby Reactor", "Dark red reactor light without flying pieces.", 320, "#FB7185", ["#1F0508", "#9F1239", "#FB7185"], ["rgb(31, 5, 8)", "rgb(159, 18, 57)", "rgb(251, 113, 133)"], "cyber"],
	["background_terminal", "Terminal Green", "Quiet green console glow.", 340, "#4ADE80", ["#03130A", "#166534", "#4ADE80"], ["rgb(3, 19, 10)", "rgb(22, 101, 52)", "rgb(74, 222, 128)"], "cyber"],
	["background_starlit", "Starlit Blue", "Deep blue layers for night runs.", 360, "#60A5FA", ["#030712", "#1E3A8A", "#60A5FA"], ["rgb(3, 7, 18)", "rgb(30, 58, 138)", "rgb(96, 165, 250)"], "ender"],
	["background_candy", "Candy Pulse", "Pink-blue arcade glow, kept dark enough.", 380, "#F9A8D4", ["#1F1025", "#BE185D", "#67E8F9"], ["rgb(31, 16, 37)", "rgb(190, 24, 93)", "rgb(103, 232, 249)"], "cyber"],
	["background_gold", "Gold Signal", "Low golden signal on black.", 400, "#FACC15", ["#120D02", "#854D0E", "#FACC15"], ["rgb(18, 13, 2)", "rgb(133, 77, 14)", "rgb(250, 204, 21)"], "sunset"],
	["background_frost", "Frost Panel", "Crisp frosted blue panels.", 420, "#BAE6FD", ["#041322", "#0369A1", "#BAE6FD"], ["rgb(4, 19, 34)", "rgb(3, 105, 161)", "rgb(186, 230, 253)"], "ice"],
	["background_void", "Void Bloom", "Near-black purple with small bloom.", 440, "#A78BFA", ["#030014", "#312E81", "#A78BFA"], ["rgb(3, 0, 20)", "rgb(49, 46, 129)", "rgb(167, 139, 250)"], "ender"],
	["background_lime", "Lime Wire", "Sharp lime wireframe glow.", 460, "#A3E635", ["#071105", "#3F6212", "#A3E635"], ["rgb(7, 17, 5)", "rgb(63, 98, 18)", "rgb(163, 230, 53)"], "cyber"],
	["background_rose", "Rose Arcade", "Rose glow with cool shadows.", 480, "#FDA4AF", ["#1E0710", "#BE123C", "#FDA4AF"], ["rgb(30, 7, 16)", "rgb(190, 18, 60)", "rgb(253, 164, 175)"], "sunset"],
	["background_ocean", "Ocean Plate", "Deep ocean gradient with teal light.", 500, "#2DD4BF", ["#02131A", "#0F766E", "#2DD4BF"], ["rgb(2, 19, 26)", "rgb(15, 118, 110)", "rgb(45, 212, 191)"], "ice"],
	["background_ultraviolet", "Ultraviolet", "Dark ultraviolet neon backdrop.", 520, "#D946EF", ["#12051F", "#86198F", "#D946EF"], ["rgb(18, 5, 31)", "rgb(134, 25, 143)", "rgb(217, 70, 239)"], "cyber"],
	["background_solar", "Solar Rail", "Warm rail lights behind the board.", 540, "#FB923C", ["#140800", "#C2410C", "#FB923C"], ["rgb(20, 8, 0)", "rgb(194, 65, 12)", "rgb(251, 146, 60)"], "sunset"],
	["background_quartz", "Quartz Blue", "Pale quartz light on deep blue.", 560, "#C4B5FD", ["#06111F", "#4338CA", "#C4B5FD"], ["rgb(6, 17, 31)", "rgb(67, 56, 202)", "rgb(196, 181, 253)"], "ice"],
].map(([id, title, description, price, accent, previewColors, gradient, scene]) => ({
	id: id as string,
	category: "background" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
	gradient: gradient as [string, string, string],
	scene: scene as BackgroundScene,
}));

const EXTRA_MUSIC: ShopItem[] = [
	["music_lofi_rain", "Lo-fi Rain", "Lo-fi preset with softer rainy energy.", 180, "#BDE0FE", ["#BDE0FE", "#64748B", "#A2D2FF"]],
	["music_lofi_rooftop", "Lo-fi Rooftop", "Laid-back rooftop mix preset.", 200, "#93C5FD", ["#93C5FD", "#FFC8DD", "#475569"]],
	["music_lofi_midnight", "Lo-fi Midnight", "Quiet midnight lo-fi loop.", 220, "#A5B4FC", ["#312E81", "#A5B4FC", "#E0E7FF"]],
	["music_lofi_cafe", "Lo-fi Cafe", "Warm low-pressure cafe mix.", 240, "#FBCFE8", ["#FBCFE8", "#FDBA74", "#BDE0FE"]],
	["music_lofi_clouds", "Lo-fi Clouds", "Airy chilled building preset.", 260, "#BAE6FD", ["#BAE6FD", "#E0F2FE", "#A7F3D0"]],
	["music_arcade_turbo", "Arcade Turbo", "Fast arcade energy with bright highs.", 280, "#FF006E", ["#FF006E", "#FBFF12", "#3A86FF"]],
	["music_arcade_combo", "Arcade Combo", "Punchy loop for combo chasing.", 300, "#FB7185", ["#FB7185", "#FACC15", "#60A5FA"]],
	["music_arcade_pixel", "Pixel Sprint", "Sharper pixel-rush mix preset.", 320, "#F43F5E", ["#F43F5E", "#22D3EE", "#FDE047"]],
	["music_arcade_neon", "Neon Sprint", "Neon arcade preset with extra lift.", 340, "#D946EF", ["#D946EF", "#22D3EE", "#A3E635"]],
	["music_arcade_boss", "Boss Rush", "Heavier arcade pressure loop.", 360, "#EF4444", ["#EF4444", "#F97316", "#111827"]],
	["music_cave_drip", "Cave Drip", "Darker cave echo with lower volume.", 300, "#8D99AE", ["#2B2D42", "#8D99AE", "#EDF2F4"]],
	["music_cave_depth", "Deep Cave", "Low cave ambience for mining skins.", 320, "#94A3B8", ["#0F172A", "#475569", "#94A3B8"]],
	["music_cave_crystal", "Crystal Cave", "Cave mix with brighter crystal edge.", 340, "#A78BFA", ["#1E1B4B", "#A78BFA", "#BAE6FD"]],
	["music_cave_ember", "Ember Cave", "Dark cave warmth with ember pulse.", 360, "#FB923C", ["#1C0A00", "#FB923C", "#64748B"]],
	["music_cave_echo", "Long Echoes", "Slow echo preset for longer rounds.", 380, "#CBD5E1", ["#111827", "#64748B", "#CBD5E1"]],
	["music_space_orbit", "Orbit Drift", "Floating orbit preset.", 340, "#9D4EDD", ["#10002B", "#5A189A", "#E0AAFF"]],
	["music_space_comet", "Comet Trail", "Space mix with light forward motion.", 360, "#C084FC", ["#312E81", "#C084FC", "#67E8F9"]],
	["music_space_nebula", "Nebula Drift", "Wide purple-blue space loop.", 380, "#A78BFA", ["#1E1B4B", "#A78BFA", "#60A5FA"]],
	["music_space_satellite", "Satellite", "Small satellite pulse preset.", 400, "#818CF8", ["#111827", "#818CF8", "#E0E7FF"]],
	["music_space_void", "Void Signal", "Sparse deep-space mix preset.", 420, "#6D28D9", ["#030014", "#6D28D9", "#C4B5FD"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "music" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

const EXTRA_SFX: ShopItem[] = [
	["sfx_wood_oak", "Oak Blocks", "Wood pack with a lighter tap.", 180, "#B08968", ["#7F5539", "#B08968", "#E6CCB2"]],
	["sfx_wood_bamboo", "Bamboo Pops", "Sharper wooden feedback.", 200, "#A3B18A", ["#588157", "#A3B18A", "#DAD7CD"]],
	["sfx_wood_chest", "Chest Clicks", "Chunky boxy wood clicks.", 220, "#C08457", ["#7F5539", "#C08457", "#FFD6A5"]],
	["sfx_wood_plank", "Plank Taps", "Flat plank placement sounds.", 240, "#BC8A5F", ["#6F4E37", "#BC8A5F", "#F2D2A9"]],
	["sfx_wood_forest", "Forest Knock", "Soft forest knock feedback.", 260, "#90A955", ["#31572C", "#90A955", "#ECF39E"]],
	["sfx_glass_frost", "Frost Glass", "Cooler glass feedback.", 240, "#A9DEF9", ["#A9DEF9", "#E4C1F9", "#FCF6BD"]],
	["sfx_glass_prism", "Prism Pops", "Bright prism clear sounds.", 260, "#B8F2E6", ["#B8F2E6", "#AED9E0", "#FAF3DD"]],
	["sfx_glass_ice", "Ice Tinks", "Crisp ice-style glass hits.", 280, "#BAE6FD", ["#BAE6FD", "#E0F2FE", "#FFFFFF"]],
	["sfx_glass_neon", "Neon Glass", "Glass pack with neon click emphasis.", 300, "#67E8F9", ["#67E8F9", "#F0ABFC", "#FDE047"]],
	["sfx_glass_chime", "Chime Glass", "Small chime-like glass clear preset.", 320, "#C4B5FD", ["#C4B5FD", "#A7F3D0", "#FBCFE8"]],
	["sfx_retro_chip", "Chip Beeps", "Small chip-style retro pack.", 280, "#06D6A0", ["#06D6A0", "#FFD166", "#EF476F"]],
	["sfx_retro_terminal", "Terminal Beeps", "Drier terminal event sounds.", 300, "#4ADE80", ["#052E16", "#4ADE80", "#BBF7D0"]],
	["sfx_retro_laser", "Laser Beeps", "Sharper laser arcade feedback.", 320, "#22D3EE", ["#22D3EE", "#A3E635", "#F43F5E"]],
	["sfx_retro_coin", "Coin Beeps", "Coin-op style menu and clear sounds.", 340, "#FACC15", ["#FACC15", "#FB7185", "#60A5FA"]],
	["sfx_retro_console", "Console Beeps", "Old console feedback mapping.", 360, "#A78BFA", ["#A78BFA", "#34D399", "#FDE047"]],
	["sfx_metal_steel", "Steel Clanks", "Heavy steel impact feedback.", 320, "#ADB5BD", ["#343A40", "#ADB5BD", "#F8F9FA"]],
	["sfx_metal_anvil", "Anvil Hits", "Thicker metal placement hits.", 340, "#94A3B8", ["#1F2937", "#94A3B8", "#E5E7EB"]],
	["sfx_metal_robot", "Robot Clinks", "Short robotic metal clicks.", 360, "#CBD5E1", ["#111827", "#64748B", "#CBD5E1"]],
	["sfx_metal_cyber", "Cyber Clanks", "Metal pack with cyber bite.", 380, "#38BDF8", ["#0F172A", "#38BDF8", "#F0ABFC"]],
	["sfx_metal_titan", "Titan Clanks", "Largest metal-feedback preset.", 400, "#F8FAFC", ["#020617", "#94A3B8", "#F8FAFC"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "sfx" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

function dedupeShopItems(items: ShopItem[]): ShopItem[] {
	const itemMap = new Map<string, ShopItem>();
	for (const item of items) {
		if (!itemMap.has(item.id)) {
			itemMap.set(item.id, item);
		}
	}
	return [...itemMap.values()];
}

export const SHOP_ITEMS: ShopItem[] = dedupeShopItems([
	...BASE_SHOP_ITEMS,
	...EXTRA_PIECE_SKINS,
	...EXTRA_BACKGROUNDS,
	...EXTRA_MUSIC,
	...EXTRA_SFX,
]);

const SHOP_ITEM_MAP = new Map(SHOP_ITEMS.map((item) => [item.id, item]));


export const shopStateAtom = atom<ShopState>(createDefaultShopState());

export function createDefaultShopState(): ShopState {
	return {
		balance: STARTER_SHOP_COINS,
		ownedItemIds: [...FREE_SHOP_ITEM_IDS],
		equipped: { ...DEFAULT_EQUIPPED_COSMETICS },
		starterGrantClaimed: true,
		updatedAt: 0,
	};
}

export function getShopItem(itemId: string): ShopItem | undefined {
	return SHOP_ITEM_MAP.get(itemId);
}

export function getShopItemsByCategory(category: ShopCategory): ShopItem[] {
	return SHOP_ITEMS.filter((item) => item.category === category);
}

export function getVisibleShopItemsByCategory(category: ShopCategory, ownedItemIds: string[] = []): ShopItem[] {
	const ownedSet = new Set(ownedItemIds);
	return getShopItemsByCategory(category).filter((item) => !item.secret || ownedSet.has(item.id));
}

export function isSecretShopItem(itemId: string): boolean {
	return SHOP_ITEM_MAP.get(itemId)?.secret === true;
}

export function calculateCoinsForScore(score: number): number {
	return Math.max(0, Math.floor(score / 25));
}

export function normalizeShopState(value: Partial<ShopState> | null | undefined): ShopState {
	const fallback = createDefaultShopState();
	if (!value) return fallback;

	const ownedSet = new Set([
		...FREE_SHOP_ITEM_IDS,
		...(Array.isArray(value.ownedItemIds) ? value.ownedItemIds.filter((id) => SHOP_ITEM_MAP.has(id)) : []),
	]);

	const equipped = { ...fallback.equipped };
	if (value.equipped) {
		for (const category of Object.keys(equipped) as ShopCategory[]) {
			const itemId = value.equipped[category];
			const item = itemId ? SHOP_ITEM_MAP.get(itemId) : undefined;
			if (item && item.category === category && ownedSet.has(itemId)) {
				equipped[category] = itemId;
			}
		}
	}

	const savedBalance = Math.max(0, Math.floor(Number(value.balance) || 0));
	const starterGrantClaimed = value.starterGrantClaimed === true;
	const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Math.max(0, Number(value.updatedAt)) : 0;

	return {
		balance: starterGrantClaimed ? savedBalance : Math.max(savedBalance, STARTER_SHOP_COINS),
		ownedItemIds: [...ownedSet],
		equipped,
		starterGrantClaimed: true,
		updatedAt,
	};
}

export async function loadShopState(): Promise<ShopState> {
	try {
		const raw = await AsyncStorage.getItem(SHOP_STATE_KEY);
		return normalizeShopState(raw ? JSON.parse(raw) : null);
	} catch (error) {
		console.error("Error loading shop state:", error);
		return createDefaultShopState();
	}
}

export async function saveShopState(state: ShopState): Promise<void> {
	try {
		await AsyncStorage.setItem(SHOP_STATE_KEY, JSON.stringify(normalizeShopState(state)));
	} catch (error) {
		console.error("Error saving shop state:", error);
	}
}

export function purchaseShopItem(state: ShopState, itemId: string): { ok: boolean; state: ShopState; error?: string } {
	const item = getShopItem(itemId);
	const current = normalizeShopState(state);
	if (!item) {
		return { ok: false, state: current, error: "Unknown item." };
	}

	if (current.ownedItemIds.includes(item.id)) {
		return { ok: true, state: current };
	}

	if (item.secret) {
		return { ok: false, state: current, error: "Find this secret first." };
	}

	if (current.balance < item.price) {
		return { ok: false, state: current, error: "Not enough coins." };
	}

	return {
		ok: true,
		state: {
			...current,
			balance: current.balance - item.price,
			ownedItemIds: [...current.ownedItemIds, item.id],
		},
	};
}

export function equipShopItem(state: ShopState, itemId: string): { ok: boolean; state: ShopState; error?: string } {
	const item = getShopItem(itemId);
	const current = normalizeShopState(state);
	if (!item) {
		return { ok: false, state: current, error: "Unknown item." };
	}

	if (!current.ownedItemIds.includes(item.id)) {
		return { ok: false, state: current, error: "Buy this item first." };
	}

	return {
		ok: true,
		state: {
			...current,
			equipped: {
				...current.equipped,
				[item.category]: item.id,
			},
		},
	};
}

export function addCoinsToShopState(state: ShopState, coins: number): ShopState {
	const current = normalizeShopState(state);
	return {
		...current,
		balance: current.balance + Math.max(0, Math.floor(coins)),
	};
}

export function getEquippedShopItem(state: ShopState, category: ShopCategory): ShopItem {
	const current = normalizeShopState(state);
	return getShopItem(current.equipped[category]) ?? getShopItem(DEFAULT_EQUIPPED_COSMETICS[category])!;
}

export function getBackgroundGradient(itemId: string): [string, string, string] | undefined {
	return getShopItem(itemId)?.gradient;
}

export function getBackgroundScene(itemId: string): BackgroundScene {
	return getShopItem(itemId)?.scene ?? "classic";
}

export function getBackgroundParticleConfig(itemId: string, isGameplayActive: boolean) {
	const scene = getBackgroundScene(itemId);
	if (scene === "classic") {
		return {
			count: isGameplayActive ? 14 : 25,
			blockSize: isGameplayActive ? 22 : 28,
			maxOpacity: isGameplayActive ? 0.55 : 1,
		};
	}

	return {
		count: 0,
		blockSize: isGameplayActive ? 18 : 22,
		maxOpacity: 0,
	};
}

export function mergeShopStates(localState: ShopState, remoteState: Partial<ShopState> | null | undefined): ShopState {
	const local = normalizeShopState(localState);
	const remote = normalizeShopState(remoteState);
	const ownedSet = new Set([...local.ownedItemIds, ...remote.ownedItemIds]);
	
	const localNewer = local.updatedAt >= remote.updatedAt;

	return normalizeShopState({
		balance: localNewer ? local.balance : remote.balance,
		ownedItemIds: [...ownedSet],
		equipped: local.equipped, // Always prefer local equipped items to avoid annoying reverts
		starterGrantClaimed: true,
		updatedAt: Math.max(local.updatedAt, remote.updatedAt),
	});
}

interface ShopSyncIdentity {
	playerName: string;
	playerId: string | null;
}

interface RemoteShopProfile {
	id?: string;
	player_name?: string;
	player_id?: string | null;
	coins?: number | null;
	owned_item_ids?: string[] | null;
	equipped?: Partial<EquippedCosmetics> | null;
	updated_at?: string | null;
}

async function getShopSyncIdentity(): Promise<ShopSyncIdentity | null> {
	const [rawName, playerId] = await Promise.all([
		AsyncStorage.getItem(PLAYER_NAME_KEY),
		AsyncStorage.getItem(PLAYER_ID_KEY),
	]);
	const playerName = (rawName || "").trim();
	if (!playerName) return null;

	return {
		playerName,
		playerId: playerId || null,
	};
}

function profileToShopState(profile: RemoteShopProfile | null | undefined): Partial<ShopState> | null {
	if (!profile) return null;

	return {
		balance: Math.max(0, Math.floor(Number(profile.coins) || 0)),
		ownedItemIds: Array.isArray(profile.owned_item_ids) ? profile.owned_item_ids : [],
		equipped: profile.equipped as EquippedCosmetics | undefined,
		starterGrantClaimed: true,
		updatedAt: profile.updated_at ? new Date(profile.updated_at).getTime() : 0,
	};
}

function escapeIlike(value: string): string {
	return value.replace(/[%_]/g, "\\$&");
}

export async function syncShopStateWithProfile(localState: ShopState): Promise<{ status: "synced" | "skipped" | "failed"; state: ShopState }> {
	const local = normalizeShopState(localState);

	try {
		const identity = await getShopSyncIdentity();
		if (!identity) {
			return { status: "skipped", state: local };
		}

		const { data: profiles, error: fetchError } = await supabase
			.from("profiles")
			.select("id, player_name, player_id, coins, owned_item_ids, equipped, updated_at")
			.ilike("player_name", escapeIlike(identity.playerName))
			.limit(1);

		if (fetchError) {
			console.error("Error fetching shop profile:", fetchError);
			return { status: "failed", state: local };
		}

		const profile = profiles?.[0] as RemoteShopProfile | undefined;
		const merged = {
			...mergeShopStates(local, profileToShopState(profile)),
			updatedAt: Date.now(),
		};

		const payload = {
			coins: merged.balance,
			owned_item_ids: merged.ownedItemIds,
			equipped: merged.equipped,
			updated_at: new Date(merged.updatedAt).toISOString(),
		};

		const writeResult = profile?.id
			? await supabase.from("profiles").update(payload).eq("id", profile.id)
			: await supabase.from("profiles").insert({ ...payload, player_name: identity.playerName, player_id: identity.playerId });

		if (writeResult.error) {
			console.error("Error saving shop profile:", writeResult.error);
			return { status: "failed", state: local };
		}

		await saveShopState(merged);
		return { status: "synced", state: normalizeShopState(merged) };
	} catch (error) {
		console.error("Error syncing shop profile:", error);
		return { status: "failed", state: local };
	}
}

export function useShopState() {
	const [state, setState] = useAtom(shopStateAtom);

	const commit = useCallback(async (next: ShopState) => {
		const normalized = normalizeShopState({ ...next, updatedAt: Date.now() });
		setState(normalized);
		await saveShopState(normalized);
		const syncResult = await syncShopStateWithProfile(normalized);
		if (syncResult.status === "synced") {
			setState(syncResult.state);
			return syncResult.state;
		}
		return normalized;
	}, [setState]);

	const reload = useCallback(async () => {
		const next = await loadShopState();
		setState(next);
		return next;
	}, [setState]);

	const purchase = useCallback(async (itemId: string) => {
		const result = purchaseShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state);
		}
		return result;
	}, [commit, state]);

	const equip = useCallback(async (itemId: string) => {
		const result = equipShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state);
		}
		return result;
	}, [commit, state]);

	const purchaseAndEquip = useCallback(async (itemId: string) => {
		const purchaseResult = purchaseShopItem(state, itemId);
		if (!purchaseResult.ok) {
			return purchaseResult;
		}
		const equipResult = equipShopItem(purchaseResult.state, itemId);
		if (!equipResult.ok) {
			return equipResult;
		}
		await commit(equipResult.state);
		return equipResult;
	}, [commit, state]);

	const awardCoins = useCallback(async (score: number) => {
		const coins = calculateCoinsForScore(score);
		if (coins <= 0) return 0;

		const latest = await loadShopState();
		await commit(addCoinsToShopState(latest, coins));
		return coins;
	}, [commit]);

	return {
		state,
		reload,
		purchase,
		equip,
		purchaseAndEquip,
		awardCoins,
		commit,
	};
}

export function useShopBootstrap() {
	const [, setState] = useAtom(shopStateAtom);

	useEffect(() => {
		loadShopState().then(async (local) => {
			setState(local);
			const syncResult = await syncShopStateWithProfile(local);
			if (syncResult.status === "synced") {
				setState(syncResult.state);
			}
		});
	}, [setState]);
}
