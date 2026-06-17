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

export type ShopProfileField = "coins" | "owned_item_ids" | "equipped";

export interface ShopState {
	balance: number;
	ownedItemIds: string[];
	equipped: EquippedCosmetics;
	starterGrantClaimed: boolean;
	pendingProfileSync: boolean;
	dirtyProfileFields: ShopProfileField[];
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
		title: "Custom Music Link",
		description: "YouTube, Spotify, Yandex, or direct audio. Configure in Options.",
		price: 0,
		accent: "#FFFFFF",
		previewColors: ["#FF0000", "#00FF00", "#0000FF"],
		secret: true,
	},
	{
		id: "sfx_custom",
		category: "sfx",
		title: "Custom SFX Link",
		description: "External link or direct SFX audio. Configure in Options.",
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
	["piece_paper_cut", "Paper Cuts", "Flat paper pieces with inked edges.", 460, "#FDE68A", ["#FDE68A", "#FFFFFF", "#111827"]],
	["piece_ocean_shell", "Ocean Shells", "Teal and coral shell-inspired pieces.", 480, "#2DD4BF", ["#0F766E", "#2DD4BF", "#FB7185"]],
	["piece_monochrome", "Monochrome", "High contrast black, white and gray blocks.", 500, "#E5E7EB", ["#111827", "#6B7280", "#F8FAFC"]],
	["piece_candy_pop", "Candy Pop", "Bright candy blocks with playful contrast.", 520, "#F9A8D4", ["#F9A8D4", "#FDE047", "#38BDF8"]],
	["piece_shadow_gold", "Shadow Gold", "Dark pieces with restrained gold highlights.", 540, "#FACC15", ["#020617", "#854D0E", "#FACC15"]],
	["piece_forest_mushroom", "Forest Caps", "Earthy green and red forest pieces.", 560, "#A3E635", ["#365314", "#A3E635", "#DC2626"]],
	["piece_aurora_glass", "Aurora Glass", "Translucent aurora-like color chips.", 580, "#A78BFA", ["#22D3EE", "#A78BFA", "#4ADE80"]],
	["piece_neon_fruit", "Neon Fruit", "Fruit-bright pieces with saturated edges.", 600, "#FB7185", ["#FB7185", "#FACC15", "#4ADE80"]],
	["piece_ink_stamp", "Ink Stamps", "Stamped ink colors with off-white blocks.", 620, "#111827", ["#111827", "#E5E7EB", "#EF4444"]],
	["piece_cosmic_ore", "Cosmic Ore", "Meteor-like pieces with cold metal shine.", 640, "#93C5FD", ["#0F172A", "#93C5FD", "#C4B5FD"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "piece_skin" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

const EXTRA_PIECE_SKINS_WAVE_2: ShopItem[] = [
	["piece_moonstone", "Moonstone", "Pale moonlit blocks with cool stone edges.", 660, "#C4B5FD", ["#111827", "#C4B5FD", "#E0F2FE"]],
	["piece_jade_tile", "Jade Tiles", "Green jade blocks with darker carved sides.", 680, "#34D399", ["#064E3B", "#34D399", "#A7F3D0"]],
	["piece_ruby_cut", "Ruby Cut", "Deep red gemstone pieces with bright facets.", 700, "#FB7185", ["#450A0A", "#DC2626", "#FB7185"]],
	["piece_sapphire_cut", "Sapphire Cut", "Blue gemstone pieces with icy highlights.", 720, "#60A5FA", ["#0F172A", "#2563EB", "#93C5FD"]],
	["piece_topaz_tile", "Topaz Tiles", "Golden-orange pieces with polished edges.", 740, "#FBBF24", ["#451A03", "#D97706", "#FBBF24"]],
	["piece_ghost_ink", "Ghost Ink", "Washed ink blocks with pale spectral tones.", 760, "#E5E7EB", ["#111827", "#64748B", "#E5E7EB"]],
	["piece_radioactive", "Radioactive", "Toxic green pieces with dark warning contrast.", 780, "#A3E635", ["#1A2E05", "#65A30D", "#D9F99D"]],
	["piece_storm_cloud", "Storm Cloud", "Gray-blue blocks with lightning-like accents.", 800, "#BAE6FD", ["#0F172A", "#475569", "#BAE6FD"]],
	["piece_pearl_shell", "Pearl Shell", "Pearl and shell tones for soft boards.", 820, "#FBCFE8", ["#831843", "#FBCFE8", "#E0F2FE"]],
	["piece_arcade_gum", "Arcade Gum", "Bubblegum arcade colors with high contrast.", 840, "#F472B6", ["#831843", "#F472B6", "#22D3EE"]],
	["piece_desert_clay", "Desert Clay", "Clay and sand blocks with sunset warmth.", 860, "#FDBA74", ["#431407", "#B45309", "#FDBA74"]],
	["piece_night_market", "Night Market", "Lantern colors over dark market shadows.", 880, "#FACC15", ["#111827", "#BE123C", "#FACC15"]],
	["piece_laser_grid", "Laser Grid", "Hard neon blocks with laser-line colors.", 900, "#22D3EE", ["#020617", "#22D3EE", "#EF4444"]],
	["piece_snow_mint", "Snow Mint", "Fresh mint and snow blocks for calmer play.", 920, "#A7F3D0", ["#064E3B", "#A7F3D0", "#FFFFFF"]],
	["piece_copper_wire", "Copper Wire", "Copper and teal pieces with techy contrast.", 940, "#F97316", ["#1C0A00", "#F97316", "#14B8A6"]],
	["piece_royal_velvet", "Royal Velvet", "Rich purple velvet with gold highlights.", 960, "#C084FC", ["#2E1065", "#7E22CE", "#FDE047"]],
	["piece_magma_ice", "Magma Ice", "Hot-cold contrast for dramatic combos.", 980, "#38BDF8", ["#7F1D1D", "#F97316", "#38BDF8"]],
	["piece_lime_shadow", "Lime Shadow", "Lime blocks over a near-black base.", 1000, "#BEF264", ["#020617", "#3F6212", "#BEF264"]],
	["piece_peach_soda", "Peach Soda", "Peach and fizz tones with candy highlights.", 1020, "#FDBA74", ["#7C2D12", "#FDBA74", "#F9A8D4"]],
	["piece_void_pearl", "Void Pearl", "Pearl shine floating over void-dark blocks.", 1040, "#DDD6FE", ["#030014", "#6D28D9", "#DDD6FE"]],
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
	["background_paper_dawn", "Paper Dawn", "Soft dawn tones with a clean paper feel.", 580, "#FDE68A", ["#1C1917", "#FDBA74", "#FDE68A"], ["rgb(28, 25, 23)", "rgb(253, 186, 116)", "rgb(253, 230, 138)"], "sunset"],
	["background_deep_forest", "Deep Forest", "Green forest shadow with a quiet glow.", 600, "#86EFAC", ["#03130A", "#166534", "#86EFAC"], ["rgb(3, 19, 10)", "rgb(22, 101, 52)", "rgb(134, 239, 172)"], "ender"],
	["background_coral_sea", "Coral Sea", "Teal water with coral edge lighting.", 620, "#FB7185", ["#042F2E", "#0F766E", "#FB7185"], ["rgb(4, 47, 46)", "rgb(15, 118, 110)", "rgb(251, 113, 133)"], "ice"],
	["background_mono_lab", "Mono Lab", "Black and silver lab lighting.", 640, "#E5E7EB", ["#020617", "#334155", "#E5E7EB"], ["rgb(2, 6, 23)", "rgb(51, 65, 85)", "rgb(229, 231, 235)"], "cyber"],
	["background_lilac_mist", "Lilac Mist", "Pale lilac haze over deep blue.", 660, "#DDD6FE", ["#111827", "#6366F1", "#DDD6FE"], ["rgb(17, 24, 39)", "rgb(99, 102, 241)", "rgb(221, 214, 254)"], "ender"],
	["background_amber_room", "Amber Room", "Dim amber panels with black corners.", 680, "#F59E0B", ["#120A02", "#92400E", "#F59E0B"], ["rgb(18, 10, 2)", "rgb(146, 64, 14)", "rgb(245, 158, 11)"], "sunset"],
	["background_steel_rain", "Steel Rain", "Cool steel rain with pale highlights.", 700, "#CBD5E1", ["#020617", "#475569", "#CBD5E1"], ["rgb(2, 6, 23)", "rgb(71, 85, 105)", "rgb(203, 213, 225)"], "ice"],
	["background_melon_arcade", "Melon Arcade", "Green and pink arcade colors kept dark.", 720, "#F9A8D4", ["#052E16", "#16A34A", "#F9A8D4"], ["rgb(5, 46, 22)", "rgb(22, 163, 74)", "rgb(249, 168, 212)"], "cyber"],
	["background_blueprint", "Blueprint", "Blueprint blue with thin electric depth.", 740, "#93C5FD", ["#07142A", "#1D4ED8", "#93C5FD"], ["rgb(7, 20, 42)", "rgb(29, 78, 216)", "rgb(147, 197, 253)"], "cyber"],
	["background_crimson_fog", "Crimson Fog", "Dark crimson fog for dramatic runs.", 760, "#FCA5A5", ["#1F0508", "#7F1D1D", "#FCA5A5"], ["rgb(31, 5, 8)", "rgb(127, 29, 29)", "rgb(252, 165, 165)"], "ender"],
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

const EXTRA_BACKGROUNDS_WAVE_2: ShopItem[] = [
	["background_moonbase", "Moonbase", "Cold moonbase panels behind the board.", 780, "#C4B5FD", ["#020617", "#312E81", "#C4B5FD"], ["rgb(2, 6, 23)", "rgb(49, 46, 129)", "rgb(196, 181, 253)"], "ice"],
	["background_emerald_rain", "Emerald Rain", "Green rainy glow with low visual noise.", 800, "#34D399", ["#03130A", "#065F46", "#34D399"], ["rgb(3, 19, 10)", "rgb(6, 95, 70)", "rgb(52, 211, 153)"], "ender"],
	["background_desert_stars", "Desert Stars", "Warm desert night with distant light.", 820, "#FDBA74", ["#140800", "#7C2D12", "#FDBA74"], ["rgb(20, 8, 0)", "rgb(124, 45, 18)", "rgb(253, 186, 116)"], "sunset"],
	["background_neon_market", "Neon Market", "Busy neon colors kept behind a dark veil.", 840, "#F472B6", ["#111827", "#BE185D", "#22D3EE"], ["rgb(17, 24, 39)", "rgb(190, 24, 93)", "rgb(34, 211, 238)"], "cyber"],
	["background_glacier_depth", "Glacier Depth", "Deep glacier blues with pale edges.", 860, "#BAE6FD", ["#041322", "#0E7490", "#BAE6FD"], ["rgb(4, 19, 34)", "rgb(14, 116, 144)", "rgb(186, 230, 253)"], "ice"],
	["background_cherry_night", "Cherry Night", "Dark cherry light for late sessions.", 880, "#FDA4AF", ["#1E0710", "#9F1239", "#FDA4AF"], ["rgb(30, 7, 16)", "rgb(159, 18, 57)", "rgb(253, 164, 175)"], "sunset"],
	["background_storm_cell", "Storm Cell", "Storm clouds with cold electric highlights.", 900, "#93C5FD", ["#020617", "#334155", "#93C5FD"], ["rgb(2, 6, 23)", "rgb(51, 65, 85)", "rgb(147, 197, 253)"], "cyber"],
	["background_jade_temple", "Jade Temple", "Jade shadows with a calm green center.", 920, "#86EFAC", ["#052E16", "#15803D", "#86EFAC"], ["rgb(5, 46, 22)", "rgb(21, 128, 61)", "rgb(134, 239, 172)"], "ender"],
	["background_peach_dusk", "Peach Dusk", "Soft peach dusk with dark readability.", 940, "#FDBA74", ["#1C0A00", "#C2410C", "#FBCFE8"], ["rgb(28, 10, 0)", "rgb(194, 65, 12)", "rgb(251, 207, 232)"], "sunset"],
	["background_violet_lab", "Violet Lab", "Violet laboratory glow with clean contrast.", 960, "#C084FC", ["#11051F", "#6B21A8", "#C084FC"], ["rgb(17, 5, 31)", "rgb(107, 33, 168)", "rgb(192, 132, 252)"], "cyber"],
	["background_magma_sea", "Magma Sea", "Dark magma light under a black horizon.", 980, "#FB923C", ["#120A02", "#7F1D1D", "#FB923C"], ["rgb(18, 10, 2)", "rgb(127, 29, 29)", "rgb(251, 146, 60)"], "sunset"],
	["background_arctic_wire", "Arctic Wire", "Frozen wireframe blues for focused play.", 1000, "#67E8F9", ["#02111B", "#155E75", "#67E8F9"], ["rgb(2, 17, 27)", "rgb(21, 94, 117)", "rgb(103, 232, 249)"], "ice"],
	["background_mint_noir", "Mint Noir", "Black noir panels with a mint signal.", 1020, "#A7F3D0", ["#020617", "#064E3B", "#A7F3D0"], ["rgb(2, 6, 23)", "rgb(6, 78, 59)", "rgb(167, 243, 208)"], "cyber"],
	["background_ruby_night", "Ruby Night", "Ruby light on a deep night gradient.", 1040, "#FB7185", ["#030014", "#881337", "#FB7185"], ["rgb(3, 0, 20)", "rgb(136, 19, 55)", "rgb(251, 113, 133)"], "ender"],
	["background_circuit_bloom", "Circuit Bloom", "Circuit-green glow with pink bloom.", 1060, "#22C55E", ["#03130A", "#22C55E", "#F472B6"], ["rgb(3, 19, 10)", "rgb(34, 197, 94)", "rgb(244, 114, 182)"], "cyber"],
	["background_pearl_void", "Pearl Void", "Pearl shimmer on a void-dark field.", 1080, "#DDD6FE", ["#030014", "#4C1D95", "#DDD6FE"], ["rgb(3, 0, 20)", "rgb(76, 29, 149)", "rgb(221, 214, 254)"], "ender"],
	["background_bronze_city", "Bronze City", "Bronze city lights with restrained warmth.", 1100, "#D97706", ["#120A02", "#92400E", "#FCD34D"], ["rgb(18, 10, 2)", "rgb(146, 64, 14)", "rgb(252, 211, 77)"], "sunset"],
	["background_rain_window", "Rain Window", "Blue rainy window light for long sessions.", 1120, "#7DD3FC", ["#020617", "#0369A1", "#7DD3FC"], ["rgb(2, 6, 23)", "rgb(3, 105, 161)", "rgb(125, 211, 252)"], "ice"],
	["background_pixel_meadow", "Pixel Meadow", "Dark meadow green with small bright hints.", 1140, "#A3E635", ["#052E16", "#4D7C0F", "#A3E635"], ["rgb(5, 46, 22)", "rgb(77, 124, 15)", "rgb(163, 230, 53)"], "ender"],
	["background_eclipse_gold", "Eclipse Gold", "Eclipse-black field with gold edge light.", 1160, "#FACC15", ["#020617", "#713F12", "#FACC15"], ["rgb(2, 6, 23)", "rgb(113, 63, 18)", "rgb(250, 204, 21)"], "sunset"],
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
	["music_lofi_rain", "Rain Piano", "Sparse piano pulses with soft rainy clicks.", 180, "#BDE0FE", ["#BDE0FE", "#64748B", "#E0F2FE"]],
	["music_lofi_rooftop", "Jazz Steps", "Swinging chords and brushed rhythm accents.", 200, "#FDE68A", ["#1F2937", "#FDE68A", "#F97316"]],
	["music_lofi_midnight", "Synth Drive", "Retro synth bass with a wide night pulse.", 220, "#22D3EE", ["#0F172A", "#22D3EE", "#F0ABFC"]],
	["music_lofi_cafe", "Blue Smoke", "Slow blues lead over a warmer low-end loop.", 240, "#60A5FA", ["#111827", "#60A5FA", "#FBBF24"]],
	["music_lofi_clouds", "Dream Pop", "Airy bright chords with a floating melody.", 260, "#F9A8D4", ["#F9A8D4", "#A7F3D0", "#BAE6FD"]],
	["music_arcade_turbo", "Drum Grid", "Fast breakbeat rhythm for tense late boards.", 280, "#FB7185", ["#FB7185", "#FDE047", "#111827"]],
	["music_arcade_combo", "Chip Hero", "Square-wave melody with classic handheld bite.", 300, "#A3E635", ["#052E16", "#A3E635", "#22D3EE"]],
	["music_arcade_pixel", "Techno Rail", "Steady four-on-floor pulse with sharp synths.", 320, "#38BDF8", ["#020617", "#38BDF8", "#818CF8"]],
	["music_arcade_neon", "Trap Steps", "Half-time bass hits with clipped high ticks.", 340, "#D946EF", ["#111827", "#D946EF", "#F97316"]],
	["music_arcade_boss", "String Siege", "Small orchestral loop for boss-like pressure.", 360, "#F87171", ["#450A0A", "#F87171", "#E5E7EB"]],
	["music_cave_drip", "Factory Pulse", "Industrial clanks under a low mechanical groove.", 300, "#94A3B8", ["#111827", "#94A3B8", "#F97316"]],
	["music_cave_depth", "Deep Ambient", "Slow pad tones with extra empty space.", 320, "#67E8F9", ["#082F49", "#67E8F9", "#C4B5FD"]],
	["music_cave_crystal", "Choir Glow", "Soft vocal-like harmonics for calmer runs.", 340, "#C4B5FD", ["#1E1B4B", "#C4B5FD", "#FBCFE8"]],
	["music_cave_ember", "Percussion Run", "Hand-drum style rhythm with a dry lead.", 360, "#FB923C", ["#1C0A00", "#FB923C", "#FDE68A"]],
	["music_cave_echo", "Noir Alley", "Minor-key late-night pulse with smoky bends.", 380, "#CBD5E1", ["#111827", "#475569", "#CBD5E1"]],
	["music_space_orbit", "Dub Orbit", "Off-beat chords and deep echo bass.", 340, "#34D399", ["#052E16", "#34D399", "#FDE68A"]],
	["music_space_comet", "Tropical Keys", "Bright mallet notes over a quick sunny pattern.", 360, "#2DD4BF", ["#064E3B", "#2DD4BF", "#FACC15"]],
	["music_space_nebula", "Funk City", "Bouncy bass line with clipped rhythm stabs.", 380, "#F97316", ["#1C0A00", "#F97316", "#22D3EE"]],
	["music_space_satellite", "Glitch Signal", "Broken digital ticks and unstable melody jumps.", 400, "#A78BFA", ["#111827", "#A78BFA", "#4ADE80"]],
	["music_space_void", "Toy March", "Playful march rhythm with bright triangle tones.", 420, "#FDE047", ["#1F2937", "#FDE047", "#38BDF8"]],
	["music_salsa", "Clave Sparks", "Fast clave-style accents with warm keys.", 440, "#FB923C", ["#7C2D12", "#FB923C", "#FDE68A"]],
	["music_hardstyle", "Hard Kick", "Heavy compressed kick pattern for intense sessions.", 460, "#EF4444", ["#111827", "#EF4444", "#FACC15"]],
	["music_music_box", "Music Box", "Tiny bell melody for a lighter, delicate mood.", 480, "#BAE6FD", ["#1E3A8A", "#BAE6FD", "#FFFFFF"]],
	["music_harp", "Harp Lines", "Plucked arpeggios with a calm open feel.", 500, "#C4B5FD", ["#312E81", "#C4B5FD", "#E0F2FE"]],
	["music_breakbeat", "Breakbeat Blocks", "Syncopated drums and a restless bass pulse.", 520, "#F43F5E", ["#111827", "#F43F5E", "#22D3EE"]],
	["music_dub", "Dub Corner", "Slow echo hits with a round bass floor.", 540, "#4ADE80", ["#052E16", "#4ADE80", "#FDE68A"]],
	["music_garage", "Garage Shuffle", "Swinging club rhythm with clipped chords.", 560, "#38BDF8", ["#082F49", "#38BDF8", "#F0ABFC"]],
	["music_minimal", "Minimal Dots", "Sparse repeating tones with clean focus.", 580, "#E5E7EB", ["#111827", "#E5E7EB", "#60A5FA"]],
	["music_waltz", "Pixel Waltz", "Three-step melody with a tiny ballroom feel.", 600, "#F9A8D4", ["#831843", "#F9A8D4", "#FDE68A"]],
	["music_future_bass", "Future Lift", "Wide bright chords with clipped bass jumps.", 620, "#A78BFA", ["#1E1B4B", "#A78BFA", "#22D3EE"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "music" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

const EXTRA_MUSIC_WAVE_2: ShopItem[] = [
	["music_bossa_blocks", "Bossa Blocks", "Light syncopated chords for relaxed puzzle runs.", 640, "#FDBA74", ["#431407", "#FDBA74", "#A7F3D0"]],
	["music_dungeon_low", "Dungeon Low", "Dark low pulse with a slow underground feel.", 660, "#94A3B8", ["#020617", "#475569", "#94A3B8"]],
	["music_meteor_shower", "Meteor Shower", "Bright arps and falling melodic sparks.", 680, "#F97316", ["#111827", "#F97316", "#38BDF8"]],
	["music_sunrise_pad", "Sunrise Pad", "Warm pads for quieter morning sessions.", 700, "#FDE68A", ["#451A03", "#FDE68A", "#FBCFE8"]],
	["music_circuit_calm", "Circuit Calm", "Minimal tech pulse with soft edges.", 720, "#22D3EE", ["#082F49", "#22D3EE", "#A7F3D0"]],
	["music_crystal_run", "Crystal Run", "Glassy notes over a fast clean rhythm.", 740, "#C4B5FD", ["#312E81", "#C4B5FD", "#E0F2FE"]],
	["music_ocean_pulse", "Ocean Pulse", "Deep water bass with small wave accents.", 760, "#2DD4BF", ["#042F2E", "#2DD4BF", "#BAE6FD"]],
	["music_desert_night", "Desert Night", "Dry plucks with a warm night groove.", 780, "#FDBA74", ["#431407", "#FDBA74", "#FDE68A"]],
	["music_steel_dream", "Steel Dream", "Metallic pads with a smooth pulse.", 800, "#CBD5E1", ["#020617", "#64748B", "#CBD5E1"]],
	["music_snowfall", "Snowfall", "Tiny cold tones with soft white space.", 820, "#BAE6FD", ["#0C4A6E", "#BAE6FD", "#FFFFFF"]],
	["music_forest_walk", "Forest Walk", "Green mallet pattern with grounded rhythm.", 840, "#86EFAC", ["#052E16", "#86EFAC", "#FDE68A"]],
	["music_vapor_trail", "Vapor Trail", "Airy retro chords with a smooth lift.", 860, "#F0ABFC", ["#581C87", "#F0ABFC", "#67E8F9"]],
	["music_puzzle_focus", "Puzzle Focus", "Sparse clicky loop built for concentration.", 880, "#E5E7EB", ["#111827", "#E5E7EB", "#60A5FA"]],
	["music_thunder_room", "Thunder Room", "Heavy room pulse with distant thunder hits.", 900, "#93C5FD", ["#020617", "#475569", "#93C5FD"]],
	["music_koto_steps", "Koto Steps", "Plucked eastern-style phrases with light drums.", 920, "#FDE68A", ["#422006", "#FDE68A", "#C4B5FD"]],
	["music_western_dust", "Western Dust", "Twangy dusty loop with slow stomp rhythm.", 940, "#D97706", ["#431407", "#D97706", "#FDE68A"]],
	["music_deep_house", "Deep House", "Warm club pulse with smooth filtered chords.", 960, "#38BDF8", ["#082F49", "#38BDF8", "#F472B6"]],
	["music_chip_calm", "Chip Calm", "Soft chiptune melody without arcade pressure.", 980, "#A3E635", ["#365314", "#A3E635", "#22D3EE"]],
	["music_marimba_run", "Marimba Run", "Bouncy marimba rhythm for quick decisions.", 1000, "#FACC15", ["#713F12", "#FACC15", "#4ADE80"]],
	["music_cosmic_bell", "Cosmic Bell", "Distant bell tones over a slow cosmic pad.", 1020, "#DDD6FE", ["#312E81", "#DDD6FE", "#BAE6FD"]],
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
	["sfx_wood_oak", "Paper Folds", "Dry paper taps and crumpled clears.", 180, "#FDE68A", ["#78350F", "#FDE68A", "#FFFFFF"]],
	["sfx_wood_bamboo", "Bubble Pops", "Rounded wet pops for playful feedback.", 200, "#67E8F9", ["#164E63", "#67E8F9", "#F9A8D4"]],
	["sfx_wood_chest", "Laser Zaps", "Sharp sci-fi zaps with fast clear sweeps.", 220, "#F43F5E", ["#111827", "#F43F5E", "#22D3EE"]],
	["sfx_wood_plank", "Stone Drops", "Short rocky impacts and dusty clears.", 240, "#A8A29E", ["#292524", "#A8A29E", "#E7E5E4"]],
	["sfx_wood_forest", "Water Plops", "Soft water taps and splashy line clears.", 260, "#38BDF8", ["#082F49", "#38BDF8", "#BAE6FD"]],
	["sfx_glass_frost", "Electric Snaps", "Static-charged clicks for quick moves.", 240, "#FDE047", ["#111827", "#FDE047", "#38BDF8"]],
	["sfx_glass_prism", "Toy Buttons", "Small toy-like button chirps.", 260, "#F9A8D4", ["#831843", "#F9A8D4", "#A3E635"]],
	["sfx_glass_ice", "Clay Thumps", "Muted clay hits with soft clears.", 280, "#FDBA74", ["#7C2D12", "#FDBA74", "#FED7AA"]],
	["sfx_glass_neon", "Bell Tones", "Bright bell clicks and ringing clears.", 300, "#C4B5FD", ["#312E81", "#C4B5FD", "#FFFFFF"]],
	["sfx_glass_chime", "Air Whoosh", "Breathy swipes and airy clear sounds.", 320, "#BAE6FD", ["#082F49", "#BAE6FD", "#E0F2FE"]],
	["sfx_retro_chip", "Typewriter", "Clacky keypress-style block feedback.", 280, "#E5E7EB", ["#111827", "#E5E7EB", "#FCA5A5"]],
	["sfx_retro_terminal", "Spring Boing", "Bouncy spring hits for light sessions.", 300, "#A3E635", ["#365314", "#A3E635", "#FDE68A"]],
	["sfx_retro_laser", "Ice Cracks", "Cold brittle taps and glassy clears.", 320, "#BAE6FD", ["#0C4A6E", "#BAE6FD", "#FFFFFF"]],
	["sfx_retro_coin", "Fire Sparks", "Hot crackles with quick ember clears.", 340, "#FB923C", ["#7C2D12", "#FB923C", "#FDE68A"]],
	["sfx_retro_console", "Coin Drops", "Coin-op clinks for menu and combo feedback.", 360, "#FACC15", ["#713F12", "#FACC15", "#60A5FA"]],
	["sfx_metal_steel", "Drum Hits", "Percussive thumps and snare-like clears.", 320, "#F87171", ["#450A0A", "#F87171", "#E5E7EB"]],
	["sfx_metal_anvil", "Sci-Fi Pings", "Clean futuristic pings with short sweeps.", 340, "#22D3EE", ["#082F49", "#22D3EE", "#A78BFA"]],
	["sfx_metal_robot", "Finger Snaps", "Dry snap clicks and crisp clear hits.", 360, "#FDE68A", ["#422006", "#FDE68A", "#FFFFFF"]],
	["sfx_metal_cyber", "Plucked Strings", "Tiny plucks for placements and combos.", 380, "#C4B5FD", ["#312E81", "#C4B5FD", "#FDE68A"]],
	["sfx_metal_titan", "Soft Felt", "Very soft muted feedback for quiet play.", 400, "#CBD5E1", ["#111827", "#CBD5E1", "#F8FAFC"]],
	["sfx_camera", "Camera Clicks", "Shutter-like taps and flash clears.", 420, "#E5E7EB", ["#111827", "#E5E7EB", "#FDE047"]],
	["sfx_clock", "Clock Ticks", "Tick-tock clicks with mechanical clears.", 440, "#FDE68A", ["#422006", "#FDE68A", "#CBD5E1"]],
	["sfx_rubber", "Rubber Bounce", "Elastic hits with a bouncy finish.", 460, "#A3E635", ["#365314", "#A3E635", "#F9A8D4"]],
	["sfx_ceramic", "Ceramic Chips", "Tiny ceramic taps and brittle clears.", 480, "#BAE6FD", ["#0F172A", "#BAE6FD", "#FFFFFF"]],
	["sfx_spark", "Spark Burst", "Bright sparks for placements and combos.", 500, "#FACC15", ["#111827", "#FACC15", "#F43F5E"]],
	["sfx_bass", "Bass Thuds", "Low bass impacts for heavier feedback.", 520, "#94A3B8", ["#020617", "#94A3B8", "#F97316"]],
	["sfx_digital", "Digital Chirps", "Short UI chirps with clean digital edges.", 540, "#38BDF8", ["#082F49", "#38BDF8", "#4ADE80"]],
	["sfx_magic", "Magic Dust", "Soft sparkling chimes for clears.", 560, "#C084FC", ["#581C87", "#C084FC", "#FDE68A"]],
	["sfx_crunch", "Crunch Pack", "Crunchy textured hits and rough clears.", 580, "#FDBA74", ["#431407", "#FDBA74", "#E7E5E4"]],
	["sfx_wind", "Wind Swipes", "Quiet airy swipes with light clear gusts.", 600, "#BAE6FD", ["#082F49", "#BAE6FD", "#A7F3D0"]],
].map(([id, title, description, price, accent, previewColors]) => ({
	id: id as string,
	category: "sfx" as const,
	title: title as string,
	description: description as string,
	price: price as number,
	accent: accent as string,
	previewColors: previewColors as string[],
}));

const EXTRA_SFX_WAVE_2: ShopItem[] = [
	["sfx_quartz", "Quartz Taps", "Clear quartz ticks with glassy clears.", 620, "#DDD6FE", ["#312E81", "#DDD6FE", "#FFFFFF"]],
	["sfx_velvet", "Velvet Mutes", "Soft muted taps for quiet late games.", 640, "#C084FC", ["#2E1065", "#C084FC", "#FBCFE8"]],
	["sfx_arcade", "Arcade Blips", "Bright arcade blips with quick clear chirps.", 660, "#22D3EE", ["#020617", "#22D3EE", "#FACC15"]],
	["sfx_moon", "Moon Echo", "Soft lunar echoes and pale clicks.", 680, "#BAE6FD", ["#0F172A", "#BAE6FD", "#DDD6FE"]],
	["sfx_jade", "Jade Knocks", "Polished jade knocks with clean clears.", 700, "#86EFAC", ["#064E3B", "#86EFAC", "#E0F2FE"]],
	["sfx_rain", "Rain Ticks", "Tiny rain taps and watery clears.", 720, "#7DD3FC", ["#082F49", "#7DD3FC", "#A7F3D0"]],
	["sfx_pearl", "Pearl Chimes", "Small pearl-like chimes with soft shine.", 740, "#FBCFE8", ["#831843", "#FBCFE8", "#FFFFFF"]],
	["sfx_thunder", "Thunder Hits", "Low thunder hits for heavy moves.", 760, "#94A3B8", ["#020617", "#94A3B8", "#F97316"]],
	["sfx_neon", "Neon Zips", "Neon zips and bright clear flashes.", 780, "#F472B6", ["#111827", "#F472B6", "#22D3EE"]],
	["sfx_snow", "Snow Crunch", "Tiny snow crunches and frosty clears.", 800, "#BAE6FD", ["#0C4A6E", "#BAE6FD", "#FFFFFF"]],
	["sfx_copper", "Copper Pings", "Copper pings with warm metallic clicks.", 820, "#F97316", ["#431407", "#F97316", "#14B8A6"]],
	["sfx_ghost", "Ghost Whispers", "Quiet airy ghost taps with soft tails.", 840, "#E5E7EB", ["#111827", "#E5E7EB", "#A78BFA"]],
	["sfx_lime", "Lime Pops", "Sharp lime pops for crisp actions.", 860, "#BEF264", ["#1A2E05", "#BEF264", "#38BDF8"]],
	["sfx_orbit", "Orbit Pings", "Small orbital pings and clear sweeps.", 880, "#38BDF8", ["#082F49", "#38BDF8", "#DDD6FE"]],
	["sfx_bronze", "Bronze Clinks", "Bronze clinks with a warm finish.", 900, "#D97706", ["#431407", "#D97706", "#FDE68A"]],
	["sfx_silk", "Silk Swipes", "Silky swipes with very soft placements.", 920, "#F9A8D4", ["#831843", "#F9A8D4", "#E0F2FE"]],
	["sfx_starlight", "Starlight", "Bright tiny star ticks and sparkly clears.", 940, "#DDD6FE", ["#312E81", "#DDD6FE", "#FDE047"]],
	["sfx_clack", "Clack Pack", "Hard clacks for responsive placement feel.", 960, "#E5E7EB", ["#111827", "#E5E7EB", "#F87171"]],
	["sfx_peach", "Peach Fizz", "Soft fizzy taps with peachy clear pops.", 980, "#FDBA74", ["#7C2D12", "#FDBA74", "#F9A8D4"]],
	["sfx_void", "Void Pulse", "Dark pulse hits with small echo tails.", 1000, "#A78BFA", ["#030014", "#6D28D9", "#A78BFA"]],
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
	...EXTRA_PIECE_SKINS_WAVE_2,
	...EXTRA_BACKGROUNDS,
	...EXTRA_BACKGROUNDS_WAVE_2,
	...EXTRA_MUSIC,
	...EXTRA_MUSIC_WAVE_2,
	...EXTRA_SFX,
	...EXTRA_SFX_WAVE_2,
]);

const SHOP_ITEM_MAP = new Map(SHOP_ITEMS.map((item) => [item.id, item]));


export const shopStateAtom = atom<ShopState>(createDefaultShopState());

export function createDefaultShopState(): ShopState {
	return {
		balance: STARTER_SHOP_COINS,
		ownedItemIds: [...FREE_SHOP_ITEM_IDS],
		equipped: { ...DEFAULT_EQUIPPED_COSMETICS },
		starterGrantClaimed: true,
		pendingProfileSync: false,
		dirtyProfileFields: [],
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
	return getShopItemsByCategory(category)
		.filter((item) => !item.secret || ownedSet.has(item.id))
		.sort((a, b) => Number(b.id.endsWith("_custom")) - Number(a.id.endsWith("_custom")));
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
	const dirtyProfileFields = Array.isArray(value.dirtyProfileFields)
		? value.dirtyProfileFields.filter((field): field is ShopProfileField => (
			field === "coins" || field === "owned_item_ids" || field === "equipped"
		))
		: [];

	return {
		balance: starterGrantClaimed ? savedBalance : Math.max(savedBalance, STARTER_SHOP_COINS),
		ownedItemIds: [...ownedSet],
		equipped,
		starterGrantClaimed: true,
		pendingProfileSync: dirtyProfileFields.length > 0,
		dirtyProfileFields: [...new Set(dirtyProfileFields)],
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
			count: isGameplayActive ? 4 : 8,
			blockSize: isGameplayActive ? 14 : 22,
			maxOpacity: isGameplayActive ? 0.32 : 0.65,
		};
	}

	return {
		count: isGameplayActive ? 3 : 6,
		blockSize: isGameplayActive ? 14 : 22,
		maxOpacity: isGameplayActive ? 0.26 : 0.48,
	};
}

interface MergeShopStateOptions {
	preferRemoteBalance?: boolean;
	preferRemoteOwnedItems?: boolean;
	preferRemoteEquipped?: boolean;
}

export function mergeShopStates(
	localState: ShopState,
	remoteState: Partial<ShopState> | null | undefined,
	options: MergeShopStateOptions = {}
): ShopState {
	const local = normalizeShopState(localState);
	if (!remoteState) return local;

	const remote = normalizeShopState(remoteState);
	const ownedSet = options.preferRemoteOwnedItems
		? new Set(remote.ownedItemIds)
		: new Set([...local.ownedItemIds, ...remote.ownedItemIds]);
	
	const localNewer = local.updatedAt >= remote.updatedAt;

	return normalizeShopState({
		balance: options.preferRemoteBalance ? remote.balance : localNewer ? local.balance : remote.balance,
		ownedItemIds: [...ownedSet],
		equipped: options.preferRemoteEquipped ? remote.equipped : local.equipped,
		starterGrantClaimed: true,
		pendingProfileSync: local.pendingProfileSync,
		dirtyProfileFields: local.dirtyProfileFields,
		updatedAt: Math.max(local.updatedAt, remote.updatedAt),
	});
}

function hasDirtyProfileField(state: ShopState, field: ShopProfileField): boolean {
	return state.dirtyProfileFields.includes(field);
}

export function shouldPushLocalShopField(
	localState: ShopState,
	remoteState: Partial<ShopState> | null | undefined,
	field: ShopProfileField
): boolean {
	const local = normalizeShopState(localState);
	if (!remoteState) return true;
	if (!hasDirtyProfileField(local, field)) return false;

	const remote = normalizeShopState(remoteState);
	return local.updatedAt >= remote.updatedAt;
}

export function shouldPushLocalShopBalance(
	localState: ShopState,
	remoteState: Partial<ShopState> | null | undefined
): boolean {
	return shouldPushLocalShopField(localState, remoteState, "coins");
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
		pendingProfileSync: false,
		dirtyProfileFields: [],
		updatedAt: profile.updated_at ? new Date(profile.updated_at).getTime() : 0,
	};
}

function escapeIlike(value: string): string {
	return value.replace(/[%_]/g, "\\$&");
}

function areStringSetsEqual(a: string[], b: string[]): boolean {
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size !== setB.size) return false;
	for (const value of setA) {
		if (!setB.has(value)) return false;
	}
	return true;
}

function areEquippedCosmeticsEqual(a: EquippedCosmetics, b: Partial<EquippedCosmetics> | null | undefined): boolean {
	if (!b) return false;
	return (Object.keys(DEFAULT_EQUIPPED_COSMETICS) as ShopCategory[])
		.every((category) => a[category] === b[category]);
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
		const dirtyFields = new Set(local.dirtyProfileFields);
		const hasUnsyncedLocalChanges = dirtyFields.size > 0;
		const remoteState = profileToShopState(profile);
		const shouldWriteBalance = shouldPushLocalShopBalance(local, remoteState);
		const shouldWriteOwnedItems = shouldPushLocalShopField(local, remoteState, "owned_item_ids");
		const shouldWriteEquipped = shouldPushLocalShopField(local, remoteState, "equipped");
		const merged = {
			...mergeShopStates(local, remoteState, {
				preferRemoteBalance: Boolean(profile && !shouldWriteBalance),
				preferRemoteOwnedItems: Boolean(profile && !shouldWriteOwnedItems),
				preferRemoteEquipped: Boolean(profile && !shouldWriteEquipped),
			}),
			pendingProfileSync: false,
			dirtyProfileFields: [],
			updatedAt: Math.max(local.updatedAt, remoteState?.updatedAt || 0),
		};

		if (profile?.id && !hasUnsyncedLocalChanges) {
			const cleanState = normalizeShopState(merged);
			await saveShopState(cleanState);
			return { status: "synced", state: cleanState };
		}

		const payload: Partial<{
			coins: number;
			owned_item_ids: string[];
			equipped: EquippedCosmetics;
		}> = {};

		if (shouldWriteBalance) {
			payload.coins = merged.balance;
		}

		const remoteOwnedItemIds = Array.isArray(profile?.owned_item_ids) ? profile!.owned_item_ids! : [];
		if ((!profile?.id || shouldWriteOwnedItems) && !areStringSetsEqual(merged.ownedItemIds, remoteOwnedItemIds)) {
			payload.owned_item_ids = merged.ownedItemIds;
		}

		if ((!profile?.id || shouldWriteEquipped) && !areEquippedCosmeticsEqual(merged.equipped, profile?.equipped)) {
			payload.equipped = merged.equipped;
		}

		if (profile?.id && Object.keys(payload).length === 0) {
			const cleanState = normalizeShopState(merged);
			await saveShopState(cleanState);
			return { status: "synced", state: cleanState };
		}

		const selectColumns = "id, player_name, player_id, coins, owned_item_ids, equipped, updated_at";
		const writeResult = profile?.id
			? await supabase.from("profiles").update(payload).eq("id", profile.id).select(selectColumns).single()
			: await supabase.from("profiles").insert({ ...payload, player_name: identity.playerName, player_id: identity.playerId }).select(selectColumns).single();

		if (writeResult.error) {
			console.error("Error saving shop profile:", writeResult.error);
			return { status: "failed", state: local };
		}

		const savedRemoteState = profileToShopState(writeResult.data as RemoteShopProfile | null);
		const syncedState = normalizeShopState({
			...mergeShopStates(merged, savedRemoteState, {
				preferRemoteBalance: true,
				preferRemoteOwnedItems: true,
				preferRemoteEquipped: true,
			}),
			pendingProfileSync: false,
			dirtyProfileFields: [],
			updatedAt: savedRemoteState?.updatedAt || merged.updatedAt || Date.now(),
		});

		await saveShopState(syncedState);
		return { status: "synced", state: syncedState };
	} catch (error) {
		console.error("Error syncing shop profile:", error);
		return { status: "failed", state: local };
	}
}

export function useShopState() {
	const [state, setState] = useAtom(shopStateAtom);

	const inferDirtyFields = useCallback((next: ShopState): ShopProfileField[] => {
		const current = normalizeShopState(state);
		const candidate = normalizeShopState(next);
		const fields: ShopProfileField[] = [];
		if (candidate.balance !== current.balance) fields.push("coins");
		if (!areStringSetsEqual(candidate.ownedItemIds, current.ownedItemIds)) fields.push("owned_item_ids");
		if (!areEquippedCosmeticsEqual(candidate.equipped, current.equipped)) fields.push("equipped");
		return fields;
	}, [state]);

	const commit = useCallback(async (next: ShopState, changedFields?: ShopProfileField[]) => {
		const dirtyProfileFields = [...new Set(changedFields ?? inferDirtyFields(next))];
		const normalized = normalizeShopState({
			...next,
			pendingProfileSync: dirtyProfileFields.length > 0,
			dirtyProfileFields,
			updatedAt: Date.now()
		});
		setState(normalized);
		await saveShopState(normalized);
		const syncResult = await syncShopStateWithProfile(normalized);
		if (syncResult.status === "synced") {
			setState(syncResult.state);
			return syncResult.state;
		}
		return normalized;
	}, [inferDirtyFields, setState]);

	const reload = useCallback(async () => {
		const next = await loadShopState();
		setState(next);
		return next;
	}, [setState]);

	const purchase = useCallback(async (itemId: string) => {
		const result = purchaseShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state, ["coins", "owned_item_ids"]);
		}
		return result;
	}, [commit, state]);

	const equip = useCallback(async (itemId: string) => {
		const result = equipShopItem(state, itemId);
		if (result.ok) {
			await commit(result.state, ["equipped"]);
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
		await commit(equipResult.state, ["coins", "owned_item_ids", "equipped"]);
		return equipResult;
	}, [commit, state]);

	const awardCoins = useCallback(async (score: number) => {
		const coins = calculateCoinsForScore(score);
		if (coins <= 0) return 0;

		const latest = await loadShopState();
		await commit(addCoinsToShopState(latest, coins), ["coins"]);
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
