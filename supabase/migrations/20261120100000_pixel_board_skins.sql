-- Pixel board skins: the default and the older board skins of chess, checkers and long backgammon are now plain (flat
-- squares, smooth chips and points); the block-bevelled look moves into three pixel skins per game
-- (components/moregames/cosmetics.ts, `pixel` skins). Chess pieces already have three pixel sets.
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('chess_board_pixel_arcade', 500, 'paid'),
  ('chess_board_pixel_wood', 700, 'paid'),
  ('chess_board_pixel_neon', 1000, 'paid'),
  ('checkers_skin_pixel_wood', 600, 'paid'),
  ('checkers_skin_pixel_neon', 800, 'paid'),
  ('checkers_skin_pixel_gold', 1200, 'paid'),
  ('backgammon_skin_pixel_wood', 600, 'paid'),
  ('backgammon_skin_pixel_neon', 800, 'paid'),
  ('backgammon_skin_pixel_gold', 1200, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;
