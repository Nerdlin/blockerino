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
