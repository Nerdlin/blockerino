import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { access_token } = await req.json();
    if (typeof access_token !== 'string' || !access_token.trim()) {
      throw new Error('access_token is required');
    }

    // 1. Verify token and get Discord user info
    const discordRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error("Discord API error:", errText);
      throw new Error('Failed to verify Discord token');
    }

    const discordUser = await discordRes.json();
    const discordId: string = discordUser.id;
    if (typeof discordId !== 'string' || !/^\d+$/.test(discordId)) throw new Error('Invalid Discord identity');
    const basePlayerName: string =
      discordUser.global_name || discordUser.username || `Player_${discordId.slice(0, 6)}`;
    const avatarUrl: string | null = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=128`
      : null;

    // 2. Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Discord identity has been verified above. Never derive passwords from public IDs.
    let email = `discord_${discordId}@blockerino.app`;
    const password = crypto.randomUUID() + crypto.randomUUID();
    let playerName = basePlayerName;

    const userMeta = {
      player_name: playerName,
      avatar_url: avatarUrl,
      discord_id: discordId,
      discord_username: discordUser.username,
      name: playerName,
    };

    // 4. Try to find existing linked profile by discord_id
    const { data: linkedProfile } = await admin.from('profiles').select('auth_user_id, email').eq('discord_id', discordId).single();
    
    let userId: string | null = null;
    
    if (linkedProfile && linkedProfile.auth_user_id) {
      // Keep the linked account password intact; issue a one-time login token.
      userId = linkedProfile.auth_user_id;
      const { data: linkedUser, error: linkedError } = await admin.auth.admin.getUserById(userId!);
      if (linkedError || !linkedUser.user?.email) throw new Error('Linked account is unavailable');
      // A writable profile is not proof of ownership of an auth account.
      const verifiedIdentity = linkedUser.user.identities?.some((identity) =>
        identity.provider === 'discord' && (identity.id === discordId || identity.identity_data?.sub === discordId)
      );
      if (!verifiedIdentity && linkedUser.user.email !== email) throw new Error('Discord account link could not be verified');
      email = linkedUser.user.email;
      
      const { error: updateError } = await admin.auth.admin.updateUserById(userId!, {
        user_metadata: userMeta,
      });
      if (updateError) throw updateError;
    } else {
      // 4.b Fallback to old behavior: Create new dummy user
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMeta,
      });

      if (createData?.user) {
        userId = createData.user.id;
      } else if (createError) {
        // User likely exists -> find user and update password/metadata
        let existingUser = null;
        for (let page = 1; ; page++) {
          const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) throw usersError;
          existingUser = usersData.users.find(u => u.email === email) ?? null;
          if (existingUser || usersData.users.length < 1000) break;
        }
        
        if (existingUser) {
          userId = existingUser.id;
          const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: userMeta,
          });
          if (updateError) throw updateError;
        } else {
          throw createError;
        }
      }
    }

    // 5. Ensure profile exists in 'profiles' table with fallback for duplicate names
    if (userId) {
      let attempts = 0;
      while (attempts < 5) {
        const { error: profileError } = await admin.from('profiles').upsert(
          {
            auth_user_id: userId,
            player_id: userId,
            player_name: playerName,
            email,
            avatar_url: avatarUrl,
            last_login_at: new Date().toISOString(),
          },
          { onConflict: 'auth_user_id' }
        );

        if (!profileError) {
          break;
        }

        if (profileError.code === '23505' || profileError.message?.includes('profiles_player_name_key')) {
          playerName = `${basePlayerName.slice(0, 12)}_${Math.floor(1000 + Math.random() * 9000)}`;
          attempts++;
        } else {
          console.error("Profile upsert non-critical error:", profileError);
          break;
        }
      }
    }

    if (!userId) throw new Error('Unable to resolve Discord account');
    const { data: login, error: loginError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (loginError || !login?.properties?.hashed_token) throw new Error('Unable to create Discord session');
    return new Response(
      JSON.stringify({
        token_hash: login.properties.hashed_token,
        player_name: playerName,
        avatar_url: avatarUrl,
        discord_id: discordId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('discord-activity-auth error:', error);
    return new Response(
      JSON.stringify({ error: `Edge Function Auth Error: ${(error as Error).message}` }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
