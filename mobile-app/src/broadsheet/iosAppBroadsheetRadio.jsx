import React from 'react';
import { createPortal } from 'react-dom';
import { NoraStage } from '../../../public/newdesign/noraStage.mjs';
import { bsSetsNow } from '../../../public/newdesign/noraSets.mjs';
import {
  BANDS, BAND_BINS, hasSignal, bandsFromBins, smoothBand, peakBand, barHeight, capVisible,
  fieldBin, fieldK, fieldAlpha, fieldRadius,
  RAIL_BARS, railRms, railBarsLit,
  ROW_WINDOW_S, GAP_PX, SAMPLE_STEP_PX, penSpeed, penX, instantAt, alphaAt,
  kickShape, ecg, penRadius,
  TIE_TOL_S, ties, bpmGap, inSync, gapText, lockStep,
  advanceHeart, trimBeats,
  previewBins, previewSimOn, PREVIEW_BINS,
} from '../../../public/newdesign/radioSignalField.mjs';
import {
  createTempoDetector, tempoEnergyFromBins, tempoBarStep, tempoBeatsBetween,
} from '../../../public/newdesign/radioTempo.mjs';
// iosAppBroadsheetRadio.jsx — Shape Radio in the Broadsheet visual language.
// Provides:
//   • BSRadioPrompt    — full-screen overlay asking "Listen to Shape Radio while in the app?"
//   • BSNowPlaying     — Home page widget showing what's currently playing + light effects
//   • BSRadioScreen    — full radio page (live + coach playlists)
//   • BSRadioContext   — global "is radio on, what's playing" state
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ NON-INTERACTIVE BOUNDARY — A LICENSING CONSTRAINT, NOT A PRODUCT PREFERENCE
//
// Shape Radio streams under the US statutory licence for non-interactive
// digital audio transmission (17 U.S.C. §114 / SoundExchange) plus the
// performing-rights licences for the underlying compositions. That licence is
// available ONLY to a service the listener cannot steer. Crossing any line
// below removes the statutory licence entirely and puts Shape into direct
// per-label negotiation for master rights — a different company, not a
// different feature flag.
//
// The four prohibitions, verbatim in effect:
//   1. NO TRACK SELECTION      — a listener may never choose what plays next.
//   2. NO ON-DEMAND REPLAY     — a specific recording may never be replayed
//                                on request.
//   3. NO ADVANCE PLAYLIST     — never publish, or let anyone else publish,
//                                the titles of upcoming recordings or their
//                                featured artists before they air.
//   4. NO SKIP-TO-SPECIFIC     — no seek, no "play this one", no per-track
//                                skip that lets a listener converge on a
//                                chosen recording.
//
// What is deliberately SAFE here, and why — do not "improve" these:
//   • `nowPlaying` names the CURRENT recording only. Contemporaneous display
//     is permitted; advance display is not.
//   • `saveTrackToLibrary` stores TEXT METADATA ONLY (see makeRadioTrackPayload:
//     key/title/artist/bpm/len/savedAt). It holds no audio, no stream handle and
//     no addressable track id, so it is a bookmark for the member's own Spotify/
//     Apple account — never a replay affordance. Keep it metadata-only.
//   • Coach soundtracks are LINK-OUTS, guaranteed at the schema layer:
//     `coach_soundtracks.provider` is CHECK-constrained to ('spotify','apple')
//     and playback is `window.open(url)` into the member's own account under
//     that provider's licence to them. They never enter Shape's stream. A coach
//     ordering recordings inside OUR stream would be interactive — never build it.
//   • Shape Sets (`nora_sets`) publishes SHOWS — title/dj/time — not track
//     lists. A programme schedule is permitted; a recording schedule is not.
//     ⚠ AUTHORING RULE: `title`, `dj` and `blurb` are unconstrained free text
//     written by ops via service_role. A set titled or described with a
//     FEATURED ARTIST or a specific recording becomes a prior announcement and
//     breaks prohibition 3. Name shows for the DJ or the mood, never the music.
//
// Anything that would let a listener answer "play THAT track, now" is out of
// scope permanently. Route such requests to the owner, not to a workaround.
// ─────────────────────────────────────────────────────────────────────────────
//
// Visual rhythm: black ink, cream paper, hairlines + slabs.
// Light effects:
//   - Audio-bar EQ in mono ink (animated heights).
//   - "Halftone aurora" — subtle dot field that drifts behind the now-playing card.
//   - Pulsing accent radial that breathes with BPM.
//   - Optional "stage lights" — diagonal cream/dark sweep at edges.

// Doto — the readings face, bundled locally in PR 1 (`fonts.css`).
//
// ⚠ EVERY CONSUMER MUST SET `'ROND' 100` EXPLICITLY. The axis defaults to 0,
// which is the square-dot form the Radio review measured as unreadable at
// display size — and an ignored or unset `font-variation-settings` is not an
// error in any browser, linter or build, so getting this wrong is silent. The
// fallback stack is the app's mono, because a missing Doto must still render a
// figure rather than fall to a proportional face that shifts on every tick.
const BS_DOTO = "'Doto', ui-monospace, SFMono-Regular, Menlo, monospace";

// ⚠ THE HEART'S COLOUR IS FIXED AND IS NOT THE THEME ACCENT. Rust is the strap's
// colour on every wearable, and the whole matching state rests on telling the two
// sources apart at a glance: the station is teal and the upper row, the member's
// heart is rust and the lower row. An accent that happened to be rust would make
// the two rows one colour, which is the one thing this drawing may not do — so
// at lock the HEART row moves to the station's teal, deliberately and only then.
const BS_HEART = '#e06547';

const { useState: useStateBR, useEffect: useEffectBR, useMemo: useMemoBR, useRef: useRefBR, useCallback: useCallbackBR, createContext: createContextBR, useContext: useContextBR } = React;
const { BSPage, BSMasthead, BSPageHeader, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSAvatar, BSFooter, BSLogo, useBS } = window;
// The masthead's top inset — the chrome owns it (window-exported). The local
// fallback mirrors the chrome's expression exactly so a load-order slip degrades
// to the same geometry instead of silently reverting to a notch-blind flat 44.
const BS_MAST_TOP_CSS = (typeof window !== 'undefined' && window.BS_MAST_TOP_CSS) || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';


// The neutral song-social shape — every read/write path returns this or a filled
// version of it, so a signed-out or pre-migration reader never sees undefined.
const RADIO_SOCIAL_EMPTY = { up: 0, down: 0, myVote: null, commentCount: 0, comments: [], loading: false };

// Optimistic vote math — mirrors set_radio_song_vote exactly (same vote toggles
// off, a different vote switches, no vote adds) so the instant UI matches what the
// server will return. Clamped at 0 so a stale cache can't render a negative count.
// Can the viewer write? Counts + comments are public to read; voting/commenting
// needs a signed-in account. The radio player is member-gated in-app, so this is
// almost always true — but a signed-out preview reads counts and is nudged, never
// given a dead tap.
function bsRadioSignedIn() {
  try { return !!window.ShapeAuth?.getCachedState?.()?.user?.id; } catch (e) { return false; }
}

// IS THIS SOMEBODY LOOKING AROUND, RATHER THAN A MEMBER?
//
// ⚠ IT DEFAULTS TO "MEMBER", AND THAT DIRECTION IS THE POINT. `ShapeCanChat` is
// the shell's own `memberAllowed` (iosAppBroadsheetMain.jsx) — an approved
// coach, a signed-in account, or an active subscription — published on a
// `shape:canchat` event. Only an explicit `false` is a prospect; `undefined`
// (the flag has not been published yet, on the first frames of a cold launch)
// reads as a member, so a real member is never shown a simulated station while
// the gate is still settling. The asymmetry is deliberate: showing a prospect
// the honest empty for a second costs nothing, and showing a MEMBER a
// fabricated signal for a second is the one thing this page must never do.
//
// ⚠ AND `false` IMPLIES SIGNED OUT, which is what makes the simulation safe at
// all: `memberAllowed` ORs in `signedIn`, so a prospect cannot have a session,
// and playback is licensed to signed-in accounts only. There is no reading for
// a simulated frame to displace, and there never could be.
function useBSRadioPreview() {
  const [v, setV] = useStateBR(() => (typeof window !== 'undefined' ? window.ShapeCanChat === false : false));
  useEffectBR(() => {
    const on = () => { try { setV(window.ShapeCanChat === false); } catch (e) { setV(false); } };
    window.addEventListener('shape:canchat', on);
    on();
    return () => window.removeEventListener('shape:canchat', on);
  }, []);
  return v;
}

// THE TRANSPORT KEY READS THE MEASURED STATE, NEVER THE REQUESTED ONE.
//
// `paused` is what the member ASKED for; `playingSince` is what is HAPPENING —
// it is stamped only once `play()` has actually started (the P1 on #2072) and
// nulled on every pause. The shipped key read `paused` alone, so with playback
// requested and refused it read "❚❚ Pause" beside a rail reading "Paused": two
// readings of one stream on one screen, and the key offered to stop something
// that was not running. Signed out, the same key rendered live over a deck the
// licence gates (`bsRadioSignedIn`) — a dead tap. One decision, four answers:
//   signIn — no account: the deck is disabled and the sign-in line says why.
//   pause  — playback is running (the clock is stamped): offer to stop it.
//   resume — the member paused it: offer to start it again.
//   tune   — requested and not running: offer to ask again (`retryPlay`).
// Both keys (the deck's and Home's) go through here, so they cannot disagree.
function bsRadioTransportKey({ signedIn, playing, paused }) {
  if (!signedIn) return 'signIn';
  if (playing) return 'pause';
  if (paused) return 'resume';
  return 'tune';
}

function bsApplyOptimisticVote(s, vote) {
  const cur = s.myVote;
  let up = s.up || 0, down = s.down || 0, my = cur;
  if (cur === 'up') up -= 1; else if (cur === 'down') down -= 1;
  if (cur === vote) {
    my = null;                                   // tapping the current vote clears it
  } else {
    if (vote === 'up') up += 1; else down += 1;
    my = vote;
  }
  return { ...s, up: Math.max(0, up), down: Math.max(0, down), myVote: my };
}

// The i18n translator for this module. Mirrors client.jsx's useShapeTr —
// self-contained on the window globals (ShapeI18n/ShapeLocale), so this module
// doesn't depend on another file's copy or its load order.
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => window.ShapeLocale?.subscribe?.(() => force((n) => n + 1)), []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}
// Active app locale for Intl date/number formatting (falls back to the browser
// default when i18n isn't ready).
function radioLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

// ═══════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════
// ⚠ NO `bpm` AND NO `listeners`. Both were typed in — 132 and 3,472 — and both
// were presented as readings: the first beat a ring on Home and printed itself
// inside it, the second read "3,472 listening" on Home and on the muted bar. A
// station that is not broadcasting has no tempo to report and nobody counting
// its audience. The tempo is MEASURED on the Radio page or it reads "—"; there
// is no listener count anywhere, because no provider reports one (brief §12,
// ruling 2). What is left here is the station's own name and what it is, which
// are facts about us rather than claims about a signal.
const BS_LIVE_STATION = {
  name: 'Shape Radio',
  show: 'Shape Radio Station',
  nextUp: 'Live mix all day',
  // 3-4 minute rolling track list
  tracks: [
    { idx: 0, t: 'NOW',    a: 'Eyes on Me',           b: 'Samyuel',       bpm: 132, len: '3:42' },
    { idx: 1, t: '3 MIN',  a: 'Floor Program II',     b: 'Tariq Osei',    bpm: 130, len: '4:18' },
    { idx: 2, t: '7 MIN',  a: 'Ironwood',             b: 'Sable',         bpm: 134, len: '3:55' },
    { idx: 3, t: '11 MIN', a: 'Peak Set',             b: 'Shape Radio',   bpm: 132, len: '5:02' },
    { idx: 4, t: '16 MIN', a: 'Cue the Lift',         b: 'Linnea Aho',    bpm: 128, len: '3:48' },
  ],
};

// `songs` is a short preview of each list (first few tracks) shown in the
// playlist-card tracklist popup before a client opens the full list in Spotify.
const BS_COACH_PLAYLISTS = [
  { id: 'p1', name: 'Pull day tempo',      by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '52m',     bpm: '95–138', tracks: 14, attached: 'Upper Pull · W6 D4',  sent: 'Mon', unplayed: true, provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',
    songs: [
      { a: 'Iron Count',   b: 'Tariq Osei',  len: '3:38' },
      { a: 'Chalk & Steel',b: 'Sable',       len: '4:02' },
      { a: 'Top Set',      b: 'Linnea Aho',  len: '3:21' },
      { a: 'Overhand',     b: 'Samyuel',     len: '3:54' },
      { a: 'Lat Spread',   b: 'Mara Vance',  len: '4:16' },
      { a: 'Last Rep',     b: 'Shape Radio', len: '3:45' },
    ] },
  { id: 'p2', name: 'Meal prep, low-key',  by: 'Dr. Maya Patel', role: 'Nutritionist', init: 'M', len: '45m',     bpm: '85–100', tracks: 12, attached: 'Sun prep · 8 meals',  sent: 'Sun', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ',
    songs: [
      { a: 'Sunday Counter',  b: 'Halve',     len: '3:30' },
      { a: 'Mise en Place',   b: 'Coriander', len: '4:08' },
      { a: 'Slow Simmer',     b: 'Nova Lane', len: '3:52' },
      { a: 'Batch Day',       b: 'Olive Park',len: '4:20' },
      { a: 'Cold Brew Hours', b: 'Temple',    len: '3:14' },
      { a: 'Tupperware Sun',  b: 'Marrow',    len: '4:01' },
    ] },
  { id: 'p3', name: 'Riverside long run',  by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '1h 50m',  bpm: '160–172',tracks: 24, attached: 'Sat Z2 run · 18k',    sent: 'last wk', provider: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    songs: [
      { a: 'Towpath',        b: 'Halcyon Mile', len: '4:12' },
      { a: 'Negative Split', b: 'Cadence Club', len: '3:48' },
      { a: 'Zone Two',       b: 'Linnea Aho',   len: '5:03' },
      { a: 'Riverlight',     b: 'Sable',        len: '4:33' },
      { a: 'Even Pace',      b: 'Tariq Osei',   len: '3:57' },
      { a: 'Final K',        b: 'Shape Radio',  len: '4:10' },
    ] },
];

// ═══════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════
function safeReadRadioJSON(key, fallback) {
  try {
    const raw = window.localStorage && window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function makeRadioTrackKey(track) {
  if (!track) return 'unknown';
  return `${track.a || 'track'}::${track.b || 'artist'}`.toLowerCase();
}

function makeRadioTrackPayload(track) {
  return {
    key: makeRadioTrackKey(track),
    title: track.a,
    artist: track.b,
    bpm: track.bpm,
    len: track.len,
    savedAt: new Date().toISOString(),
  };
}

const BSRadioContext = createContextBR(null);

// The valid light-effects intensities — a persisted value outside this set
// (or a future rename) falls back to 'off' instead of rendering nothing odd.
const BS_FX_MODE_KEYS = ['off', 'subtle', 'immersive', 'hologram'];
// Valid fx colors: the cycling palette, the app accent, or a fixed hex.
function bsValidFxColor(c) {
  return c === 'cycle' || c === 'accent' || /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
}

// ---- "Asked once" is a property of the ACCOUNT, not the device --------------
// The prompt is shown to a member EXACTLY ONCE — on any device, after any
// reinstall — and never again; Settings → Shape Radio owns every later change.
// `shape.radio.pref` (below) stays DEVICE-level: it carries the runtime on/off
// and deliberately survives sign-out. The ask-GATE is per-account — a per-uid
// localStorage mirror for the first synchronous render, converged from
// user_goals('client_settings').radioAsked so a fresh device inherits the
// account's answer instead of re-asking it.
//
// ⚠ SIGNED-OUT IS NEVER ASKED, and that is not a style call: playback is gated
// to a signed-in account (licensing — see the playback effect below), so a
// preview visitor answering "yes" gets silence. Worse, the old device-level
// gate let that unanswerable prompt CONSUME the ask, so the real account they
// went on to create was never asked at all. Signed-out therefore reads
// "already asked" and the prompt waits for a resolved session.
//
// ⚠ THE FLAG IS STICKY-TRUE — nothing ever writes false. So the hydrate ORs the
// mirror with the cloud instead of converging on it: a stale or absent cloud
// doc can never re-open a prompt the member already answered, and a mirror that
// is AHEAD of the cloud re-issues the write (the retry, for free).
//
// ⚠ NO MIGRATION FROM THE LEGACY DEVICE FLAG, deliberately. `shape.radio.pref
// .asked` is not attributable to any account — on a shared device it is
// whoever answered first — so reading it as this account's answer is the
// cross-account class the per-uid keys exist to prevent. The cost is one
// re-ask per account after this ships; the alternative is silently never
// asking someone, which is not recoverable.
const BS_RADIO_ASKED_LS = 'shape.radio.asked';
function bsRadioUid() {
  try { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; } catch (e) { return null; }
}
function bsRadioAskedKey(uid) { return BS_RADIO_ASKED_LS + '.' + uid; }
function bsRadioAskedMirrorRead() {
  try {
    const uid = bsRadioUid();
    if (!uid) return true; // signed-out: nothing to ask yet (see above)
    const raw = window.localStorage && window.localStorage.getItem(bsRadioAskedKey(uid));
    if (!raw) return false;
    const rec = JSON.parse(raw);
    return !!(rec && rec.asked === true && rec.uid === uid);
  } catch (e) { return true; } // unreadable storage: fail CLOSED — never nag on a guess
}
function bsRadioAskedMirrorWrite() {
  try {
    const uid = bsRadioUid();
    if (!uid) return;
    window.localStorage && window.localStorage.setItem(bsRadioAskedKey(uid), JSON.stringify({ uid, asked: true }));
  } catch (e) {}
}
// Read-only view of the ask-gate for the Settings pane's whole-doc save, which
// spreads a doc snapshot that may predate this write and would otherwise drop
// the key (the same shape as its onlineRail fold). Tolerant: the pane treats
// an absent module as "nothing to fold".
window.ShapeRadioAsked = { asked: () => bsRadioAskedMirrorRead() };

// Persist the ask-gate to the account. Joins the client module's client_settings
// write lane when that module is loaded — every local writer replaces the WHOLE
// doc, and the lane is what stops two in-flight writers landing snapshots that
// predate each other. Falls back to a direct read-merge-write so the radio
// module never hard-depends on module load order (it loads BEFORE the role
// bundle; by the time a member can answer, both are up).
// ⚠ BOUND TO THE INITIATING ACCOUNT: saveUserGoals resolves the user at SAVE
// time, so an account switch mid-flight would write A's whole settings blob
// into B's row. A changed or unresolvable identity discards the write — the
// mirror still holds, and the next hydrate re-issues it.
function bsRadioAskedPersist() {
  const db = window.shapeDb;
  if (!(db && db.getUserGoals && db.saveUserGoals)) return;
  const uid0 = bsRadioUid();
  if (!uid0) return; // signed-out: nothing to bind a save to
  const step = async () => {
    const s = await db.getUserGoals('client_settings').catch(() => null);
    if (!(s && typeof s === 'object')) return; // no real doc — decline, never clobber
    if (s.radioAsked === true) return;         // already on record
    const u = db.getUser ? await db.getUser().catch(() => null) : null;
    const nowUid = u ? u.id : bsRadioUid();
    if (nowUid !== uid0) return;               // account changed mid-flight — discard
    try { await db.saveUserGoals('client_settings', { ...s, radioAsked: true }); } catch (e) {}
  };
  try {
    const lane = window.BSSettingsWriteSerial;
    if (typeof lane === 'function') lane(step); else step();
  } catch (e) {}
}

function BSRadioProvider({ children }) {
  // Persisted radio preference (device-level localStorage) so the "Want music
  // while you move?" prompt is asked ONCE — after the user answers it (play or
  // muted), it never auto-shows again on a later launch / re-login. Seed from it.
  const _radioPref = safeReadRadioJSON('shape.radio.pref', null); // { asked, on } | null
  const [radioOn, setRadioOn]       = useStateBR(_radioPref ? !!_radioPref.on : false);
  const [askedPrompt, setAsked]     = useStateBR(() => bsRadioAskedMirrorRead());
  const [showPrompt, setShowPrompt] = useStateBR(false);
  // Ticks when the signed-in identity changes, so the playback effect below
  // re-evaluates its auth gate. Needed because this provider mounts above the
  // async auth gate: on a cold launch the cached session is not resolved yet,
  // so the first evaluation must be allowed to fail closed and then re-run.
  const [authTick, setAuthTick] = useStateBR(0);
  useEffectBR(() => {
    const bump = () => setAuthTick((n) => n + 1);
    window.addEventListener('shape:identity', bump);
    window.addEventListener('shape:signedOut', bump);
    return () => {
      window.removeEventListener('shape:identity', bump);
      window.removeEventListener('shape:signedOut', bump);
    };
  }, []);
  const [paused, setPaused]         = useStateBR(_radioPref ? !_radioPref.on : true);
  // When this session's playback actually began, or null while nothing is
  // playing. Stamped by the playback effect below; read by the Radio page's rail.
  const [playingSince, setPlayingSince] = useStateBR(null);
  // ⚠ ONE PLAYBACK ATTEMPT AT A TIME, AND EVERY ATTEMPT IS CANCELLABLE. The
  // session clock is stamped only once `play()` has actually started (Codex P1
  // on #2072), and a pause, a sign-out or radio-off must be able to cancel an
  // attempt still in flight — or a play that resolves AFTER the member paused
  // stamps a clock for playback that is already over. The token IS the
  // attempt; cancelling it is flipping `live`. A newer attempt supersedes an
  // older one the same way, so two taps cannot stamp twice.
  const attemptRef = useRefBR(null);
  const startPlay = () => {
    if (attemptRef.current) attemptRef.current.live = false;
    const token = { live: true };
    attemptRef.current = token;
    Promise.resolve(window.ShapeRadioLive?.play?.()).then((ok) => {
      if (!token.live || ok !== true) return;
      setPlayingSince((v) => (v == null ? Date.now() : v));
    }).catch(() => { /* play() already reports failure by resolving false */ });
  };
  const cancelPlay = () => { if (attemptRef.current) { attemptRef.current.live = false; attemptRef.current = null; } };
  // ⚠ A `play()` THAT DID NOT START HAS TO BE ASKABLE AGAIN — FROM THE TAP,
  // SYNCHRONOUSLY. The effect below runs on [radioOn, paused, authTick], so once
  // it has asked and been refused (an unconfigured station, an autoplay policy
  // that wants a gesture, a request superseded while it was starting) nothing
  // asks again until one of those three moves. The deck's key reads the
  // MEASURED state and offers "Tune in" for exactly this case
  // (`bsRadioTransportKey`), and this is what the tap calls.
  //
  // ⚠ IT CALLS `play()` INSIDE THE TAP'S OWN CALL STACK, NEVER THROUGH A STATE
  // UPDATE. A first cut bumped a nonce the effect ran on — which asks `play()`
  // a task later, outside the gesture's transient activation, so a browser
  // that binds media playback to a gesture (WebKit) refused the retry exactly
  // as it had refused the first attempt, forever. (Codex, P1 on #2088.) And
  // `shapeBackend.play()` keeps its last good station read so the retry reaches
  // `audio.play()` with no await in front of it — see the note there.
  const retryPlay = () => { if (!radioOn || paused) return; startPlay(); };
  // currently-playing track index in BS_LIVE_STATION.tracks (0 == "NOW") — kept
  // for the muted/fallback display path; live now-playing overrides via nowPlaying state.
  // ⚠ No trackIdx/setTrackIdx here, deliberately. A track-index setter on this
  // context is a ready-made "play track N" affordance — prohibition 1 + 4 of the
  // NON-INTERACTIVE BOUNDARY at the top of this file. The pair existed with zero
  // consumers and was removed rather than left as a foothold. Do not reintroduce.
  const [nowPlaying, setNowPlaying] = useStateBR(null);
  const [activeChannel, setChannel] = useStateBR('live');
  // The Shape Sets schedule + the stream gate, resolved ONCE here and shared
  // through context (`r.sets`) — the station, the radio screen and the muted bar
  // must never disagree about what is on air. `useBSSetsSchedule` is a hoisted
  // function declaration, so calling it above its definition is safe.
  const sets = useBSSetsSchedule();
  // Light-effects intensity ('off' | 'subtle' | 'immersive' | 'hologram') +
  // color ('cycle' | 'accent' | '#rrggbb') — ONE state object persisted from
  // an effect, so mode and color can never clobber each other's stored value
  // no matter how callers interleave the setters (stale-closure guard).
  const [fx, setFx] = useStateBR(() => {
    const s = safeReadRadioJSON('shape.radio.fx', null); // { mode, color } | null
    return {
      mode: BS_FX_MODE_KEYS.includes(s?.mode) ? s.mode : 'off',
      color: bsValidFxColor(s?.color) ? s.color : 'cycle',
    };
  });
  useEffectBR(() => {
    try { window.localStorage && window.localStorage.setItem('shape.radio.fx', JSON.stringify(fx)); } catch {}
  }, [fx]);
  const fxMode = fx.mode, fxColor = fx.color;
  const setFxMode = (mode) => setFx(prev => ({ ...prev, mode: BS_FX_MODE_KEYS.includes(mode) ? mode : 'off' }));
  const setFxColor = (color) => setFx(prev => ({ ...prev, color: bsValidFxColor(color) ? color : 'cycle' }));
  // Shared song social (like/dislike + comments), cached by song key. Server-backed
  // now (window.ShapeRadioSong) — the old device-only localStorage feedback is
  // retired. Each entry: { up, down, myVote, commentCount, comments, loading }.
  const [songSocial, setSongSocial] = useStateBR({});
  const [musicLibraries, setMusicLibrariesState] = useStateBR(() => safeReadRadioJSON('shape.radio.musicLibraries', { spotify: [], apple: [] }));
  // Generation counter for the async social operations (load/vote/comment).
  // Sign-out bumps it, so a request in flight when the account changes can
  // never write its response — the previous member's myVote/optimistic
  // baseline — over the state the signedOut reset just cleared.
  const socialGenRef = useRefBR(0);
  // Latest track key, readable from the []-dep signedOut listener (which would
  // otherwise close over the first render's value).
  const currentSongKeyRef = useRefBR(null);

  // Auto-prompt once, for a SIGNED-IN member who has never answered. Keyed on
  // authTick as well as askedPrompt because this provider mounts ABOVE the async
  // auth gate: on a cold launch there is no uid on the first evaluation, so it
  // must fail closed and re-run when the session resolves. The 600ms delay lets
  // the launch splash finish rather than painting over it mid-transition.
  useEffectBR(() => {
    if (askedPrompt) return undefined;
    if (!bsRadioUid()) return undefined; // no resolved account — nothing to ask
    const tm = setTimeout(() => setShowPrompt(true), 600);
    return () => clearTimeout(tm);
  }, [askedPrompt, authTick]);

  // Re-seed the gate from the account's own mirror whenever the identity
  // changes, then converge it from the cloud so a fresh device inherits the
  // answer instead of re-asking. Sticky-true in BOTH directions: a null read
  // (offline · query error — getUserGoals resolves null for every can't-know
  // case, it never rejects) keeps the seed, a cloud `true` writes the mirror,
  // and a mirror that is ahead of the cloud RE-ISSUES the write.
  // ⚠ NO CLOUD READ CAN LOWER THE GATE — that is the claim, and it is narrower
  // than "nothing here lowers it". The re-seed on the line below CAN, and does
  // so deliberately: the identity changed, so the NEW account's own record
  // decides, and B must not inherit A's answer. What is ruled out is a stale,
  // empty or failed cloud read re-opening a prompt this account already
  // answered. The one residual — a mirror write that failed after an in-session
  // answer, leaving the re-seed to read false — is recovered by the cloud
  // branch below, which dismisses the prompt as well as setting the gate.
  useEffectBR(() => {
    const seeded = bsRadioAskedMirrorRead();
    setAsked(seeded);
    if (!bsRadioUid() || !(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    let alive = true;
    window.shapeDb.getUserGoals('client_settings').then((s) => {
      if (!alive) return;
      if (!s || typeof s !== 'object') return; // null read: keep the seed
      // ⚠ CLOSES THE PROMPT, NOT JUST THE GATE. The auto-prompt fires on a 600ms
      // timer while this read is still in flight, so on a second device with a
      // slow round trip the prompt is ALREADY on screen by the time the account
      // answers for it — flipping the gate alone would leave it standing and ask
      // a member who answered on another device. (Inside 600ms the effect's own
      // cleanup clears the timer and it never paints.)
      // The prompt is deliberately NOT held until this read settles: that would
      // fail toward never asking a genuinely new member when the network is
      // down, which is not recoverable — the same direction as the no-migration
      // call above.
      if (s.radioAsked === true) { bsRadioAskedMirrorWrite(); setAsked(true); setShowPrompt(false); return; }
      if (seeded) bsRadioAskedPersist(); // mirror ahead of the account record — retry the write
    }).catch(() => {});
    return () => { alive = false; };
  }, [authTick]);

  // Sign-out: drop the in-memory saved-tracks library AND the per-song social
  // state. This provider is deliberately hoisted above the stage switch (it
  // survives logout so radio state doesn't remount, #1783) — which means the
  // storage sweep alone can't clear either: without this, an in-app account
  // switch hands the previous member's Spotify/Apple library to the next
  // sign-in, and songSocial only reloads when the track key CHANGES, so the
  // same track still playing renders the previous member's myVote and applies
  // the next vote's optimistic math against it.
  useEffectBR(() => {
    const onSignedOut = () => {
      socialGenRef.current += 1; // orphan any in-flight load/vote/comment so its response can't overwrite the reset below
      setMusicLibrariesState({ spotify: [], apple: [] });
      setSongSocial({});
      // Re-fetch the on-air track's PUBLIC social under the new generation so
      // the still-playing track shows fresh counts (myVote honestly null for
      // the signed-out viewer) instead of an empty entry until the track turns.
      try { if (currentSongKeyRef.current) loadSongSocial(currentSongKeyRef.current); } catch (e) {}
    };
    window.addEventListener('shape:signedOut', onSignedOut);
    return () => window.removeEventListener('shape:signedOut', onSignedOut);
  }, []);

  // Drive the live stream and now-playing poll.
  // - radioOn=false  → stop audio + stop poll.
  // - radioOn=true, paused=true  → pause audio; keep poll running (harmless).
  // - radioOn=true, paused=false → play audio + ensure poll is running.
  useEffectBR(() => {
    if (!radioOn) {
      window.ShapeRadioLive?.pause?.();
      window.ShapeRadioLive?.stopPolling?.();
      setNowPlaying(null); // honest-data: don't keep presenting the last track after radio is off
      setPlayingSince(null);
      return () => {};
    }
    // Start poll once (covers both paused and playing states so now-playing stays fresh).
    window.ShapeRadioLive?.startPolling?.((np) => setNowPlaying(np));
    // ⚠ PLAYBACK REQUIRES A SIGNED-IN ACCOUNT — licensing, not product.
    // `shape.radio.pref` persists {on:true} across sign-out by design (the
    // prompt must not re-ask), and this provider mounts ABOVE the async auth
    // gate. So without this check a signed-out launch — or a reload right
    // after logout — resumes the stream for a non-subscriber, which is the
    // non-subscription rate classification the signed-out path was removed to
    // avoid (see the NON-INTERACTIVE BOUNDARY at the top of this file).
    // Fails CLOSED: unresolved auth does not play.
    const bsRadioSignedIn = !!window.ShapeAuth?.getCachedState?.()?.user?.id;
    if (paused || !bsRadioSignedIn) {
      window.ShapeRadioLive?.pause?.();
      setPlayingSince(null);
    } else {
      // ⚠ THE SESSION CLOCK IS THE ONLY CLOCK ON THE PAGE, AND IT IS NOT A TRACK
      // POSITION. The scrubber it replaces computed `elapsed = total * 0.46`
      // over a length the now-playing payload does not carry — so it rendered
      // `0:00 / -0:00` in every state — and a scrubber on a non-interactive
      // stream promises a seek the licence forbids (prohibition 4 in this
      // module's own header). This is how long the stream has been playing THIS
      // session: a fact we hold, about us, that no provider has to report.
      //
      // ⚠ WHICH IS WHY IT IS STAMPED ONLY ONCE `play()` HAS ACTUALLY STARTED,
      // AND NEVER BESIDE THE CALL. That promise resolves FALSE for every way
      // playback can fail — no `ShapeRadioLive` at all, `/api/radio/station`
      // unreachable or unconfigured, `audio.play()` rejected by the autoplay
      // policy, or the attempt superseded by a pause or a sign-out while it was
      // starting (shapeBackend.js `play()`). Stamping on the call rendered a
      // rail counting "On air · 0:07" upward for a member hearing nothing,
      // which is the one thing this page exists not to do. The instant is taken
      // when playback started, not when it was requested. (Codex, P1 on #2072.)
      //
      // The guard is the effect's own cleanup: a pause, a sign-out or radio-off
      // re-runs this effect, which cancels the attempt in flight (`cancelPlay`,
      // above) before its resolution can stamp a clock for playback that is
      // already over. The deck's retry goes through the same `startPlay`, so a
      // retry in flight is cancelled the same way.
      startPlay();
    }
    return () => { cancelPlay(); window.ShapeRadioLive?.stopPolling?.(); };
  }, [radioOn, paused, authTick]);

  // The key for the track on air, built from the RAW now-playing fields (NOT the
  // '—'-substituted display copy), so a title-only or artist-only track keys the
  // same everywhere — the read (loadSongSocial) and the writes (voteSong /
  // commentSong) must agree on it (Codex P2 on #1781). Null when nothing real is
  // playing. The load effect lives BELOW loadSongSocial's declaration (Codex P1:
  // referencing it in a dep array above its const is a render-time TDZ crash, and
  // BSRadioProvider wraps the whole app shell).
  const currentSongKey = (nowPlaying && (nowPlaying.title || nowPlaying.artist))
    ? makeRadioTrackKey({ a: nowPlaying.title, b: nowPlaying.artist }) : null;
  currentSongKeyRef.current = currentSongKey; // keep the []-dep signedOut listener reading the LIVE key

  function persistRadioPref(asked, on) {
    try { window.localStorage && window.localStorage.setItem('shape.radio.pref', JSON.stringify({ asked: !!asked, on: !!on })); } catch {}
  }

  // Mark the ACCOUNT as asked: the per-uid mirror (instant, survives a reload)
  // plus the cloud record (survives a reinstall and reaches every other device).
  function markRadioAsked() {
    bsRadioAskedMirrorWrite();
    bsRadioAskedPersist();
  }

  function answerPrompt(yes) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!yes);
    setPaused(!yes);
    persistRadioPref(true, !!yes); // device-level runtime on/off
    markRadioAsked();              // account-level gate → never auto-prompt again, on any device
  }

  function requestRadioPrompt() {
    setAsked(false);
    setShowPrompt(true);
  }

  // Settings → Shape Radio. Answering there counts as answering the prompt, so
  // a member who sets the preference before ever seeing it is not asked later.
  function setRadioPreference(enabled) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!enabled);
    setPaused(!enabled);
    persistRadioPref(true, !!enabled);
    markRadioAsked();
  }

  // Fetch the shared social for a track key (counts + my vote + recent comments)
  // and cache it. Public read — works signed-out (myVote just stays null).
  const loadSongSocial = useCallbackBR(async (key) => {
    if (!key || key === 'unknown') return;
    const gen = socialGenRef.current; // a sign-out mid-flight orphans this request
    setSongSocial(prev => ({ ...prev, [key]: { ...RADIO_SOCIAL_EMPTY, ...(prev[key] || {}), loading: !prev[key] } }));
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.get(key) : null;
      if (gen !== socialGenRef.current) return; // stale: the response carries the previous session's myVote
      if (s) setSongSocial(prev => ({ ...prev, [key]: { ...s, loading: false } }));
      else setSongSocial(prev => ({ ...prev, [key]: { ...(prev[key] || RADIO_SOCIAL_EMPTY), loading: false } }));
    } catch (e) {
      if (gen !== socialGenRef.current) return;
      setSongSocial(prev => ({ ...prev, [key]: { ...(prev[key] || RADIO_SOCIAL_EMPTY), loading: false } }));
    }
  }, []);

  // Like/dislike the track. Optimistic (the tap feels instant), then reconciled
  // with the server's authoritative counts; reverts on failure. Returns true on
  // success, false if it couldn't (e.g. signed out) so the caller can nudge.
  const voteSong = useCallbackBR(async (track, vote) => {
    const key = makeRadioTrackKey(track);
    if (!key || key === 'unknown') return false;
    const gen = socialGenRef.current; // sign-out orphans this vote: no write-back AND no revert (the revert snapshot is the previous session's state)
    const before = songSocial[key] || { ...RADIO_SOCIAL_EMPTY };
    setSongSocial(prev => ({ ...prev, [key]: bsApplyOptimisticVote(prev[key] || RADIO_SOCIAL_EMPTY, vote) }));
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.vote(key, vote) : null;
      if (gen !== socialGenRef.current) return false;
      if (s) setSongSocial(prev => ({ ...prev, [key]: { ...s, loading: false } }));
      return true;
    } catch (e) {
      if (gen !== socialGenRef.current) return false;
      setSongSocial(prev => ({ ...prev, [key]: before }));   // revert
      return false;
    }
  }, [songSocial]);

  // Comment on the track. The server returns the fresh social (comments included),
  // so we replace the cache entry with server truth. Returns true on success.
  const commentSong = useCallbackBR(async (track, text) => {
    const key = makeRadioTrackKey(track);
    const body = (text || '').trim();
    if (!key || key === 'unknown' || !body) return false;
    const gen = socialGenRef.current;
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.comment(key, body) : null;
      if (gen !== socialGenRef.current) return false; // stale: don't write the previous session's response back
      if (s) setSongSocial(prev => ({ ...prev, [key]: { ...s, loading: false } }));
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  // Load the shared social whenever the track changes to a REAL one. Defined AFTER
  // loadSongSocial so the dep array can reference it without a TDZ (Codex P1 #1781).
  // An honest-empty track keys null, so counts/comments never attach to a placeholder.
  useEffectBR(() => {
    if (radioOn && currentSongKey) loadSongSocial(currentSongKey);
  }, [radioOn, currentSongKey, loadSongSocial]);

  function saveTrackToLibrary(track, service) {
    const payload = makeRadioTrackPayload(track);
    const current = musicLibraries[service] || [];
    const nextList = [payload, ...current.filter(item => item.key !== payload.key)].slice(0, 50);
    const next = { ...musicLibraries, [service]: nextList };
    setMusicLibrariesState(next);
    try { window.localStorage && window.localStorage.setItem('shape.radio.musicLibraries', JSON.stringify(next)); } catch {}
  }

  function isTrackSaved(track, service) {
    const key = makeRadioTrackKey(track);
    return (musicLibraries[service] || []).some(item => item.key === key);
  }

  const value = {
    radioOn, setRadioOn, setRadioPreference, paused, setPaused, playingSince,
    retryPlay,
    nowPlaying, activeChannel, setChannel,
    showPrompt, askedPrompt, answerPrompt, requestRadioPrompt,
    fxMode, setFxMode, fxColor, setFxColor,
    songSocial, voteSong, commentSong, loadSongSocial, currentSongKey,
    musicLibraries, saveTrackToLibrary, isTrackSaved,
    sets,
    LIVE: BS_LIVE_STATION,
  };
  return <BSRadioContext.Provider value={value}>{children}</BSRadioContext.Provider>;
}

function useBSRadio() {
  const v = useContextBR(BSRadioContext);
  if (!v) throw new Error('useBSRadio must be inside BSRadioProvider');
  return v;
}

// ═══════════════════════════════════════════════════════════
// Light/visual effect primitives
// ═══════════════════════════════════════════════════════════

// Animated EQ — bars whose heights cycle, paper-aware
function BSEQ({ bars = 22, color, height = 56, gap = 3, speed = 1.4, phase = 0, paused = false }) {
  const t = useBS();
  const c = color || t.INK;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height, width: '100%' }}>
      {Array.from({ length: bars }).map((_, i) => {
        const dur = (speed + (i % 5) * 0.15).toFixed(2) + 's';
        const delay = ((i + phase) * 0.06).toFixed(2) + 's';
        const baseH = 35 + Math.abs(Math.sin(i * 0.42 + phase)) * 65;
        return (
          <div key={i} style={{
            flex: 1, height: `${baseH}%`, minHeight: 4,
            background: c,
            transformOrigin: 'bottom',
            animation: paused ? 'none' : `bs-eq-${i % 4} ${dur} ease-in-out ${delay} infinite`,
          }} />
        );
      })}
      <style>{`
        @keyframes bs-eq-0 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.32); } }
        @keyframes bs-eq-1 { 0%,100% { transform: scaleY(0.6); } 50% { transform: scaleY(1); } }
        @keyframes bs-eq-2 { 0%,100% { transform: scaleY(0.45); } 50% { transform: scaleY(0.95); } }
        @keyframes bs-eq-3 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.55); } }
      `}</style>
    </div>
  );
}

// The channel row's signal meter — five bars, LIT OR NOT LIT, off the count the
// rail measured from the analyser's own RMS. Deliberately not `BSEQ`: that one
// animates on a CSS keyframe loop and says nothing about whether audio is
// arriving, which is exactly the claim this row must not make. Zero lit bars is
// the honest state for a frame we cannot read, and it is also what a paused or
// unselected channel gets — there is no reading to draw either way.
function BSChannelMeter({ lit = 0, teal, dim }) {
  const n = Number.isFinite(lit) ? Math.max(0, Math.min(RAIL_BARS, Math.round(lit))) : 0;
  return (
    <div aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
      {Array.from({ length: RAIL_BARS }).map((_, i) => (
        <span key={i} style={{ width: 4, height: 8 + i * 4, borderRadius: 1, background: i < n ? teal : dim }} />
      ))}
    </div>
  );
}

// Halftone aurora — animated radial-dot field, drifts and breathes
function BSHalftoneAurora({ color, opacity = 0.55, paused = false }) {
  const t = useBS();
  const c = color || t.ACCENT;
  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity,
        backgroundImage: `radial-gradient(circle at 30% 30%, ${c}, transparent 60%), radial-gradient(circle at 75% 70%, ${c}, transparent 55%)`,
        filter: 'blur(2px)',
        mixBlendMode: t.isLight ? 'multiply' : 'screen',
        animation: paused ? 'none' : 'bs-aurora-drift 8s ease-in-out infinite alternate',
      }} />
      <style>{`
        @keyframes bs-aurora-drift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(8%, -4%) scale(1.08); } }
      `}</style>
    </>
  );
}

// ⚠ `BSBeatRing` LIVED HERE AND IS DELETED. It drew a ring pulsing at a `bpm`
// prop and printed that number inside itself, and its last caller was the Home
// card handing it `BS_LIVE_STATION.bpm` — a typed-in 132. With the constant
// retired it had no caller at all, and a component whose whole job is to render
// a tempo, kept beside a page that measures one, is the next reader's mistake
// waiting to be made. Its `bs-beat-ring` keyframes went with it.
// Shape Radio wordmark — picks the right PNG for the surface. On dark paper the
// original white logo; on light paper a recolored variant where the white parts
// (SHAPE + the second play-triangle) read as ink/black while the play triangle +
// RADIO stay teal — the two-tone treatment the brand uses on light backgrounds.
function BSRadioWordmark({ width = 'min(86%, 330px)', style = {} }) {
  const t = useBS();
  const file = t.isLight ? 'shape-radio-logo-lt.png?v=1' : 'shape-radio-logo.png?v=2';
  return <img src={`${import.meta.env.BASE_URL}${file}`} alt="Shape Radio" style={{ width, height: 'auto', aspectRatio: '1647 / 116', display: 'block', ...style }} />;
}

// Sweeping diagonal "stage light" — used as a subtle background streak
function BSStageLight({ color, opacity = 0.18, paused = false }) {
  const t = useBS();
  const c = color || t.INK;
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', top: '-50%', left: '-30%', width: '160%', height: '200%',
        background: `linear-gradient(115deg, transparent 35%, ${c} 50%, transparent 65%)`,
        opacity,
        mixBlendMode: t.isLight ? 'multiply' : 'screen',
        animation: paused ? 'none' : 'bs-stage-sweep 6s ease-in-out infinite alternate',
      }} />
      <style>{`
        @keyframes bs-stage-sweep { 0% { transform: translateX(-15%); } 100% { transform: translateX(15%); } }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BSRadioPrompt — overlay asking the user
// ═══════════════════════════════════════════════════════════
function BSRadioPrompt() {
  const t = useBS();
  const r = useBSRadio();
  const tr = useShapeTr();
  const [choice, setChoice] = useStateBR('on'); // pre-select the recommended "play Radio" option
  const isLight = !!t.isLight;

  if (!r.showPrompt) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      color: t.INK,
      // Plain black screen — no colour wash, no decorative glow.
      background: isLight ? t.PAPER : '#0b0c0c',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Flowing sound-wave backdrop — soft teal lines drifting behind the
          content, echoing the EQ visualiser. Dark theme only. */}
      {!isLight && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id="bsRadioWave" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={t.ACCENT} stopOpacity="0" />
                <stop offset="0.5" stopColor={t.ACCENT} stopOpacity="0.8" />
                <stop offset="1" stopColor={t.ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="bs-radio-waves" fill="none" stroke="url(#bsRadioWave)" strokeLinecap="round">
              {[120, 205, 290, 380, 470, 560, 650].map((y, i) => {
                const a = i % 2 === 0 ? 40 : -40;
                const d = `M -40 ${y} C 60 ${y - a}, 140 ${y + a}, 200 ${y} C 260 ${y - a}, 340 ${y + a}, 460 ${y}`;
                return <path key={i} d={d} strokeWidth={i % 3 === 0 ? 2 : 1.4} opacity={0.38 + (i % 3) * 0.16} />;
              })}
            </g>
          </svg>
        </div>
      )}

      {/* Shape Radio wordmark — fixed header near the top (transparent PNG, no box) */}
      <BSRadioWordmark width="min(74%, 268px)" style={{ position: 'absolute', zIndex: 3, top: 'max(70px, calc(env(safe-area-inset-top, 0px) + 56px))', left: t.padX, pointerEvents: 'none' }} />

      {/* Scrollable upper region — hero + choices */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="bs-scroll">
      {/* Hero */}
      <div style={{ position: 'relative', padding: `max(170px, calc(env(safe-area-inset-top, 0px) + 152px)) ${t.padX}px 8px` }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 230 }}><BSEQ bars={22} color={t.ACCENT} height={56} gap={4} /></div>
        </div>
        <div style={{ marginTop: 18, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: t.ACCENT, animation: 'bs-blink 1.2s ease-in-out infinite' }} /> {tr('radio:prompt.liveNow', { defaultValue: 'Live now · Ad-free' })}
          </div>
          <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 34, letterSpacing: '-0.035em', lineHeight: 0.96, color: t.INK }}>
            {tr('radio:prompt.title', { defaultValue: 'Want music' })}<br/><span style={{ fontStyle: 'italic', fontWeight: 500, color: t.ACCENT }}>{tr('radio:prompt.titleAccent', { defaultValue: 'while the app is open?' })}</span>
          </h1>
          <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70, maxWidth: 340 }}>
            {tr('radio:prompt.body', { defaultValue: 'Radio will stream in the background — on your workouts, meal preps, or whenever the app is open. Always ad-free. You can pause anytime.' })}
          </div>
        </div>
      </div>

      {/* Slack above the choices — weighted lighter than below so the cards sit
          a touch higher on the screen. */}
      <div style={{ flex: 0.5, minHeight: 14 }} />

      {/* Choice rows */}
      <div style={{ padding: `10px ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PromptChoice
          on={choice === 'on'}
          onClick={() => setChoice('on')}
          title={tr('radio:prompt.choiceOnTitle', { defaultValue: 'Yes, play Radio.' })}
          meta={tr('radio:prompt.choiceOnMeta', { defaultValue: 'PLAYS IN APP · AD-FREE · PAUSE ANYTIME' })}
          icon={<div style={{ width: 18, height: 16 }}><BSEQ bars={5} height={16} gap={2} color="#ffffff" paused={false} /></div>}
          accent
        />
        <PromptChoice
          on={choice === 'off'}
          onClick={() => setChoice('off')}
          title={tr('radio:prompt.choiceOffTitle', { defaultValue: 'Keep it muted.' })}
          meta={tr('radio:prompt.choiceOffMeta', { defaultValue: 'START SILENT · TURN ON ANYTIME FROM HOME' })}
          icon={<span style={{ fontSize: 20, color: t.INK, opacity: 0.7, lineHeight: 1 }}>⏸</span>}
        />
      </div>
      {/* Heavier slack below so the cards rest slightly above center. */}
      <div style={{ flex: 1, minHeight: 12 }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: `14px ${t.padX}px 22px`, background: isLight ? t.PAPER : 'rgba(11,12,12,0.5)', backdropFilter: isLight ? undefined : 'blur(8px)', WebkitBackdropFilter: isLight ? undefined : 'blur(8px)' }}>
        <button
          disabled={!choice}
          onClick={() => r.answerPrompt(choice === 'on')}
          style={{ borderRadius: 999,
            width: 'fit-content', margin: '0 auto', display: 'block',
            padding: '10px 28px', cursor: choice ? 'pointer' : 'default',
            background: choice ? t.INK : 'transparent',
            color: choice ? t.PAPER : t.INK30,
            border: `1px solid ${choice ? t.INK : t.RULE}`,
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 700,
          }}
        >{tr('radio:prompt.continue', { defaultValue: 'Continue →' })}</button>
        <div style={{ marginTop: 8, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          {tr('radio:prompt.changeAnytime', { defaultValue: 'Change anytime in settings' })}
        </div>
      </div>

      <style>{`
        @keyframes bs-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes bs-radio-wave { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-18px); } }
        .bs-radio-waves { animation: bs-radio-wave 14s ease-in-out infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .bs-radio-waves { animation: none; } }
      `}</style>
    </div>
  );
}

function PromptChoice({ on, onClick, eyebrow, title, meta, icon, accent }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, width: '100%',
      padding: '9px 13px', cursor: 'pointer', textAlign: 'left',
      background: on ? 'rgba(10,197,168,0.08)' : 'transparent',
      color: t.INK,
      border: `1px solid ${on ? t.ACCENT : t.RULE}`,
      borderRadius: 13,
    }}>
      <div style={{
        width: 38, height: 38, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
        background: accent ? 'linear-gradient(135deg, #0ac5a8, #14806f)' : 'transparent',
        border: accent ? 'none' : `1px solid ${t.RULE}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.55, marginTop: 4, lineHeight: 1.4 }}>{meta}</div>
      </div>
      <div style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: 999,
        border: `1px solid ${on ? t.ACCENT : t.RULE}`,
        background: on ? t.ACCENT : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: on ? '#04211c' : 'transparent', fontSize: 12, fontWeight: 800,
      }}>✓</div>
    </button>
  );
}

// Honest now-playing display. /api/radio/now-playing returns {title:null,
// artist:null} on a provider error (a TRUTHY object), so `nowPlaying || {...}`
// never falls back — guard each FIELD and render '—' rather than fabricate a
// "Shape Radio / Live" track (honest-data principle).
function radioNowPlayingDisplay(np) {
  const has = (v) => typeof v === 'string' && v.trim().length > 0;
  return {
    title: has(np && np.title) ? np.title : '—',
    artist: has(np && np.artist) ? np.artist : '—',
    len: (np && np.len) || null,
    hasTrack: !!(np && (has(np.title) || has(np.artist))),
  };
}

// ═══════════════════════════════════════════════════════════
// BSNowPlaying — Home page widget
// ═══════════════════════════════════════════════════════════
// Shared clipped-notch frame for the now-playing bar — one geometry for the
// live and muted states so the two siblings can never drift.
const bsNpClip = (n) => `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, 0 100%)`;

function BSNowPlaying({ onOpen }) {
  const t = useBS();
  const r = useBSRadio();
  const tr = useShapeTr();
  if (!r.radioOn) return <BSNowPlayingMuted onTurnOn={() => r.setRadioPreference(true)} onOpen={onOpen} />;

  const np = radioNowPlayingDisplay(r.nowPlaying);
  // Key off the provider's raw-derived currentSongKey (NOT np, whose '—' fillers
  // fork a title-only/artist-only track's key) so the count read + the vote write
  // agree (Codex P2 #1781). np is display-only. The raw track feeds voteSong.
  const homeKey = r.currentSongKey;
  const homeTrack = { a: r.nowPlaying?.title, b: r.nowPlaying?.artist };
  const homeSocial = (homeKey && r.songSocial[homeKey]) || RADIO_SOCIAL_EMPTY;

  return (
    <div onClick={onOpen} style={{
      position: 'relative', cursor: 'pointer', boxSizing: 'border-box',
      margin: `10px ${t.padX}px`, padding: 1.5,
      clipPath: bsNpClip(13), background: `${t.ACCENT}80`, color: t.INK,
    }}>
      <div style={{ position: 'relative', overflow: 'hidden', clipPath: bsNpClip(12), background: t.PAPER }}>
      {/* Light effects layer — accent (adapts to paper); stronger so it reads on light papers too */}
      <BSHalftoneAurora color={t.ACCENT} opacity={t.isLight ? 0.7 : 0.55} paused={r.paused} />
      <BSStageLight color={t.ACCENT} opacity={t.isLight ? 0.22 : 0.16} paused={r.paused} />
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        backgroundImage: `radial-gradient(circle, rgba(${t.inkRGB},0.26) 1px, transparent 1.35px)`,
        backgroundSize: '8px 8px',
        opacity: 0.32,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 2, padding: `7px ${t.padX}px 8px` }}>
        {/* Eyebrow — single line (nowrap + tighter tracking so it fits the inset box) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'nowrap',
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontWeight: 900, color: t.INK70, whiteSpace: 'nowrap',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.ACCENT, flex: 'none' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#d83a2c', animation: 'bs-blink 1.2s ease-in-out infinite', flex: 'none' }} />
            Shape Radio
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none', minWidth: 0 }}>
            <span style={{ color: t.ACCENT, fontWeight: 900, background: `${t.ACCENT}26`, border: `1px solid ${t.ACCENT}`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 4, padding: '3px 9px', letterSpacing: '0.12em', flex: 'none' }}>{tr('radio:nowPlaying.open', { defaultValue: 'Open →' })}</span>
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {/* ⚠ A MARK, NOT A READING. This was `<BSBeatRing bpm={r.LIVE.bpm}>` — a
              ring pulsing at a typed-in 132 with "132" printed inside it, which is
              a claim about the station's tempo. The tempo is measured on the Radio
              page, off the analyser, and nothing on Home reads that analyser: the
              detector runs inside the Signal Field, and hoisting a 60Hz read onto
              a Home card to feed one number is the wrong trade. So Home shows the
              mark and says nothing it has not measured. The blinking dot in the
              eyebrow above already carries "this is on air". */}
          <div aria-hidden style={{
            width: 28, height: 28, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${t.INK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: t.INK, fontFamily: t.DISPLAY, lineHeight: 1,
          }}>♪</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.DISPLAY, fontSize: 15, fontWeight: t.W.display, letterSpacing: '-0.025em',
              color: t.INK, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{np.title}</div>
            <div style={{
              fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: t.INK70, marginTop: 2, fontWeight: 900,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{np.artist}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {[
              { key: 'up', glyph: '+', count: homeSocial.up },
              { key: 'down', glyph: '−', count: homeSocial.down },
            ].map(item => {
              const active = homeSocial.myVote === item.key;
              return (
                <button
                  key={item.key}
                  aria-label={item.key === 'up' ? tr('radio:nowPlaying.likeSong', { defaultValue: 'Like song' }) : tr('radio:nowPlaying.dislikeSong', { defaultValue: 'Dislike song' })}
                  onClick={(e) => { e.stopPropagation(); if (homeKey) r.voteSong(homeTrack, item.key); }}
                  disabled={!homeKey}
                  style={{
                    minWidth: 24, height: 26, flexShrink: 0, border: 0, padding: '0 4px',
                    background: active ? `${t.ACCENT}22` : 'transparent', borderRadius: 5,
                    color: active ? t.INK : (t.isLight ? 'rgba(5,7,7,0.92)' : '#ffffff'),
                    cursor: homeKey ? 'pointer' : 'default',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                    fontFamily: t.MONO, fontWeight: 900, lineHeight: 1,
                    textShadow: active || t.isLight ? 'none' : '0 1px 3px rgba(0,0,0,0.38)',
                    opacity: active ? 1 : 0.95,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{item.glyph}</span>
                  {item.count > 0 && <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{item.count}</span>}
                </button>
              );
            })}
          </div>

          {/* Pause/play — the MEASURED state, through the deck's own decision
              (bsRadioTransportKey): a stream that was asked for and did not
              start reads ▶ and asks again; it never reads ❚❚ over silence. */}
          {(() => {
            const key = bsRadioTransportKey({ signedIn: bsRadioSignedIn(), playing: r.playingSince != null, paused: r.paused });
            const act = key === 'pause' ? () => r.setPaused(true)
              : key === 'resume' ? () => r.setPaused(false)
                : key === 'tune' ? () => r.retryPlay()
                  : null;
            const label = key === 'pause' ? tr('radio:screen.pause', { defaultValue: 'Pause' })
              : key === 'resume' ? tr('radio:screen.resume', { defaultValue: 'Resume' })
                : key === 'tune' ? tr('radio:nowPlaying.tuneIn', { defaultValue: 'Tune in' })
                  : tr('radio:screen.signInToListen', { defaultValue: 'Sign in to listen' });
            return (
              <button disabled={!act} aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); if (act) act(); }} style={{
                width: 28, height: 28, flexShrink: 0, borderRadius: 4,
                background: `rgba(${t.inkRGB},0.34)`, color: t.PAPER, border: 0, cursor: act ? 'pointer' : 'default',
                opacity: act ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
                fontWeight: 900,
              }}>{key === 'pause' ? '❚❚' : '▶'}</button>
            );
          })()}
        </div>
      </div>
      </div>
      {/* accent spine over the frame */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: t.ACCENT }} />
    </div>
  );
}

// Muted state when radio is off — still shows what's playing on the live
// station so the user knows what they're missing, with a "Tune in" CTA.
// Same clipped instrument frame as the live bar, quiet: rule-colored frame,
// ink-alpha spine, no light-fx layers (the station is muted).
// THE SCHEDULE LINE — one implementation for every surface that reports what is
// on air, so the radio screen and the muted bar can never word it differently.
//
// ⚠ The honesty contract: a scheduled row is NOT a broadcast. The LIVE tag and
// the tune action appear ONLY when the stream is actually configured
// (`sets.real`). On the mock provider a set that covers right now reads
// "on the schedule now — broadcast coming soon", with no lamp and nothing to
// tap, because tapping would raise silence. Nothing scheduled → renders nothing
// rather than a placeholder.
function BSSetsLine({ tone = 'dark', style }) {
  const t = useBS();
  const tr = useShapeTr();
  const r = useBSRadio();
  const s = r.sets || {};
  const RUST = t.RUST || '#c0533b';
  // The accent is the same on both surfaces by design — `tone` swaps the
  // FOREGROUND (cream on the dark radio screen vs theme ink on the paper bar),
  // not the accent. A ternary with identical branches only implied otherwise
  // (review: CodeRabbit).
  const ACC = t.ACCENT;
  const FG = tone === 'dark' ? '#f4ede0' : t.INK;
  const DIM = tone === 'dark' ? 'rgba(244,237,224,0.6)' : t.INK50;
  const mono = { fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 };

  if (s.live && s.real) {
    return (
      <button
        type="button"
        // stopPropagation: the muted bar's own wrapper is clickable (it opens the
        // radio screen), and tuning in is a different intent from opening.
        onClick={(e) => { e.stopPropagation(); r.setRadioPreference(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, margin: 0, cursor: 'pointer', background: 'transparent', border: `1px solid ${ACC}59`, borderRadius: 3, padding: '4px 6px', boxShadow: `0 0 10px ${ACC}26`, color: ACC, ...mono, ...style }}
      >
        <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: RUST, boxShadow: `0 0 6px ${RUST}`, flex: '0 0 auto' }} />
        {tr('radio:sets.liveBanner', { title: s.live.title, dj: s.live.dj, defaultValue: 'LIVE · {title} · {dj}' })}
      </button>
    );
  }
  if (s.live) {
    return (
      <div style={{ ...mono, fontWeight: 600, letterSpacing: '0.1em', color: DIM, ...style }}>
        {tr('radio:sets.onScheduleNow', { defaultValue: 'On the schedule now — broadcast coming soon' })}
      </div>
    );
  }
  // "Up next" is deliberately near-term only: a set six days out is the COMING UP
  // station's job, not a line on the player.
  if (s.next && Date.parse(s.next.starts_at) - Date.now() <= 60 * 60000) {
    return (
      <div style={{ ...mono, fontWeight: 600, letterSpacing: '0.1em', color: DIM, ...style }}>
        {tr('radio:sets.upNext', { title: s.next.title, time: bsSetsTimeLabel(s.next.starts_at), defaultValue: 'Up next · {title} · {time}' })}
      </div>
    );
  }
  return null;
}

function BSNowPlayingMuted({ onTurnOn, onOpen }) {
  const t = useBS();
  const r = useBSRadio();
  const tr = useShapeTr();
  const np = radioNowPlayingDisplay(r.nowPlaying);

  return (
    <div onClick={onOpen} style={{
      position: 'relative', cursor: onOpen ? 'pointer' : 'default', boxSizing: 'border-box',
      margin: `10px ${t.padX}px`, padding: 1.5,
      clipPath: bsNpClip(13), background: t.RULE, color: t.INK, opacity: 0.92,
    }}>
      <div style={{ position: 'relative', overflow: 'hidden', clipPath: bsNpClip(12), background: t.PAPER }}>
      <div style={{ position: 'relative', padding: `10px ${t.padX}px 10px` }}>
        {/* Eyebrow — single line (nowrap + tighter tracking so it fits the inset box) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'nowrap',
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontWeight: 700, color: t.INK50, whiteSpace: 'nowrap',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, border: `1px solid ${t.INK50}`, background: 'transparent', flex: 'none' }} />
            Shape Radio · {tr('radio:nowPlaying.muted', { defaultValue: 'Muted' })}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ color: t.ACCENT, fontWeight: 900, background: `${t.ACCENT}22`, border: `1px solid ${t.ACCENT}`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 4, padding: '3px 9px', letterSpacing: '0.12em', flex: 'none' }}>{tr('radio:nowPlaying.open', { defaultValue: 'Open →' })}</span>
          </span>
        </div>

        {/* Body — same layout as live, but greyscale + tune-in CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <div style={{
            width: 32, height: 32, flexShrink: 0, border: `1px solid ${t.INK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: t.INK, fontFamily: t.DISPLAY,
          }}>♪</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.DISPLAY, fontSize: 16, fontWeight: t.W.display, letterSpacing: '-0.02em',
              color: t.INK, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{np.title}</div>
            <div style={{
              fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: t.INK50, marginTop: 2, fontWeight: 600,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{np.artist}</div>
          </div>

          {/* Tune in — replaces the pause/play button */}
          <button onClick={(e) => { e.stopPropagation(); onTurnOn && onTurnOn(); }} style={{ borderRadius: 4,
            padding: '7px 10px', flexShrink: 0,
            background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>▶ {tr('radio:nowPlaying.tuneIn', { defaultValue: 'Tune in' })}</button>
        </div>

        {/* Schedule state — renders nothing unless a set is on air or imminent. */}
        <BSSetsLine tone="paper" style={{ marginTop: 8 }} />
      </div>
      </div>
      {/* muted spine over the frame (live carries the accent; muted stays quiet) */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `rgba(${t.inkRGB},0.30)` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BSRadioScreen — full Radio page (live + playlists + ticker)
// ═══════════════════════════════════════════════════════════
// Comments on the track on air — a bottom sheet portaled into the phone surface
// (dark, matching the radio screen). Reads the shared comment list; posting goes
// through onComment (server-backed, which returns the fresh list). Signed-out
// readers see the thread but get a sign-in line instead of the composer.
function BSSongCommentsSheet({ t, tr, title, artist, social, onComment, onClose }) {
  const [draft, setDraft] = useStateBR('');
  const [busy, setBusy] = useStateBR(false);
  const canWrite = bsRadioSignedIn();
  const comments = Array.isArray(social.comments) ? social.comments : [];
  const CREAM = '#f4ede0', CREAM70 = 'rgba(244,237,224,0.72)', CREAM50 = 'rgba(244,237,224,0.5)', CREAM25 = 'rgba(244,237,224,0.25)';
  const TEAL = t.ACCENT;
  const submit = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await onComment(body);
    setBusy(false);
    if (ok) setDraft('');
  };
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || null;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('radio:social.commentsOn', { title, defaultValue: 'Comments on {title}' })}
        style={{ width: '100%', maxHeight: '80%', display: 'flex', flexDirection: 'column',
          background: '#0b0f0f', borderTop: `2px solid ${TEAL}`, borderTopLeftRadius: 16, borderTopRightRadius: 16, color: CREAM }}>
        {/* Header */}
        <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${CREAM25}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, fontWeight: 800 }}>
              {tr('radio:social.commentsTitle', { count: social.commentCount || 0, defaultValue: '{count, plural, one {# comment} other {# comments}}' })}
            </span>
            <button onClick={onClose} aria-label={tr('radio:social.close', { defaultValue: 'Close' })} style={{ border: 0, background: 'transparent', color: CREAM70, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: CREAM50, marginTop: 2 }}>{artist}</div>
        </div>
        {/* List */}
        <div className="bs-hide-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
          {comments.length === 0 ? (
            <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: t.BODY, fontSize: 13, color: CREAM50 }}>
              {tr('radio:social.beFirst', { defaultValue: 'No comments yet — say something about this track.' })}
            </div>
          ) : comments.map((c) => (
            <div key={c.id} style={{ padding: '9px 0', borderBottom: `1px solid rgba(244,237,224,0.1)` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: CREAM }}>{c.name || tr('radio:social.member', { defaultValue: 'Member' })}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: CREAM50 }}>{bsRadioTimeAgo(c.at, tr)}</span>
              </div>
              <div style={{ marginTop: 3, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.4, color: CREAM70, wordBreak: 'break-word' }}>{c.body}</div>
            </div>
          ))}
        </div>
        {/* Composer */}
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${CREAM25}` }}>
          {canWrite ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder={tr('radio:social.placeholder', { defaultValue: 'Say something…' })}
                rows={1}
                style={{ flex: 1, resize: 'none', boxSizing: 'border-box', maxHeight: 90, padding: '10px 12px', borderRadius: 12,
                  border: `1px solid ${CREAM25}`, background: 'rgba(244,237,224,0.05)', color: CREAM, fontFamily: t.BODY, fontSize: 14, outline: 'none' }} />
              <button onClick={submit} disabled={!draft.trim() || busy}
                style={{ flex: 'none', minHeight: 40, padding: '0 16px', borderRadius: 12, border: 0,
                  background: draft.trim() && !busy ? TEAL : 'rgba(244,237,224,0.12)', color: draft.trim() && !busy ? '#050707' : CREAM50,
                  fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                  cursor: draft.trim() && !busy ? 'pointer' : 'default' }}>
                {busy ? tr('radio:social.posting', { defaultValue: 'Posting…' }) : tr('radio:social.post', { defaultValue: 'Post' })}
              </button>
            </div>
          ) : (
            <div style={{ padding: '8px 2px', textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: CREAM50 }}>
              {tr('radio:social.signInToReact', { defaultValue: 'Sign in to react & comment' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return surface ? createPortal(sheet, surface) : sheet;
}

// Compact relative time for a comment stamp (ISO string in). Localized buckets;
// falls to a short date past a week.
function bsRadioTimeAgo(iso, tr) {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return tr('radio:social.now', { defaultValue: 'now' });
  const m = Math.round(s / 60);
  if (m < 60) return tr('radio:social.mAgo', { n: m, defaultValue: '{n}m' });
  const h = Math.round(m / 60);
  if (h < 24) return tr('radio:social.hAgo', { n: h, defaultValue: '{n}h' });
  const d = Math.round(h / 24);
  if (d < 7) return tr('radio:social.dAgo', { n: d, defaultValue: '{n}d' });
  try {
    const loc = (window.ShapeI18n?.intlLocale?.()) || undefined;
    return new Date(ms).toLocaleDateString(loc, { month: 'short', day: 'numeric' });
  } catch (e) { return new Date(ms).toLocaleDateString(); }
}

// THE MASTHEAD TRAILING CLUSTER (owner ruling 2026-08-01 — one row, one inset,
// every page). The search circle + the member's own facet avatar, both sized by
// BS_HEADER_AVATAR and spaced by BS_CORNER_GAP, in ONE place so the radio screen
// and the Shape Sets page cannot drift. Both constants are READ, never re-typed:
// the chrome owns the values and the `|| 34` / `|| 9` fallbacks only cover load
// order. `ink` is the search circle's colour — both radio pages are fixed-dark on
// their portrait ground, so they pass CREAM rather than the theme ink.
// `bg` is the SURFACE the corner sits on, and it is only passed by a screen whose
// ground is fixed regardless of the paper theme. BSFacetAvatar falls back to
// `t.PAPER`, which is right on a theme-adaptive screen (BSRadioScreen derives its
// whole palette from `t.isLight`) and WRONG on a fixed-dark one: the presence-dot
// surround and the rank shadow would paint light paper onto an unchanging dark
// venue. Pass it only where the ground is a literal, never as a blanket constant.
function bsRadioCorner(ink, bg) {
  const size = (typeof window !== 'undefined' && window.BS_HEADER_AVATAR) || 34;
  const gap = (typeof window !== 'undefined' && window.BS_CORNER_GAP) || 9;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      {(typeof window !== 'undefined' && window.BSSearchCorner)
        ? React.createElement(window.BSSearchCorner, { size, ink })
        : null}
      {(typeof window !== 'undefined' && window.BSFacetAvatar)
        ? React.createElement(window.BSFacetAvatar, {
          size,
          c: (window.bsMyTierColor && window.bsMyTierColor()) || '#8a8f98',
          initial: (window.bsMyInitials && window.bsMyInitials()) || 'A',
          name: (window.bsMyName && window.bsMyName()) || undefined,
          photo: (window.bsMyPhoto && window.bsMyPhoto()) || undefined,
          live: !!(window.bsAmLive && window.bsAmLive()),
          showRank: false,
          ...(bg ? { BG: bg, INK: ink } : null),
          onClick: () => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} },
        })
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE SIGNAL FIELD — the page's own ground.
//
// One canvas behind the page's chrome, one requestAnimationFrame loop that
// reads `getByteFrequencyData` ONCE per frame, feeds the tempo detector, draws
// the field, then the spectrum. It portals nothing: this is the page's ground,
// not a sheet.
//
// ⚠ EVERYTHING IT DRAWS IS A READING OR IT IS NOT DRAWN. `hasSignal` decides
// whether there is a frame at all — an all-zero frame is a stream we cannot read
// (no `Access-Control-Allow-Origin`), NOT a quiet passage — so the bars are not
// drawn over it and the page says so in words instead. The field stays lit
// either way, because the field is ground rather than a figure; it breathes on
// a MEASURED tempo or it is simply still.
// ---------------------------------------------------------------------------
// How long the page will read a silent analyser before it is willing to say the
// channel is sending nothing. Longer than any plausible start-up (the station
// request plus `audio.play()`), short enough that a genuinely dead stream is
// named rather than left silently blank.
const SIGNAL_GRACE_S = 6;

// Reduced motion, per the brief's §7: the spectrum redraws at ~4 fps and the
// field does not breathe.
//
// ⚠ THE MEASUREMENT KEEPS RUNNING AT FULL RATE — ONLY THE DRAWING IS THROTTLED.
// The analyser read and the detector are READINGS, not animation: starving them
// to 4 fps would leave the ring with a quarter of its samples and the tempo
// would take four times as long to settle, or refuse entirely. A member who
// asks for less motion is asking for less motion, not for a worse reading.
const REDUCED_FPS = 4;

function BSRadioSignalField({ paused, matching, heartBpm, teal, heart, ink, paper, figureRef, preview, onRead, onSignal, onRail }) {
  const wrapRef = useRefBR(null);
  const cvsRef = useRefBR(null);
  // The detector and every per-frame buffer live in refs: this loop runs at
  // 60Hz and must never re-render React.
  const detRef = useRefBR(null);
  const binsRef = useRefBR(null);   // the raw analyser frame
  // ⚠ THE SIMULATED FRAME GETS ITS OWN BUFFER, NEVER `binsRef`. Sharing one
  // would have the preview writing into the buffer the analyser reads into, so
  // the instant a real frame arrived the two would be interleaving in the same
  // array — and the bug would look like a flickering spectrum rather than like
  // what it is.
  const simBinsRef = useRefBR(null);
  const smRef = useRefBR(null);     // smoothed band values
  const pkRef = useRefBR(null);     // peak caps
  const liveRef = useRefBR({ paused, matching, heartBpm, teal, heart, ink, paper, figureRef, preview, onRead, onSignal, onRail });
  liveRef.current = { paused, matching, heartBpm, teal, heart, ink, paper, figureRef, preview, onRead, onSignal, onRail };
  // The last tempo handed UP to React, so the loop can tell a change from a
  // repeat. See the guard in the frame body.
  const saidRef = useRefBR(undefined);
  // Likewise for "is the analyser carrying anything at all" — one boolean, and
  // the page only needs to hear about it when it flips.
  const sigRef = useRefBR(undefined);
  // And for the rail's five bars: the page draws a COUNT, so a change is only
  // visible — and only worth a render — when the count moves.
  const railRef = useRefBR(undefined);
  // Has a frame EVER carried anything on this mount? Once one has, a later
  // all-zero frame really is the stream going quiet rather than a slow start.
  const startedRef = useRefBR(false);
  // `prefers-reduced-motion`, live: a member can change it while the page is open.
  const reducedRef = useRefBR(false);
  const lastDrawRef = useRefBR(-1);
  // The listening ↔ matching crossfade, and the lock's cues. Both are eased in
  // the loop rather than held in state, for the same reason as everything else
  // in this block: they move every frame.
  const kxRef = useRefBR(0);
  const lockRef = useRefBR(0);
  // The heart's phase accumulator. A strap sends a RATE (and, on straps that
  // report them, RR intervals `hrm.js` does not yet parse), so the glyph runs on
  // the measured rate from the moment the reading arrives.
  const hrPhaseRef = useRefBR(0);
  // Edge-detects the pause so the detector is reset once rather than every frame.
  const pausedRef = useRefBR(false);
  // The beats that actually arrived, in order, trimmed to the visible window.
  // A list rather than a derivation: see `advanceHeart` in radioSignalField.mjs.
  const hrBeatsRef = useRefBR([]);

  useEffectBR(() => {
    const wrap = wrapRef.current;
    const cvs = cvsRef.current;
    if (!wrap || !cvs) return undefined;
    const ctx = cvs.getContext('2d');
    if (!ctx) return undefined;

    if (!detRef.current) detRef.current = createTempoDetector({});
    const det = detRef.current;

    // ⚠ devicePixelRatio IS CAPPED AT 2. A 3x phone triples the fill cost of a
    // full-bleed dot field for a difference nobody can see at this dot size.
    let W = 0; let H = 0;
    const size = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width = `${W}px`;
      cvs.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    // ⚠ THE FIGURE IS MEASURED, NEVER A LITERAL. The spectrum's baseline and the
    // two row baselines all sit inside the page's own figure block, whose top
    // moves whenever anything above it does — the no-signal line appearing, a
    // locale with a two-line mode label, a larger text setting. The brief says
    // it in as many words: use the app's metrics rather than the board's 375px
    // literals. So the block hands us a ref and we read its box against ours.
    //
    // ⚠ AND IT IS RE-READ ON A CADENCE RATHER THAN EVERY FRAME. A
    // getBoundingClientRect forces layout, and doing two of them at 60Hz on a
    // scrolling page is a real jank risk; a stale box for a fifth of a second
    // after a reflow is not.
    let fig = null;
    const MEASURE_EVERY = 12;
    let sinceMeasure = MEASURE_EVERY;
    // Returns whether the box MOVED, so the draw throttle can be told.
    const measureFigure = () => {
      const prev = fig;
      const el = liveRef.current.figureRef && liveRef.current.figureRef.current;
      if (!el) { fig = null; return prev != null; }
      const fr = el.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      if (!(fr.width > 0) || !(fr.height > 0)) { fig = null; return prev != null; }
      fig = { x: fr.left - wr.left, y: fr.top - wr.top, w: fr.width, h: fr.height };
      return !prev || prev.x !== fig.x || prev.y !== fig.y || prev.w !== fig.w || prev.h !== fig.h;
    };

    let ro = null;
    try {
      ro = new ResizeObserver(() => { size(); sinceMeasure = MEASURE_EVERY; });
      ro.observe(wrap);
      const fe = figureRef && figureRef.current;
      if (fe) ro.observe(fe);
    } catch { /* no ResizeObserver here — the one-time size above still holds */ }

    startedRef.current = false;
    lastDrawRef.current = -1;
    let mq = null;
    const onMq = (e) => { reducedRef.current = !!(e && e.matches); };
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reducedRef.current = !!mq.matches;
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    } catch { /* no matchMedia here — full motion, which is the shipped default */ }
    let raf = 0;
    let stopped = false;
    // The page's own monotonic clock. The detector takes `t` from its caller and
    // reads no wall clock of its own, which is what makes it replayable.
    const clock = () => ((typeof window !== 'undefined' && window.performance && window.performance.now)
      ? window.performance.now() : 0);
    const t0 = clock();
    let last = 0;

    const frame = () => {
      if (stopped) return;
      raf = window.requestAnimationFrame(frame);
      // ⚠ A HIDDEN PAGE DRAWS NOTHING AND FEEDS NOTHING. rAF is throttled when
      // hidden, but a tab that still ticks would push sparse, irregular samples
      // and the detector would read the GAPS as a tempo. Skipping the push keeps
      // the ring honest; the hold then expires and the reading goes to "—",
      // which is the truth about a page nobody is looking at.
      if (typeof document !== 'undefined' && document.hidden) return;

      const t = (clock() - t0) / 1000;
      const dt = last > 0 ? Math.max(0, Math.min(0.1, t - last)) : 0;
      last = t;
      const cfg = liveRef.current;
      const an = (window.ShapeRadioLive && window.ShapeRadioLive.analyser)
        ? window.ShapeRadioLive.analyser() : null;

      let bins = null;
      if (an && an.frequencyBinCount) {
        if (!binsRef.current || binsRef.current.length !== an.frequencyBinCount) {
          binsRef.current = new Uint8Array(an.frequencyBinCount);
        }
        an.getByteFrequencyData(binsRef.current);
        bins = binsRef.current;
      }

      // ⚠ THE SIMULATION NEVER OUTRANKS A READING, AND THE ORDER IS THE WHOLE
      // GUARANTEE. The analyser is read first and `previewBins` runs only over
      // a frame that carried nothing — so on any surface where something real
      // is arriving, the real thing is what draws. In the population this is
      // gated to (a signed-out visitor previewing the app) nothing real can
      // arrive at all, which is why it is safe to draw anything here.
      const realSignal = hasSignal(bins);
      const sim = previewSimOn(cfg.preview, realSignal);
      if (sim) {
        if (!simBinsRef.current) simBinsRef.current = new Uint8Array(PREVIEW_BINS);
        bins = previewBins(simBinsRef.current, t);
      }
      const signal = realSignal || sim;
      // ⚠ AND A PREVIEW HAS NO PLAYBACK TO PAUSE. `paused` is the member's
      // REQUEST about a stream a prospect cannot start — it seeds `true` for
      // anyone with no stored radio preference, which is every first-time
      // visitor — so honouring it here would reset the detector on frame one
      // and hold the reading at null forever: bars over a rail that never names
      // a tempo. It governs the STATION half only; the heart half deliberately
      // keeps running through a pause and is untouched by this.
      const pausedEff = sim ? false : !!cfg.paused;
      const live = signal && !pausedEff;
      // ⚠ AN UNSTARTED PLAYER IS NOT A BROKEN STREAM, AND ONLY TIME TELLS THEM
      // APART. `play()` is still awaiting the station request and `audio.play()`
      // when this loop first reads the freshly created analyser, so its
      // zero-filled buffer would report `false` before a single frame of channel
      // audio had been sampled — the page would say "No signal data from the
      // channel" about a player that had not started. The verdict stays UNKNOWN
      // until either a frame has actually carried something, or we have been
      // reading a silent analyser for longer than any start-up could plausibly
      // take. (Codex, P2.)
      if (signal) startedRef.current = true;
      const verdict = signal ? true : ((startedRef.current || t >= SIGNAL_GRACE_S) ? false : null);
      if (verdict !== sigRef.current) {
        sigRef.current = verdict;
        if (cfg.onSignal) cfg.onSignal(verdict);
      }

      // Feed the detector only from a readable frame. `tempoEnergyFromBins`
      // returns null for a frame with nothing anywhere in it, and `push` refuses
      // a non-finite sample, so a CORS-blocked stream can never enter the ring.
      if (live) {
        const e = tempoEnergyFromBins(bins);
        if (e != null) det.push(t, e);
      }
      // ⚠ A PAUSED STATION HAS NO BEAT, AND THE HOLD MUST NOT OUTLIVE THE
      // PLAYBACK. The detector holds a settled reading through a dropout on
      // purpose — a few seconds of quiet mid-track is not a tempo change — but a
      // PAUSE is not a dropout: the member stopped the stream, and for the length
      // of that hold the station row went on pulsing a kick and the reading went
      // on naming a BPM for audio nobody was playing. Resetting rather than only
      // gating the read also drops the ring, so a resume rebuilds from frames
      // that are actually contiguous instead of splicing across the gap.
      // (Codex, P2 on #2072.)
      if (pausedEff && !pausedRef.current) det.reset();
      pausedRef.current = pausedEff;
      const read = pausedEff ? null : det.read(t);
      // ⚠ REPORT UP ONLY WHEN THE PUBLISHED READING CHANGES. `onRead` is a React
      // setState and this loop runs at 60Hz — calling it every frame re-renders
      // the whole page sixty times a second, which is exactly what the refs
      // above exist to avoid. The page draws a ROUNDED integer, so that is the
      // granularity at which a change is visible and the only granularity worth
      // a render; the kick and the beat phase stay in here, where they are drawn
      // rather than stored.
      const said = read ? Math.round(read.bpm) : null;
      if (said !== saidRef.current) {
        saidRef.current = said;
        if (cfg.onRead) cfg.onRead(read);
      }
      // The rail's five bars, on the same rule: a COUNT is what the page draws,
      // so a count is the granularity worth a render. `railRms` answers null for
      // a frame we cannot read, which the rail renders as no bars lit rather
      // than as a measured silence.
      const litNow = live ? railBarsLit(railRms(bins), RAIL_BARS) : 0;
      if (litNow !== railRef.current) {
        railRef.current = litNow;
        if (cfg.onRail) cfg.onRail(litNow);
      }

      // The two states of one instrument. `kx` is 0 while listening and 1 while
      // matching, eased over 0.7s so the spectrum folds away as the rows arrive
      // rather than cutting.
      const target = cfg.matching ? 1 : 0;
      const step = dt / 0.7;
      kxRef.current = target > kxRef.current
        ? Math.min(target, kxRef.current + step)
        : Math.max(target, kxRef.current - step);
      const kx = kxRef.current;

      // The heart's own clock. It advances on the MEASURED rate, so a strap that
      // has stopped reporting stops the glyph rather than drawing invented beats.
      //
      // ⚠ EACH BEAT IS RECORDED WHEN IT ARRIVES AND NEVER RE-DERIVED. The row
      // holds three seconds, and a strap re-reports inside that window all the
      // time — so rebuilding the window's beats from the LATEST rate (which is
      // what this did until Codex's P2) redraws beats that genuinely landed
      // 500 ms apart as though they had landed 600 ms apart the instant a
      // 120 → 100 reading lands: the drawn trace jumps and ties appear or
      // vanish for beats that already happened. An instant is a fact about when
      // a beat arrived; no later reading may move it.
      //
      // ⚠ AND IT KEEPS RUNNING WHILE THE STATION IS PAUSED, DELIBERATELY. Pausing
      // the radio does not take the strap off: the member's heart is still
      // beating and the strap is still reporting it, so freezing this row would
      // hold a stale frame under a live reading — a flatline where there is a
      // pulse, which is the same class of lie as the station row pulsing to
      // silence. What stops on pause is the STATION half, above. The picture a
      // paused matching state should give is exactly that: your heart beating,
      // the station flat, the gap reading "——".
      const hrBpm = Number.isFinite(cfg.heartBpm) && cfg.heartBpm > 0 ? cfg.heartBpm : null;
      if (hrBpm != null) {
        const adv = advanceHeart(hrPhaseRef.current, hrBpm, t, dt);
        hrPhaseRef.current = adv.phase;
        for (let i = 0; i < adv.beats.length; i += 1) hrBeatsRef.current.push(adv.beats[i]);
      }
      // Older than the window plus the half-second of lead-in the row samples.
      trimBeats(hrBeatsRef.current, t - ROW_WINDOW_S - 0.5);
      const gap = bpmGap(hrBpm, read ? read.bpm : null);
      lockRef.current = lockStep(lockRef.current, cfg.matching && inSync(gap), dt);

      // The reading is done; everything below is drawing. Under reduced motion
      // that redraws at ~4 fps, and the field's breath is forced off.
      const reduced = reducedRef.current;
      // ⚠ THE FIGURE IS RE-MEASURED ON THE FRAME CADENCE, NOT THE DRAW CADENCE.
      // Under either throttle below a draw happens ~4 times a second, and
      // counting DRAWS stretched MEASURE_EVERY from ~200 ms to ~3 s: a reflow
      // that moves the figure without resizing either observed element — or a
      // browser with no ResizeObserver — left the baseline, the counter and the
      // scrims at the old coordinates for seconds (Codex, P2 on #2088). So the
      // count runs every frame, and a measurement that MOVED the box forces a
      // draw through the throttle.
      sinceMeasure += 1;
      let moved = false;
      if (sinceMeasure >= MEASURE_EVERY) { sinceMeasure = 0; moved = measureFigure(); }
      // ⚠ AND AT REST THE PICTURE IS STILL, SO IT IS DRAWN AT THE SAME CADENCE.
      // With nothing on the air and the crossfade settled on listening nothing
      // below moves — the grid at its rest, a dashed baseline, four unlit dots —
      // and redrawing ~1,300 dots sixty times a second for a still picture is a
      // battery cost on the one state a member can leave open all day. The READ
      // above still runs every frame, so the first live frame is drawn within a
      // quarter of a second of the stream starting.
      const still = !live && kx === 0;
      if (!moved && (reduced || still) && lastDrawRef.current >= 0 && t - lastDrawRef.current < 1 / REDUCED_FPS) return;
      lastDrawRef.current = t;

      ctx.clearRect(0, 0, W, H);

      const kick = (reduced || !read) ? 0 : read.kick;

      // ── the field ─────────────────────────────────────────────────
      // Ground, never figure. The grid is drawn at its REST whether or not
      // anything is on the air (FIELD_REST_ALPHA — the first build scaled the
      // rest by `fieldK` as well and the figure was a void; the reasoning is on
      // the constant in radioSignalField.mjs). The light on it reads the bins
      // and breathes on the kick, and with no measured tempo `fieldK(kx, 0)`
      // keeps that light simply still.
      const k = fieldK(kx, kick);
      const cx = W / 2;
      const cy = fig ? fig.y + fig.h * 0.5 : H * 0.52;
      const nBins = bins ? Math.min(BAND_BINS, bins.length) : BAND_BINS;
      ctx.save();
      ctx.fillStyle = cfg.ink;
      for (let y = 7; y < H; y += 14) {
        for (let x = 7; x < W; x += 14) {
          const v = live ? Math.max(0, Math.min(1, (bins[fieldBin(Math.hypot(x - cx, y - cy), nBins)] || 0) / 255)) : 0;
          ctx.globalAlpha = fieldAlpha(v, k);
          ctx.beginPath();
          ctx.arc(x, y, fieldRadius(v, k), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (!fig) return;

      // ── the instrument's band ─────────────────────────────────────
      // ⚠ THE FIGURE BLOCK SAYS **WHERE**, THE CANVAS SAYS **HOW WIDE**, AND
      // CONFLATING THE TWO IS WHAT DREW THE SPECTRUM IN A PADDED COLUMN. The
      // figure is measured because the drawing must follow the type — a longer
      // mode label, the no-signal line appearing or a larger text setting all
      // move it, and the geometry has to move with it (the 09-14 brief's rule,
      // and why nothing here is a literal). But that block sits inside the
      // page's own `padding: 12px ${t.padX}px 16px`, so taking its WIDTH made
      // the bars a padded column while the field's dots and both scrims ran
      // edge to edge. Measured in Chromium at 390px before this changed: the
      // bars filled 354 of 390, i.e. 18px of dead paper each side, against a
      // field reaching both edges — and that contrast is exactly what reads as
      // "not filling the width of screen".
      //
      // So the vertical geometry still derives from `fig` and the horizontal
      // extent derives from the canvas, which IS the screen: the wrap is
      // `position:absolute; inset:0`, so `W` is the viewport width.
      const band = { x: 0, w: W };

      // ── the scrims ────────────────────────────────────────────────
      // ⚠ LOAD-BEARING, AND THE RENDER IS WHAT PROVED IT. The field is
      // full-bleed, so its dots sit behind the rail, the Now block and the deck —
      // 8px mono at 0.18em over a field of dots is a legibility problem, not a
      // texture. The brief's own §8 says so: "the field must stay quiet enough
      // behind the track for the words to read (the scrims are load-bearing)".
      // The figure keeps its ground; everything above and below it is faded back
      // into the paper.
      //
      // ⚠ THE ALPHA IS `globalAlpha`, NEVER A HEX SUFFIX ON THE COLOUR. Every
      // `PAPERS` entry is a plain hex today — but this file already records two
      // page-wide backgrounds voided by `${rgbaToken}33`, and stepping the alpha
      // here means the scrim is correct for whatever spelling a paper's colour
      // ever takes.
      // ⚠ THE RAMP IS EASED, NOT LINEAR, BECAUSE A LINEAR ONE IS ALREADY SPENT
      // WHERE THE WORDS ARE. The chrome that needs the scrim most — the mode
      // label, the rail, the lock — sits in the LAST third before the figure,
      // exactly where a straight fade has almost nothing left; and the Now block
      // sits in the first third after it. `ease` holds the paper up across the
      // band the type occupies and gives it back over the short run beside the
      // figure. Measured by looking at the render twice, once each way.
      const scrim = (yA, yB, aA, aB, ease) => {
        const span = yB - yA;
        if (!(span > 0)) return;
        const steps = Math.max(1, Math.round(span / 2));
        ctx.save();
        ctx.fillStyle = cfg.paper;
        for (let i = 0; i < steps; i += 1) {
          const u = i / steps;
          ctx.globalAlpha = aA + (aB - aA) * Math.pow(u, ease);
          ctx.fillRect(0, yA + span * u, W, span / steps + 1);
        }
        ctx.restore();
      };
      scrim(0, fig.y, 0.94, 0, 3.2);
      scrim(fig.y + fig.h, H, 0, 0.94, 0.45);

      // ── the spectrum (listening) ────────────────────────────────
      // The INSTRUMENT is drawn in the listening half whatever the air carries:
      // its baseline and its four-beat counter are the fixed parts of the
      // picture, the way a monitor's axis is there before a trace is. The BARS
      // are drawn ONLY over a frame that carries data, mirrored with the bass at
      // the centre so the pump reads as one instrument rather than a sweep.
      //
      // ⚠ THE FIRST BUILD GATED THE WHOLE BLOCK ON `live`, AND THE RESTING PAGE
      // WAS A VOID. Nothing was drawn between the rail and the Now block for a
      // signed-out visitor, a paused member, or anyone whose station is not
      // broadcasting — which in production today is everyone — so the owner
      // opened the page the day after #2072 merged and saw the old page with
      // its parts removed. The honest picture of silence is not an empty box;
      // it is the instrument, with a flat line where a reading would be.
      if (kx < 1) {
        const maxH = fig.h * 0.50;
        const baseY = fig.y + fig.h * 0.70;
        // ⚠ THE GAP IS SPLIT ACROSS THE CELL, NOT TAKEN OFF ITS RIGHT EDGE.
        // Inside a padded column a right-only gap was invisible; at full bleed
        // it leaves the first bar flush against the screen and the last one
        // 1.6px short of it — an asymmetry the mirrored spectrum (bass at the
        // centre) is exactly the wrong drawing to carry. Half each side keeps
        // the instrument centred on the band it is drawn in, and ONE constant
        // feeds both the width and the offset so they cannot drift apart.
        const BAR_GAP = 1.6;
        const bw = band.w / BANDS;
        const wBar = Math.max(1, bw - BAR_GAP);
        ctx.save();
        if (live) {
          const raw = bandsFromBins(bins, BANDS);
          if (!smRef.current || smRef.current.length !== BANDS) smRef.current = new Array(BANDS).fill(0);
          if (!pkRef.current || pkRef.current.length !== BANDS) pkRef.current = new Array(BANDS).fill(0);
          const sm = smRef.current;
          const pk = pkRef.current;
          const grad = ctx.createLinearGradient(0, baseY - maxH, 0, baseY);
          grad.addColorStop(0, cfg.ink);
          grad.addColorStop(0.32, cfg.teal);
          grad.addColorStop(1, cfg.teal);
          // ⚠ THE MIRROR IS IN THE BAND TABLE, NOT IN THE DRAWING, AND DOING IT
          // TWICE PUT THE BASS AT THE QUARTERS. `bandBin` reads
          // `|i − (BANDS/2 − 0.5)|`, so `bandsFromBins` already hands back an
          // array whose CENTRE indices are bin 0 and whose ends are bin 63 — the
          // mirror, built in. Drawing that array outwards from the centre mirrored
          // it a second time: band 0 (a treble bin) landed dead centre and the kick
          // showed up as two humps a quarter of the way in from each edge. Caught
          // by looking at the render, not by reading it. The array is laid out
          // left → right across the figure, and the picture is what it says.
          for (let i = 0; i < BANDS; i += 1) {
            sm[i] = smoothBand(sm[i], raw[i]);
            pk[i] = peakBand(pk[i], sm[i]);
            const h = barHeight(sm[i], maxH);
            const capped = capVisible(pk[i], sm[i], maxH);
            const hCap = capped ? barHeight(pk[i], maxH) : 0;
            const x = band.x + i * bw + BAR_GAP / 2;
            ctx.globalAlpha = (1 - kx) * (0.55 + 0.45 * sm[i]);
            ctx.fillStyle = grad;
            ctx.fillRect(x, baseY - h, wBar, h);
            // a soft reflection under the baseline — an echo, never a reading
            ctx.globalAlpha = (1 - kx) * 0.13;
            ctx.fillRect(x, baseY + 1.5, wBar, h * 0.42);
            if (capped) {
              ctx.globalAlpha = (1 - kx) * 0.65;
              ctx.fillStyle = cfg.ink;
              ctx.fillRect(x, baseY - hCap - 2, wBar, 1.5);
            }
          }
          // The station's own line, flashing on the beat it carries.
          ctx.globalAlpha = (1 - kx) * (0.22 + 0.6 * kick);
          ctx.fillStyle = cfg.teal;
          ctx.fillRect(band.x, baseY, band.w, 1);
        } else {
          // ⚠ NO SIGNAL → A DASHED FLAT LINE, NEVER A BAR. The same grammar the
          // matching state's rows use for a source that is not there (the
          // station row "waits", the heart row with no strap): a flat reading is
          // still a reading, drawn where the bars will stand, and the dashes say
          // it is waiting for a source rather than measuring a silence.
          ctx.strokeStyle = cfg.teal;
          ctx.lineWidth = 1;
          ctx.globalAlpha = (1 - kx) * 0.38;
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(band.x, baseY + 0.5); ctx.lineTo(band.x + band.w, baseY + 0.5); ctx.stroke();
          ctx.setLineDash([]);
        }
        // The four-beat counter — the one thing on the listening state that makes
        // the MEASURED tempo visible as a rhythm rather than as a number. With no
        // settled grid `tempoBarStep` is null and the dots simply do not step;
        // with nothing on the air they are drawn unlit, because a counter that
        // stepped over a flat line would be counting a beat nobody measured.
        const step4 = (live && read) ? tempoBarStep(read.bpm, read.phase, t, 4) : null;
        const counterY = baseY + fig.h * 0.24;
        for (let b = 0; b < 4; b += 1) {
          const on = step4 === b;
          ctx.globalAlpha = (1 - kx) * (on ? 0.95 : 0.2);
          ctx.fillStyle = on ? cfg.teal : cfg.ink;
          ctx.beginPath();
          // ⚠ CLEAR OF THE REFLECTION, WHICH IS WHY THIS IS A FRACTION OF THE
          // BOX AND NOT A CONSTANT. The reflection runs `h * 0.42` below the
          // baseline, so at full height it reaches `maxH * 0.42`; the counter has
          // to sit under that or it reads as four more bars.
          // ⚠ THE CENTRE IS THE BAND'S, AND ON TODAY'S LAYOUT THAT IS A PROVEN
          // NO-OP — recorded rather than left to read as a fix. The page's own
          // horizontal padding is symmetric (`padding: 12px ${t.padX}px 16px`),
          // so `fig.x + fig.w / 2` and `W / 2` are the same pixel: measured at
          // 390px, fig.x 18 and fig.w 354, and 18 + 177 = 195 = 390 / 2. It is
          // the BAND's because the counter belongs to the instrument, and the
          // instrument is the screen's width now — so it stays on the bars'
          // centre line the day the figure stops being centred in the screen.
          ctx.arc(band.x + band.w / 2 - 21 + b * 14, counterY, on ? 2.6 + 1.6 * kick : 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── the rows (matching) ─────────────────────────────────────
      // Two pulses on ONE clock, drawn the way a heart-rate monitor draws: a pen
      // sweeping left to right with the erase gap ahead of it, the newest sample
      // at the pen. While the rates differ the lower row's beats slide against
      // the upper row's; at lock the ties join them and the lower row takes the
      // station's teal.
      if (kx > 0) {
        // ⚠ THE TWO EDGES HAVE TWO DIFFERENT SOURCES, AND THAT IS THE POINT.
        // The LEFT is a fact about the DOM: the station and heart readings are
        // positioned `left: 0` inside the figure block, so the rows must clear
        // THEM — hence `fig`, and hence the inset survives the band. The RIGHT
        // is a fact about the instrument's width, so it is the band's. Both
        // halves are drawn while `kx` crosses, so a right edge that disagreed
        // with the spectrum's would make the instrument visibly change width
        // the moment a member taps Match my BPM.
        const x0 = fig.x + fig.w * 0.27;
        const x1 = band.x + band.w;
        const RW = x1 - x0;
        const pps = penSpeed(RW);
        const px = penX(t, x0, RW);
        const yS = fig.y + fig.h * 0.30;
        const aS = fig.h * 0.20;
        const yH = fig.y + fig.h * 0.72;
        const aH = fig.h * 0.17;
        const lockK = lockRef.current;
        const eH = hrBpm == null ? 0 : Math.exp(-hrPhaseRef.current / 0.13);

        // The heart's beats inside the window — the ones this loop RECORDED as
        // they arrived, not a reconstruction from the current rate.
        const hb = hrBeatsRef.current;
        // The station's beats over the same window — the grid the detector
        // settled on, or nothing at all.
        const sb = read ? tempoBeatsBetween(read.bpm, read.phase, t - ROW_WINDOW_S - 0.5, t) : [];

        const heartCol = lockK > 0
          ? `rgb(${Math.round(224 + (52 - 224) * lockK)},${Math.round(101 + (214 - 101) * lockK)},${Math.round(71 + (197 - 71) * lockK)})`
          : cfg.heart;

        ctx.save();
        // ⚠ THE TIES ARE PAIRED, NEVER DRAWN ON RATE ALONE. Two rates can agree
        // while their beats sit half a period apart, so `ties` only returns a
        // pair whose members genuinely land within TIE_TOL_S of each other — the
        // drawing may not assert an alignment the measurement does not have.
        if (lockK > 0 && hb.length && sb.length) {
          ctx.strokeStyle = cfg.teal;
          ctx.lineWidth = 1;
          for (const pair of ties(sb, hb, TIE_TOL_S)) {
            const back = (t - pair.station) * pps;
            if (back > RW - GAP_PX) continue;
            let x = px - back;
            if (x < x0) x += RW;
            ctx.globalAlpha = 0.32 * lockK * kx * (1 - 0.4 * back / RW);
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, yS + 3);
            ctx.lineTo(Math.round(x) + 0.5, yH - aH - 2);
            ctx.stroke();
          }
        }

        // One row, sampled every half pixel. The stroke is broken at the gap and
        // re-opened whenever the age fade changes, so the trace dissolves into
        // the gap instead of being cut off mid-stroke.
        const row = (yBase, amp, colour, valueAt) => {
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          let open = false;
          let lastQ = -1;
          for (let x = x0; x < x1; x += SAMPLE_STEP_PX) {
            const q = Math.round(alphaAt(x, px, RW, kx) * 20);
            if (q === 0) { if (open) { ctx.stroke(); open = false; } continue; }
            const y = yBase - amp * valueAt(instantAt(x, px, RW, t));
            if (!open) { ctx.globalAlpha = q / 20; ctx.beginPath(); ctx.moveTo(x, y); open = true; lastQ = q; continue; }
            if (q !== lastQ) { ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = q / 20; ctx.beginPath(); ctx.moveTo(x, y); lastQ = q; continue; }
            ctx.lineTo(x, y);
          }
          if (open) ctx.stroke();
          ctx.globalAlpha = 1;
        };

        // ⚠ THE STATION ROW WAITS RATHER THAN TICKING TO A GUESS. With no settled
        // grid there are no beat instants, so the trace is flat — which is the
        // honest picture of "we have not measured a tempo yet" and is exactly
        // what §7's table asks for.
        if (read) {
          const p = 60 / read.bpm;
          row(yS, aS, cfg.teal, (tt) => kickShape(((tt - read.phase) % p + p) % p));
        } else {
          ctx.strokeStyle = cfg.teal;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.38 * kx;
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(x0, yS); ctx.lineTo(x1, yS); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // ⚠ NO STRAP → A DASHED FLAT LINE, NEVER A NUMBER. The shipped page
        // fabricated 114 BPM for a member with nothing on their chest and then
        // eased that invention into "sync". A row with no source says so.
        if (hrBpm == null) {
          ctx.strokeStyle = cfg.heart;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.38 * kx;
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(x0, yH); ctx.lineTo(x1, yH); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else {
          row(yH, aH, heartCol, (tt) => {
            let v = 0;
            for (let i = 0; i < hb.length; i += 1) {
              const u = tt - hb[i];
              if (u >= 0 && u < 0.42) v += ecg(u);
            }
            return v;
          });
        }

        // The pen dots — where each row is being written now, each on its own pulse.
        ctx.fillStyle = cfg.teal;
        ctx.globalAlpha = (0.45 + 0.55 * kick) * kx;
        ctx.beginPath(); ctx.arc(px, yS, penRadius(kick), 0, Math.PI * 2); ctx.fill();
        if (hrBpm != null) {
          ctx.fillStyle = heartCol;
          ctx.globalAlpha = (0.45 + 0.55 * eH) * kx;
          ctx.beginPath(); ctx.arc(px, yH, penRadius(eH), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    };
    raf = window.requestAnimationFrame(frame);

    return () => {
      stopped = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (ro) { try { ro.disconnect(); } catch { /* already gone */ } }
      if (mq) {
        try {
          if (mq.removeEventListener) mq.removeEventListener('change', onMq);
          else if (mq.removeListener) mq.removeListener(onMq);
        } catch { /* already gone */ }
      }
      // ⚠ A TEMPO IS ONLY MEASURABLE WHILE SOMETHING IS READING THE ANALYSER, so
      // leaving the page clears it rather than leaving a stale number on the
      // context for Home to draw. A reading nobody is taking is not a reading.
      // ⚠ AND THE MEMO IS RESET WITH IT. Without this a remount that settles on
      // the same tempo as last time would compare equal to a stale `saidRef` and
      // never report it — the page would sit at "—" over a detector that had
      // already settled.
      saidRef.current = undefined;
      sigRef.current = undefined;
      railRef.current = undefined;
      startedRef.current = false;
      const cfg = liveRef.current;
      if (cfg && cfg.onRead) cfg.onRead(null);
      if (cfg && cfg.onRail) cfg.onRail(0);
      // ⚠ AND THE SIGNAL GOES BACK TO UNKNOWN, NOT TO FALSE. Nothing is reading
      // the analyser once this unmounts, so "the stream sends no data" is a claim
      // we are no longer entitled to make — and leaving it false would paint the
      // no-signal line over a page that is simply not being looked at.
      if (cfg && cfg.onSignal) cfg.onSignal(null);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <canvas ref={cvsRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
function BSRadioScreen({ onBack }) {
  const t = useBS();
  const r = useBSRadio();
  const tr = useShapeTr();
  // ⚠ `playlist` WENT WITH THE HERO THAT READ IT. It was a permanent `null`
  // feeding two branches — a "Coach Playlist" rail label and a "From {name} ·
  // {bpm} BPM" line — that no render could ever reach, and whose keys were being
  // shipped to thirteen locales for a channel that does not exist. `onLive` is a
  // permanent `true` on the same footing; it is still READ by the channel row
  // below, so it stays until PR 4 retires that row's constants.
  const onLive = true;
  const np = radioNowPlayingDisplay(r.nowPlaying);
  // Shared like/dislike + comments for the track on air. Key off the provider's
  // raw-derived currentSongKey (not np's '—'-filled display copy) so the read and
  // the writes agree (Codex P2 #1781); the raw track feeds vote/comment.
  const screenKey = r.currentSongKey;
  const screenTrack = { a: r.nowPlaying?.title, b: r.nowPlaying?.artist };
  const screenSocial = (screenKey && r.songSocial[screenKey]) || RADIO_SOCIAL_EMPTY;
  // ⚠ THE STATION'S TEMPO IS MEASURED OR IT IS "—". This was `r.LIVE.bpm` — a
  // 132 typed into a constant and rendered in three places as though somebody had
  // counted it. `tempoRead` is whatever the signal field's detector has settled
  // on THIS second, and it is null far more often than it is a number: a talk
  // segment, a breakdown, a stream with no CORS header and a paused player all
  // read null, and the page says "—" rather than guessing.
  const [tempoRead, setTempoRead] = useStateBR(null);
  const stationBpm = tempoRead ? tempoRead.bpm : null;
  // ⚠ THREE STATES, NOT TWO: null is "nobody is reading the analyser", false is
  // "we read it and it carries nothing". Only the second is a fact about the
  // STREAM, and only the second earns the line below.
  const [hasSig, setHasSig] = useStateBR(null);
  // How many of the rail's five bars are lit — a COUNT, reported up only when it
  // moves, so a 60Hz loop cannot re-render the page 60 times a second.
  const [railLit, setRailLit] = useStateBR(0);
  // Someone previewing the app sees the instrument running on a SIMULATED
  // station, labelled as one on the rail below. Owner ruling, 2026-09-15:
  // "i want to show what it would look like for someone previewing the app".
  const previewSim = useBSRadioPreview();
  const [hrmConnected, setHrmConnected] = useStateBR(false);
  const [liveHr, setLiveHr] = useStateBR(null); // real strap/watch reading (window.ShapeHRM)
  const [matching, setMatching] = useStateBR(false);
  const [showSets, setShowSets] = useStateBR(false);
  const [commentsOpen, setCommentsOpen] = useStateBR(false);
  // The figure block the canvas measures and draws inside. See the comment at
  // its own element, and the one at `measureFigure` in the field.
  const figureRef = useRefBR(null);
  // ⚠ `demoHr` IS GONE, AND ITS DELETION IS THE POINT. It seeded 114 and eased
  // that invented figure toward the station's, so "Connect monitor" with nothing
  // on your chest fabricated a heart rate and then "locked" it — flagged in the
  // marketing recipe on 2026-09-02 and live until now. No strap → no number.
  // ⚠ NO MEASURED TEMPO MEANS NO GAP — NOT A GAP OF ZERO, AND NOT NaN. `bpmGap`
  // answers null unless BOTH ends are finite and positive, so a strap with no
  // settled station tempo (and a settled tempo with no strap) both read "—"
  // rather than presenting a subtraction nobody could make.
  const signedDelta = bpmGap(liveHr, stationBpm);
  const isSynced = hrmConnected && inSync(signedDelta);
  // HR sync stage machine: off → free (connected) → matching → synced
  const hrStage = !hrmConnected ? 'off' : (matching ? (isSynced ? 'synced' : 'matching') : 'free');
  const hrStatus = { off: tr('radio:hr.notConnected', { defaultValue: 'Not connected' }), free: liveHr != null ? tr('radio:hr.live', { defaultValue: 'Live' }) : tr('radio:hr.free', { defaultValue: 'Free' }), matching: tr('radio:hr.matching', { defaultValue: 'Matching…' }), synced: tr('radio:hr.inSync', { defaultValue: 'In sync' }) }[hrStage];
  // Real readings stream in as shape:hrm events while a monitor is connected.
  // These events only ever come from a real device, so connected:false means the
  // monitor dropped — fully disconnect rather than leaving a stale rate running.
  useEffectBR(() => {
    const onHr = (e) => {
      const d = e.detail || {};
      if (d.connected === false) {
        setLiveHr(null); setHrmConnected(false);
        return;
      }
      if (Number.isFinite(d.bpm) && d.bpm > 0) { setLiveHr(d.bpm); setHrmConnected(true); }
    };
    window.addEventListener('shape:hrm', onHr);
    return () => window.removeEventListener('shape:hrm', onHr);
  }, []);
  const connectMonitor = async () => {
    if (!window.ShapeHRM?.available?.()) return;
    try {
      await window.ShapeHRM.connect();
      setHrmConnected(true);
    } catch { /* cancelled, or no strap in range — the heart row says so in words */ }
  };
  // ⚠ *× LISTEN ONLY* RELEASES THE STRAP AS WELL AS THE MODE, BECAUSE IT IS THE
  // PAGE'S ONLY WAY OUT. The card this layout replaces carried a separate ✕ that
  // disconnected the monitor; collapsing the card without moving that job would
  // have left a member able to OPEN a Bluetooth connection and never close it —
  // a radio holding a strap awake for the rest of the session. "Listen only" is
  // exactly the outcome, and the key reads *Connect monitor* again afterwards,
  // so nothing about the state is hidden.
  const listenOnly = () => {
    setMatching(false);
    try { window.ShapeHRM?.disconnect?.(); } catch { /* already gone */ }
    setHrmConnected(false);
    setLiveHr(null);
  };

  // ⚠ THE KEY ENTERS MATCHING WHETHER OR NOT A STRAP ANSWERS, AND THAT IS THE
  // HONEST SHAPE. Gating the mode on a connected strap makes the key a dead tap
  // for every member without one — the failure §7 gives its own row to: a dashed
  // flat line, "——", and *No pulse · connect a monitor*, which is somewhere to
  // be rather than nothing happening.
  const toggleMatch = () => {
    if (matching && hrStage !== 'off') { listenOnly(); return; }
    setMatching(true);
    if (!hrmConnected) connectMonitor();
  };
  // ── the session clock ───────────────────────────────────────────────────────
  // ⚠ IT TICKS ONLY WHILE SOMETHING IS PLAYING. A clock left running over a
  // paused stream counts time nobody is listening to, so `playingSince` is
  // cleared by the provider the moment playback stops and this reads "Paused".
  const [clockNow, setClockNow] = useStateBR(() => Date.now());
  useEffectBR(() => {
    if (r.playingSince == null) return undefined;
    setClockNow(Date.now());
    const id = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [r.playingSince]);
  const sessionClock = r.playingSince == null
    ? tr('radio:screen.paused', { defaultValue: 'Paused' })
    : (() => {
      const secs = Math.max(0, Math.floor((clockNow - r.playingSince) / 1000));
      const hh = Math.floor(secs / 3600);
      const mm = Math.floor((secs % 3600) / 60);
      const ss = secs % 60;
      const two = (n) => String(n).padStart(2, '0');
      return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
    })();

  // ── Nora watch (preview) ─────────────────────────────────────────────────────
  const [noraOn, setNoraOn] = useStateBR(false);
  const [noraFailed, setNoraFailed] = useStateBR(false);
  const noraCanvasRef = useRefBR(null);
  const noraStageRef = useRefBR(null);
  const noraColorRef = useRefBR(t.ACCENT);
  const toggleNora = () => setNoraOn(v => !v);
  useEffectBR(() => {
    if (!noraOn) return;
    setNoraFailed(false);
    let disposed = false;
    (async () => {
      try {
        if (!window.WebGLRenderingContext) { setNoraFailed(true); return; }
        const an = window.ShapeRadioLive?.analyser?.();
        // The projection takes the page's accent. This is the accent at CONSTRUCTION;
        // a later change is carried by the effect below, because this effect depends
        // on noraOn alone and re-running it would re-download the VRM.
        const st = new NoraStage({ canvas: noraCanvasRef.current, analyser: an, modelUrl: `${import.meta.env.BASE_URL}nora/placeholder.vrm`, color: t.ACCENT });
        await st.load();
        if (disposed) { st.dispose(); return; }
        st.start();
        noraStageRef.current = st;
        if (noraColorRef.current) st.setColor(noraColorRef.current);
      } catch (e) { console.warn('[nora] stage failed', e); setNoraFailed(true); }
    })();
    return () => { disposed = true; if (noraStageRef.current) { noraStageRef.current.dispose(); noraStageRef.current = null; } };
  }, [noraOn]);
  // ⚠ THE ACCENT IS LIVE AND THE STAGE IS ASYNC, SO BOTH DIRECTIONS ARE COVERED.
  // The booth around the canvas reads t.ACCENT at render, so it recolours on that
  // frame; without this the shader keeps the colour it was constructed with and the
  // preview is two colours until Nora is toggled. An accent changed WHILE the VRM is
  // still loading reaches no stage at all, so the latest one is kept in a ref and the
  // load applies it on arrival.
  useEffectBR(() => {
    noraColorRef.current = t.ACCENT;
    if (noraStageRef.current) noraStageRef.current.setColor(t.ACCENT);
  }, [t.ACCENT]);

  // Section accent — follows the global Appearance accent so Radio's
  // colored highlights (kicker, italic "Radio.", EQ, beat ring, play button,
  // NEW pills, channel rules) recolor with the rest of the app.
  const TEAL = t.ACCENT;
  // The heart's own colour — see the note at BS_HEART. It is deliberately NOT
  // the theme accent: the two rows have to be told apart at a glance.
  const HEART = BS_HEART;

  // Foreground tones — track paper mode. On dark paper we use cream; on light
  // paper we fall back to the regular ink scale so the radio page reads clean
  // either way.
  const isLight = !!t.isLight;
  const CREAM   = isLight ? t.INK   : '#f4ede0';
  const CREAM70 = isLight ? t.INK70 : 'rgba(244,237,224,0.72)';
  const CREAM50 = isLight ? t.INK50 : 'rgba(244,237,224,0.5)';
  const CREAM25 = isLight ? t.INK30 : 'rgba(244,237,224,0.25)';
  const CREAM12 = isLight ? t.RULE  : 'rgba(244,237,224,0.12)';
  const CARD    = isLight ? t.PAPER2 : 'rgba(15,18,18,0.55)';
  const RULE_DK = isLight ? t.RULE  : 'rgba(244,237,224,0.18)';

  if (showSets) return <BSShapeSetsScreen onBack={() => setShowSets(false)} />;

  return (
    <div className="bs-scroll" style={{
      position: 'absolute', inset: 0, overflow: 'auto',
      fontFamily: t.DISPLAY,
      color: CREAM,
      scrollbarWidth: 'none', msOverflowStyle: 'none',
      backgroundColor: t.PAPER,
    }}>
      {/* Top fade so the masthead area sits cleanly on the portrait */}
      <div aria-hidden style={{
        position: 'sticky', top: 0, height: 0, zIndex: 1,
      }} />

      {/* HEADER — translucent so portrait shows through */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 11px`, borderBottom: `1px solid ${RULE_DK}`, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BSLogo size={16} color={CREAM} />
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: CREAM70 }}>
              {tr('radio:masthead.volNo', { defaultValue: 'Vol. 1 · No. 1' })}
            </div>
          </div>
          {/* Canonical trailing corners (owner ruling 2026-08-01), from the one
              module-scope cluster. ⚠ THIS PAGE IS NOT FIXED-DARK, WHICH THIS
              COMMENT USED TO CLAIM: the whole palette below derives from
              `t.isLight`, so on light paper CREAM *is* the theme ink and the
              `ink` variant is simply the right one either way. (The Sets
              screen's identical comment IS correct — that screen is
              literal-palette. Fix the one, leave the other.) */}
          {bsRadioCorner(CREAM)}
        </div>
        {/* Universal back row — own row, flush left, under the mast (2026-07-14). */}
        <button onClick={onBack} style={{
          marginTop: 12, display: 'inline-flex', padding: '8px 2px', background: 'transparent', color: CREAM, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800,
        }}>{tr('radio:screen.back', { defaultValue: '← Back' })}</button>
        <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, textAlign: 'center' }}>
          {tr('radio:screen.sectionMusic', { defaultValue: 'Section · Music' })}
        </div>
        <div style={{
          marginTop: 17,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <BSRadioWordmark width="min(86%, 330px)" style={{ margin: '0 auto' }} />
        </div>
      </div>

      {/* ⚠ THE HERO IS THE INSTRUMENT, AND EVERYTHING IN IT IS A READING.
          This block was a listener count nobody counted, a BPM ring beating to a
          typed-in 132, a CSS-sine EQ next to an idle analyser and a scrubber
          parked at `0:00 / -0:00`. It is D · The Signal Field now (the owner's
          pick, 2026-09-14): two states of ONE instrument — the station's live
          spectrum while you are listening, two pulse rows on one clock while you
          are matching — over a field of dots whose brightness is the spectrum and
          whose breath is the MEASURED beat. Anything unmeasured reads "—". */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderBottom: `1px solid ${RULE_DK}`,
        background: 'transparent',
      }}>
        {/* Full-bleed soft teal glow — fills the whole screen, no inset frame */}
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          background: `radial-gradient(95% 42% at 50% 17%, ${TEAL}1f, ${TEAL}08 42%, transparent 62%)`,
          pointerEvents: 'none',
        }} />
        {/* ⚠ THE PAGE'S GROUND, AND THE ONLY THING ON IT THAT MOVES. The stage
            light stays as painted atmosphere; the field, the spectrum and the
            rows are the analyser, drawn per frame, and they draw nothing at all
            over a frame that carries no data. */}
        <BSRadioSignalField
          paused={r.paused} matching={matching} heartBpm={liveHr}
          teal={TEAL} heart={HEART} ink={CREAM} paper={t.PAPER} figureRef={figureRef}
          preview={previewSim}
          onRead={setTempoRead} onSignal={setHasSig} onRail={setRailLit}
        />
        <BSStageLight color={TEAL} opacity={0.1} paused={r.paused} />

        <div style={{ position: 'relative', zIndex: 2, padding: `12px ${t.padX}px 16px` }}>
          {/* The mode label — which of the instrument's two states you are in. */}
          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: matching ? HEART : TEAL }}>
            {matching
              ? tr('radio:screen.matching', { defaultValue: 'Matching · station × heart' })
              : tr('radio:screen.listening', { defaultValue: 'Listening · the station' })}
          </div>

          {/* THE RAIL — on air + the session clock, the signal's own strength,
              and at the right either the measured tempo (listening) or the lock
              (matching). ⚠ NO LISTENER COUNT: this read "On Air · 3,472" from
              `BS_LIVE_STATION.listeners`, a number nobody has counted on a
              station that is not broadcasting (brief §12, ruling 2). */}
          <div style={{ marginTop: 11, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div>
              {/* ⚠ THE BLINKING RED DOT IS THE BROADCAST CLAIM, SO IT GOES WHERE
                  THE CLAIM DOES. On the preview this rail would otherwise read
                  "● ON AIR" over bars the page itself generated — and one line
                  under a label saying the signal is an example, which is worse
                  than either half alone. The house rule is not "never say it"
                  but "never claim it unlabelled"; here the honest label REPLACES
                  the claim rather than sitting beside it. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: previewSim ? TEAL : CREAM50 }}>
                {!previewSim && <span style={{ width: 5, height: 5, borderRadius: 3, flexShrink: 0, background: '#ff5b4a', animation: 'bs-blink 1.2s ease-in-out infinite' }} />}
                {previewSim
                  ? tr('radio:rail.preview', { defaultValue: 'Preview' })
                  : tr('radio:rail.onAir', { defaultValue: 'On Air' })}
              </div>
              {/* ⚠ AND THE LABEL IS NOT SET IN THE READING FACE. Doto is this
                  page's numeral face precisely because "every measured figure
                  reads like a reading" (the 2026-09-10 type ruling) — so the one
                  thing on the rail that is NOT a measurement must not wear it.
                  The session clock keeps it; the example label is mono. */}
              {previewSim ? (
                <div style={{ marginTop: 4, maxWidth: 150, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', lineHeight: 1.35, color: CREAM50 }}>
                  {tr('radio:rail.exampleSignal', { defaultValue: 'Example signal' })}
                </div>
              ) : (
                <div style={{ marginTop: 3, fontFamily: BS_DOTO, fontSize: 15, fontWeight: 900, fontVariationSettings: "'ROND' 100", letterSpacing: '0.02em', color: CREAM }}>
                  {sessionClock}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: CREAM50 }}>
                {tr('radio:rail.signal', { defaultValue: 'Signal' })}
              </div>
              {/* Five bars off the analyser's own RMS — lit, or not lit. A frame
                  we cannot read lights none of them rather than claiming silence. */}
              <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: 14 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ width: 4, height: 5 + i * 2.2, borderRadius: 1, background: i < railLit ? TEAL : CREAM25 }} />
                ))}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              {matching ? (
                <React.Fragment>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: CREAM50 }}>
                    {tr('radio:rail.lock', { defaultValue: 'Lock' })}
                  </div>
                  <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: hrStage === 'synced' ? TEAL : hrStage === 'off' ? CREAM50 : '#e3a544' }}>
                    {hrStatus}
                  </div>
                  {signedDelta != null && (
                    <div style={{ marginTop: 4, fontFamily: BS_DOTO, fontSize: 13, fontWeight: 900, fontVariationSettings: "'ROND' 100", color: isSynced ? TEAL : '#e3a544' }}>
{tr('radio:hr.deltaBpm', { delta: gapText(signedDelta), defaultValue: '{delta} BPM' })}
                    </div>
                  )}
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: CREAM50 }}>
                    {tr('radio:rail.station', { defaultValue: 'Station · beat' })}
                  </div>
                  <div style={{ marginTop: 3, display: 'inline-flex', alignItems: 'baseline', gap: 5, color: stationBpm == null ? CREAM50 : TEAL }}>
                    <span style={{ fontFamily: BS_DOTO, fontSize: 17, fontWeight: 900, fontVariationSettings: "'ROND' 100", letterSpacing: '0.02em' }}>
                      {stationBpm == null ? '—' : Math.round(stationBpm)}
                    </span>
                    <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.2em', fontWeight: 700 }}>BPM</span>
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>

          {/* ⚠ WHY THE PAGE SAYS NOTHING, WHEN IT CAN SAY IT HONESTLY. A stream
              that sends no `Access-Control-Allow-Origin` hands the analyser
              all-zero bins forever — the spectrum draws nothing and the tempo
              reads "—", and without this line that is indistinguishable from a
              station playing silence. It renders ONLY on `false` (we read the
              analyser and it carried nothing) and never on `null` (nothing is
              reading it yet), and never while paused, where an empty analyser is
              exactly what a paused player should produce.
              ⚠ AND IT REQUIRES THAT PLAYBACK IS ACTUALLY PERMITTED. Found by
              driving the page rather than by reading it: playback is gated on a
              signed-in account (licensing, not product — the provider's own
              effect pauses for anyone else), so a signed-out visitor's analyser
              reads all-zero for a reason that has NOTHING to do with the
              channel. Without this clause the page would blame the broadcaster
              for our own sign-in gate, which is the same class of false claim
              the line exists to remove. */}
          {hasSig === false && !r.paused && bsRadioSignedIn() && (
            <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: CREAM50, fontWeight: 600 }}>
              {tr('radio:screen.noSignalData', { defaultValue: 'No signal data from the channel' })}
            </div>
          )}

          {/* THE FIGURE — the spectrum, or the two rows. The canvas behind this
              block measures THIS element and draws inside it, so the baselines
              follow the layout rather than a literal: a longer mode label, the
              line above, a larger text setting all move the figure and the
              drawing with it. */}
          <div ref={figureRef} style={{ position: 'relative', height: 268, marginTop: 10 }}>
            {matching && (
              <React.Fragment>
                {/* Each row's reading at its left end — the station above in
                    teal, the heart below in rust, the same identity the rows
                    themselves carry. */}
                <div style={{ position: 'absolute', left: 0, top: '30%', transform: 'translateY(-50%)' }}>
                  <div style={{ fontFamily: BS_DOTO, fontSize: 17, fontWeight: 900, fontVariationSettings: "'ROND' 100", color: stationBpm == null ? CREAM50 : TEAL, lineHeight: 1 }}>
                    {stationBpm == null ? '—' : Math.round(stationBpm)}
                  </div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: stationBpm == null ? CREAM50 : `${TEAL}bf` }}>
                    {tr('radio:rail.station', { defaultValue: 'Station · beat' })}
                  </div>
                </div>
                <div style={{ position: 'absolute', left: 0, top: '72%', transform: 'translateY(-50%)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    {/* The monochrome heart glyph the house rule allows — never
                        an emoji — beside the reading it belongs to. */}
                    {liveHr != null && <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 12, color: isSynced ? TEAL : HEART }}>♡</span>}
                    <span style={{ fontFamily: BS_DOTO, fontSize: 17, fontWeight: 900, fontVariationSettings: "'ROND' 100", color: liveHr == null ? CREAM50 : (isSynced ? TEAL : HEART), lineHeight: 1 }}>
                      {liveHr == null ? '——' : Math.round(liveHr)}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: liveHr == null ? CREAM50 : `${HEART}cc` }}>
                    {tr('radio:rail.you', { defaultValue: 'You · heart' })}
                  </div>
                </div>
                {/* ⚠ NO STRAP → NO NUMBER, AND THE ROW SAYS WHY. The shipped page
                    invented 114 BPM for a member with nothing on their chest and
                    then eased that invention into "sync". */}
                {liveHr == null && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '84%', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: CREAM50 }}>
                    {tr('radio:hr.noPulse', { defaultValue: 'No pulse · connect a monitor' })}
                  </div>
                )}
              </React.Fragment>
            )}
          </div>

          {/* NOW — the track is the hero while listening, and steps back while
              matching so the rows have the room. */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 11, background: TEAL, display: 'inline-block' }} />
              {tr('radio:screen.nowPlaying', { defaultValue: 'Now Playing' })}
            </div>
            <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: matching ? 24 : 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: CREAM }}>
              {np.title}
            </div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, fontWeight: 600 }}>
              {np.artist}
            </div>
          </div>

          {/* Transport — the key reads the MEASURED state (bsRadioTransportKey),
              so it and the rail's clock can never disagree about the stream. */}
          {(() => {
            const signedIn = bsRadioSignedIn();
            const key = bsRadioTransportKey({ signedIn, playing: r.playingSince != null, paused: r.paused });
            const act = key === 'pause' ? () => r.setPaused(true)
              : key === 'resume' ? () => r.setPaused(false)
                : key === 'tune' ? () => r.retryPlay()
                  : null;
            const label = key === 'pause' ? `❚❚  ${tr('radio:screen.pause', { defaultValue: 'Pause' })}`
              : key === 'resume' ? `▶  ${tr('radio:screen.resume', { defaultValue: 'Resume' })}`
                : `▶  ${tr('radio:nowPlaying.tuneIn', { defaultValue: 'Tune in' })}`;
            return (
              <>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'stretch', gap: 8 }}>
                  <button disabled={!act} onClick={() => { if (act) act(); }} style={{ borderRadius: 12,
                    flex: 1, padding: '10px', background: act ? TEAL : 'transparent', color: act ? '#050707' : CREAM50,
                    border: act ? 0 : `1px solid ${CREAM25}`, cursor: act ? 'pointer' : 'default',
                    fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    {label}
                  </button>
                  <button onClick={() => r.setRadioPreference(false)} aria-label={tr('radio:screen.stop', { defaultValue: 'Stop' })} style={{ borderRadius: 12,
                    width: 46, background: 'transparent', color: CREAM, border: `1px solid ${CREAM25}`, cursor: 'pointer',
                    fontFamily: t.MONO, fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>■</button>
                </div>
                {/* ⚠ SIGNED OUT, THE DECK SAYS WHY IT IS OFF. Playback is
                    licensing-gated (bsRadioSignedIn), so the key above is
                    disabled — and a disabled key with nothing beside it is a
                    dead control. This is the social row's own nudge, one row up,
                    which is what the brief's §7 calls for on the signed-out row. */}
                {!signedIn && (
                  <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: CREAM50, textAlign: 'center' }}>
                    {tr('radio:screen.signInToListen', { defaultValue: 'Sign in to listen' })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Song social — shared like/dislike + a comments door. Renders ONLY on
              a real track (honest-absent on a placeholder). Counts are public;
              voting/commenting is signed-in only (an inline nudge, never a dead tap). */}
          {screenKey && (() => {
            const canReact = bsRadioSignedIn();
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[
                    { key: 'up', glyph: '+', count: screenSocial.up, label: tr('radio:nowPlaying.likeSong', { defaultValue: 'Like song' }) },
                    { key: 'down', glyph: '−', count: screenSocial.down, label: tr('radio:nowPlaying.dislikeSong', { defaultValue: 'Dislike song' }) },
                  ].map(item => {
                    const active = screenSocial.myVote === item.key;
                    return (
                      <button key={item.key} aria-label={item.label} disabled={!canReact}
                        onClick={() => r.voteSong(screenTrack, item.key)}
                        style={{ flex: 1, minHeight: 40, borderRadius: 12, cursor: canReact ? 'pointer' : 'default',
                          border: `1px solid ${active ? TEAL : CREAM25}`, background: active ? `${TEAL}1f` : 'transparent',
                          color: active ? CREAM : CREAM70, fontFamily: t.MONO, fontWeight: 800,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <span style={{ fontSize: 17 }}>{item.glyph}</span>
                        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{item.count}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setCommentsOpen(true)} aria-label={tr('radio:social.openComments', { defaultValue: 'Comments' })}
                    style={{ flex: 1, minHeight: 40, borderRadius: 12, cursor: 'pointer',
                      border: `1px solid ${CREAM25}`, background: 'transparent', color: CREAM70,
                      fontFamily: t.MONO, fontWeight: 800, fontSize: 11, letterSpacing: '0.08em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <span style={{ fontSize: 15 }}>❝</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{screenSocial.commentCount || 0}</span>
                  </button>
                </div>
                {!canReact && (
                  <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: CREAM50, textAlign: 'center' }}>
                    {tr('radio:social.signInToReact', { defaultValue: 'Sign in to react & comment' })}
                  </div>
                )}
              </div>
            );
          })()}

          {commentsOpen && screenKey && (
            <BSSongCommentsSheet
              t={t} tr={tr} title={np.title} artist={np.artist}
              social={screenSocial}
              onComment={(text) => r.commentSong(screenTrack, text)}
              onClose={() => setCommentsOpen(false)}
            />
          )}

          {/* THE ONE WIDE KEY — the whole heart-rate sync card collapsed into the
              single control it always was. Its three surfaces (this key, the lock
              word and the gap) say three different things, which is the rule
              `tests/radio-hr-sync-labels.test.mjs` exists to keep. */}
          <button onClick={toggleMatch} style={{ borderRadius: 12, marginTop: 12, width: '100%',
            border: `1px solid ${hrStage === 'synced' ? TEAL : matching ? '#e3a544' : CREAM25}`,
            background: hrStage === 'synced' ? TEAL : matching ? '#e3a544' : 'transparent',
            color: hrStage === 'synced' || matching ? '#050707' : CREAM,
            padding: '13px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800,
          }}>
            <span style={{ fontSize: 11 }}>{matching ? '◉' : '↕'}</span>
{hrStage === 'off' ? tr('radio:hr.connectMonitor', { defaultValue: 'Connect monitor' }) : matching ? tr('radio:hr.matchingBeat', { defaultValue: 'Matching beat' }) : tr('radio:hr.matchMyBpm', { defaultValue: 'Match my BPM' })}
          </button>
          {matching && (
            <button onClick={listenOnly} style={{ display: 'block', margin: '9px auto 0', background: 'transparent', border: 0, cursor: 'pointer', padding: '6px 10px', color: CREAM50, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
              {tr('radio:hr.listenOnly', { defaultValue: '× Listen only' })}
            </button>
          )}

          {/* THE STRIP — a CHANNEL row, never a track list. Channels may be
              chosen; tracks never (prohibition 4 in this module's own header). */}
          <div style={{ marginTop: 16, display: 'flex', gap: 22, borderTop: `1px solid ${CREAM12}`, paddingTop: 12 }}>
            {[
              { key: 'live', on: true, label: tr('radio:strip.live', { defaultValue: 'Live' }), go: () => r.setChannel('live') },
              { key: 'sets', on: false, label: tr('radio:strip.sets', { defaultValue: 'Shape Sets' }), go: () => setShowSets(true) },
              { key: 'nora', on: noraOn, label: tr('radio:strip.nora', { defaultValue: 'Nora' }), go: toggleNora },
            ].map(s => (
              <button key={s.key} onClick={s.go} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '0 0 7px',
                borderBottom: `2px solid ${s.on ? TEAL : 'transparent'}`, color: s.on ? TEAL : CREAM50,
                fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Below-fold panel — tracks paper mode. Carries the page's bottom padding so
          its background fills all the way down (no color step / "border" above the nav). */}
      <div style={{ background: isLight ? t.PAPER : 'rgba(5,7,7,0.92)', paddingBottom: 80 + 28 }}>

        {/* ── NORA WATCH (preview) ──────────────────────────────────────────── */}
        <div style={{ padding: `14px ${t.padX}px 18px`, borderBottom: `1px solid ${RULE_DK}` }}>
          {/* Section eyebrow */}
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700, marginBottom: 12 }}>
            Nora · {tr('radio:nora.djPreview', { defaultValue: 'DJ preview' })}
          </div>
          {/* Canvas — shown when Nora is on */}
          {noraOn && (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', maxHeight: '56vh', borderRadius: 14, overflow: 'hidden',
              // The booth: the Signal Field's own 14px dot pitch as the room's ground, on the dark panel.
              background: `radial-gradient(circle, ${TEAL}1f 0.9px, transparent 1.1px) 0 0 / 14px 14px, #0b0d10`, marginBottom: 12 }}>
              <canvas ref={noraCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {/* THE PROJECTION'S ROOM — scanlines over the figure and a floor glow
                  under it, so she reads as light thrown into the booth rather than
                  a model in a box. The same grammar as RadioHologramDJ (the Booth).
                  Pointer-events none; the label above stays the label. */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse 60% 26% at 50% 100%, ${TEAL}33, transparent 70%), repeating-linear-gradient(0deg, ${TEAL}0a 0px, ${TEAL}0a 1px, transparent 1px, transparent 3px)` }} />
              <div aria-hidden style={{ position: 'absolute', left: '22%', right: '22%', bottom: 16, height: 1, pointerEvents: 'none',
                background: TEAL, opacity: 0.6, boxShadow: `0 0 14px ${TEAL}` }} />
              {noraFailed && (
                <img src={`${import.meta.env.BASE_URL}nora-avatar.png`} alt="Nora" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div aria-hidden style={{ position: 'absolute', top: 10, left: 10, fontFamily: t.MONO, fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', color: '#2ee0c4' }}>
                ● {tr('radio:nora.liveLabel', { defaultValue: 'LIVE' })} · NORA <span style={{ opacity: 0.6 }}>({tr('radio:nora.preview', { defaultValue: 'preview' })})</span>
              </div>
            </div>
          )}
          {/* Toggle button — instrument-plate style with accent spine */}
          <button onClick={toggleNora} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
            background: noraOn ? `${TEAL}1a` : 'transparent',
            color: noraOn ? TEAL : CREAM,
            border: `1px solid ${noraOn ? TEAL : CREAM25}`,
            borderLeft: `3px solid ${TEAL}`,
            borderRadius: 10,
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800,
          }}>
            <span style={{ fontSize: 13 }}>{noraOn ? '◉' : '○'}</span>
            {noraOn ? tr('radio:nora.hide', { defaultValue: 'Hide Nora' }) : tr('radio:nora.watch', { defaultValue: 'Watch Nora (preview)' })}
          </button>
        </div>

        {/* CHANNEL */}
        <DarkSection title={tr('radio:screen.channel', { defaultValue: 'Channel' })} meta={tr('radio:screen.liveChannel', { defaultValue: 'Live channel' })} cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        {/* Schedule state — the ON AIR tag appears only over a real stream. */}
        <div style={{ padding: `0 ${t.padX}px` }}><BSSetsLine tone="dark" /></div>
        {/* ⚠ AND THE ROW'S BARS ARE THE ANALYSER'S, NOT A SINE. This was
            `<BSEQ bars={5}>` — five bars on a CSS `@keyframes` loop, animating
            whether or not a single frame of audio had been sampled, three inches
            from a spectrum drawn off the real analyser. A picture of a signal is
            a claim about the signal. It reads `railLit` now: the same measured
            count the rail above it draws, so the two cannot disagree, and a frame
            we cannot read lights none of them rather than miming a broadcast. */}
        {/* ⚠ THE ROW'S META CARRIED A TYPED BPM AND A LISTENER COUNT, AND BOTH ARE
            GONE. `screen.liveStationMeta` read "Live station · 132 BPM · 3,472
            listening now" off `BS_LIVE_STATION` — two figures nobody has measured,
            on a station that is not broadcasting. What is left is the one thing
            that is true of the row: it is the live channel. */}
        <DarkChannelRow
          active={onLive} onClick={() => r.setChannel('live')}
          eyebrow={tr('radio:screen.live247', { defaultValue: 'LIVE · 24/7' })} eyebrowColor={TEAL}
          title={r.LIVE.show}
          meta={tr('radio:screen.liveChannel', { defaultValue: 'Live channel' })}
          right={<BSChannelMeter lit={railLit} teal={TEAL} dim={CREAM25} />}
          t={t} cream={CREAM} cream50={CREAM50} rule={RULE_DK} accent={TEAL}
        />

        {/* SHAPE SETS — its own section (header like CHANNEL) + a full-width row that
            matches the Shape Radio Station row width. Links to the about page. */}
        <DarkSection title="Shape Sets" meta="Club Shape" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        <button onClick={() => setShowSets(true)} style={{
          width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', color: CREAM, border: 0, borderBottom: `1px solid ${RULE_DK}`, borderLeft: `3px solid ${TEAL}`,
          display: 'flex', alignItems: 'center', gap: 12, padding: `14px ${t.padX}px`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ⚠ GATED ON A REAL SCHEDULE. This said "Live from Club Shape"
                unconditionally, over a series whose own page reads COMING SOON.
                `BSSetsLine` already gates its ON AIR tag on `sets.real`; this
                row now uses the same fact rather than asserting one. */}
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>
              {r.sets && r.sets.real ? `${tr('radio:sets.liveFrom', { defaultValue: 'Live from' })} Club Shape` : 'Club Shape'}
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM, marginTop: 4, lineHeight: 1.1 }}>Shape <span style={{ fontStyle: 'italic', color: TEAL }}>Sets.</span></div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: CREAM50, marginTop: 4, fontWeight: 600 }}>{tr('radio:screen.setsSubtitle', { defaultValue: 'What Shape Radio is · concert series · coach playlists' })}</div>
          </div>
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEAL, fontWeight: 800 }}>{tr('radio:screen.about', { defaultValue: 'About →' })}</span>
        </button>


        {/* ⚠ THE DEAD `UP NEXT` BLOCK IS DELETED, NOT LEFT BEHIND ITS `false`.
            It carried a schedule nobody published — a 6:00 PM slot, a "Tempo Run"
            and a named host — and it was still being counted as copy the app
            ships in English to twelve locales. A block that renders nothing is
            not free; it is the thing the next reader turns back on. The real
            schedule is `BSSetsLine`, which gates itself on `sets.real`. */}

      </div>

      <style>{`
        @keyframes bs-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}

// Dark variants of section/row used only inside BSRadioScreen so the paper portrait
// background can sit underneath without being washed out by paper-colored cards.
function DarkSection({ title, meta, cream, cream50, rule, t }) {
  return (
    <div style={{
      padding: `${t.sectGap}px ${t.padX}px 8px`,
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
    }}>
      <span style={{
        fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.24em',
        textTransform: 'uppercase', color: cream, fontWeight: 800,
        borderBottom: `2px solid ${cream}`, paddingBottom: 4,
      }}>{title}</span>
      {meta && <span style={{
        fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: cream50, fontWeight: 600,
      }}>{meta}</span>}
    </div>
  );
}

function DarkChannelRow({ active, onClick, eyebrow, eyebrowColor, title, meta, right, t, cream, cream50, rule, accent }) {
  const ink = t.isLight ? t.INK : cream, ink50 = t.isLight ? t.INK50 : cream50;
  return (
    <button onClick={onClick} style={{ borderRadius: 0, boxSizing: 'border-box',
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: `14px ${t.padX}px`, cursor: 'pointer', textAlign: 'left',
      background: active ? `${accent}10` : 'transparent',
      color: ink, border: 0, borderBottom: `1px solid ${rule}`,
      borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: eyebrowColor }}>{eyebrow}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: ink, marginTop: 4, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: ink50, marginTop: 4, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </button>
  );
}


// ── Shape Sets — an editorial "about Shape Radio + Shape Sets" page (mirrors the
// website's Shape Radio page), reached from the Radio screen. Sits on the Club
// Shape venue background (the same image the website radio page uses).
// Schedule times render in the MEMBER's selected UI language, not the device
// locale (the #1595 rule) — window.ShapeI18n.intlLocale() maps catalog codes
// Intl doesn't know. Falls back to 'en' rather than throwing on a bad tag.
function bsSetsTimeLabel(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const loc = (window.ShapeI18n && window.ShapeI18n.intlLocale && window.ShapeI18n.intlLocale()) || 'en';
  const opts = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  try { return new Intl.DateTimeFormat(loc, opts).format(d); }
  catch (e) { try { return new Intl.DateTimeFormat('en', opts).format(d); } catch (e2) { return ''; } }
}

// The schedule read, hoisted to the radio provider so the Shape Sets station,
// the radio screen and the muted bar all share ONE fetch. Polls once on open
// (the table is deliberately out of the realtime publication) and re-derives
// liveness every minute from the SAME fetched rows, so a set going on or off
// air flips every surface without a refetch.
//
// `real` is the stream gate: `station()` reports configured:false on the mock
// provider, and a scheduled row is NOT a broadcast. Members never see a LIVE
// badge over a stream that cannot play — that is the whole honesty contract of
// this build, so the flag is resolved here rather than at each render site.
function useBSSetsSchedule() {
  const [state, setState] = useStateBR({ live: null, next: null, upcoming: [], real: false });
  const rowsRef = useRefBR([]);
  const realRef = useRefBR(false);
  useEffectBR(() => {
    let on = true;
    const derive = () => { if (on) setState({ ...bsSetsNow(rowsRef.current, Date.now()), real: realRef.current }); };
    const load = () => Promise.all([
      window.ShapeNoraSets ? window.ShapeNoraSets.list() : Promise.resolve([]),
      window.ShapeRadioLive ? window.ShapeRadioLive.station() : Promise.resolve(null),
    ]).then(([rows, cfg]) => {
      if (!on) return;
      rowsRef.current = Array.isArray(rows) ? rows : [];
      realRef.current = !!(cfg && cfg.configured);
      derive();
    }).catch(() => {});
    load();
    // ⚠ The station route is SIGNED-IN ONLY, so a mount that beats the session
    // resolve reads configured:false. That errs SAFE — it under-reports rather
    // than painting a LIVE badge over a stream that cannot play, which is this
    // hook's stated contract — but under-reporting is still wrong, so re-read
    // once auth lands. The 60s interval only re-DERIVES from cached rows; it
    // never re-fetches, so without this the first read would stand for the
    // whole mount.
    const onAuth = () => { load(); };
    window.addEventListener('shape:identity', onAuth);
    const id = setInterval(derive, 60000);
    return () => { on = false; clearInterval(id); window.removeEventListener('shape:identity', onAuth); };
  }, []);
  return state;
}

function BSShapeSetsScreen({ onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const TEAL = t.ACCENT;
  const RUST = t.RUST || '#c0533b';
  const CREAM = '#f4ede0', CREAM70 = 'rgba(244,237,224,0.74)', CREAM50 = 'rgba(244,237,224,0.5)';
  const CARD = 'rgba(11,14,12,0.62)', RULE_DK = 'rgba(244,237,224,0.16)';
  const BG = `${import.meta.env.BASE_URL || '/'}club-shape-bg.jpg`;
  const examples = [
    { from: 'Maya Okafor', role: 'Trainer', ctx: 'UPPER PULL · TODAY', title: 'Upper Pull — Peak', meta: '95–130 BPM · 31 tracks · 1h 48m', note: 'Builds across the session. Peaks at your top sets — don’t pussyfoot that row.', accent: '#6a8cff', provider: 'Spotify' },
    { from: 'Rae Lindqvist', role: 'Nutritionist', ctx: 'SUNDAY PREP · 2 PM', title: 'Sunday Meal Prep', meta: '95–120 BPM · 32 tracks · 2h 18m', note: '2 hours. Enough to batch-cook without burning out — ends right as you’re plating.', accent: '#f2a94e', provider: 'Spotify' },
    { from: 'Diego Alvarez', role: 'Run coach', ctx: 'LONG RUN · SAT', title: '90-Minute Zone 2', meta: '168–172 BPM · 22 tracks · 1h 32m', note: 'Locked cadence. Don’t let the tempo drop after the 45-min mark — this’ll carry you.', accent: '#78d8a4', provider: 'Apple Music' },
  ];
  // A live set pins to the top of the list carrying a NOW tag; `_now` is a render
  // flag only and never rides back to the data layer. Reads the ONE schedule the
  // provider resolved — a second fetch here could disagree with the radio screen.
  const sched = useBSRadio().sets;
  const schedRows = useMemoBR(
    () => (sched.live ? [{ ...sched.live, _now: true }, ...sched.upcoming] : sched.upcoming),
    [sched.live, sched.upcoming],
  );
  const Glass = ({ children, style }) => (
    <div style={{ position: 'relative', overflow: 'hidden', background: CARD, backdropFilter: 'blur(14px) saturate(1.1)', WebkitBackdropFilter: 'blur(14px) saturate(1.1)', border: `1px solid ${RULE_DK}`, borderRadius: 14, padding: 20, ...style }}>
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.75 }} />
      {children}
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#0a0d0c' }}>
      {/* Club Shape backdrop + light scrim — absolute (NOT fixed) so they stay inside
          the phone frame. The image is pre-cropped to the frame ratio, so center/cover
          fills it cleanly; a light scrim keeps it visible (not washed out). */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, background: `#0a0d0c url('${BG}') center / cover no-repeat`, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, rgba(8,10,9,0.34), rgba(8,10,9,0.22) 45%, rgba(8,10,9,0.55))', pointerEvents: 'none' }} />

      <div className="bs-scroll" style={{ position: 'absolute', inset: 0, overflow: 'auto', zIndex: 1, fontFamily: t.DISPLAY, color: CREAM, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div style={{ minHeight: '100%', boxSizing: 'border-box', paddingBottom: 80 + 28, display: 'flex', flexDirection: 'column' }}>
          {/* HEADER — masthead like other mobile pages: Vol·No row, then the
              universal back row (← RADIO, plain mono text-action flush left —
              the bordered pill died with the placement sweep), eyebrow, title. */}
          <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {typeof BSLogo === 'function' && <BSLogo size={16} color={CREAM} />}
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: CREAM70 }}>{tr('radio:masthead.volNo', { defaultValue: 'Vol. 1 · No. 1' })}</div>
              </div>
              {/* Canonical trailing corners — CREAM `ink` variant, this page is
                  fixed-dark on the venue ground (owner ruling 2026-08-01). Same
                  module-scope cluster the radio screen uses.
                  ⚠ The venue ground is passed EXPLICITLY because this screen's
                  palette is a set of literals, not derived from `t.isLight` —
                  without it the live presence dot's surround would render in
                  light paper on the unchanging dark venue. The radio screen
                  deliberately passes nothing: it IS theme-adaptive, so there the
                  avatar's `t.PAPER` fallback is the correct surface. */}
              {/* No corner: Shape Sets is a drill-in held in BSRadioScreen's local
                  showSets, while the nav descriptor records only tab:'radio' — the
                  avatar unmounts the radio screen and back returns to the root. */}
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={onBack} aria-label="Radio" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, padding: '8px 2px', cursor: 'pointer', color: CREAM, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1 }}>
                <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>←</span>Radio
              </button>
            </div>
            <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700 }}>{tr('radio:screen.sectionMusic', { defaultValue: 'Section · Music' })}</div>
            <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: CREAM }}>Shape <span style={{ fontStyle: 'italic', color: TEAL }}>Sets.</span></h1>
          </div>

          {/* HERO — centered in the remaining space; no box, just the content over
              the Club Shape backdrop (title lives in the page header above). A soft
              local vignette keeps the text readable without darkening the whole image. */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: `8px ${t.padX}px`, background: 'radial-gradient(120% 60% at 50% 50%, rgba(8,10,9,0.62), rgba(8,10,9,0.18) 72%, transparent 88%)' }}>
            <div style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 18 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: TEAL, animation: 'bs-blink 1.6s ease-in-out infinite' }} />
                <span style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: CREAM }}>{tr('radio:sets.liveFrom', { defaultValue: 'Live from' })} <span style={{ fontStyle: 'italic', color: TEAL }}>Club Shape</span></span>
              </div>
              <p style={{ fontFamily: t.BODY || t.DISPLAY, fontSize: 14.5, fontWeight: 500, color: 'rgba(244,237,224,0.92)', margin: '0 auto', maxWidth: 360, lineHeight: 1.55 }}>{tr('radio:sets.introA', { defaultValue: 'A virtual concert series broadcast straight from' })} <strong style={{ color: CREAM, fontWeight: 700 }}>Club Shape</strong>{tr('radio:sets.introB', { defaultValue: ', our flagship venue. DJs and live acts, captured on the floor and streamed through Shape Radio.' })}</p>
              <div style={{ marginTop: 24, fontFamily: t.MONO, fontSize: 14, letterSpacing: '0.26em', textTransform: 'uppercase', color: TEAL, fontWeight: 700 }}>{tr('radio:sets.comingSoon', { defaultValue: 'Coming soon' })}</div>
            </div>
          </div>

          {/* COMING UP — the real schedule. A set that is on air right now pins to
              the top with a NOW tag; everything else is the next 7 days. Absent a
              schedule (pre-migration, or simply nothing booked) this says so
              plainly rather than staging an empty grid. */}
          <div style={{ padding: `0 ${t.padX}px 12px` }}>
            <Glass>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700 }}>{tr('radio:sets.comingUp', { defaultValue: 'Coming up' })}</div>
              {schedRows.length === 0 ? (
                <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.06em', color: CREAM50 }}>{tr('radio:sets.empty', { defaultValue: 'Schedule lands with the first broadcast.' })}</div>
              ) : schedRows.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 0', borderTop: i ? `1px solid ${RULE_DK}` : 'none' }}>
                  <span style={{ flex: '0 0 auto', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: s._now ? TEAL : CREAM70, fontWeight: s._now ? 800 : 600 }}>
                    {s._now ? tr('radio:sets.nowTag', { defaultValue: 'Now' }) : bsSetsTimeLabel(s.starts_at)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: CREAM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span style={{ flex: '0 0 auto', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: CREAM50 }}>{s.dj}</span>
                </div>
              ))}
            </Glass>
          </div>
        </div>
      </div>
      <style>{`@keyframes bs-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
    </div>
  );
}

// Expose
Object.assign(window, {
  BSRadioProvider, useBSRadio,
  BSRadioPrompt, BSNowPlaying, BSRadioScreen, BSShapeSetsScreen,
  BSEQ, BSHalftoneAurora, BSStageLight,
  BS_COACH_PLAYLISTS,
});
