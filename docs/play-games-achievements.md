# Play Games: achievements and leaderboards

Created by hand in Play Console (Grow users, Play Games Services, Setup and management, Achievements / Leaderboards).
The game's own achievements stay the source of truth; Play Games mirrors this subset. After creating them, copy each
Play Games id ("CgkI...") into `PLAY_GAMES_ACHIEVEMENTS` / `PLAY_GAMES_LEADERBOARDS` in `constants/PlayGamesSync.ts`.

Play Games project: `124810801663` (cloud project `blockerino`), OAuth client `blockerino-play` (Play app signing key).

## Achievements (20, 1000 XP in all)

Default language en-US; add the Russian translation (Добавить перевод, ru-RU) with the second pair of columns.
Leave "Incremental" off for all of them: the game decides when an achievement is earned.

| Our id | Name (en) | Description (en) | Name (ru) | Description (ru) | XP |
|---|---|---|---|---|---|
| first_steps | First Steps | Finish any solo game. | Первые шаги | Завершите любую соло-игру. | 5 |
| line_breaker | Line Breaker | Clear 50 rows or columns. | Разрушитель линий | Очистите 50 рядов или столбцов. | 10 |
| piece_architect | Piece Architect | Place 1000 pieces. | Архитектор фигур | Поставьте 1000 фигур. | 10 |
| score_hunter | Score Hunter | Reach 1000 points in one solo game. | Охотник за очками | Наберите 1000 очков за одну соло-игру. | 25 |
| score_legend | Score Legend | Reach 10000 points in one solo game. | Легенда очков | Наберите 10000 очков за одну соло-игру. | 100 |
| classic_riser | Classic Riser | Reach 2500 points in Classic. | Восход классики | Наберите 2500 очков в Классике. | 25 |
| chaos_tamer | Chaos Tamer | Reach 1500 points in Chaos. | Укротитель хаоса | Наберите 1500 очков в Хаосе. | 25 |
| first_duel | First Duel | Win a Versus match. | Первая дуэль | Выиграйте матч в дуэли. | 10 |
| duelist | Duelist | Win 10 Versus matches. | Дуэлянт | Выиграйте 10 матчей в дуэлях. | 50 |
| pawn_pusher | Pawn Pusher | Win a chess game. | Толкатель пешек | Выиграйте партию в шахматы. | 25 |
| chess_master | Chess Master | Win 50 chess games. | Шахматный мастер | Выиграйте 50 партий в шахматы. | 100 |
| card_rookie | Card Rookie | Win a Durak game. | Новичок за столом | Выиграйте партию в Дурака. | 25 |
| deckhand | Deckhand | Win a Sea Battle. | Матрос | Выиграйте Морской бой. | 25 |
| sudoku_sage | Sudoku Sage | Solve 50 Sudokus. | Мудрец судоку | Решите 50 судоку. | 50 |
| mahjong_sage | Mahjong Sage | Clear 50 Mahjong boards. | Мудрец маджонга | Очистите 50 досок маджонга. | 50 |
| bot_basher | Bot Basher | Beat the bot 10 times. | Громила ботов | Победите бота 10 раз. | 50 |
| terminator | Terminator | Beat the bot on Hard 25 times. | Терминатор | Победите сложного бота 25 раз. | 150 |
| all_rounder | All-Rounder | Win in 4 different games. | Универсал | Выиграйте в 4 разных играх. | 100 |
| week_warrior | Week Warrior | Log in 7 days in a row. | Воин недели | Заходите 7 дней подряд. | 50 |
| centurion | Centurion | Log in 100 days in a row. | Центурион | Заходите 100 дней подряд. | 115 |

## Added in 2.0.7 (12, 590 XP; 1590 in all)

Play Console now allows up to 2000 XP per game, so the new tiers fit next to the first 20. Bulk import:
`builds/play-games-achievements-2.0.7.zip` (Achievements, Import achievements). It holds AchievementsMetadata.csv,
AchievementsLocalizations.csv (ru-RU), AchievementsIconsMappings.csv and a 512x512 icon per achievement, drawn from the
game's own pixel glyphs. Then copy the twelve `CgkI...` ids into `PLAY_GAMES_ACHIEVEMENTS`.

| Our id | Name (en) | Name (ru) | XP |
|---|---|---|---|
| checkers_rookie | Checkers Rookie | Шашист | 10 |
| checkers_captain | Checkers Captain | Капитан шашек | 25 |
| checkers_grandmaster | Checkers Grandmaster | Гроссмейстер шашек | 75 |
| daily_habit | Puzzle Habit | Привычка | 10 |
| daily_devotee | Puzzle Devotee | Верность головоломке | 25 |
| daily_legend | Puzzle Legend | Легенда головоломки | 100 |
| star_gazer | Star Gazer | Звездочёт | 15 |
| star_collector | Star Collector | Собиратель звёзд | 30 |
| star_master | Star Master | Повелитель звёзд | 75 |
| rank_gold | Gold Rank | Золотой ранг | 25 |
| rank_diamond | Diamond Rank | Алмазный ранг | 50 |
| rank_legend | Legend Rank | Легендарный ранг | 150 |

## Leaderboards (2)

| Game mode | Name (en) | Name (ru) | Score format | Ordering |
|---|---|---|---|---|
| classic | Classic 8x8 | Классика 8x8 | Numeric, no decimals | Larger is better |
| chaos | Chaos 10x10 | Хаос 10x10 | Numeric, no decimals | Larger is better |
