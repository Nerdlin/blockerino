# Two-player smoke test

Checks that the realtime games start for both players: Tic-Tac-Toe, Chess (including a synced move), Sea Battle (both
fleets ready) and Durak (two signed-in accounts). Run it before a release, and after touching `useMiniGameRoom`, the
realtime publication or the game lobbies.

It only uses the **local** Supabase (never the live project):

```bash
npx supabase start          # once; Docker must be running
npm run e2e:two-player      # builds the web app against the local database, then plays
```

- `npm run e2e:two-player -- chess durak` runs only some scenarios.
- `npm run e2e:two-player -- --skip-build` reuses the last build in `dist-e2e/`.
- Chrome is found automatically on Windows, macOS and Linux; otherwise set `CHROME_PATH`.
- The test registers throw-away accounts in the local database only. `npx supabase db reset --local --no-seed` wipes them.

Each scenario prints `PASS` or `FAIL` with the reason (for example "the host never got a room code"), and the script exits
with a non-zero code when one fails.
