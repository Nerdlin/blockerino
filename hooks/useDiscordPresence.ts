import { useEffect } from 'react';
import { GameModeType } from '@/hooks/useAppState';
import { updateDiscordPresence, type DiscordPresenceScreen } from '@/constants/DiscordPresence';

// Pushes the current screen/mode to Discord Rich Presence. Safe everywhere:
// outside a Discord Activity nothing is attached, so this does nothing.
export function useDiscordPresence(screen: DiscordPresenceScreen, mode?: GameModeType) {
  useEffect(() => {
    updateDiscordPresence({ screen, mode });
  }, [screen, mode]);
}
