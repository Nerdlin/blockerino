# Discord Activity: Rich Presence art

The pictures in `assets/` are the Rich Presence art assets (1024x1024 PNG, pixel style). The file name is the asset key
that `DISCORD_PRESENCE_ASSETS` in `constants/DiscordPresence.ts` points at.

Upload them by hand: Discord Developer Portal -> the application -> Rich Presence -> Art Assets -> Add Image(s).
Keep the keys equal to the file names (without `.png`):

| key          | used for                      |
|--------------|-------------------------------|
| `classic`    | Classic 8x8                   |
| `chaos`      | Chaos 10x10                   |
| `duel`       | Versus (lobby and match)      |
| `daily`      | Daily Puzzle and Levels       |
| `speed`      | Speed Game                    |
| `move_limit` | Move Limit                    |
| `rescue`     | Rescue                        |
| `combo`      | Combo Trial                   |
| `icon`       | already uploaded (the logo)   |

Until a key exists in the portal Discord just shows no picture for it (no error).
`make_assets.py` redraws the pictures (`python docs/discord/make_assets.py`, needs Pillow).

## Usage statistics from the Activity

Events (table `events`, only with "Help improve the game" on, which is the default):

- `discord_open` - once per page load, sent before the SDK handshake (so failed starts count too). Props: surface, platform, server id (no account).
- `discord_fail` - the Activity start stopped at `stage` (ready, authorize, exchange, authenticate, sign_in).
- `discord_session` - head count in the Activity (`discord_players`) and surface; sent at the start and when the count changes.
- every other event from the Activity carries `props.via = 'discord'`, so the funnel is
  `discord_open` -> `game_start` (via discord) -> `game_over` (via discord).

```sql
select date(created_at) d,
       count(distinct device_id) filter (where name = 'discord_open')                    opened,
       count(distinct device_id) filter (where name = 'game_start' and props->>'via' = 'discord') started,
       count(distinct device_id) filter (where name = 'game_over'  and props->>'via' = 'discord') finished
from events where created_at > now() - interval '14 days' group by 1 order by 1;
```
