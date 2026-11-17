-- 18 piece skins in six new block kinds (pixel, glass, metal, wood, candy, orb). Sold for coins; also in chests.
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
