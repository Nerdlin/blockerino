import { useEffect } from 'react';
import { GameModeType } from '@/hooks/useAppState';
import { isDiscordActivityRuntime } from '@/constants/DiscordEnvironment';
import { scoreMilestone, shouldUpdateEnd, updateDiscordPresence } from '@/constants/DiscordPresence';

const POLL_MS = 3000;

interface SharedNumber {
  value: number;
}

// The live line of Rich Presence while a single-player game runs ("Classic 8x8 / 1,240 points") and, in the Speed Game,
// the countdown to the end of the timer. The score is read every few seconds but sent only when it crosses a milestone,
// the countdown only when it drifted (the timer gains seconds for every line). Does nothing outside a Discord Activity.
export function useDiscordGamePresence(gameMode: GameModeType, score: SharedNumber, timeRemaining: SharedNumber) {
  useEffect(() => {
    if (!isDiscordActivityRuntime()) return;
    let sentMilestone = 0;
    let sentEnd: number | undefined;
    const tick = () => {
      const current = Math.floor(score.value);
      const milestone = scoreMilestone(current);
      let endsAt = sentEnd;
      if (gameMode === GameModeType.TimeAttack && timeRemaining.value > 0) {
        const projected = Date.now() + timeRemaining.value * 1000;
        if (shouldUpdateEnd(sentEnd, projected)) endsAt = projected;
      }
      if (milestone === sentMilestone && endsAt === sentEnd) return;
      sentMilestone = milestone;
      sentEnd = endsAt;
      updateDiscordPresence({ screen: 'singleplayer', mode: gameMode, score: milestone > 0 ? current : undefined, endsAt });
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [gameMode, score, timeRemaining]);
}
