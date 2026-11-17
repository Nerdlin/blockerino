-- Style shop, wave 2: 22 more skins for chess pieces and boards, Sea Battle, cards and Mahjong.
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('chess_piece_marble', 600, 'paid'),
  ('chess_piece_jade', 700, 'paid'),
  ('chess_piece_sunset', 750, 'paid'),
  ('chess_piece_toxic', 820, 'paid'),
  ('chess_piece_gold', 1500, 'paid'),
  ('chess_board_coral', 400, 'paid'),
  ('chess_board_midnight', 650, 'paid'),
  ('chess_board_sand', 500, 'paid'),
  ('chess_board_mono', 800, 'paid'),
  ('chess_board_royal', 1450, 'paid'),
  ('sea_skin_arctic', 450, 'paid'),
  ('sea_skin_toxic', 600, 'paid'),
  ('sea_skin_night', 750, 'paid'),
  ('sea_skin_gold', 1500, 'paid'),
  ('card_skin_ocean', 600, 'paid'),
  ('card_skin_noir', 700, 'paid'),
  ('card_skin_sunset', 800, 'paid'),
  ('card_skin_royal', 1450, 'paid'),
  ('mahjong_theme_ocean', 550, 'paid'),
  ('mahjong_theme_bamboo', 650, 'paid'),
  ('mahjong_theme_neon', 850, 'paid'),
  ('mahjong_theme_gold', 1500, 'paid')
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
