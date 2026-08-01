import React from 'react';
import { createPortal } from 'react-dom';
import { NoraStage } from '../../../public/newdesign/noraStage.mjs';
import { bsSetsNow } from '../../../public/newdesign/noraSets.mjs';
// iosAppBroadsheetRadio.jsx — Shape Radio in the Broadsheet visual language.
// Provides:
//   • BSRadioPrompt    — full-screen overlay asking "Listen to Shape Radio while in the app?"
//   • BSNowPlaying     — Home page widget showing what's currently playing + light effects
//   • BSRadioScreen    — full radio page (live + coach playlists)
//   • BSRadioContext   — global "is radio on, what's playing" state
//
// Visual rhythm: black ink, cream paper, hairlines + slabs.
// Light effects:
//   - Audio-bar EQ in mono ink (animated heights).
//   - "Halftone aurora" — subtle dot field that drifts behind the now-playing card.
//   - Pulsing accent radial that breathes with BPM.
//   - Optional "stage lights" — diagonal cream/dark sweep at edges.

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
const BS_LIVE_STATION = {
  name: 'Shape Radio',
  show: 'Shape Radio Station',
  bpm: 132,
  listeners: 3472,
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

function BSRadioProvider({ children }) {
  // Persisted radio preference (device-level localStorage) so the "Want music
  // while you move?" prompt is asked ONCE — after the user answers it (play or
  // muted), it never auto-shows again on a later launch / re-login. Seed from it.
  const _radioPref = safeReadRadioJSON('shape.radio.pref', null); // { asked, on } | null
  const [radioOn, setRadioOn]       = useStateBR(_radioPref ? !!_radioPref.on : false);
  const [askedPrompt, setAsked]     = useStateBR(_radioPref ? !!_radioPref.asked : false);
  const [showPrompt, setShowPrompt] = useStateBR(false);
  const [paused, setPaused]         = useStateBR(_radioPref ? !_radioPref.on : true);
  // currently-playing track index in BS_LIVE_STATION.tracks (0 == "NOW") — kept
  // for the muted/fallback display path; live now-playing overrides via nowPlaying state.
  const [trackIdx, setTrackIdx]     = useStateBR(0);
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

  // Auto-prompt once after first render (post-login simulation)
  useEffectBR(() => {
    if (!askedPrompt) {
      const tm = setTimeout(() => setShowPrompt(true), 600);
      return () => clearTimeout(tm);
    }
  }, [askedPrompt]);

  // Drive the live stream and now-playing poll.
  // - radioOn=false  → stop audio + stop poll.
  // - radioOn=true, paused=true  → pause audio; keep poll running (harmless).
  // - radioOn=true, paused=false → play audio + ensure poll is running.
  useEffectBR(() => {
    if (!radioOn) {
      window.ShapeRadioLive?.pause?.();
      window.ShapeRadioLive?.stopPolling?.();
      setNowPlaying(null); // honest-data: don't keep presenting the last track after radio is off
      return () => {};
    }
    // Start poll once (covers both paused and playing states so now-playing stays fresh).
    window.ShapeRadioLive?.startPolling?.((np) => setNowPlaying(np));
    if (paused) {
      window.ShapeRadioLive?.pause?.();
    } else {
      window.ShapeRadioLive?.play?.();
    }
    return () => window.ShapeRadioLive?.stopPolling?.();
  }, [radioOn, paused]);

  // The key for the track on air, built from the RAW now-playing fields (NOT the
  // '—'-substituted display copy), so a title-only or artist-only track keys the
  // same everywhere — the read (loadSongSocial) and the writes (voteSong /
  // commentSong) must agree on it (Codex P2 on #1781). Null when nothing real is
  // playing. The load effect lives BELOW loadSongSocial's declaration (Codex P1:
  // referencing it in a dep array above its const is a render-time TDZ crash, and
  // BSRadioProvider wraps the whole app shell).
  const currentSongKey = (nowPlaying && (nowPlaying.title || nowPlaying.artist))
    ? makeRadioTrackKey({ a: nowPlaying.title, b: nowPlaying.artist }) : null;

  function persistRadioPref(asked, on) {
    try { window.localStorage && window.localStorage.setItem('shape.radio.pref', JSON.stringify({ asked: !!asked, on: !!on })); } catch {}
  }

  function answerPrompt(yes) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!yes);
    setPaused(!yes);
    persistRadioPref(true, !!yes); // answered once → never auto-prompt again
  }

  function requestRadioPrompt() {
    setAsked(false);
    setShowPrompt(true);
  }

  function setRadioPreference(enabled) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!enabled);
    setPaused(!enabled);
    persistRadioPref(true, !!enabled);
  }

  // Fetch the shared social for a track key (counts + my vote + recent comments)
  // and cache it. Public read — works signed-out (myVote just stays null).
  const loadSongSocial = useCallbackBR(async (key) => {
    if (!key || key === 'unknown') return;
    setSongSocial(prev => ({ ...prev, [key]: { ...RADIO_SOCIAL_EMPTY, ...(prev[key] || {}), loading: !prev[key] } }));
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.get(key) : null;
      if (s) setSongSocial(prev => ({ ...prev, [key]: { ...s, loading: false } }));
      else setSongSocial(prev => ({ ...prev, [key]: { ...(prev[key] || RADIO_SOCIAL_EMPTY), loading: false } }));
    } catch (e) {
      setSongSocial(prev => ({ ...prev, [key]: { ...(prev[key] || RADIO_SOCIAL_EMPTY), loading: false } }));
    }
  }, []);

  // Like/dislike the track. Optimistic (the tap feels instant), then reconciled
  // with the server's authoritative counts; reverts on failure. Returns true on
  // success, false if it couldn't (e.g. signed out) so the caller can nudge.
  const voteSong = useCallbackBR(async (track, vote) => {
    const key = makeRadioTrackKey(track);
    if (!key || key === 'unknown') return false;
    const before = songSocial[key] || { ...RADIO_SOCIAL_EMPTY };
    setSongSocial(prev => ({ ...prev, [key]: bsApplyOptimisticVote(prev[key] || RADIO_SOCIAL_EMPTY, vote) }));
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.vote(key, vote) : null;
      if (s) setSongSocial(prev => ({ ...prev, [key]: { ...s, loading: false } }));
      return true;
    } catch (e) {
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
    try {
      const s = window.ShapeRadioSong ? await window.ShapeRadioSong.comment(key, body) : null;
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
    radioOn, setRadioOn, setRadioPreference, paused, setPaused,
    trackIdx, setTrackIdx, nowPlaying, activeChannel, setChannel,
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

// BPM ring — pulses on the beat
function BSBeatRing({ bpm = 132, size = 42, color, paused = false }) {
  const t = useBS();
  const c = color || t.INK;
  const dur = (60 / bpm).toFixed(3) + 's';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: `1.5px solid ${c}`,
        animation: paused ? 'none' : `bs-beat-ring ${dur} ease-out infinite`,
      }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: c,
      }}>{bpm}</div>
      <style>{`
        @keyframes bs-beat-ring {
          0%   { transform: scale(0.92); opacity: 0.95; }
          50%  { transform: scale(1.0);  opacity: 0.55; }
          100% { transform: scale(1.18); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

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
            {tr('radio:prompt.title', { defaultValue: 'Want music' })}<br/><span style={{ fontStyle: 'italic', fontWeight: 500, color: t.ACCENT }}>{tr('radio:prompt.titleAccent', { defaultValue: 'while you move?' })}</span>
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
            <span style={{ color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('radio:nowPlaying.listening', { count: r.LIVE.listeners, defaultValue: '{count, plural, one {# listening} other {# listening}}' })}</span>
            <span style={{ color: t.ACCENT, fontWeight: 900, background: `${t.ACCENT}26`, border: `1px solid ${t.ACCENT}`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 4, padding: '3px 9px', letterSpacing: '0.12em', flex: 'none' }}>{tr('radio:nowPlaying.open', { defaultValue: 'Open →' })}</span>
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <BSBeatRing bpm={r.LIVE.bpm} color={t.INK} size={28} paused={r.paused} />
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

          {/* Pause/play */}
          <button onClick={(e) => { e.stopPropagation(); r.setPaused(p => !p); }} style={{
            width: 28, height: 28, flexShrink: 0, borderRadius: 4,
            background: `rgba(${t.inkRGB},0.34)`, color: t.PAPER, border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
          }}>{r.paused ? '▶' : '❚❚'}</button>
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
            <span>{tr('radio:nowPlaying.listening', { count: r.LIVE.listeners, defaultValue: '{count, plural, one {# listening} other {# listening}}' })}</span>
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

function BSRadioScreen({ onBack }) {
  const t = useBS();
  const r = useBSRadio();
  const tr = useShapeTr();
  const onLive = true;
  const playlist = null;
  const np = radioNowPlayingDisplay(r.nowPlaying);
  // Shared like/dislike + comments for the track on air. Key off the provider's
  // raw-derived currentSongKey (not np's '—'-filled display copy) so the read and
  // the writes agree (Codex P2 #1781); the raw track feeds vote/comment.
  const screenKey = r.currentSongKey;
  const screenTrack = { a: r.nowPlaying?.title, b: r.nowPlaying?.artist };
  const screenSocial = (screenKey && r.songSocial[screenKey]) || RADIO_SOCIAL_EMPTY;
  // Station tempo — the live now-playing payload carries no per-track BPM, so this
  // is the STATION's nominal BPM (labeled as such), used as the HR-match target.
  const stationBpm = r.LIVE.bpm;
  const [hrmConnected, setHrmConnected] = useStateBR(false);
  const [demoHr, setDemoHr] = useStateBR(114);
  const [liveHr, setLiveHr] = useStateBR(null); // real strap/watch reading (window.ShapeHRM)
  const [matching, setMatching] = useStateBR(false);
  const [showSets, setShowSets] = useStateBR(false);
  const [commentsOpen, setCommentsOpen] = useStateBR(false);
  const youHr = liveHr != null ? liveHr : demoHr;
  const signedDelta = youHr - stationBpm;
  const syncDelta = Math.abs(signedDelta);
  const isSynced = hrmConnected && syncDelta <= 4;
  // HR sync stage machine: off → free (connected) → matching → synced
  const hrStage = !hrmConnected ? 'off' : (matching ? (isSynced ? 'synced' : 'matching') : 'free');
  const hrStatus = { off: tr('radio:hr.notConnected', { defaultValue: 'Not connected' }), free: liveHr != null ? tr('radio:hr.live', { defaultValue: 'Live' }) : tr('radio:hr.free', { defaultValue: 'Free' }), matching: tr('radio:hr.matching', { defaultValue: 'Matching…' }), synced: tr('radio:hr.inSync', { defaultValue: 'In sync' }) }[hrStage];
  // Real readings stream in as shape:hrm events while a monitor is connected.
  // These events only ever come from a real device (demo mode never emits), so
  // connected:false means the monitor dropped — fully disconnect the card
  // rather than silently reverting to demo numbers under a "connected" stage.
  useEffectBR(() => {
    const onHr = (e) => {
      const d = e.detail || {};
      if (d.connected === false) {
        setLiveHr(null); setMatching(false); setHrmConnected(false); setDemoHr(114);
        return;
      }
      if (Number.isFinite(d.bpm)) setLiveHr(d.bpm);
    };
    window.addEventListener('shape:hrm', onHr);
    return () => window.removeEventListener('shape:hrm', onHr);
  }, []);
  // Beat-matching (demo only) — ease YOU toward the track BPM while matching is
  // on. A real monitor reading always wins; we never fake live data.
  useEffectBR(() => {
    if (!matching || liveHr != null) return undefined;
    const id = setInterval(() => {
      setDemoHr(prev => (prev === stationBpm ? prev : prev + (prev < stationBpm ? 1 : -1)));
    }, 200);
    return () => clearInterval(id);
  }, [matching, stationBpm, liveHr]);
  const connectMonitor = async () => {
    setMatching(false);
    if (window.ShapeHRM?.available?.()) {
      try {
        await window.ShapeHRM.connect();
        setHrmConnected(true);
        return;
      } catch { /* user cancelled or no strap in range — fall back to the demo */ }
    }
    setLiveHr(null); setDemoHr(114); setHrmConnected(true);
  };
  const disconnectHrm = () => {
    try { window.ShapeHRM?.disconnect?.(); } catch { /* no-op */ }
    setMatching(false); setHrmConnected(false); setLiveHr(null); setDemoHr(114);
  };

  // ── Nora watch (preview) ─────────────────────────────────────────────────────
  const [noraOn, setNoraOn] = useStateBR(false);
  const [noraFailed, setNoraFailed] = useStateBR(false);
  const noraCanvasRef = useRefBR(null);
  const noraStageRef = useRefBR(null);
  const toggleNora = () => setNoraOn(v => !v);
  useEffectBR(() => {
    if (!noraOn) return;
    setNoraFailed(false);
    let disposed = false;
    (async () => {
      try {
        if (!window.WebGLRenderingContext) { setNoraFailed(true); return; }
        const an = window.ShapeRadioLive?.analyser?.();
        const st = new NoraStage({ canvas: noraCanvasRef.current, analyser: an, modelUrl: `${import.meta.env.BASE_URL}nora/placeholder.vrm` });
        await st.load();
        if (disposed) { st.dispose(); return; }
        st.start();
        noraStageRef.current = st;
      } catch (e) { console.warn('[nora] stage failed', e); setNoraFailed(true); }
    })();
    return () => { disposed = true; if (noraStageRef.current) { noraStageRef.current.dispose(); noraStageRef.current = null; } };
  }, [noraOn]);

  // Section accent — follows the global Appearance accent so Radio's
  // colored highlights (kicker, italic "Radio.", EQ, beat ring, play button,
  // NEW pills, channel rules) recolor with the rest of the app.
  const TEAL = t.ACCENT;

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
              module-scope cluster. This page is fixed-dark on the venue portrait,
              so the search circle takes the `ink` variant in CREAM rather than
              the theme ink. */}
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

      {/* HERO — translucent over the portraits */}
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
        <BSStageLight color={TEAL} opacity={0.1} paused={r.paused} />

        {/* Top breathing room before live readout */}
        <div style={{ height: 6 }} />

        <div style={{ position: 'relative', zIndex: 2, padding: `0 ${t.padX}px 14px` }}>
          {/* On air + active listeners — sits high at the top-left of the box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: CREAM }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: '#ff5b4a', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
            {onLive ? tr('radio:screen.onAir', { count: r.LIVE.listeners, defaultValue: 'On Air · {count, number}' }) : tr('radio:screen.coachPlaylist', { defaultValue: 'Coach Playlist' })}
          </div>

          {/* Now playing — centered hero */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {/* BPM ring */}
            <div style={{ position: 'relative', width: 88, height: 88 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${CREAM25}` }} />
              <div style={{ position: 'absolute', inset: 9, borderRadius: '50%', border: `1px solid ${TEAL}44` }} />
              <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: `1.5px solid ${TEAL}`, animation: r.paused ? 'none' : `bs-beat-ring ${(60 / stationBpm).toFixed(3)}s ease-out infinite` }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, color: CREAM, lineHeight: 1, letterSpacing: '-0.03em' }}>{stationBpm}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.18em', color: TEAL, fontWeight: 700, marginTop: 2 }}>{tr('radio:screen.stationBpm', { defaultValue: 'Station BPM' })}</div>
              </div>
            </div>

            {/* Now playing label + track */}
            <div style={{ marginTop: 11, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 11, background: TEAL, display: 'inline-block' }} />
              {tr('radio:screen.nowPlaying', { defaultValue: 'Now Playing' })}
            </div>
            <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: CREAM }}>
              {onLive ? np.title : playlist.name}
            </div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, fontWeight: 600 }}>
              {onLive ? np.artist : tr('radio:screen.fromCoach', { name: playlist.by, bpm: playlist.bpm, defaultValue: 'From {name} · {bpm} BPM' })}
            </div>
          </div>

          {/* Waveform */}
          <div style={{ margin: '10px auto 0', maxWidth: 210 }}>
            <BSEQ bars={17} color={TEAL} height={20} gap={3} paused={r.paused} />
          </div>

          {/* Scrubber */}
          {(() => {
            const total = (() => { const p = String(np.len || '0:00').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); })();
            const elapsed = Math.round(total * 0.46);
            const remain = Math.max(0, total - elapsed);
            const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
            const pct = total ? Math.round((elapsed / total) * 100) : 0;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ position: 'relative', height: 2.5, borderRadius: 999, background: CREAM25 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: TEAL }} />
                  <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: TEAL, boxShadow: `0 0 0 3px ${t.PAPER}` }} />
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', color: CREAM50, fontWeight: 600 }}>
                  <span>{fmt(elapsed)}</span>
                  <span>-{fmt(remain)}</span>
                </div>
              </div>
            );
          })()}

          {/* Transport */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <button onClick={() => r.setPaused(p => !p)} style={{ borderRadius: 12,
              flex: 1, padding: '10px', background: TEAL, color: '#050707', border: 0, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {r.paused ? `▶  ${tr('radio:screen.resume', { defaultValue: 'Resume' })}` : `❚❚  ${tr('radio:screen.pause', { defaultValue: 'Pause' })}`}
            </button>
            <button onClick={() => r.setRadioPreference(false)} aria-label={tr('radio:screen.stop', { defaultValue: 'Stop' })} style={{ borderRadius: 12,
              width: 46, background: 'transparent', color: CREAM, border: `1px solid ${CREAM25}`, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>■</button>
          </div>

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

          <style>{`@keyframes bs-beat-ring { 0% { transform: scale(0.92); opacity: 0.95; } 50% { transform: scale(1.0); opacity: 0.55; } 100% { transform: scale(1.18); opacity: 0; } }`}</style>

          {/* Heart-rate sync — stages: not connected → free → matching → in sync.
              Full-bleed opaque band so no glow / stage-light shows through (plain black). */}
          <div style={{ marginTop: 16, marginLeft: -t.padX, marginRight: -t.padX, marginBottom: -14, padding: `14px ${t.padX}px 18px`, background: t.PAPER, position: 'relative', zIndex: 3, borderTop: `1px solid ${RULE_DK}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 4, height: 11, background: TEAL, display: 'inline-block' }} />
                {tr('radio:hr.title', { defaultValue: 'Heart-rate sync' })}
              </span>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: hrStage === 'off' ? CREAM50 : TEAL }}>
                {hrStatus}
              </span>
            </div>

            <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 14 }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>{tr('radio:hr.station', { defaultValue: 'Station' })}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: CREAM, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 2 }}>{stationBpm}</div>
              </div>
              {hrStage === 'off' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `1px dashed ${CREAM25}` }} />
                    <svg width="22" height="22" viewBox="0 0 22 22" style={{ position: 'relative', background: t.PAPER, borderRadius: '50%' }}>
                      <circle cx="11" cy="11" r="6.5" fill="none" stroke={CREAM50} strokeWidth="1" />
                      <line x1="11" y1="1.5" x2="11" y2="20.5" stroke={CREAM50} strokeWidth="1" />
                      <line x1="1.5" y1="11" x2="20.5" y2="11" stroke={CREAM50} strokeWidth="1" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>{tr('radio:hr.awaitingSignal', { defaultValue: 'Awaiting signal' })}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  <div style={{ position: 'relative', width: '100%', height: 14, display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, transform: 'translateY(-50%)', background: CREAM25, borderRadius: 999 }} />
                    <div style={{ position: 'absolute', left: '58%', top: '50%', transform: 'translate(-50%,-50%)', width: 1.5, height: 14, background: CREAM50 }} />
                    <div style={{ position: 'absolute', left: `${Math.max(6, Math.min(94, 58 + signedDelta * 0.9))}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: TEAL, boxShadow: `0 0 0 3px ${t.PAPER}`, transition: 'left 0.24s linear' }} />
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: isSynced ? TEAL : CREAM50, fontWeight: 700 }}>
                    {isSynced ? tr('radio:hr.inSync', { defaultValue: 'In sync' }) : tr('radio:hr.deltaBpm', { delta: `${signedDelta > 0 ? '+' : ''}${signedDelta}`, defaultValue: '{delta} BPM' })}
                  </div>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: liveHr != null ? TEAL : CREAM50, fontWeight: 700 }}>{liveHr != null ? tr('radio:hr.youLive', { defaultValue: 'You · live' }) : tr('radio:hr.you', { defaultValue: 'You' })}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: hrStage === 'off' ? CREAM50 : CREAM, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 2 }}>{hrStage === 'off' ? '— —' : youHr}</div>
              </div>
            </div>

            {/* Stage controls */}
            <div style={{ marginTop: 13, display: 'flex', gap: 8 }}>
              {hrStage === 'off' ? (
                <button onClick={connectMonitor} style={{ borderRadius: 11, flex: 1,
                  border: `1px solid ${t.isLight ? '#0a8f87' : CREAM25}`, background: t.isLight ? '#0a8f8714' : 'transparent', color: t.isLight ? '#0a8f87' : CREAM,
                  padding: '11px', cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800,
                }}>{tr('radio:hr.connectMonitor', { defaultValue: 'Connect monitor' })}</button>
              ) : (
                <>
                  <button onClick={() => setMatching(m => !m)} style={{ borderRadius: 11, flex: 1,
                    border: `1px solid ${matching ? TEAL : CREAM50}`,
                    background: matching ? TEAL : 'transparent',
                    color: matching ? '#050707' : CREAM,
                    padding: '11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800,
                  }}>
                    <span style={{ fontSize: 10 }}>{matching ? '◉' : '○'}</span>
                    {matching ? (isSynced ? tr('radio:hr.inSync', { defaultValue: 'In sync' }) : tr('radio:hr.matchingBeat', { defaultValue: 'Matching beat' })) : tr('radio:hr.matchMyBpm', { defaultValue: 'Match my BPM' })}
                  </button>
                  <button onClick={disconnectHrm} aria-label={tr('radio:hr.disconnectMonitor', { defaultValue: 'Disconnect monitor' })} style={{ borderRadius: 11, width: 44,
                    border: `1px solid ${CREAM25}`, background: 'transparent', color: CREAM, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: t.MONO, fontSize: 11, fontWeight: 800,
                  }}>✕</button>
                </>
              )}
            </div>
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
            <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', maxHeight: '56vh', borderRadius: 14, overflow: 'hidden', background: '#0b0d10', marginBottom: 12 }}>
              <canvas ref={noraCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
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
        {false && (
        <DarkSection title="Channels" meta={onLive ? 'Live · always on' : 'Coach · sent to you'} cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        )}
        <DarkChannelRow
          active={onLive} onClick={() => r.setChannel('live')}
          eyebrow={tr('radio:screen.live247', { defaultValue: 'LIVE · 24/7' })} eyebrowColor={TEAL}
          title={r.LIVE.show}
          meta={tr('radio:screen.liveStationMeta', { bpm: r.LIVE.bpm, count: r.LIVE.listeners, defaultValue: 'Live station - {bpm} BPM - {count, plural, one {# listening now} other {# listening now}}' })}
          right={<BSEQ bars={5} color={TEAL} height={28} gap={2} paused={r.paused || !onLive} />}
          t={t} cream={CREAM} cream50={CREAM50} rule={RULE_DK} accent={TEAL}
        />
        {false && r.PLAYLISTS && r.PLAYLISTS.map(p => (
          <DarkChannelRow
            key={p.id}
            active={r.activeChannel === p.id}
            onClick={() => r.setChannel(p.id)}
            eyebrow={`${p.role.toUpperCase()} · ${p.sent.toUpperCase()}`}
            eyebrowColor={CREAM50}
            title={p.name}
            meta={`${p.by} · ${p.bpm} BPM · ${p.len} · ${p.tracks} tracks`}
            right={p.unplayed
              ? <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', color: '#050707', background: TEAL, padding: '3px 6px', textTransform: 'uppercase', fontWeight: 700 }}>NEW</span>
              : <span style={{ fontFamily: t.DISPLAY, color: CREAM50 }}>▶</span>}
            t={t} cream={CREAM} cream50={CREAM50} rule={RULE_DK} accent={TEAL}
          />
        ))}

        {/* SHAPE SETS — its own section (header like CHANNEL) + a full-width row that
            matches the Shape Radio Station row width. Links to the about page. */}
        <DarkSection title="Shape Sets" meta="Club Shape" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        <button onClick={() => setShowSets(true)} style={{
          width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', color: CREAM, border: 0, borderBottom: `1px solid ${RULE_DK}`, borderLeft: `3px solid ${TEAL}`,
          display: 'flex', alignItems: 'center', gap: 12, padding: `14px ${t.padX}px`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>{tr('radio:sets.liveFrom', { defaultValue: 'Live from' })} Club Shape</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM, marginTop: 4, lineHeight: 1.1 }}>Shape <span style={{ fontStyle: 'italic', color: TEAL }}>Sets.</span></div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: CREAM50, marginTop: 4, fontWeight: 600 }}>{tr('radio:screen.setsSubtitle', { defaultValue: 'What Shape Radio is · concert series · coach playlists' })}</div>
          </div>
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEAL, fontWeight: 800 }}>{tr('radio:screen.about', { defaultValue: 'About →' })}</span>
        </button>


        {false && (
        <React.Fragment>
        {/* UP NEXT */}
        <DarkSection title="Up next" meta="06:00 PM" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        <div style={{ padding: `14px ${t.padX}px`, borderTop: `1px solid ${RULE_DK}` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>▍ Tempo Run</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM, marginTop: 6 }}>Long-form 165 BPM block</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, marginTop: 6, fontWeight: 600 }}>Hosted by Nilo Ceza · 2h block</div>
        </div>
        </React.Fragment>
        )}

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
    Promise.all([
      window.ShapeNoraSets ? window.ShapeNoraSets.list() : Promise.resolve([]),
      window.ShapeRadioLive ? window.ShapeRadioLive.station() : Promise.resolve(null),
    ]).then(([rows, cfg]) => {
      if (!on) return;
      rowsRef.current = Array.isArray(rows) ? rows : [];
      realRef.current = !!(cfg && cfg.configured);
      derive();
    }).catch(() => {});
    const id = setInterval(derive, 60000);
    return () => { on = false; clearInterval(id); };
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
              {bsRadioCorner(CREAM, '#0a0d0c')}
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
              <p style={{ fontFamily: t.BODY || t.DISPLAY, fontSize: 14.5, fontWeight: 500, color: 'rgba(244,237,224,0.92)', margin: '0 auto', maxWidth: 360, lineHeight: 1.55 }}>{tr('radio:sets.introA', { defaultValue: 'A virtual concert series broadcast straight from' })} <strong style={{ color: CREAM, fontWeight: 700 }}>Club Shape</strong>{tr('radio:sets.introB', { defaultValue: ', our flagship venue. DJs and live acts mixed for movement — captured on the floor and streamed through Shape Radio.' })}</p>
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
  BSEQ, BSHalftoneAurora, BSBeatRing, BSStageLight,
  BS_COACH_PLAYLISTS,
});
