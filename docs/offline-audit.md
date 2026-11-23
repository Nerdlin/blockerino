# Offline audit (2026-11-23)

Phone: Samsung R5GYB0CDY4K, dev client, airplane mode, real signed-in account (an expired access token, so the auth client was refreshing).
Web: production build (`expo export -p web`) served locally, Chrome DevTools "Offline". Screenshots are in `docs/offline-audit/`.

## Findings (before the fixes)

| # | Where | What the player saw / waited | Cause | Fixed |
|---|-------|------------------------------|-------|-------|
| 1 | Main menu | No sign that the network is gone; the streak chip silently disappeared | no connectivity state at all | yes (badge + chip) |
| 2 | Records | Pixel loader, still spinning after 40 s | every request waits for `getSession`, which retries the token refresh for ~27 s (and again on the next call) | yes |
| 3 | Profile | Pixel loader, still spinning after 25 s | same, plus profile hydration | yes |
| 4 | Season pass | Empty level-1 pass shown as if real, no hint | `season_pass_sync` fails quietly | yes |
| 5 | Shop | Opens from local state with no hint; a purchase waits for the token refresh and then says "You need to be online to buy items." in English | no offline check, English string | yes |
| 6 | Duel gate | Appears at once, but English text in a Russian UI and a raw "Network request failed" | hardcoded strings | yes |
| 7 | Daily reward / streak chip | Nothing: no popup, no chip. No retry when the network came back while the app stayed open | status fetch returns null; refresh only on start, foreground and sign-in | yes |
| 8 | Startup / identity | `signedIn` unknown for ~27 s (menu chip, pass), because the identity lookup waits for the auth refresh and then for a profile query | `getAccountSession` + `profiles` query | yes |
| 9 | Background sync | Every 15 s a failing round of requests and an error in the log | `syncPendingScores` has no offline check | yes |
| 10 | Music | A pack song that was never loaded: silence for ~12 s, then the built-in songs; nothing is kept on the device | streamed every time | yes |
| 11 | Web | Reload offline: Chrome's "no internet" page | the service worker was **never registered**: the registration waited for `window.load`, but the effect runs after it fired | yes |
| 12 | Web (latent) | If the worker had been active it would have cached the server's GET answers (cache-first) and served them stale | worker intercepted every GET of every origin | yes (same origin only) |
| 13 | Chess lobby | "Start game" / "Play with a friend" show no hint offline (bots work) | no check | not changed (see below) |
| 14 | `components/OfflinePlayPrompt.tsx` | Not imported anywhere | lost; not needed: solo games start offline and results go to the queue (`constants/OfflineSync.ts`, "saved without network" on the game-over screen) | left as is |

Works without a network (verified): Classic/Chaos (start, resume, a move, settings, back to menu), achievements, trials (shown from device data), "More games" list, **chess against bots (Stockfish, bot replied to e4)**, checkers, settings.
Dev-only noise: red "Network request failed" toasts come from the auth client's own retries (`console.error`); they do not exist in release builds.

## What was done

1. **Status and messages.** `constants/OfflineMessages.ts` (which text for which screen, pure) + `constants/i18n/offline.ts` (ru/en). `components/OfflineNotice.tsx` is a short card with "Try again". The main menu shows an "Offline" badge with one line; the streak chip stays as "?" and opens the notice. Shop, Records, Profile, Season pass, the duel gate and the reward popup use it. The duel gate and the shop error are translated now.
2. **Fast detection.** `constants/ConnectivityCache.ts` (pure): the answer is cached 20 s when online and 3 s when offline, one probe is shared by simultaneous callers, subscribers are told on a change. `constants/NetworkStatus.ts`: probe = the existing Supabase check with a 4 s timeout (an HTTP error still counts as reachable), `isOnline()`, `useOnlineStatus()` (re-checks every 8 s, on app foreground and on the browser's online/offline events). Every request that fails with a network error marks the cache offline (`constants/NetworkFailure.ts`, wrapper in `constants/Supabase.tsx`). Offline, `getAccountSession()` reads the saved session without refreshing it, the identity lookup skips the profile query, and the score sync, season pass sync and shop purchase answer at once.
3. **Music.** `constants/MusicCache.ts`: a pack song that has been played is saved on the device (app: `expo-file-system`, `documents/music-cache`, written through a `.part` file; web: Cache API `blockerino-music-v1`) and plays from there without a network. Nothing is downloaded ahead. A song that is neither saved nor reachable is skipped at once and the built-in songs play (before: ~12 s of silence). Checked on the phone: two songs were saved after one online start.
4. **Daily reward.** Offline the popup says "you need a network to collect it; your day is not lost". The reward is offered as soon as the network returns, even if the app stayed open (before: only on the next start). The streak is counted by the server by UTC day, so playing offline and collecting later loses nothing as long as it is collected on a later UTC day than the last claim; no server rules or migrations were touched.
5. **Web.** `app/_layout.tsx` registers the worker right away and hands it the list of loaded files, so even the first visit is complete offline. `public/service-worker.js` (v4): only same-origin files, never the server API, `/supabase/` (Discord proxy) or `/music/`; navigation with another query opens the saved page.

## After the fixes (same devices, no network)

| Screen | Result |
|--------|--------|
| Main menu | "Offline" badge, "?" chip (`phone-after-menu.png`, `phone-after-daily-chip.png`) |
| Records | at once: notice + "Try again", no loader (`phone-after-records.png`) |
| Profile | at once: notice (`phone-after-profile.png`) |
| Season pass | notice on top of the saved view (`phone-after-pass.png`) |
| Shop | notice on top, browsing works (`phone-after-shop.png`) |
| Duel | translated text, no raw error (`phone-after-duel.png`) |
| Web reload | the game opens from the worker, the badge shows, Records shows the notice (`web-after-offline-reload.png`, `web-after-records.png`; before: `web-before-offline-reload.png`) |
| Back online (airplane off, restart) | season-pass level-up and the rest sync as before |

Tests: `ConnectivityCache.test.ts`, `OfflineMessages.test.ts`, `MusicCache.test.ts`, `AccountSessionStored.test.ts` (+ the existing suite).

## Second round (the user approved the ideas)

- **Last known data.** `constants/LastKnown.ts` keeps the last server answer on the device with its time; `ageLabel` (pure, tested) words it as "saved data from 00:21 / yesterday / 03.11". Used for the Records table and the Season pass (`phone-saved-records-offline.png`, `phone-saved-pass-offline.png`). The pass shown offline can be old, so claiming still needs the network.
- **Chess lobby.** Offline, "Start game" and "Play with a friend" are dimmed and inactive with a short notice; bots, puzzles and chess.com stay usable.

## Not done / ideas

- The profile now also keeps a saved copy (name, Classic, Chaos, Elo) shown with its age offline (`phone-saved-profile-offline.png`).
- **Queue of actions without a network: decided against, on purpose.** The daily reward is offered by itself on reconnect (the server counts the UTC day; a repeat answers "already"). A season-pass claim rolls its prize (chests) on the server and the player has to see it, so there is nothing to queue: the claim now fails at once offline with the offline text and works when the network is back (the server already answers "already" to a repeat, so no migration is needed). Gifts and purchases spend coins, so they stay online so that coins cannot be spent twice or a gift sent to a friend who has since been removed.
- Pre-downloading music (for example the chosen pack on Wi-Fi): the project cannot tell Wi-Fi from mobile data (no network-type library), so only played songs are saved.
- The auth client still retries its token refresh in the background for ~30 s after a cold offline start (only the log is noisy; screens no longer wait for it).
