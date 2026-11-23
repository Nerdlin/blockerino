import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { GameModeType } from '@/hooks/useAppState';
import { updateDiscordPresence, type DiscordPresenceScreen } from '@/constants/DiscordPresence';
import { dailyRewardStatusAtom } from '@/constants/DailyReward';

// Pushes the current screen/mode to Discord Rich Presence. Safe everywhere:
// outside a Discord Activity nothing is attached, so this does nothing.
export function useDiscordPresence(screen: DiscordPresenceScreen, mode?: GameModeType) {
  const streakDays = useAtomValue(dailyRewardStatusAtom)?.streak;
  useEffect(() => {
    updateDiscordPresence({ screen, mode, streakDays: streakDays && streakDays > 0 ? streakDays : undefined });
  }, [screen, mode, streakDays]);
}
