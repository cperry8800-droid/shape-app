# Nora's engine

Nora plans each of her DJ sets on Shape (`src/lib/radio/noraPlanner.mjs`). This small service
**plays** them. At each set it:

1. fetches what she planned;
2. loads each song just before it plays;
3. mixes the set exactly as planned (`mixer.mjs`): beat-matched blends with a bass swap,
   crossfades, the levels and the final fade;
4. broadcasts the mix live into Shape Radio's station on radio.co;
5. hangs up at the end, so the station's AutoDJ carries on.

It reports every song it plays back to Shape. That log feeds the monthly SoundExchange report
(Admin → Nora's library → *Play reports*).

**It fails to the AutoDJ, never to silence.** If a song can't be loaded in time or the connection
drops, the engine hangs up and the station's own rotation takes over. A dropped connection is
retried on the next poll, joining the set where it is by then.

It needs only Node 20+ and ffmpeg; it has no npm dependencies.

## Setting it up

1. **Run the migrations** on Supabase, in this order:
   - `2026-10-11-radio-library.sql`
   - `2026-10-11-nora-dj-sets.sql`
   - `2026-10-11-nora-engine-log.sql`
2. **Make a token** shared by Shape and the engine. Any random string of 32 characters or more
   works, for example `openssl rand -hex 32`.
   - In Vercel, add it to the Shape project as `NORA_ENGINE_TOKEN`, then redeploy.
   - Until it is set, the engine's route answers 503 and hands out nothing.
3. **Get radio.co's live-broadcast details:** the server, port, mount, username and password it
   gives you for broadcasting live from an encoder.
   - Check your plan allows live broadcasting.
   - Check that the AutoDJ resumes when the live source disconnects.
   - Put the details together as one URL:
     ```
     icecast://USERNAME:PASSWORD@SERVER:PORT/MOUNT
     ```
   - If radio.co's server takes only the older SOURCE method, also set `NORA_LEGACY_ICECAST=1`.
4. **Run the engine** on any always-on machine that runs Docker: a small VPS, or a background
   worker on Fly.io, Railway or Render. One CPU and 1 GB of memory is plenty.
   ```
   docker build -t nora-engine services/nora-engine
   docker run -d --restart=always \
     -e SHAPE_URL=https://www.theshapecommunity.com \
     -e NORA_ENGINE_TOKEN=... \
     -e NORA_STREAM_URL='icecast://USERNAME:PASSWORD@SERVER:PORT/MOUNT' \
     nora-engine
   ```
5. **Add Nora's slots** and **confirm the licences** on Admin → Nora's library.
   - Her sets are published only after the licences are confirmed.
   - The engine is handed a set only while they stay confirmed.

**To test without going on the air,** set `NORA_STREAM_URL` to a file path such as `/tmp/set.mp3`.
The engine then records the next set to that file instead of broadcasting it.

## Settings

| Variable | |
|---|---|
| `SHAPE_URL` | Shape's address |
| `NORA_ENGINE_TOKEN` | the shared token from step 2 |
| `NORA_STREAM_URL` | the live input (`icecast://…`) or a file path |
| `NORA_BITRATE` | MP3 bitrate, default `192k` |
| `NORA_LEGACY_ICECAST` | `1` for a server that takes only the SOURCE method |
| `NORA_POLL_SEC` | how often it asks Shape, default 20 |
| `FFMPEG` | the ffmpeg binary, default `ffmpeg` |

The stream URL holds the station's password, so the engine never prints it.
