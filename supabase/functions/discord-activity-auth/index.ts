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

    // 3. Find or create user by synthetic email
    const email = `discord_${discordId}@blockerino.app`;
    let playerName = basePlayerName;

    const userMeta = {
      player_name: playerName,
      avatar_url: avatarUrl,
      discord_id: discordId,
      discord_username: discordUser.username,
      name: playerName,
    };

    // Try to create user in Auth
    let userId: string | null = null;
    const { data: createData, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: userMeta,
    });

    if (createData?.user) {
      userId = createData.user.id;
    } else if (createError) {
      const msg = (createError.message || '').toLowerCase();
      if (!msg.includes('already') && !msg.includes('exists') && !msg.includes('duplicate')) {
        throw createError;
      }
    }

    // 4. Generate magic link token for login
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError) {
      throw linkError;
    }

    if (linkData?.user) {
      userId = linkData.user.id;
      // Keep user metadata updated with latest Discord info
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: userMeta,
      });
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

        // Handle unique constraint failure for player_name
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
        hashed_token: linkData.properties.hashed_token,
        email,
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
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
