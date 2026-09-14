import { useEffect, useState } from 'react';
import { DiscordSDK } from './discordSdk';
import { supabase } from '@/constants/Supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDiscordActivityLocation, withDiscordTimeout } from '@/constants/DiscordEnvironment';

const discordClientId = process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;

let discordSdk: DiscordSDK | null = null;
if (discordClientId && typeof window !== 'undefined' && isDiscordActivityLocation(window.location.hostname, window.location.search)) {
  try {
    discordSdk = new DiscordSDK(discordClientId);
  } catch (e) {
    console.error("Failed to initialize Discord SDK:", e);
  }
}

export function useDiscordSDK() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [discordUser, setDiscordUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    async function setupDiscord() {
      const activity = typeof window !== 'undefined' && isDiscordActivityLocation(window.location.hostname, window.location.search);
      if (mounted) setIsEmbedded(activity);
      if (!discordSdk) {
        if (mounted) {
          setIsReady(true);
          if (activity) setError(new Error('Discord could not initialize. Check the Activity client ID and reopen the Activity.'));
        }
        return;
      }

      // Check if we are running in an iframe (likely Discord)
      const isIframe = isDiscordActivityLocation(window.location.hostname, window.location.search);
      if (mounted) setIsEmbedded(isIframe);
      
      if (!isIframe) {
        if (mounted) setIsReady(true);
        return;
      }
      
      try {
        await withDiscordTimeout(discordSdk.ready());
        console.log("Discord SDK is ready!");
        
        // 1. Authorize with Discord Client
        const { code } = await withDiscordTimeout(discordSdk.commands.authorize({
          client_id: discordClientId!,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify']
        }));
        
        // 2. Exchange token via Supabase Edge Function
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
        const auth = await withDiscordTimeout(discordSdk.commands.authenticate({ access_token }));
        
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
          if (mounted) setError(autoAuthErr instanceof Error ? autoAuthErr : new Error(String(autoAuthErr)));
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        console.error("Error setting up Discord SDK:", err);
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
