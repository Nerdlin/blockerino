-- Pixel-art chess piece sets for the style shop. The glyph sets stay; these are extra choices.
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('chess_piece_pixel', 600, 'paid'),
  ('chess_piece_pixel_neon', 800, 'paid'),
  ('chess_piece_pixel_gold', 1200, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;
