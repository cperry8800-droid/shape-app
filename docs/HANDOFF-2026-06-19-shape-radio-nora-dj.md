# Handoff — Shape Radio + Nora avatar DJ (2026-06-19)

**Branch:** `claude/shape-radio-nora-dj` (off `origin/main` @ `12d15c27`) — **pushed**, HEAD `4cfeee3c`.
**NOT merged to main** by design: it's an isolated feature branch and the live experience is gated on owner steps (Radio.co signup + a migration + procuring a 3D model). PR-able at `github.com/cperry8800-droid/shape-app/pull/new/claude/shape-radio-nora-dj`.
**Local worktree:** `C:\Users\cperr\shape-radio-wt` (separate from the main repo at `C:\Users\cperr\shape-app`, which is on `claude/dashboard-widgets`). `node_modules` + `mobile-app/node_modules` are **junctions** into the main repo's installed deps (so builds/tests work in the worktree).

## What this branch is

The full **"Nora as an AI DJ on Shape Radio"** initiative, built through brainstorm → spec → plan → subagent-driven build. Two pieces are DONE and reviewed; the rest is designed and queued.

### ✅ DONE — Phase 1: real licensed audio radio (commits `994e0c95`..`b4010c16`)
- Spec `docs/superpowers/specs/2026-06-19-shape-radio-nora-ai-dj-design.md`; plan `docs/superpowers/plans/2026-06-19-shape-radio-phase-1-player.md`.
- `radio_station` config table + public routes `/api/radio/station` + `/api/radio/now-playing`, behind a swappable `RadioProvider` adapter (`src/lib/radio/` — `provider.ts`, `now-playing.mjs` [pure, tested], `mock.ts`, `http.ts`, `index.ts`). Default provider = `mock`.
- Web (`public/radio.html`) + mobile (`iosAppBroadsheetRadio.jsx` + `ShapeRadioLive` in `shapeBackend.js`) players stream the live URL + poll now-playing; off-air/coming-soon/retry states; pause actually stops the stream.
- Native background-audio config (iOS `Info.plist` audio mode + `RADIO-BACKGROUND-AUDIO.md`).

### ✅ DONE — Nora avatar, Phase A: real-time engine + watch preview (commits `40691bdf`..`4cfeee3c`)
- Spec `docs/superpowers/specs/2026-06-19-shape-radio-nora-avatar-dj-design.md`; plan `docs/superpowers/plans/2026-06-19-shape-radio-nora-avatar-phase-A.md`.
- Deps: `three@0.169.0` + `@pixiv/three-vrm@3.1.6` (exact-pinned; web via esm.sh import map, mobile via npm). Placeholder VRM at `public/nora/placeholder.vrm` + `mobile-app/public/nora/placeholder.vrm` (CC0 sample, ~10 MB).
- `public/newdesign/noraReactive.mjs` — pure audio-reactive driver (`computeBands` + `computeRigParams`), unit-tested (`tests/nora-reactive.test.mjs`).
- `public/newdesign/noraStage.mjs` — `NoraStage` class (Three.js + three-vrm; loads VRM, 30fps loop, reacts to an existing `AnalyserNode`, dispose/teardown).
- Watch screen behind a **manual "Watch Nora (preview)" toggle** on both web (`radio.html`, reuses the existing analyser) and mobile (`iosAppBroadsheetRadio.jsx`, `ShapeRadioLive.analyser()`); featured-image fallback (`/nora-avatar.png`) on no-WebGL/load failure.

## Verification state
- **261/261 tests pass** (`npm test`). Mobile Vite build succeeds (bundles three/three-vrm — `broadsheet` chunk ~1 MB, expected). `tsc --noEmit` clean. Web module scripts syntax-checked.
- **On-device WebGL render is NOT yet verified** (no GPU/device in the build env) — the avatar visually rendering + reacting must be confirmed on a real device/browser.
- Every task passed an independent review; the Opus final whole-branch review returned READY (Phase 1) and clean-after-fixes (Phase A). SDD trail: `.superpowers/sdd/progress.md` (Phase 1) + `.superpowers/sdd/progress-phaseA.md` (Phase A) — gitignored scratch.

## ⏭️ NEXT — not built yet
- **Nora avatar Phase B** — the `nora_sets` schedule + `/api/radio/nora-sets` + auto show/hide the watch view around set windows + an "up next" affordance (replaces the manual preview toggle). Design is in the avatar spec §6/§10.
- **Nora avatar Phase C** — swap the placeholder VRM for the **real procured Nora model**; tune the mapping to her rig.
- (Parallel, optional) the original audio "Nora DJ Sets" / narration-clip path — superseded by the visual-avatar direction but documented in the first spec.

## 🔒 Owner-gated (no code — needed for the live experience)
1. **Radio.co** — sign up, capture the stream URL + now-playing URL (Phase 1 Task 0). Then **run** `supabase-migrations/2026-06-19-radio-station.sql` and set the row: `update radio_station set provider='http', stream_url='…', now_playing_url='…' where id=1;`. Until then the radio shows "coming soon" on `mock`.
2. **Procure the rigged Nora VRM** (the avatar long pole) — decide style (stylized VRoid vs custom realistic), deliver a `.vrm` (standard humanoid + blendshapes + spring bones, ≤ ~50k tris). Drop it in for Phase C.
3. **Native build** for background audio (iOS/Android) per `RADIO-BACKGROUND-AUDIO.md`.

## Logged follow-ups (non-blocking, for a later pass)
- Web loads three/three-vrm from the **esm.sh CDN** (import maps can't carry SRI) — fine for the preview; **vendor/self-host before Phase C** when the feature goes prominent.
- Demo BPM tile / HR-sync widget is now static on a live stream (real BPM was always blocked) — cosmetic vestige to clean up.
- `NoraStage` has no `ResizeObserver` (canvas won't re-fit on container resize) — wire if needed.
- Verify the Radio.co stream sends permissive **CORS** so the Web Audio analyser (visualizer + the avatar's reactivity) works.

## How to resume
1. Work in the worktree `C:\Users\cperr\shape-radio-wt` on `claude/shape-radio-nora-dj` (node_modules already junctioned). Mobile builds/tests run there.
2. Read the two specs + two plans under `docs/superpowers/`. For a new phase: brainstorm → writing-plans → subagent-driven-development (the pattern used here).
3. Mobile build = PowerShell only: `Set-Location …\mobile-app; $env:VITE_BASE='/m/'; npm run build`, then republish `public/m` from the worktree root. (Git Bash mangles `VITE_BASE`.)
