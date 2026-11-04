# Nora's engine

Nora plans each of her DJ sets on Shape (`src/lib/radio/noraPlanner.mjs`). This small service
**plays** Shape's own station (`../station`) around the clock: Nora's sets at their times and,
between them, the rotation Shape plans from the same library. For each, it:

1. fetches what was planned;
2. loads each song just before it plays;
3. mixes it exactly as planned (`mixer.mjs`): beat-matched blends with a bass swap, crossfades,
   the levels and the final fade;
4. streams the mix live into the station's Icecast server, on one stream that stays open.

It asks for each next set or block two minutes before the current one ends, and checks with Shape
every minute (a licence withdrawn stops the music; a set scheduled inside a block cuts the block at
her start). It updates the station's song title at each change, and reports every song it plays
back to Shape. That log feeds the monthly SoundExchange report (Admin → Nora's library → *Play
reports*).

**It fails to the standby loop, never to silence.** If it has nothing to play, a song can't be
loaded in time or the connection drops, the engine hangs up and the station's standby loop plays
until it is back.

It needs only Node 20+ and ffmpeg; it has no npm dependencies. It runs in the station's Docker
Compose: `../station/README.md` sets it all up. (It used to play Nora's sets alone into radio.co;
radio.co was taken out on 2026-11-04.)

**To test without going on the air,** set `NORA_STREAM_URL` to a file path such as `/tmp/set.mp3`.
The engine then records what it plays to that file instead of streaming it.

## Settings

| Variable | |
|---|---|
| `SHAPE_URL` | Shape's address |
| `NORA_ENGINE_TOKEN` | the token Shape and the station share (`NORA_ENGINE_TOKEN` in Vercel) |
| `NORA_STREAM_URL` | the station's live input (`icecast://…`) or a file path |
| `NORA_BITRATE` | MP3 bitrate, default `192k` |
| `NORA_ICECAST_TLS` | `1` if the station's title updates (`/admin/metadata`) need https |
| `FFMPEG` | the ffmpeg binary, default `ffmpeg` |

The stream URL holds the station's password, so the engine never prints it.
