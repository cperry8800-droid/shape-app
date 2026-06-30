# Shape Radio — Nora real-time avatar DJ (design)

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Scope:** Add a **visual, real-time, audio-reactive 3D avatar of Nora** that visibly DJs
**scheduled ~1-hour "Nora sets"** on Shape Radio. The avatar is a rigged 3D model rendered
**client-side** (web + the Capacitor mobile WebView from one codebase), animated live by
analyzing the **shared Phase 1 audio stream** on each device. This is its own feature,
larger than and separate from the earlier audio-narration "Phase 2"; it builds on the
Phase 1 radio foundation (`radio_station`, the `RadioProvider` adapter, the players).

## 1. Goal & principles

- **Watch Nora DJ.** During a scheduled set, you open Shape Radio and *see* Nora — a 3D
  character — DJing at the decks, moving to the music, for ~an hour. Like tuning into a DJ
  livestream where Nora is the visible host.
- **Client-side, no server video.** Because Shape Radio is ONE shared broadcast, the rig
  renders on each device and reacts to that device's own playback of the shared stream
  (Web Audio analysis → motion). No server-side video rendering or streaming to build.
- **One renderer, two surfaces.** A single web module (Three.js/WebGL) runs in both the
  website Radio page and the Capacitor mobile WebView.
- **An enhancement layer, never a dependency.** The audio radio (Phase 1) always works
  underneath; the avatar degrades to a featured still image wherever WebGL can't run.
- **The model is swappable config.** The runtime is style-agnostic; the VRM model is
  fetched from config so it can be replaced/upgraded without a redeploy.
- **Reuse Phase 1.** The same audio stream + player the Phase 1 work built is the audio
  source the rig reacts to; the schedule/config follow the Phase 1 `radio_station` RLS
  pattern (public-read, service-role-write).

## 2. Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Avatar dimensionality | **3D** (not 2D/Live2D) |
| Model format | **VRM** (VTuber standard — glTF humanoid + blendshapes + spring bones) |
| Renderer | **Three.js + `@pixiv/three-vrm`**, client-side WebGL |
| Animation source | **Audio-reactive** off the shared stream (Web Audio `AnalyserNode`), client-side |
| Liveness | **Real-time reactive** (motion driven live by the music) — not pre-rendered video |
| Station model | **One shared broadcast** — same Nora to everyone; not per-listener personalized |
| When Nora shows | **Scheduled ~1-hour sets** (admin schedule), not always-on |
| Degradation | **Featured still image + audio** where WebGL/data-saver can't run the rig |
| Build order | Engine-on-placeholder → schedule/integration → drop in the real model |

**Open owner decision (not a blocker — the engine is style-agnostic):** the VRM model
**style** is a budget fork — **stylized** (build it yourself in VRoid Studio → VRM, fast/
cheap, anime-styled) vs **custom realistic** (commission a sculpt that matches Nora's
existing concierge render → VRM, weeks + cost). Recommendation: target VRM either way;
develop against a free placeholder VRM; pick the style for the procured model separately.

## 3. Architecture — three subsystems

During a live set, every listener's Radio screen renders the **same rigged Nora VRM
client-side**, animated each frame from a live analysis of that device's playback of the
**shared Phase 1 stream**. No server video.

- **#1 Avatar asset (owner-procured — the long pole):** a rigged Nora **VRM** + its files.
- **#2 Real-time runtime (build):** `NoraStage` — Three.js scene + `@pixiv/three-vrm`
  loader + render loop + a pure **audio-reactive driver** mapping sound → rig parameters.
- **#3 Radio integration (build):** a `nora_sets` schedule + `/api/radio/nora-sets` + a
  `radio_avatar` model config + the full-screen **watch view** on the Radio screen (web +
  mobile), with set-window entry/exit.

## 4. Subsystem #1 — the VRM avatar asset (owner)

A rigged humanoid model in **VRM** (a glTF/GLB humanoid with the standard bone map,
facial **blendshapes** for blink/expression/mouth, and **spring bones** for hair/clothing
physics). VRM is chosen because it's riggable, has a mature web runtime (`@pixiv/three-vrm`),
and standardizes bone/expression names so the runtime never hard-codes a specific model.

**Deliverable to the artist/tool:** a VRM with the standard humanoid skeleton + the
standard blendshape set (blink L/R, joy/neutral/etc., mouth A/I/U/E/O) + spring bones for
hair/clothing, posed T-pose, framed bust-to-decks, **≤ ~50k triangles** and reasonable
texture sizes for mobile WebGL. Delivered as a single `.vrm` file.

The **style** (stylized vs realistic) is the open owner decision above; the runtime is
identical regardless.

## 5. Subsystem #2 — the real-time runtime (build)

A `NoraStage` web module (plain JS/TS, framework-agnostic so both surfaces use it):

- **Scene:** Three.js renderer + camera framed on the decks + simple stage lighting; loads
  the VRM (URL from `radio_avatar` config) via `@pixiv/three-vrm`.
- **Render loop:** capped at **30 fps**; updates VRM (spring bones, blendshapes) per frame;
  **mounts only while a set is live + the tab/app is foregrounded**, tears down on set
  end / background to free GPU + battery.
- **Audio-reactive driver — the pure, testable core:** a function
  `computeRigParams(audioFeatures) → rigParams`, where `audioFeatures` comes from a Web
  Audio `AnalyserNode` on the stream (low/mid/high band energy, overall loudness, a beat
  estimate). Mapping: low-band/beat → head bob + spine sway + drop emphasis; mid/high →
  arm + hand-on-decks motion + bounce; loudness → expression intensity; a periodic timer →
  blinks; (reserved) vocal band → mouth blendshape (for a future "Nora talks" layer).
  Spring bones add hair/clothing follow-through automatically.
- **The binding** (apply `rigParams` to the VRM bones/blendshapes; create the
  `AnalyserNode` off the shared `<audio>` element) is the thin untestable shell, verified
  on-device.

`computeRigParams` is pure and unit-tested; the Three.js/VRM/Web-Audio shell is verified by
on-device check (web + mobile).

## 6. Subsystem #3 — radio integration (build)

- **`nora_sets`** (admin-managed, public-read; service-role-write — Phase 1 pattern):
  `id`, `title` ("The Nora Show"), `scheduled_start`, `duration_min` (~60), `status`,
  optional `recurrence`.
- **`radio_avatar`** config (single row, public-read): `model_url` (the VRM in a public
  bucket) + `version`, so the rig is swappable without a redeploy. Until a real model
  exists, points at the placeholder VRM.
- **`GET /api/radio/nora-sets`** (public): the server resolves the schedule and returns
  `{ live: <set|null>, next: <set|null> }` so clients don't each reimplement "is a set live
  now."
- **Watch view (web `radio.html` + the mobile Radio screen, one `NoraStage`):**
  - **During a live set:** swap the audio-only player for a **full-bleed Nora stage** (the
    rig reacting to the music) + the now-playing line + a **"● LIVE · The Nora Show"** badge
    + the existing play/volume controls.
  - **Outside a set:** normal audio radio + an **"Up next: Nora live · 7:00"** affordance
    that, when the set starts, offers **"Nora's on — watch live →."**
  - **Sync is free:** each client reacts to the same shared stream locally (beat-reactive,
    not frame-locked broadcast sync — per-client latency is irrelevant).

## 7. Data flow

**Authoring (admin):** an admin schedules a set (start, duration, title) → `nora_sets`;
uploads/points the `radio_avatar` config at the current VRM.

**Listening (client):** the Radio screen polls `/api/radio/nora-sets`. When a set is live,
it fetches the `radio_avatar` model URL, mounts `NoraStage` over the playing Phase 1 stream,
attaches an `AnalyserNode` to the stream audio, and runs the render loop
(`audioFeatures → computeRigParams → apply to VRM`) at 30 fps until the set ends or the app
backgrounds, then tears down. Outside a set, it shows the audio player + the "up next"
affordance.

## 8. Error handling / graceful degradation

The rig is an enhancement; the Phase 1 audio radio always works underneath.

- **No WebGL / low-end / data-saver** → **Featured-image** fallback (Nora portrait + audio).
- **VRM fails to load** → featured-image fallback + a retry.
- **No set live / `/api/radio/nora-sets` unreachable** → normal audio radio (no watch view).
- **Stream off-air** (Phase 1) → rig idles / featured image; no fake reactivity.
- **Phase 1 not wired** (Radio.co not set up) → "coming soon," like the rest of radio.
- **Perf guard** → 30 fps cap; teardown on set-end/background; mobile-light model.

## 9. Testing

- **Unit (`tests/*.mjs`):** `computeRigParams(audioFeatures)` (the audio-reactive mapping)
  and the **"is a set live now"** schedule resolver — both pure.
- **Integration:** `/api/radio/nora-sets` + the config (curl/preview).
- **On-device:** the Three.js/VRM rendering — loads, animates, reacts to audio, tears down
  cleanly — checked on web + a mobile build (WebGL can't be unit-tested).

## 10. Phased rollout (within this project)

- **Phase A — Engine on a placeholder VRM:** `NoraStage` + the audio-reactive driver + the
  watch screen, reacting to any audio, using a free placeholder VRM. The bulk of the build,
  doable now (no owner dependency).
- **Phase B — Schedule + integration:** `nora_sets` + `radio_avatar` config +
  `/api/radio/nora-sets` + the live/upcoming watch logic, wired to the Phase 1 stream.
- **Phase C — Real Nora model:** swap the placeholder VRM for the procured one, tune the
  mapping to her rig, polish.
- Full live experience is gated on **Phase 1 audio going live** (Radio.co).

## 11. Dependencies & risks

- **The rigged Nora VRM (long pole)** — owner-procured; the engine runs on a placeholder
  until it lands.
- **Phase 1 audio live** (Radio.co) — the rig reacts to that stream.
- **Mobile WebGL performance** — mitigated by a mobile-light model, the 30 fps cap, teardown
  on background, and the featured-image fallback for devices that can't.
- **New deps** — Three.js + `@pixiv/three-vrm` (web include + mobile-app npm); bundle size to
  watch (load the stage module only when a set is live).
- **Model realism vs Nora's render** — the stylized-vs-custom style fork is a budget call;
  the engine is unaffected.
- **VRM/three-vrm version drift** — pin versions; the loader is isolated in `NoraStage`.

## 12. Out of scope (future layers)

- **Nora talking / lip-sync** during sets — the runtime reserves a mouth-blendshape hook;
  the TTS-driven speech layer is future.
- **Per-listener personalization** — it's a shared broadcast.
- **Audio "DJ Sets" programming** (curated track blocks + Nora voice-tracks — the original
  Phase 3) — parallel; can layer onto this.
- **Real-time AI *video* generation** of the avatar — rejected in favor of a rigged model.
- **Live viewer count / on-screen reactions** — nice-to-have follow-up.

## 13. External decisions required (owner, not engineering)

1. **Procure the rigged Nora VRM** — decide the **style** (stylized VRoid build vs
   commissioned realistic sculpt) and have it delivered as a `.vrm` (standard humanoid +
   blendshapes + spring bones, ≤ ~50k tris).
2. **Phase 1 live** — Radio.co set up + the station wired (prerequisite for the full live
   experience).
3. **SDK licensing** — confirm `@pixiv/three-vrm` (MIT) + Three.js (MIT) suffice; no
   paid avatar-SDK license is needed on the 3D/VRM path.
