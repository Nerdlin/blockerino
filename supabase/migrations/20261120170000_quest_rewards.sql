-- Quest rewards, balanced by effort. Daily: an easy solo target pays 15-20, a medium one 30-40, the hardest 50-60;
-- a win over a bot (Elo 400 and up, the early ones are trivial) pays less than a win over a person (60) or in the harder
-- games; the bonus for all three quests is 75 coins and a key. At most 3 x 60 + 75 = 255 coins a day (the caps of
-- claim_daily_quests are unchanged). Monthly (monthly_quest migration): the bonus on 10 days = 600 coins and 2 keys.
-- Kept in step with constants/DailyQuests.ts and constants/MonthlyQuest.ts (jest tests compare both).

CREATE OR REPLACE FUNCTION public.daily_quest_reward(p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_id
    WHEN 'lines_15' THEN 20
    WHEN 'lines_25' THEN 30
    WHEN 'lines_40' THEN 40
    WHEN 'lines_70' THEN 55
    WHEN 'games_1' THEN 15
    WHEN 'games_2' THEN 20
    WHEN 'games_3' THEN 30
    WHEN 'games_4' THEN 40
    WHEN 'pieces_40' THEN 20
    WHEN 'pieces_70' THEN 30
    WHEN 'pieces_100' THEN 40
    WHEN 'pieces_150' THEN 55
    WHEN 'botWin_1' THEN 20
    WHEN 'botWin_2' THEN 35
    WHEN 'versus_1' THEN 60
    WHEN 'moreWin_1' THEN 30
    WHEN 'moreWin_2' THEN 50
    WHEN 'chessWin_1' THEN 35
    WHEN 'chessWin_2' THEN 55
    WHEN 'durakWin_1' THEN 35
    WHEN 'seaWin_1' THEN 35
    WHEN 'puzzle_1' THEN 30
    WHEN 'puzzle_2' THEN 50
    WHEN 'rescue_1' THEN 30
    WHEN 'rescue_2' THEN 50
    WHEN 'combo_1' THEN 30
    WHEN 'combo_2' THEN 50
    WHEN 'bonus' THEN 75
    ELSE NULL
  END;
$$;
