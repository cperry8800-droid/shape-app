# Nora's Booth — prototype

Nora DJing in Club Shape: a three.js scene with two media players and a mixer (modelled on the
CDJ-3000 / DJM-A9 layout, no trademarks on screen), the Club Shape venue, a crowd built from
Nora's own VRM, a camera director and a beat-matched two-deck mix.

**This is a prototype, not app code.** Nothing here is imported by the app or the website. The
plan for moving it into `public/newdesign/` and the app is in
[`docs/REVIEW-2026-09-29-nora-dj.md`](../../docs/REVIEW-2026-09-29-nora-dj.md) (§ Phase 1). The
module rules (world frame, gear frame, brand rule, no `Math.random` / `Date.now` in pure modules)
are in [`CONTRACT.md`](CONTRACT.md). Two known integration items are in
[`INTEGRATION-NOTES.md`](INTEGRATION-NOTES.md).

Live preview (private artifact): https://claude.ai/artifact/RUCmUSmsu4W68dqzneoUqy

## Layout

| Path | What it is |
|---|---|
| `src/main.mjs` | The booth page: renderer, post (bloom), camera director, HUD, mix loop. Built to `pub/booth.js`. |
| `src/noraPerformer.mjs` | Nora's body: springs for hands, groove, dip, sway, head; the skin-shader ceiling. |
| `src/noraDirector.mjs` | Camera shots (panoramic, decks, mixer, face, shoulder, behind Nora, the drone glide…) and cut timing. |
| `src/noraMix.mjs` | Pure mix planner: when to cue, blend and swap decks on bar boundaries. |
| `src/deckAudio.mjs` | Two decks on Web Audio: synthesized example tracks, or real buffers. |
| `src/trackAnalysis.mjs` | Tempo / beat grid / waveform from a decoded buffer. |
| `src/cdj3000.mjs`, `src/djmMixer.mjs` | The gear (real dimensions, instanced LEDs, screen UI). |
| `src/club.mjs`, `src/clubVenue.mjs` | Club Shape: venue, private balcony boxes, glass balcony fronts, stage lights, lasers and blinders, the crowd. |
| `src/arenaStage.mjs` | The arena main stage: a floor-to-ceiling LED wall (shader content), tiered wings with LED risers, the ▸ ◂ mark as uplit sculptures, a runway and B-stage, a truss rig with spots, moving-head beams and line arrays. |
| `src/lightBake.mjs` | The load-time light bake: direct light with shadows, AO and one bounce into vertex colours and the floor texture. |
| `src/palmGeometry.mjs` | The 3D palms (trunk and fronds), uplit gold. |
| `src/crowdAvatars.mjs` | Instanced crowd renderer (shader arm raise, per-person top/bottoms/shoe/skin/hair colours, eyes drawn in the shader, near/far/tiny/seated LODs). |
| `src/crowd-bake.mjs` | Bakes the crowd figures from the VRM (CPU skinning + QEM decimation) into `crowd.bin.txt`. |
| `src/meshDecimate.mjs` | Quadric-error mesh decimation used by the bake (tested in `test/meshDecimate.test.mjs`). |
| `src/radioTempo.mjs`, `src/tempoBridge.mjs` | The app's tempo detector and its bridge. |
| `src/*-test.mjs`, `dist/*.html` | Stand-alone test pages for each module (gear, mixer, club, venue, crowd, audio). |
| `test/*.test.mjs` | Node tests (mix planner, deck audio, track analysis, decimation, the light bake, the arena stage). |
| `*.cjs` | Headless Chromium harnesses (screenshots, motion sampling, draw calls, the crowd bake). |
| `pub/index.html` | The published page's HTML. |

`src/deckAudio.before-buffers.mjs` is kept on purpose: `buffer-deck-test.mjs` checks the current
deck renders bit-identically to it on the synthesized path.

## Setup

```bash
cd prototypes/nora-booth
npm ci                                   # three 0.185.1, @pixiv/three-vrm 3.5.5, esbuild, playwright-core
cp ../../public/nora/placeholder.vrm dist/nora.vrm
node --test test/*.test.mjs              # 61 tests  (⚠ `node --test test/` fails: it treats the dir as a module)
```

## Build

```bash
# dev bundle (loads dist/nora.vrm via ?vrm=nora.vrm) and the published, minified bundle
npx esbuild src/main.mjs --bundle --format=esm --target=es2020 --outfile=dist/booth.js
npx esbuild src/main.mjs --bundle --minify --format=esm --target=es2020 --outfile=pub/booth.js

# the Shape logo on the stage screen: public/SHAPE-logo-teal-white.png sampled onto the LED dots
node logo-mask.cjs ../../public/SHAPE-logo-teal-white.png src/shapeLogoMask.mjs 168

# the VRM, base64'd (the artifact host will not serve .vrm)
base64 -w0 dist/nora.vrm > pub/nora.vrm.txt

# the crowd figures (needs a static server on dist/)
npx esbuild src/crowd-bake.mjs --bundle --format=esm --target=es2020 --outfile=dist/crowd-bake.js
python3 -m http.server 8811 -d dist &
node crowd-bake.cjs http://127.0.0.1:8811/crowd-bake.html pub/crowd.bin.txt
cp pub/crowd.bin.txt dist/           # the dev page loads it from beside booth.js
```

The crowd bake (v2) outputs about 110 KB (≈146 KB as base64): body LODs near 2,349 tris, far 700,
tiny 300 and a seated figure 360; three hair lengths per LOD; measured face data for the shader eyes.
`?diag=1` on the bake page prints a per-bone diagnostic instead of baking (`node bake-diag.cjs <url> <out.json>`).

Stand-in audio for station-mode tests only (never published):
`mkdir -p fixture-site/tracks && node mkfix.cjs` writes four 60 s loops at known tempos.

## Run and check

```bash
python3 -m http.server 8813 -d pub &      # the published page: booth.js + nora.vrm.txt + crowd.bin.txt
node shot3.cjs "http://127.0.0.1:8813/index.html" /tmp/shot 1280 720 12000 wide,decks,face
node shot4.cjs "http://127.0.0.1:8811/index.html?vrm=nora.vrm&autostart=1"   # a full mix, screenshot per phase
node motion-sample.cjs "<url>" 400        # Nora's peak hand speed / acceleration
node glinfo.cjs "<url>" 1280 720 high     # draw calls and triangles per frame
./measure-all.sh http://127.0.0.1:8813 /tmp/m   # the whole before/after panel into one folder
node phone-run.cjs "<url>" /tmp/phone.png # 390 px layout; do NOT pass &autostart=1 (it times out)
```

- Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the cloud container.
  It renders with SwiftShader at 1–3 fps, so every check here is **headless and software-rendered**;
  none of it says anything about a real phone's frame rate.
- Read pixels from the screenshot PNG. The canvas has no `preserveDrawingBuffer`, so a canvas
  read-back returns zeros.
- The owned Higgsfield tracks live on `d8j0ntlcm91z4.cloudfront.net`, which the web container's
  network policy blocks. The preview plays tracks synthesized in the browser and says so. Allowing
  that host in the environment's network settings is what lets the real tracks in.

## Publish

The preview artifact is `https://claude.ai/artifact/RUCmUSmsu4W68dqzneoUqy`. A new session must
`read` it before publishing to it. Publish `pub/index.html` with `files`
`{ "booth.js": "pub/booth.js", "nora.vrm.txt": "pub/nora.vrm.txt", "crowd.bin.txt": "pub/crowd.bin.txt" }`.

## Rules that bind every change

- No "Pioneer", "CDJ", "DJM" or "rekordbox" text on the gear or screens.
- The page is labelled a preview. The tempo is measured or reads "—". No listener counts.
- No `Math.random()` / `Date.now()` in the pure modules (seeded PRNG; the caller passes `t`).
- Stage flashes (blinders) never exceed once a beat, under 3 a second; reduced motion holds them steady.
- The private boxes are scenery: no booking, prices or availability on screen until a real product exists.
