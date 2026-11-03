# Shape Radio's station

Shape's own radio station. It replaces radio.co. Members hear the songs uploaded on
**Admin → Nora's library** (`/dashboard/radio`), around the clock:

- **Nora's sets** play at the times set on that page.
- **The rotation** plays between them. Shape plans it an hour at a time
  (`src/lib/radio/rotation.mjs`) under the same rules as her sets: no more than 4 songs by one
  artist and 3 from one album in any 3 hours, no song twice in 3 hours.
- **The standby loop** plays only if the music stops: the engine is restarting, Shape can't be
  reached, or nothing is licensed to play. Listeners stay connected through it and go back to the
  music as soon as it returns.

Every song played is logged for the monthly SoundExchange report (**Admin → Nora's library →
Play reports**). The same licences are needed as with radio.co: SoundExchange, ASCAP, BMI, SESAC,
GMR, and PRS and PPL for the UK. Nothing plays until they are confirmed on that page.

## What runs

| | |
|---|---|
| `icecast` | the stream server listeners connect to (`/live`), with the standby loop as its fallback |
| `standby` | the standby loop (`standby/standby.sh`) |
| `engine` | Nora's engine (`../nora-engine`) with `NORA_MODE=station`: it plays the station |
| `caddy` | HTTPS for the station's address, with a certificate it gets and renews itself |

## Setting it up

1. **A server.** Any always-on Linux machine with Docker: a VPS with 2 CPUs and 2 GB of memory is
   plenty. Pick a plan with a lot of included bandwidth: each listener uses about 86 MB an hour at
   192 kbps, so 100 people listening around the clock is about 6 TB a month.
2. **A name.** Add a DNS `A` record, for example `radio.theshapecommunity.com`, pointing at the
   server. Open ports 80 and 443.
3. **Run the migration** `supabase-migrations/2026-11-03-radio-rotation.sql` on Supabase (after the
   three in `../nora-engine/README.md`).
4. **The engine token.** If the Shape project on Vercel has no `NORA_ENGINE_TOKEN` yet, make one
   (`openssl rand -hex 32`), add it there and redeploy.
5. **On the server**, copy this folder (or clone the repository) and fill in `.env`:
   ```
   cd services/station
   cp .env.example .env
   openssl rand -hex 24     # once for ICECAST_SOURCE_PASSWORD
   openssl rand -hex 24     # once for ICECAST_ADMIN_PASSWORD
   ```
   `NORA_ENGINE_TOKEN` is the same value as in Vercel.
6. **Start it:**
   ```
   docker compose up -d --build
   ```
   Then open `https://radio.theshapecommunity.com/live`. You hear the standby loop until the
   licences are confirmed and the library has songs, then the music.

To use your own standby loop (an ident or an ambient bed you have the rights to), put the file in
`standby-audio/` and set `STANDBY_FILE=/standby/<its name>` in `.env`.

## Day to day

- `docker compose logs -f engine` shows each block and set as it plays, and anything that went
  wrong.
- `docker compose pull && docker compose up -d --build` after an update.
- Icecast's own status page is on the server only:
  `ssh -L 8000:127.0.0.1:8000 <server>`, then `http://localhost:8000/` (user `admin`, the
  `ICECAST_ADMIN_PASSWORD`).

## While radio.co is still in use

The website and app keep playing radio.co's stream until the station is switched over on Shape's
side. Until then this station can run alongside, for checking. Don't run Nora's engine for
radio.co at the same time as this one: both would play her sets and log them twice.

## Testing it here

`tests/radio-station-e2e.test.mjs` runs this config against a real Icecast with a stand-in Shape.
It needs `icecast2` and `ffmpeg` installed and skips without them.
