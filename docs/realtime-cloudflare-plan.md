# Moving online play from Supabase Realtime to Cloudflare Durable Objects

Why: the Supabase Free plan caps Realtime at 200 concurrent connections and 100 messages/s for the whole project. A
Versus duel sends ~15–20 msg/s (hover every 100 ms per player + moves), so ~5–7 duels at once saturate it. Every
signed-in open app also holds one connection for invites (`invites:${userId}`).

Cloudflare Durable Objects (checked in the docs, Nov 2026): the Free Workers plan includes 100k requests/day and
13,000 GB-s/day for SQLite-backed DOs (~300 five-minute duels/day). Workers Paid at $5/month includes 1M requests and
400k GB-s/month; incoming WebSocket messages bill at 20:1. Use the WebSocket Hibernation API so idle rooms cost nothing.

## Today (Supabase channels to replace)

- `components/game/MultiplayerGame.tsx`: `room:${roomId}`, with broadcasts `game_state` and `hover_state` (hover is sent every 100 ms), plus presence.
- `components/MultiplayerMenu.tsx`: `room-updates-${roomId}` (lobby status).
- `components/moregames/shared.tsx`: `more-games:${gameId}:${code}` (chess, checkers, durak, sea battle, tic-tac-toe rooms).
- `constants/InviteChannel.ts` and `hooks/useInviteListener.ts`: `invites:${userId}`, which every signed-in app keeps open.
- `components/FriendsList.tsx`: `friends_changes` (postgres changes). This one can stay or turn into a poll.

## Plan

1. **Worker** `blockerino-rooms` (new folder `workers/rooms/`, wrangler, SQLite-backed DO class `Room`).
   - Route: `wss://rooms.aionerdlin.me/room/<topic>?token=<supabase access token>`.
   - The DO is keyed by topic. It accepts with `ctx.acceptWebSocket()`, which is hibernatable.
   - It relays broadcasts to the other sockets in the room and keeps presence: the join and leave list, sent to everyone.
   - Auth: verify the Supabase JWT in the Worker before the upgrade, using the project JWKS or the JWT secret as a Worker secret. Reject anonymous room joins exactly as today.
2. **Client adapter** `constants/RoomSocket.ts` with the subset of the Supabase channel API the game uses: `on('broadcast', {event}, cb)`, `on('presence', ...)`, `send({type: 'broadcast', event, payload})`, `track`, `subscribe(cb)` and `unsubscribe`. Each call site then swaps `supabase.channel(...)` for `roomChannel(...)` with minimal edits.
   - Reconnect with backoff.
   - If the connection fails, show "Сервер занят, попробуй через минуту".
3. **Traffic.**
   - Send hover only when it changes, every 250 ms instead of 100 ms.
   - Send `game_state` only on a move. It already does; keep it that way.
4. **Invites:** a per-user DO `invites:<userId>`. The app connects only while it is in the foreground (AppState); in the background, invites arrive as the existing push notifications.
5. **Rollout.** A flag in `app_config` (`realtime_backend: 'supabase' | 'cloudflare'`) so the switch can be reversed without a build.
   - Test on dev with two isolated browser contexts (the duel bot in the session scratchpad).
   - Then main and OTA.
6. **DNS:** `rooms.aionerdlin.me` as a Worker custom domain (Cloudflare zone aionerdlin.me is already on the account).

## Approved queue after this

UX audit of all menus, then 60 unique skin animations (trail, place, clear, line effect, idle shimmer, shop preview; chest skins get extra particles and a combo effect; no per-skin sounds), then long backgammon (нарды), then a free season pass, then "share a moment" GIFs.

## Status (2026-11-18)

Done on dev:
- `workers/rooms` deployed as `blockerino-rooms` at `rooms.aionerdlin.me`. It checks the Supabase ES256 token against the project JWKS, relays broadcasts, and handles presence. A heartbeat alarm drops a socket that has been silent for 45 s. Deploy with `cd workers/rooms && npx wrangler deploy`.
- `constants/RoomSocket.ts`: `realtime.channel` and `realtime.removeChannel`, with the backend picked from the app_config row `realtime` (`{"backend":"cloudflare"}`). Without that row it stays on Supabase. For testing on web, set `localStorage["blockerino.realtime"] = "cloudflare"`.
- Moved to it: the Versus duel channel and the More Games rooms. Hover is now sent every 200 ms instead of 100 ms.
- Tested on web: a tic-tac-toe room between two isolated guests (create, join, move, leave), and a Versus duel between two bots: moves both ways, opponent hand and score, and a closed tab ending as a win after ~14 s.
- The Discord URL mapping `/rooms` → `rooms.aionerdlin.me` is set (2026-11-18).

- Invites: the inbox `invites:<user id>` on the worker; only the owner may open it. Senders POST `/send/invites:<id>`, and the worker checks for an accepted `friends` row using the sender's token (tested: a stranger gets 403, a friend reaches the inbox). Phones keep the inbox open only in the foreground. A sender on Cloudflare also delivers to the Supabase inbox while players are still on the old backend. The legacy public invite channel was removed.
- Versus shows "Сервер занят" when the room server cannot be reached.

Still to do:
- Release (main + OTA), then insert the app_config row.
