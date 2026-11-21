// Keeps the web game from running inside someone else's page (an <iframe> on an aggregator, for example). The real
// protection is the response header set at the edge (X-Frame-Options / frame-ancestors, see docs/frame-protection.md);
// GitHub Pages cannot set headers, so this inline script is the second line. It runs before the app starts.
// Allowed: not framed at all, Discord Activities (discordsays.com proxy or the frame_id/instance_id parameters Discord adds),
// and pages on our own domain. Anything else gets a short notice with a link to the official site.
export const FRAME_GUARD_SCRIPT = String.raw`(function(){try{
if(window.top===window.self)return;
var h=location.hostname,q=location.search;
var discord=/(^|\.)discordsays\.com$/i.test(h)||(/[?&]frame_id=/.test(q)&&/[?&]instance_id=/.test(q));
var ok=/^https:\/\/([a-z0-9-]+\.)*(discord\.com|discordsays\.com|aionerdlin\.me)$/i;
var ao=location.ancestorOrigins,own=false;
if(ao&&ao.length){own=true;for(var i=0;i<ao.length;i++){if(!ok.test(ao[i]))own=false;}}
if(discord||own)return;
var u='https://blockerino.aionerdlin.me/';
document.open();
document.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blockerino</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#120a1c;color:#fff;font-family:system-ui,sans-serif;text-align:center"><div style="padding:24px"><h1 style="font-size:28px;margin:0 0 12px">Blockerino: Pixel Duels</h1><p style="margin:0 0 20px;color:#a1a1aa">This game is made by Nerdlin and plays on its official site, not inside other pages.</p><a href="'+u+'" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#ff3b3b;color:#fff;text-decoration:none;font-weight:700">Play on blockerino.aionerdlin.me</a></div></body>');
document.close();
}catch(e){}})();`;
