# Shape Radio — Nora as AI DJ (design)

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Scope:** Turn Shape Radio from an illustrative UI into a **real, licensed, always-on
music station** that Shape controls, with **Nora as the on-air host** — light presence
through the day plus scheduled, appointment-style **"Nora DJ Sets"**. Music + broadcast +
royalties are handled by a licensed **radio-as-a-service provider**; Shape builds the
Nora-authoring layer and the in-app player.

## 1. Goal & principles

- **Make Shape Radio real.** Today it is a visual shell — the mobile screen is a demo
  carousel with no audio (`iosAppBroadsheetRadio.jsx`), and `public/radio.html` plays free
  SoundHelix demo MP3s behind a "swap with licensed URLs" comment. This builds an actual
  licensed station you can listen to.
- **Nora is the station's voice.** Baseline = music + occasional Nora station IDs/hype. At
  scheduled times, a **Nora DJ Set**: a curated block of tracks with Nora's pre-rendered
  talk breaks woven between them — appointment listening that *feels* live to everyone
  tuned in.
- **One shared broadcast.** Everyone hears the same stream at the same time, like an FM
  station. Nora's hosting is station-wide, not personalized per listener (a single broadcast
  is one-to-many).
- **Reuse what exists.** Nora's voice is already production-ready — `/api/ai/speak`
  (OpenAI TTS, `synthesizeSpeech` in `src/lib/ai.ts`) returns an MP3 spoken verbatim; the
  clients already play it via `new Audio(blob)` (`ShapeVoice.speak`). The narration layer
  reuses this; no new voice stack.
- **Isolate the vendor.** Everything Shape builds codes against a thin `RadioProvider`
  adapter, so the provider is swappable and the design degrades gracefully if the provider's
  API is limited.
- **Degrade, never break.** Every failure (stream down, metadata missing, TTS or provider
  API failure, no station configured) falls back to a calm state; nothing shows a broken
  control or silently loses a show.

## 2. Locked decisions (from brainstorming)

| Decision | Choice | Consequence |
|---|---|---|
| Music source & licensing | **Radio-as-a-service** (provider bundles licensing + royalties) | Provider hosts music + broadcast; Shape never touches raw label catalogs or per-play royalty reporting. |
| Station model | **One shared station** | Nora hosts station-wide; no per-listener personalization. |
| Nora's DJ depth | **Baseline station IDs/hype + scheduled DJ Sets** | No live-data generation, no per-track AI. Pre-rendered clips + programmed show blocks. |
| Show "liveness" | **Programmed ahead, feels live** | A Nora DJ Set is a scheduled block (curated tracks + woven talk breaks), assembled in advance — not real-time improv. |
| Management | **Shape admin "Studio" (option B)** | Shape builds the authoring + scheduling UI and pushes to the provider via the adapter. |
| Background audio | **From day one** | Native build + iOS `AVAudioSession` / Android `MediaSession` so playback survives lock/background. |

## 3. Architecture

**Division of labor.** The **provider** owns the hard/regulated parts: licensed music
hosting, the broadcast stream, royalty payments, and playout of whatever schedule we give
it. **Shape** owns the experience and the Nora layer. The seam is the `RadioProvider`
adapter.

**Units Shape builds (each one job, one interface):**

- **`RadioProvider` adapter** — `src/lib/radio/provider.ts`: a typed interface —
  `getStreamUrl()`, `getNowPlaying()`, `uploadAudio(clip)`, `scheduleShow(show)`,
  `setRotation()`. A concrete impl for the chosen provider (e.g. `src/lib/radio/radioco.ts`)
  and a `manual` impl (no-API fallback: Shape still generates everything; the schedule +
  clips are exported to load into the provider's dashboard). Nothing else references the
  vendor directly.
- **Nora narration service** — `src/lib/radio/nora-dj.ts`, reusing `synthesizeSpeech`.
  Takes a show's script lines → renders MP3 clips → stores them in a `radio-audio` bucket →
  hands them to the adapter. Same voice/tone the app already uses for Nora.
- **Show Studio (admin)** — `/dashboard/radio`, admin-gated exactly like
  `/dashboard/credentials` (`requireAdminUser`). Create a show (name + schedule), pick a
  curated track list from the provider's library, write or **auto-draft** Nora's talk-break
  script per slot (an LLM draft you edit), **preview** the TTS, then **Publish** → the
  adapter pushes audio + schedule to the provider.
- **In-app player** — replaces the demo radio in `iosAppBroadsheetRadio.jsx` and
  `public/radio.html`: streams the provider URL, polls now-playing, shows a **"Nora ON AIR"**
  badge during her scheduled windows, with native background audio (`@capacitor/media` +
  `AVAudioSession`/`MediaSession`).
- **"Nora on air" signal** — because it's a shared stream, the app knows a Nora show is live
  from the schedule it stored (`radio_shows`) and/or now-playing metadata tagging a Nora
  segment.

**Data model (Shape side).** The provider holds the music + live playout; Shape holds the
*program* and the Nora content:

- `radio_station` — one config row: stream URL, now-playing URL, provider id/name.
- `radio_shows` — `id`, `name`, `schedule` (cadence/start/duration), `status`
  (`draft`/`published`), timestamps.
- `radio_show_segments` — ordered rows per show: `kind` (`track`/`nora`), `position`,
  a provider track ref (for `track`) or a `radio_nora_clips` ref (for `nora`).
- `radio_nora_clips` — `id`, `kind` (`station_id`/`intro`/`break`/`outro`), `script` text,
  `audio_url` (bucket path), `provider_asset_id` (once uploaded), timestamps.
- a **private** `radio-audio` storage bucket for the rendered Nora MP3s — the provider
  ingests them (via the API or a signed URL) and the admin downloads them for the `manual`
  adapter; members never fetch them directly, so it stays private (mirrors the
  `meal-notes`/`coach-credentials` private-bucket pattern).

All Shape tables are admin-managed (service-role writes from the Studio server actions, like
the credentials queue); `radio_station` is publicly readable (the app needs the stream URL).

## 4. Data flow

**Authoring a Nora DJ Set (admin → provider):**
1. Admin opens the Studio (`/dashboard/radio`), creates a show — name + schedule (e.g.
   nightly 19:00, 60 min) — and lays out **segments**: tracks (from the provider's licensed
   library) interleaved with Nora talk-break slots.
2. For each Nora slot, the admin writes or **auto-drafts** the line (LLM draft → edit), then
   **previews** the TTS (calls `synthesizeSpeech`).
3. On **Publish**, `nora-dj.ts` renders each line → MP3 → stores in `radio-audio`, then the
   adapter `uploadAudio()`s each clip to the provider and `scheduleShow()` programs the
   ordered block into the provider's clock. Shape persists the show in
   `radio_shows`/`radio_show_segments`/`radio_nora_clips`.
4. At showtime, the provider plays the block out to the one shared stream.

**Member listening (app → provider):**
1. The Radio screen loads station config (stream URL) from `/api/radio/station`.
2. The native, background-capable player starts the provider stream.
3. The app polls `/api/radio/now-playing` (→ `provider.getNowPlaying()`) for the live track
   title/artist, and flips on **"Nora ON AIR"** during her scheduled windows (from
   `radio_shows` and/or now-playing metadata).
4. An **"up next · The Nora Show · 19:00"** affordance drives appointment listening.

## 5. The provider dependency (the one real external risk)

This is the critical-path decision. Shape needs a provider that **bundles music licensing**
(so royalties are handled) *and* exposes enough API for the adapter's four calls (stream URL
· now-playing · upload audio · schedule). Realistic candidates that bundle licensing:
**Radio.co, Live365, Radio King**. Open-source playout (LibreTime/Airtime) has a strong API
but **no bundled licensing** — excluded, since it re-opens the royalty problem.

**Risk:** API completeness varies. If the chosen provider only schedules via its
**dashboard** (not API), option B degrades cleanly — Shape still generates Nora's clips + the
full show plan; you load them via the provider dashboard (that's the `manual` adapter).
Because everything codes against the adapter interface, this is a different impl, **not a
rebuild**.

**Step zero of implementation is provider selection:** pick one, sign up, confirm its actual
API surface against the adapter interface before building the concrete adapter. Shortlist
Radio.co and Radio King first (both have real APIs + bundled licensing + show/jingle
scheduling).

## 6. Error handling & graceful degradation

- **Stream unreachable** → player shows *"Shape Radio is off air — back soon"* and retries
  with backoff; never a broken control.
- **Now-playing fails** → stream keeps playing; UI falls back to *"Shape Radio · Live"*
  without track metadata.
- **TTS render fails in the Studio** → surfaced per-clip; a show **cannot publish with
  missing clips**; individual clips can be re-rendered. No partial/silent publish.
- **Provider upload/schedule API fails** → surfaced; **falls back to the `manual` adapter**
  (export clips + a schedule sheet to paste into the provider dashboard). The show still
  airs; nothing is silently lost.
- **Background-audio interruptions** (call, another app) → standard
  `AVAudioSession`/`MediaSession` interruption handling: pause, then resume.
- **No station configured yet** (pre-launch) → Radio screen shows a "coming soon" state; the
  feature no-ops, matching the repo's migrations-no-op-until-applied convention.
- **Cost guardrail** → TTS is admin-only and clips are **generated once and stored** (reused
  on every broadcast), so there is no member-triggered or per-play TTS spend.

## 7. Testing

- **Unit (existing `tests/*.mjs` harness):** the adapter interface against a `mock` impl; the
  script → clip → schedule pipeline (segment ordering, schedule building); the
  showtime/"Nora-on-air" window computation.
- **Provider adapter:** click-through against a staging station on the preview deploy.
- **Player:** native background audio verified on-device (not unit-testable); the web player +
  now-playing UI via headless/Playwright.

## 8. Phased rollout (each phase ships something real on its own)

- **Phase 0 — Provider selection (external, blocking):** pick + sign up (Radio.co / Radio
  King), confirm API surface against the adapter, stand up a test station with a few licensed
  tracks.
- **Phase 1 — Real player, no Nora yet:** replace the demo radio with a real stream player
  (web first, then native background audio) + now-playing. **Ships a real licensed music
  station on its own** — value even if Nora slips.
- **Phase 2 — Nora on the air:** the narration service + a minimal Studio to generate Nora
  **station IDs/hype**, loaded into rotation. Nora's voice goes live.
- **Phase 3 — Nora DJ Sets:** the full Studio (show builder, segment sequencing, auto-drafted
  scripts, schedule push) + the **"Nora ON AIR"** and **"up next · The Nora Show"** appointment
  affordances.

Each phase is independently shippable and testable; Phase 1 de-risks the rest by putting a real
station on air before any Nora work.

## 9. Out of scope / deferred

- **Personalized per-member radio** (your coach's playlist + Nora referencing your workout) —
  impossible on a shared broadcast; would require self-hosting playout. Future, separate project.
- **Real-time / improvised DJing** — Nora reacting live in the moment; same constraint as above.
- **Track-by-track AI intros** (Nora names each specific upcoming song) — depends on provider
  per-track voice-track scheduling; layer on after Phase 3 if the provider supports it.
- **Fresh data-driven segments** (Nora referencing live Shape stats/featured coach) — a richer
  Phase 4 once the base station + Studio exist.
- **Direct music licensing / self-hosting** — explicitly rejected in favor of radio-as-a-service.

## 10. External decisions still required (not engineering)

1. **Pick the provider** and sign up (Radio.co / Radio King shortlist) — confirm bundled
   licensing covers the target listener regions + the API surface.
2. **Budget** — the provider's monthly fee + listener-count tier.
3. **Native build** — background audio needs the iOS/Android app build with audio
   capabilities/entitlements (ties into the existing "native build" go-live item).
