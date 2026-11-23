import { useEffect, useState } from 'react';
import { getOtherParticipants, subscribeParticipants, type DiscordParticipant } from '@/constants/DiscordParticipants';

/** The other people in this Discord Activity right now (empty outside Discord), kept up to date. */
export function useDiscordParticipants(): DiscordParticipant[] {
  const [people, setPeople] = useState<DiscordParticipant[]>(() => getOtherParticipants());
  useEffect(() => {
    const refresh = () => setPeople(getOtherParticipants());
    refresh();
    return subscribeParticipants(refresh);
  }, []);
  return people;
}
