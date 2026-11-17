-- 18 piece skins in six new block kinds (pixel, glass, metal, wood, candy, orb), and skins for checkers.
-- Sold for coins; also in chests.
-- Mirrors constants/Shop.ts (EXTRA_PIECE_SKINS_WAVE_3); constants/ShopCatalog.test.ts compares both.
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('piece_pixel_gameboy', 240, 'paid'),
  ('piece_pixel_arcade', 380, 'paid'),
  ('piece_pixel_vapor', 720, 'paid'),
  ('piece_glass_ice', 300, 'paid'),
  ('piece_glass_rose', 560, 'paid'),
  ('piece_glass_aqua', 820, 'paid'),
  ('piece_metal_steel', 260, 'paid'),
  ('piece_metal_bronze', 520, 'paid'),
  ('piece_metal_chrome', 1650, 'paid'),
  ('piece_wood_oak', 220, 'paid'),
  ('piece_wood_cherry', 460, 'paid'),
  ('piece_wood_ebony', 780, 'paid'),
  ('piece_sweet_mint', 280, 'paid'),
  ('piece_sweet_berry', 540, 'paid'),
  ('piece_sweet_rainbow', 1550, 'paid'),
  ('piece_orb_bubble', 320, 'paid'),
  ('piece_orb_planet', 840, 'paid'),
  ('piece_orb_galaxy', 1750, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- Checkers skins: the board's squares and both sides' pieces (components/moregames/cosmetics.ts, CHECKERS_SKINS).
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('checkers_skin_classic', 0, 'free'),
  ('checkers_skin_marble', 450, 'paid'),
  ('checkers_skin_tournament', 550, 'paid'),
  ('checkers_skin_candy', 650, 'paid'),
  ('checkers_skin_neon', 820, 'paid'),
  ('checkers_skin_gold', 1500, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- The collection knows the new category (as in 20261116120000, plus checkers_skin).
CREATE OR REPLACE FUNCTION public.item_category(p_item_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_item_id LIKE 'chess\_piece\_%' THEN 'chess_piece'
    WHEN p_item_id LIKE 'chess\_board\_%' THEN 'chess_board'
    WHEN p_item_id LIKE 'checkers\_skin\_%' THEN 'checkers_skin'
    WHEN p_item_id LIKE 'sea\_skin\_%' THEN 'sea_skin'
    WHEN p_item_id LIKE 'card\_skin\_%' THEN 'card_skin'
    WHEN p_item_id LIKE 'sudoku\_theme\_%' THEN 'sudoku_theme'
    WHEN p_item_id LIKE 'mahjong\_theme\_%' THEN 'mahjong_theme'
    WHEN p_item_id LIKE 'piece\_%' THEN 'piece_skin'
    WHEN p_item_id LIKE 'background\_%' THEN 'background'
    WHEN p_item_id LIKE 'music\_%' THEN 'music'
    WHEN p_item_id LIKE 'sfx\_%' THEN 'sfx'
    ELSE NULL
  END;
$$;
