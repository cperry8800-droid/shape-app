# Nora's Booth — prototype

Nora DJing in Club Shape: a three.js scene with two media players and a mixer (modelled on the
CDJ-3000 / DJM-A9 layout, no trademarks on screen), the Club Shape venue, a crowd built from
Nora's own VRM, a camera director and a beat-matched two-deck mix.

**The booth's runtime modules now live in [`public/newdesign/booth/`](../../public/newdesign/booth/)**,
where the app's Radio screen and the website's Radio page both load them (Phase 1 of
[`docs/REVIEW-2026-09-29-nora-dj.md`](../../docs/REVIEW-2026-09-29-nora-dj.md)). This folder keeps
the preview page (`src/main.mjs`), the bake-time tools (the crowd bake, the decimator, the screen
artwork generator), the stand-alone test pages and the Chromium harnesses, all built against those
modules. The module rules (world frame, gear frame, brand rule, no `Math.random` / `Date.now` in
pure modules) are in [`CONTRACT.md`](CONTRACT.md).

Live preview (private artifact): https://claude.ai/artifact/RUCmUSmsu4W68dqzneoUqy

## Layout

| Path | What it is |
|---|---|
| `src/main.mjs` | The preview page: renderer, post (the cinematic chain on high, bloom alone on low), camera director, HUD, mix loop. Built to `pub/booth.js`. |
| `../../public/newdesign/booth/` | The runtime modules, shared with the app and the website: the gear (`cdj3000`, `djmMixer`), Club Shape (`club`, `clubVenue`, `arenaStage`, `crowdAvatars`, `palmGeometry`, `lightBake`, `clubShapeMask`, `flashGate`), Nora (`noraPerformer`, `noraDirector`, `noraMix`), the audio (`deckAudio`, `trackAnalysis`, `tempoBridge`), the desktop `cinematic` tier and the host both pages mount (`noraBooth`). |
| `src/wordmarkGlyphs.mjs`, `src/screenArt.mjs`, `screen-mask.mjs` | The stage screen's artwork generator: the Shape mark's two triangles over CLUB SHAPE, from strokes fitted to the brand wordmark. `screen-mask.mjs` writes the result to `public/newdesign/booth/clubShapeMask.mjs`. |
| `src/crowd-bake.mjs` | Bakes the crowd figures from the VRM (CPU skinning + QEM decimation) into `crowd.bin.txt`. |
| `src/meshDecimate.mjs` | Quadric-error mesh decimation used by the bake (tested in `test/meshDecimate.test.mjs`). |
| `src/*-test.mjs`, `dist/*.html` | Stand-alone test pages for each module (gear, mixer, club, venue, crowd, audio). |
| `test/*.test.mjs` | The two node tests that cover this folder's own tools (the decimator, the screen artwork). The runtime modules' tests are in the root suite as `tests/booth-*.test.mjs`, so CI runs them. |
| `*.cjs` | Headless Chromium harnesses (screenshots, motion sampling, draw calls, the crowd bake). |
| `pub/index.html` | The published page's HTML. |

`src/deckAudio.before-buffers.mjs` is kept on purpose: `buffer-deck-test.mjs` checks the current
deck renders bit-identically to it on the synthesized path.

## Setup

```bash
cd prototypes/nora-booth
npm ci                                   # three 0.185.1, @pixiv/three-vrm 3.5.5, esbuild, playwright-core
cp ../../public/nora/placeholder.vrm dist/nora.vrm
node --test test/*.test.mjs              # 7 tests here; the other 69 run in the root suite (tests/booth-*.test.mjs)
```

## Build

```bash
# ⚠ NODE_PATH: the runtime modules live in public/newdesign/booth/, outside this folder, so their
# bare `three` imports only resolve against this folder's node_modules when esbuild is told to look there.
# dev bundle (loads dist/nora.vrm via ?vrm=nora.vrm) and the published, minified bundle
export NODE_PATH=node_modules
npx esbuild src/main.mjs --bundle --format=esm --target=es2020 --outfile=dist/booth.js
npx esbuild src/main.mjs --bundle --minify --format=esm --target=es2020 --outfile=pub/booth.js

# the stage screen's artwork (the mark over CLUB SHAPE) onto the LED dots; the optional argument
# writes a preview PNG. test/screenArt.test.mjs fails if the committed mask is out of date.
node screen-mask.mjs /tmp/screen-preview.png

# the VRM, base64'd (the artifact host will not serve .vrm)
base64 -w0 dist/nora.vrm > pub/nora.vrm.txt

# the crowd figures (needs a static server on dist/)
npx esbuild src/crowd-bake.mjs --bundle --format=esm --target=es2020 --outfile=dist/crowd-bake.js
python3 -m http.server 8811 -d dist &
node crowd-bake.cjs http://127.0.0.1:8811/crowd-bake.html pub/crowd.bin.txt
cp pub/crowd.bin.txt dist/           # the dev page loads it from beside booth.js
# the app and the website serve the same pack; re-copy both after a re-bake
cp pub/crowd.bin.txt ../../public/nora/crowd.bin.txt
cp pub/crowd.bin.txt ../../mobile-app/public/nora/crowd.bin.txt
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

- `pub/index.html` is a fragment with no `<head>`: the artifact host wraps it and adds the viewport
  meta. Served raw, a phone-sized page lays out at 980 px, so `phone-run.cjs` must load a copy
  wrapped in `<!doctype html>…<meta name="viewport" content="width=device-width,initial-scale=1">`.

- Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in the cloud container;
  every harness takes `CHROME_PATH=<binary>` to run elsewhere.
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
