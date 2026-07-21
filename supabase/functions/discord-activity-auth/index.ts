import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { access_token } = await req.json();
    if (!access_token) {
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

    // 3. Deterministic secret password per Discord user
    const email = `discord_${discordId}@blockerino.app`;
    const password = `Discord_Auth_${discordId}_SecuredPass123!`;
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
      // User is already linked! Update password to ensure they can login via SDK
      userId = linkedProfile.auth_user_id;
      email = linkedProfile.email || email; // Use their real email for login
      
      await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: userMeta,
      });
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
        const { data: usersData } = await admin.auth.admin.listUsers();
        const existingUser = usersData?.users?.find(u => u.email === email);
        
        if (existingUser) {
          userId = existingUser.id;
          await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: userMeta,
          });
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

    return new Response(
      JSON.stringify({
        email,
        password,
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
