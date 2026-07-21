import { useEffect, useState } from 'react';
import { DiscordSDK } from './discordSdk';
import { supabase } from '@/constants/Supabase';

const discordClientId = process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID;

let discordSdk: DiscordSDK | null = null;
if (discordClientId && typeof window !== 'undefined') {
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
      // If no client ID, or not running in a browser, just proceed as normal
      if (!discordSdk) {
        if (mounted) setIsReady(true);
        return;
      }

      // Check if we are running in an iframe (likely Discord)
      const isIframe = window.self !== window.top;
      if (mounted) setIsEmbedded(isIframe);
      
      if (!isIframe) {
        if (mounted) setIsReady(true);
        return;
      }
      
      try {
        await discordSdk.ready();
        console.log("Discord SDK is ready!");
        
        // 1. Authorize with Discord Client
        const { code } = await discordSdk.commands.authorize({
          client_id: discordClientId!,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify']
        });
        
        // 2. Exchange token via Supabase Edge Function
        const { data: exchangeData, error: exchangeError } = await supabase.functions.invoke('discord-token-exchange', {
          body: { code }
        });
        
        if (exchangeError) {
          throw exchangeError;
        }
        
        const { access_token } = exchangeData;
        
        // 3. Authenticate with SDK using the obtained access token
        const auth = await discordSdk.commands.authenticate({ access_token });
        
        if (mounted) {
          setDiscordUser(auth.user);
        }

        // 4. Auto-login to Supabase using Discord identity
        try {
          const { data: authData, error: authError } = await supabase.functions.invoke('discord-activity-auth', {
            body: { access_token }
          });

          if (authError) {
            console.error("Discord→Supabase auth error:", authError);
          } else if (authData?.hashed_token) {
            // Try verifying token_hash as magiclink or email
            let { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: authData.hashed_token,
              type: 'magiclink',
            });
            if (otpError) {
              const res = await supabase.auth.verifyOtp({
                token_hash: authData.hashed_token,
                type: 'email',
              });
              otpError = res.error;
            }
            if (otpError) {
              console.error("Supabase OTP verification error:", otpError);
            } else {
              console.log("Auto-logged into Supabase via Discord!");
            }
          }
        } catch (autoAuthErr) {
          console.error("Discord auto-auth failed (non-critical):", autoAuthErr);
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

