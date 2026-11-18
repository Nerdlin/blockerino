-- Long backgammon joins the More Games: its ratings, match history and win/loss records are accepted like the other
-- games (the same server-side Elo as checkers: +10 for the winner, -10 for the loser, counted on the loser's report),
-- and its board skins go on sale. Mirrors 20261101110000_checkers_game.sql and the checkers part of
-- 20261117120000_style_shop_skins.sql.

ALTER TABLE public.more_game_ratings DROP CONSTRAINT more_game_ratings_game_id_check;
ALTER TABLE public.more_game_ratings ADD CONSTRAINT more_game_ratings_game_id_check
  CHECK (game_id IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong', 'checkers', 'backgammon'));

ALTER TABLE public.more_game_match_history DROP CONSTRAINT more_game_match_history_game_id_check;
ALTER TABLE public.more_game_match_history ADD CONSTRAINT more_game_match_history_game_id_check
  CHECK (game_id IN ('battleship', 'durak', 'chess', 'tictactoe', 'sudoku', 'mahjong', 'checkers', 'backgammon'));

ALTER TABLE public.player_game_records DROP CONSTRAINT player_game_records_game_id_check;
ALTER TABLE public.player_game_records ADD CONSTRAINT player_game_records_game_id_check
  CHECK (game_id IN ('versus', 'chess', 'battleship', 'durak', 'tictactoe', 'sudoku', 'mahjong', 'checkers', 'backgammon'));

-- Both functions keep their bodies; only their list of game ids gains 'backgammon'.
-- record_more_game_match lists the rated duel games (20261110134159_security_audit_fixes.sql);
-- sync_game_records lists every game with a win/loss record (20261101110000_checkers_game.sql).
DO $$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_new text;
  v_old_list text;
  v_new_list text;
BEGIN
  FOR v_fn, v_old_list, v_new_list IN
    SELECT 'public.record_more_game_match(text, text, text, text, text, jsonb)'::regprocedure,
           '''tictactoe'', ''checkers'')',
           '''tictactoe'', ''checkers'', ''backgammon'')'
    UNION ALL
    SELECT 'public.sync_game_records(jsonb)'::regprocedure,
           '''mahjong'', ''checkers'')',
           '''mahjong'', ''checkers'', ''backgammon'')'
  LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := replace(v_def, v_old_list, v_new_list);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'game id list not found in %', v_fn;
    END IF;
    EXECUTE v_new;
  END LOOP;
END;
$$;

-- Backgammon board skins: the frame, field, points and both sides' checkers
-- (components/moregames/cosmetics.ts, BACKGAMMON_SKINS). Mirrors constants/Shop.ts; constants/ShopCatalog.test.ts compares both.
INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('backgammon_skin_classic', 0, 'free'),
  ('backgammon_skin_stone', 450, 'paid'),
  ('backgammon_skin_felt', 550, 'paid'),
  ('backgammon_skin_midnight', 650, 'paid'),
  ('backgammon_skin_neon', 820, 'paid'),
  ('backgammon_skin_gold', 1500, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- The collection knows the new category (as in 20261117120000, plus backgammon_skin).
CREATE OR REPLACE FUNCTION public.item_category(p_item_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_item_id LIKE 'chess\_piece\_%' THEN 'chess_piece'
    WHEN p_item_id LIKE 'chess\_board\_%' THEN 'chess_board'
    WHEN p_item_id LIKE 'checkers\_skin\_%' THEN 'checkers_skin'
    WHEN p_item_id LIKE 'backgammon\_skin\_%' THEN 'backgammon_skin'
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
