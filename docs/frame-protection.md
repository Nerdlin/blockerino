# Framing protection (web build)

Why: aggregators such as jungleyard.com embed the game in an `<iframe>` and present it as theirs.

Two layers:

1. **Edge headers (the real protection).** The site is GitHub Pages behind Cloudflare, and Pages cannot set headers, so the headers belong in a Cloudflare *Response Header Transform Rule* (Rules > Transform Rules > Modify Response Header) for hostname `blockerino.aionerdlin.me`:
   - `Content-Security-Policy: frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com`
   - `X-Frame-Options` is left off on purpose: it cannot list Discord, and modern browsers use `frame-ancestors` when both are present. If you want it for old browsers, it would break the Discord Activity.
2. **Inline script (second line).** `constants/FrameGuard.ts` is injected at the top of `<head>` by `app/+html.tsx`. If the page is framed by anything other than Discord or our own domain it replaces itself with a notice and a link to the official site. A page that fakes the Discord URL parameters can get past it, which is why the header is the main defence. Tests: `constants/FrameGuard.test.ts`.

Check after the rule is live: `curl -sI https://blockerino.aionerdlin.me | grep -i content-security-policy`, then open https://www.jungleyard.com/games/blockerino and the game must not load.
