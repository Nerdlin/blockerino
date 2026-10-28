-- Daily quests: a bigger pool (more tiers per kind, plus chess / Durak / Sea Battle wins, Sudoku and Mahjong,
-- and the Rescue and Combo Trial challenges). Only the reward table changes; the claim function and the caps
-- (three quests plus one bonus per account and day) stay as they were. Kept in step with constants/DailyQuests.ts.

CREATE OR REPLACE FUNCTION public.daily_quest_reward(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'lines_15' THEN 20
    WHEN 'lines_40' THEN 40
    WHEN 'games_2' THEN 20
    WHEN 'games_4' THEN 40
    WHEN 'pieces_40' THEN 20
    WHEN 'pieces_100' THEN 40
    WHEN 'botWin_1' THEN 30
    WHEN 'botWin_2' THEN 50
    WHEN 'versus_1' THEN 40
    WHEN 'moreWin_1' THEN 30
    WHEN 'moreWin_2' THEN 50
    WHEN 'lines_25' THEN 30
    WHEN 'lines_70' THEN 50
    WHEN 'games_1' THEN 10
    WHEN 'games_3' THEN 30
    WHEN 'pieces_70' THEN 30
    WHEN 'pieces_150' THEN 50
    WHEN 'chessWin_1' THEN 30
    WHEN 'chessWin_2' THEN 50
    WHEN 'durakWin_1' THEN 30
    WHEN 'seaWin_1' THEN 30
    WHEN 'puzzle_1' THEN 30
    WHEN 'puzzle_2' THEN 50
    WHEN 'rescue_1' THEN 30
    WHEN 'rescue_2' THEN 50
    WHEN 'combo_1' THEN 30
    WHEN 'combo_2' THEN 50
    WHEN 'bonus' THEN 50
    ELSE NULL
  END;
$$;
