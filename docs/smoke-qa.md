# Blockerino Smoke QA

Use this checklist before a release build or after changing game-mode rules.

## Per Mode

Run this for Classic, Chaos, Daily Puzzle, Speed Game, and Move Limit.

1. Start the mode from its menu entry.
2. Place one valid piece.
3. Confirm the score increases and the hand updates.
4. Open Options, return to the game, and confirm the board state is still intact.
5. Close/reload the app, continue the saved game, and confirm score, board, hand, timer/moves, and mode are restored.
6. Force or play to game over.
7. Confirm the Game Over modal shows the correct reason and score.
8. Confirm a local high score is saved for that mode.

## Mode-Specific Checks

- Classic: extra chance can appear when no moves remain.
- Chaos: board is 10x10 and hand size is 5.
- Daily Puzzle: restarting on the same day uses the same seeded board and piece sequence.
- Speed Game: timer starts at 60 seconds, decreases, and increases after scoring/line clears.
- Move Limit: starts at 30 moves, decrements by 1 after each valid placement, ends at 0 moves, and never shows extra chance.

## Menus And Scores

1. Open Challenges.
2. Confirm Daily, Speed, Move Limit, Rescue, and Combo Trial rows are visible.
3. Confirm Rescue and Combo Trial are shown as upcoming/disabled.
4. Open High Scores.
5. Confirm Classic, Chaos, Daily, Speed, and Move Limit tabs are visible.
6. Switch each tab and confirm local best is shown.
7. Enter a nickname and confirm scores sync or queue when offline.
