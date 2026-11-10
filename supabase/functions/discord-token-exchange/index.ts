import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, redirect_uri } = await req.json();
    // The Android app signs in through the browser and must name the redirect it used; only ours is accepted.
    const allowedRedirects = ['com.nerdlin.blockerino://discord-auth'];
    if (redirect_uri !== undefined && !allowedRedirects.includes(redirect_uri)) {
      throw new Error('Unknown redirect_uri');
    }
    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('Code is required');
    }

    const clientId = Deno.env.get('DISCORD_CLIENT_ID');
    const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Missing Discord credentials in environment variables');
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        ...(redirect_uri ? { redirect_uri } : {}),
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Discord API Error:", data);
      return new Response(JSON.stringify({ error: `Discord API error: ${JSON.stringify(data)}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return new Response(JSON.stringify({ error: `Edge Function Token Exchange Error: ${error instanceof Error ? error.message : String(error)}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
