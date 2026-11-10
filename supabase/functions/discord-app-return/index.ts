// Discord only accepts http(s) redirect URIs for our app, so the Android sign-in sends the browser here first.
// This answers with a redirect to the app (com.nerdlin.blockerino://discord-auth) carrying the same code and state.
// Chrome follows a server redirect to the app because the chain started with the player's tap on "Authorize";
// the page body is a fallback button for browsers that do not.
const APP_RETURN = 'com.nerdlin.blockerino://discord-auth';
const PASSED = ['code', 'state', 'error', 'error_description'];

Deno.serve((req) => {
  const incoming = new URL(req.url);
  const out = new URLSearchParams();
  for (const key of PASSED) {
    const value = incoming.searchParams.get(key);
    if (value !== null && value.length <= 512) out.set(key, value);
  }
  const target = `${APP_RETURN}?${out.toString()}`;
  const safeTarget = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blockerino</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#130a17;color:#fff;font-family:system-ui,sans-serif;text-align:center}a{display:inline-block;margin-top:16px;padding:14px 22px;border-radius:10px;background:#5865F2;color:#fff;text-decoration:none;font-weight:700}</style>
</head><body><div><div>Вернитесь в Blockerino / Return to Blockerino</div><a href="${safeTarget}">Открыть игру / Open the game</a></div></body></html>`;
  return new Response(body, {
    status: 302,
    headers: { Location: target, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
