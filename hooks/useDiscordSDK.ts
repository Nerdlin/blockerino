import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { DiscordSDK } from './discordSdk';
import { supabase } from '@/constants/Supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDiscordActivityLocation, withDiscordTimeout } from '@/constants/DiscordEnvironment';
import { attachDiscordPresence } from '@/constants/DiscordPresence';
import { trackDiscordFail, trackDiscordOpen, type DiscordFailStage } from '@/constants/DiscordUsage';
import { attachDiscordParticipants, setDiscordSelfId } from '@/constants/DiscordParticipants';
import { setDiscordPresenceLocale } from '@/constants/DiscordPresence';
import { normalizeDiscordLocale } from '@/constants/DiscordLocale';

const discordClientId = process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;

let discordSdk: DiscordSDK | null = null;
function isActivityRuntime(): boolean {
  // React Native defines window too, but it does not have a browser location.
  return Platform.OS === 'web' && typeof window !== 'undefined' &&
    !!window.location && isDiscordActivityLocation(window.location.hostname, window.location.search);
}

if (discordClientId && isActivityRuntime()) {
  try {
    discordSdk = new DiscordSDK(discordClientId);
  } catch (e) {
    console.error("Failed to initialize Discord SDK:", e);
  }
}

/** Opens a page outside the game. Inside a Discord Activity the page itself may not leave Discord
 *  (Discord ends the activity), so the link goes through Discord's own "open external link" prompt. */
export async function openExternalLink(url: string): Promise<void> {
  if (discordSdk && isActivityRuntime()) {
    try {
      await discordSdk.commands.openExternalLink({ url });
    } catch (e) {
      console.error('Discord openExternalLink failed:', e);
    }
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** True once the Discord SDK is up in this page (an Activity). */
export function isDiscordSdkAvailable(): boolean {
  return !!discordSdk && isActivityRuntime();
}

/** The server this Activity was opened in; null in a DM / group chat or outside Discord. */
export function getDiscordGuildId(): string | null {
  const id = discordSdk && isActivityRuntime() ? (discordSdk as { guildId?: unknown }).guildId : null;
  return typeof id === 'string' && /^d{5,25}$/.test(id) ? id : null;
}

/** The id of this Activity instance (everyone in the same voice channel session shares it). */
export function getDiscordInstanceId(): string | null {
  const id = discordSdk && isActivityRuntime() ? (discordSdk as { instanceId?: unknown }).instanceId : null;
  return typeof id === 'string' ? id : null;
}

/** Opens Discord's own "invite friends to this Activity" dialog. Resolves false when Discord refuses it
 *  (a DM, or no permission to create invites). */
export async function openDiscordInviteDialog(): Promise<boolean> {
  if (!discordSdk || !isActivityRuntime()) return false;
  try {
    await discordSdk.commands.openInviteDialog();
    return true;
  } catch (e) {
    console.warn('Discord openInviteDialog failed:', e);
    return false;
  }
}

/** Asks the player to pick an image (Discord uploads it to its CDN) and opens the "share as a message" dialog for it.
 *  The GIF itself cannot be handed to Discord from code: Discord only takes a CDN address, so the player picks the saved file. */
export async function pickAndShareDiscordImage(): Promise<'shared' | 'failed'> {
  if (!discordSdk || !isActivityRuntime()) return 'failed';
  try {
    const { image_url } = await discordSdk.commands.initiateImageUpload();
    if (!image_url) return 'failed';
    await discordSdk.commands.openShareMomentDialog({ mediaUrl: image_url });
    return 'shared';
  } catch (e) {
    console.warn('Discord share failed:', e);
    return 'failed';
  }
}

async function readDiscordLocale(): Promise<string> {
  try {
    if (discordSdk) {
      const { locale } = await withDiscordTimeout(discordSdk.commands.userSettingsGetLocale(), 4000);
      if (locale) return locale;
    }
  } catch {
    // fall back to the page language below
  }
  const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('locale') : null;
  return fromUrl || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en';
}

export function useDiscordSDK() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [discordUser, setDiscordUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    async function setupDiscord() {
      const activity = isActivityRuntime();
      if (mounted) setIsEmbedded(activity);
      if (!discordSdk) {
        if (mounted) {
          setIsReady(true);
          if (activity) setError(new Error('Discord could not initialize. Check the Activity client ID and reopen the Activity.'));
        }
        return;
      }

      // Check if we are running in an iframe (likely Discord)
      const isIframe = activity;
      if (mounted) setIsEmbedded(isIframe);
      
      if (!isIframe) {
        if (mounted) setIsReady(true);
        return;
      }
      
      // Counted as soon as the Activity page starts, before the SDK handshake: a player who never gets in
      // (timeout, no consent) is part of the funnel too. The server id comes from the page address.
      trackDiscordOpen(discordSdk);
      let stage: DiscordFailStage = 'ready';
      try {
        await withDiscordTimeout(discordSdk.ready());
        console.log("Discord SDK is ready!");
        void attachDiscordParticipants(discordSdk);
        void readDiscordLocale().then((locale) => setDiscordPresenceLocale(normalizeDiscordLocale(locale)));
        stage = 'authorize';
        
        // 1. Authorize with Discord Client
        const { code } = await withDiscordTimeout(discordSdk.commands.authorize({
          client_id: discordClientId!,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'rpc.activities.write']
        }));
        
        // 2. Exchange token via Supabase Edge Function
        stage = 'exchange';
        const { data: exchangeData, error: exchangeError } = await withDiscordTimeout(supabase.functions.invoke('discord-token-exchange', {
          body: { code }
        }));
        
        if (exchangeError) {
          throw exchangeError;
        }
        if (exchangeData?.error) {
          throw new Error(`Exchange Data Error: ${exchangeData.error}`);
        }
        
        if (typeof exchangeData?.access_token !== 'string' || !exchangeData.access_token) throw new Error('Discord did not return an access token');
        const { access_token } = exchangeData;
        
        // 3. Authenticate with SDK using the obtained access token
        stage = 'authenticate';
        const auth = await withDiscordTimeout(discordSdk.commands.authenticate({ access_token }));
        attachDiscordPresence(discordSdk);
        setDiscordSelfId(auth.user?.id);
        
        if (mounted) {
          setDiscordUser(auth.user);
        }

        // Guaranteed fallback: save player name to AsyncStorage from Discord User info
        if (auth?.user) {
          const discordName = auth.user.global_name || auth.user.username;
          if (discordName) {
            const currentLocalName = await AsyncStorage.getItem('PLAYER_NAME');
            if (!currentLocalName || currentLocalName.startsWith('Guest')) {
              await AsyncStorage.setItem('PLAYER_NAME', discordName);
            }
          }
        }

        // 4. Auto-login to Supabase using Discord identity
        try {
          const { data: authData, error: authError } = await withDiscordTimeout(supabase.functions.invoke('discord-activity-auth', {
            body: { access_token }
          }));

          if (authError) {
            console.error("Discord→Supabase auth error:", authError);
            if (mounted) setError(authError instanceof Error ? authError : new Error(String(authError)));
          } else if (authData?.error) {
            console.error("Discord→Supabase auth returned error:", authData.error);
            if (mounted) setError(new Error(`Auth Data Error: ${authData.error}`));
          } else if (typeof authData?.token_hash === 'string' && authData.token_hash) {
            const { error: signInError } = await withDiscordTimeout(supabase.auth.verifyOtp({
              token_hash: authData.token_hash,
              type: 'magiclink',
            }));

            if (signInError) {
              console.error("Supabase Discord sign-in error:", signInError);
              if (mounted) setError(signInError instanceof Error ? signInError : new Error(String(signInError)));
            } else {
              console.log("Auto-logged into Supabase via Discord Activity successfully!");
            }
          } else if (authData?.email && authData?.password) {
            const { error: signInError } = await withDiscordTimeout(supabase.auth.signInWithPassword({
              email: authData.email,
              password: authData.password,
            }));

            if (signInError) {
              console.error("Supabase password sign-in error:", signInError);
              if (mounted) setError(signInError instanceof Error ? signInError : new Error(String(signInError)));
            } else {
              console.log("Auto-logged into Supabase via Discord Activity successfully!");
            }
          } else {
            throw new Error('Discord sign-in returned no login token. Check the deployed Activity auth function.');
          }
        } catch (autoAuthErr) {
          console.error("Discord auto-auth failed (non-critical):", autoAuthErr);
          trackDiscordFail('sign_in', discordSdk);
          if (mounted) setError(autoAuthErr instanceof Error ? autoAuthErr : new Error(String(autoAuthErr)));
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        console.error("Error setting up Discord SDK:", err);
        trackDiscordFail(stage, discordSdk);
        // It might fail if not running in Discord iframe, proceed anyway
        if (mounted) {
          setIsReady(true);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    setupDiscord();

    return () => {
      mounted = false;
    };
  }, []);

  return { discordSdk, isReady, error, isEmbedded, discordUser };
}
