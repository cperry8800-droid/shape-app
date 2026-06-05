import React from 'react';
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

const { useState: useStateBR, useEffect: useEffectBR, useMemo: useMemoBR, createContext: createContextBR, useContext: useContextBR } = React;
const { BSPage, BSMasthead, BSPageHeader, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSAvatar, BSFooter, BSLogo, useBS } = window;

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
  { id: 'p1', name: 'Pull day tempo',      by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '52m',     bpm: '95–138', tracks: 14, attached: 'Upper Pull · W6 D4',  sent: 'Mon', unplayed: true, url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',
    songs: [
      { a: 'Iron Count',   b: 'Tariq Osei',  len: '3:38' },
      { a: 'Chalk & Steel',b: 'Sable',       len: '4:02' },
      { a: 'Top Set',      b: 'Linnea Aho',  len: '3:21' },
      { a: 'Overhand',     b: 'Samyuel',     len: '3:54' },
      { a: 'Lat Spread',   b: 'Mara Vance',  len: '4:16' },
      { a: 'Last Rep',     b: 'Shape Radio', len: '3:45' },
    ] },
  { id: 'p2', name: 'Meal prep, low-key',  by: 'Dr. Maya Patel', role: 'Nutritionist', init: 'M', len: '45m',     bpm: '85–100', tracks: 12, attached: 'Sun prep · 8 meals',  sent: 'Sun', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ',
    songs: [
      { a: 'Sunday Counter',  b: 'Halve',     len: '3:30' },
      { a: 'Mise en Place',   b: 'Coriander', len: '4:08' },
      { a: 'Slow Simmer',     b: 'Nova Lane', len: '3:52' },
      { a: 'Batch Day',       b: 'Olive Park',len: '4:20' },
      { a: 'Cold Brew Hours', b: 'Temple',    len: '3:14' },
      { a: 'Tupperware Sun',  b: 'Marrow',    len: '4:01' },
    ] },
  { id: 'p3', name: 'Riverside long run',  by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '1h 50m',  bpm: '160–172',tracks: 24, attached: 'Sat Z2 run · 18k',    sent: 'last wk', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
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

function BSRadioProvider({ children }) {
  const [radioOn, setRadioOn]       = useStateBR(false);
  const [askedPrompt, setAsked]     = useStateBR(false);
  const [showPrompt, setShowPrompt] = useStateBR(false);
  const [paused, setPaused]         = useStateBR(true);
  // currently-playing track index in BS_LIVE_STATION.tracks (0 == "NOW")
  const [trackIdx, setTrackIdx]     = useStateBR(0);
  const [activeChannel, setChannel] = useStateBR('live');
  // Light-effects intensity: 'off' | 'subtle' | 'immersive' | 'hologram'
  const [fxMode, setFxMode]         = useStateBR('off');
  const [trackFeedback, setTrackFeedbackState] = useStateBR(() => safeReadRadioJSON('shape.radio.feedback', {}));
  const [musicLibraries, setMusicLibrariesState] = useStateBR(() => safeReadRadioJSON('shape.radio.musicLibraries', { spotify: [], apple: [] }));

  // Auto-prompt once after first render (post-login simulation)
  useEffectBR(() => {
    if (!askedPrompt) {
      const tm = setTimeout(() => setShowPrompt(true), 600);
      return () => clearTimeout(tm);
    }
  }, [askedPrompt]);

  // "Advance" the live station every 18s while radio is on (for demo motion)
  useEffectBR(() => {
    if (!radioOn || paused) return;
    const id = setInterval(() => {
      setTrackIdx(i => (i + 1) % BS_LIVE_STATION.tracks.length);
    }, 18000);
    return () => clearInterval(id);
  }, [radioOn, paused]);

  function answerPrompt(yes) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!yes);
    setPaused(!yes);
  }

  function reopenPrompt() { setShowPrompt(true); }

  function requestRadioPrompt() {
    setAsked(false);
    setShowPrompt(true);
  }

  function setRadioPreference(enabled) {
    setAsked(true);
    setShowPrompt(false);
    setRadioOn(!!enabled);
    setPaused(!enabled);
  }

  function persistFeedback(next) {
    setTrackFeedbackState(next);
    try { window.localStorage && window.localStorage.setItem('shape.radio.feedback', JSON.stringify(next)); } catch {}
  }

  function setTrackFeedback(track, vote) {
    const key = makeRadioTrackKey(track);
    const prev = trackFeedback[key] || { vote: null, comments: [] };
    const nextVote = prev.vote === vote ? null : vote;
    persistFeedback({ ...trackFeedback, [key]: { ...prev, vote: nextVote } });
  }

  function addTrackComment(track, text) {
    const body = (text || '').trim();
    if (!body) return;
    const key = makeRadioTrackKey(track);
    const prev = trackFeedback[key] || { vote: null, comments: [] };
    const next = {
      ...trackFeedback,
      [key]: {
        ...prev,
        comments: [{ who: 'You', text: body, time: 'now' }, ...(prev.comments || [])].slice(0, 12),
      },
    };
    persistFeedback(next);
  }

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
    trackIdx, setTrackIdx, activeChannel, setChannel,
    showPrompt, askedPrompt, answerPrompt, reopenPrompt, requestRadioPrompt,
    fxMode, setFxMode,
    trackFeedback, setTrackFeedback, addTrackComment,
    musicLibraries, saveTrackToLibrary, isTrackSaved,
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

function BSShapeRadioLogo({ cream, accent }) {
  const t = useBS();
  const ink = cream || t.INK;
  const glow = accent || t.ACCENT;
  const logoFont = "'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif";
  const logoSize = 'clamp(22px, 7vw, 30px)';
  const shapeTracking = '0.2em';
  const radioTracking = '0.18em';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      gap: 'clamp(8px, 2.2vw, 13px)',
      maxWidth: '100%',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        display: 'inline-block',
        fontFamily: logoFont,
        fontSize: logoSize,
        fontWeight: 300,
        letterSpacing: shapeTracking,
        lineHeight: 1,
        color: ink,
        marginRight: `-${shapeTracking}`,
        flexShrink: 0,
      }}>
        SHAPE
      </span>
      <span aria-hidden="true" style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'clamp(10px, 2.7vw, 13px)',
        height: 'clamp(15px, 4vw, 19px)',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-12%)',
          width: 0,
          height: 0,
          borderTop: 'clamp(4px, 1vw, 5px) solid transparent',
          borderBottom: 'clamp(4px, 1vw, 5px) solid transparent',
          borderLeft: `clamp(6px, 1.6vw, 8px) solid ${glow}`,
        }} />
        <span style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-88%)',
          width: 0,
          height: 0,
          borderTop: 'clamp(4px, 1vw, 5px) solid transparent',
          borderBottom: 'clamp(4px, 1vw, 5px) solid transparent',
          borderRight: `clamp(6px, 1.6vw, 8px) solid ${ink}`,
        }} />
      </span>
      <span style={{
        display: 'inline-block',
        fontFamily: logoFont,
        fontSize: logoSize,
        fontWeight: 300,
        letterSpacing: radioTracking,
        lineHeight: 1,
        color: glow,
        marginRight: `-${radioTracking}`,
        flexShrink: 0,
      }}>
        RADIO
      </span>
    </div>
  );
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
      <img src={`${import.meta.env.BASE_URL}shape-radio-logo.png`} alt="Shape Radio" style={{ position: 'absolute', zIndex: 3, top: 'max(70px, calc(env(safe-area-inset-top, 0px) + 56px))', left: t.padX, height: 32, width: 'auto', display: 'block', pointerEvents: 'none' }} />

      {/* Scrollable upper region — hero + choices */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="bs-scroll">
      {/* Hero */}
      <div style={{ position: 'relative', padding: `max(170px, calc(env(safe-area-inset-top, 0px) + 152px)) ${t.padX}px 8px` }}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 230 }}><BSEQ bars={22} color={t.ACCENT} height={56} gap={4} /></div>
        </div>
        <div style={{ marginTop: 18, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: t.ACCENT, animation: 'bs-blink 1.2s ease-in-out infinite' }} /> Live now · Ad-free
          </div>
          <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 34, letterSpacing: '-0.035em', lineHeight: 0.96, color: t.INK }}>
            Want music<br/><span style={{ fontStyle: 'italic', fontWeight: 500, color: t.ACCENT }}>while you move?</span>
          </h1>
          <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70, maxWidth: 340 }}>
            Radio will stream in the background — on your workouts, meal preps, or whenever the app is open. Always ad-free. You can pause anytime.
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
          title="Yes, play Radio."
          meta="PLAYS IN APP · AD-FREE · PAUSE ANYTIME"
          icon={<div style={{ width: 18, height: 16 }}><BSEQ bars={5} height={16} gap={2} color="#ffffff" paused={false} /></div>}
          accent
        />
        <PromptChoice
          on={choice === 'off'}
          onClick={() => setChoice('off')}
          title="Keep it muted."
          meta="START SILENT · TURN ON ANYTIME FROM HOME"
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
        >Continue →</button>
        <div style={{ marginTop: 8, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          Change anytime in settings
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

// ═══════════════════════════════════════════════════════════
// BSNowPlaying — Home page widget
// ═══════════════════════════════════════════════════════════
function BSNowPlaying({ onOpen }) {
  const t = useBS();
  const r = useBSRadio();
  if (!r.radioOn) return <BSNowPlayingMuted onTurnOn={() => r.setRadioPreference(true)} onPrompt={r.reopenPrompt} onOpen={onOpen} />;

  const tr = r.LIVE.tracks[r.trackIdx];
  const homeFeedback = r.trackFeedback[makeRadioTrackKey(tr)] || { vote: null, comments: [] };

  return (
    <div onClick={onOpen} style={{
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
      margin: 0, borderTop: `1px solid ${t.RULE}`, borderBottom: `1px solid ${t.RULE}`, borderRadius: 0,
      background: t.PAPER, color: t.INK,
    }}>
      {/* Light effects layer */}
      <BSHalftoneAurora color={t.ACCENT} opacity={0.45} paused={r.paused} />
      <BSStageLight color={t.ACCENT} opacity={0.12} paused={r.paused} />
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        backgroundImage: `radial-gradient(circle, rgba(${t.inkRGB},0.26) 1px, transparent 1.35px)`,
        backgroundSize: '8px 8px',
        opacity: 0.32,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 2, padding: `10px ${t.padX}px 10px` }}>
        {/* Eyebrow */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
          fontWeight: 900, color: t.INK70,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.ACCENT }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#d83a2c', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
            ▍ Shape Radio
          </span>
          <span>{r.LIVE.listeners.toLocaleString()} listening now · Open →</span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <BSBeatRing bpm={r.LIVE.bpm} color={t.INK} size={32} paused={r.paused} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 900, letterSpacing: '-0.025em',
              color: t.INK, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{tr.a}</div>
            <div style={{
              fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: t.INK70, marginTop: 2, fontWeight: 900,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{tr.b} · {tr.bpm} BPM</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {[
              { key: 'like', label: '👍' },
              { key: 'dislike', label: '👎' },
            ].map(item => {
              const active = homeFeedback.vote === item.key;
              return (
                <button
                  key={item.key}
                  aria-label={item.key === 'like' ? 'Like song' : 'Dislike song'}
                  onClick={(e) => { e.stopPropagation(); r.setTrackFeedback(tr, item.key); }}
                  style={{
                    width: 24,
                    height: 30,
                    flexShrink: 0,
                    border: 0,
                    background: 'transparent',
                    color: active ? t.INK : (t.isLight ? 'rgba(5,7,7,0.92)' : '#ffffff'),
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: t.MONO,
                    fontSize: 18,
                    fontWeight: 900,
                    lineHeight: 1,
                    textShadow: active ? 'none' : '0 1px 3px rgba(0,0,0,0.38)',
                    opacity: active ? 1 : 0.95,
                  }}
                >{item.key === 'like' ? '+' : '-'}</button>
              );
            })}
          </div>

          {/* Pause/play */}
          <button onClick={(e) => { e.stopPropagation(); r.setPaused(p => !p); }} style={{
            width: 30, height: 30, flexShrink: 0, borderRadius: 9,
            background: `rgba(${t.inkRGB},0.34)`, color: t.PAPER, border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
          }}>{r.paused ? '▶' : '❚❚'}</button>
        </div>
      </div>
    </div>
  );
}

// Muted state when radio is off — still shows what's playing on the live
// station so the user knows what they're missing, with a "Tune in" CTA.
function BSNowPlayingMuted({ onTurnOn, onPrompt, onOpen }) {
  const t = useBS();
  const r = useBSRadio();
  const tr = r.LIVE.tracks[r.trackIdx];

  return (
    <div onClick={onOpen} style={{
      position: 'relative', cursor: onOpen ? 'pointer' : 'default',
      margin: 0, borderTop: `1px solid ${t.RULE}`, borderBottom: `1px solid ${t.RULE}`, borderRadius: 0, overflow: 'hidden',
      background: t.PAPER, color: t.INK, opacity: 0.92,
    }}>
      <div style={{ padding: `10px ${t.padX}px 10px` }}>
        {/* Eyebrow — static (no blinking dot, no pulsing rings) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
          fontWeight: 700, color: t.INK50,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, border: `1px solid ${t.INK50}`, background: 'transparent' }} />
            ▍ Shape Radio · Muted
          </span>
          <span>{r.LIVE.listeners.toLocaleString()} listening now · Open →</span>
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
              fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em',
              color: t.INK, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{tr.a}</div>
            <div style={{
              fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: t.INK50, marginTop: 2, fontWeight: 600,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{tr.b} · {tr.bpm} BPM</div>
          </div>

          {/* Tune in — replaces the pause/play button */}
          <button onClick={(e) => { e.stopPropagation(); onTurnOn && onTurnOn(); }} style={{ borderRadius: t.RADIUS_SM,
            padding: '7px 10px', flexShrink: 0,
            background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>▶ Tune in</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BSRadioScreen — full Radio page (live + playlists + ticker)
// ═══════════════════════════════════════════════════════════
function BSRadioFeedbackPanel({ track, cream, cream70, cream50, rule, accent, dark = true }) {
  const t = useBS();
  const r = useBSRadio();
  const [comment, setComment] = useStateBR('');
  const feedback = r.trackFeedback[makeRadioTrackKey(track)] || { vote: null, comments: [] };
  const spotifySaved = r.isTrackSaved(track, 'spotify');
  const appleSaved = r.isTrackSaved(track, 'apple');
  const bg = dark ? 'rgba(244,237,224,0.045)' : t.PAPER2;
  const ink = cream || t.INK;
  const sub = cream70 || t.INK70;
  const faint = cream50 || t.INK50;
  const line = rule || t.RULE;

  const submitComment = () => {
    const body = comment.trim();
    if (!body) return;
    r.addTrackComment(track, body);
    setComment('');
  };

  const actionStyle = (active) => ({
    borderRadius: t.RADIUS_SM,
    minHeight: 42,
    padding: '10px 8px',
    background: active ? accent : 'transparent',
    color: active ? '#050707' : ink,
    border: `1px solid ${active ? accent : line}`,
    cursor: 'pointer',
    fontFamily: t.MONO,
    fontSize: 9,
    lineHeight: 1.1,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    fontWeight: 800,
    whiteSpace: 'normal',
  });

  return (
    <div style={{ marginTop: 14, border: `1px solid ${line}`, background: bg, padding: 12, borderRadius: t.RADIUS_SM }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>Song feedback</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: faint, fontWeight: 700 }}>{(feedback.comments || []).length} comments</div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => r.setTrackFeedback(track, 'like')} style={actionStyle(feedback.vote === 'like')}>Like</button>
        <button onClick={() => r.setTrackFeedback(track, 'dislike')} style={actionStyle(feedback.vote === 'dislike')}>Dislike</button>
      </div>

      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => r.saveTrackToLibrary(track, 'spotify')} style={actionStyle(spotifySaved)}>{spotifySaved ? 'Spotify saved' : 'Add Spotify'}</button>
        <button onClick={() => r.saveTrackToLibrary(track, 'apple')} style={actionStyle(appleSaved)}>{appleSaved ? 'Apple saved' : 'Add Apple'}</button>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'stretch' }}>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment on this song..."
          style={{
            minWidth: 0,
            borderRadius: t.RADIUS_SM,
            border: `1px solid ${line}`,
            background: dark ? 'rgba(5,7,7,0.24)' : t.PAPER,
            color: ink,
            padding: '10px 11px',
            outline: 'none',
            fontFamily: t.DISPLAY,
            fontSize: 13.5,
          }}
        />
        <button onClick={submitComment} style={{
          borderRadius: t.RADIUS_SM,
          padding: '10px 12px',
          background: accent,
          color: '#050707',
          border: 0,
          cursor: 'pointer',
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 800,
        }}>Post</button>
      </div>

      {(feedback.comments || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${line}`, paddingTop: 8, display: 'grid', gap: 7 }}>
          {(feedback.comments || []).slice(0, 3).map((item, i) => (
            <div key={i} style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: sub, lineHeight: 1.35 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>{item.who}</span>
              <span> - {item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BSRadioInlineFeedback({ track, cream, cream50, accent }) {
  const t = useBS();
  const r = useBSRadio();
  const feedback = r.trackFeedback[makeRadioTrackKey(track)] || { vote: null, comments: [] };
  const items = [
    { key: 'like', label: '👍', aria: 'Like song' },
    { key: 'dislike', label: '👎', aria: 'Dislike song' },
  ];

  return (
    <div style={{
      marginTop: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {items.map(item => {
          const active = feedback.vote === item.key;
          return (
            <button
              key={item.key}
              aria-label={item.aria}
              onClick={() => r.setTrackFeedback(track, item.key)}
              style={{
                width: 28,
                height: 30,
                flexShrink: 0,
                border: 0,
                background: 'transparent',
                color: active ? accent : cream,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: t.MONO,
                fontSize: 18,
                fontWeight: 900,
                lineHeight: 1,
                textShadow: active ? 'none' : '0 1px 3px rgba(0,0,0,0.42)',
                opacity: active ? 1 : 0.95,
              }}
            >{item.key === 'like' ? '+' : '-'}</button>
          );
        })}
      </div>
      <div style={{
        fontFamily: t.MONO,
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: cream50,
        fontWeight: 700,
      }}>
        {(feedback.comments || []).length} comments
      </div>
    </div>
  );
}

function BSRadioScreen({ onBack }) {
  const t = useBS();
  const r = useBSRadio();
  const onLive = true;
  const playlist = null;
  const tr = r.LIVE.tracks[r.trackIdx];
  const [hrmConnected, setHrmConnected] = useStateBR(false);
  const [demoHr, setDemoHr] = useStateBR(114);
  const [matching, setMatching] = useStateBR(false);
  const trackBpm = tr.bpm;
  const signedDelta = demoHr - trackBpm;
  const syncDelta = Math.abs(signedDelta);
  const isSynced = hrmConnected && syncDelta <= 4;
  // HR sync stage machine: off → free (connected) → matching → synced
  const hrStage = !hrmConnected ? 'off' : (matching ? (isSynced ? 'synced' : 'matching') : 'free');
  const hrStatus = { off: 'Not connected', free: 'Free', matching: 'Matching…', synced: 'In sync' }[hrStage];
  // Beat-matching — ease YOU heart-rate toward the track BPM while matching is on
  useEffectBR(() => {
    if (!matching) return undefined;
    const id = setInterval(() => {
      setDemoHr(prev => (prev === trackBpm ? prev : prev + (prev < trackBpm ? 1 : -1)));
    }, 200);
    return () => clearInterval(id);
  }, [matching, trackBpm]);
  const connectMonitor = () => { setHrmConnected(true); setMatching(false); setDemoHr(114); };
  const disconnectHrm = () => { setMatching(false); setHrmConnected(false); setDemoHr(114); };

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

  return (
    <div className="bs-scroll" style={{
      position: 'absolute', inset: 0, overflow: 'auto',
      paddingBottom: 80 + 28,
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
      <div style={{ padding: `50px ${t.padX}px 11px`, borderBottom: `1px solid ${RULE_DK}`, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BSLogo size={16} color={CREAM} />
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM70 }}>
              Vol. 1 · No. 1
            </div>
          </div>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: CREAM, border: `1px solid ${CREAM50}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>← Back</button>
        </div>
        <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, textAlign: 'center' }}>
          Section · Music
        </div>
        <div style={{
          marginTop: 17,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <BSShapeRadioLogo cream={CREAM} accent={TEAL} />
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
        <div style={{ height: 14 }} />

        <div style={{ position: 'relative', zIndex: 2, padding: `0 ${t.padX}px 18px` }}>
          {/* On air + active listeners — sits high at the top-left of the box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 22, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: CREAM }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: '#ff5b4a', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
            {onLive ? `On Air · ${r.LIVE.listeners.toLocaleString()}` : 'Coach Playlist'}
          </div>

          {/* Now playing — centered hero */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {/* BPM ring */}
            <div style={{ position: 'relative', width: 112, height: 112 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${CREAM25}` }} />
              <div style={{ position: 'absolute', inset: 11, borderRadius: '50%', border: `1px solid ${TEAL}44` }} />
              <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: `1.5px solid ${TEAL}`, animation: r.paused ? 'none' : `bs-beat-ring ${(60 / trackBpm).toFixed(3)}s ease-out infinite` }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 35, fontWeight: 700, color: CREAM, lineHeight: 1, letterSpacing: '-0.03em' }}>{trackBpm}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.24em', color: TEAL, fontWeight: 700, marginTop: 3 }}>BPM</div>
              </div>
            </div>

            {/* Now playing label + track */}
            <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 11, background: TEAL, display: 'inline-block' }} />
              Now Playing
            </div>
            <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: CREAM }}>
              {onLive ? tr.a : playlist.name}
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, fontWeight: 600 }}>
              {onLive ? `${tr.b} · ${tr.bpm} BPM · ${tr.len}` : `From ${playlist.by} · ${playlist.bpm} BPM`}
            </div>
          </div>

          {/* Waveform */}
          <div style={{ margin: '16px auto 0', maxWidth: 210 }}>
            <BSEQ bars={17} color={TEAL} height={26} gap={3} paused={r.paused} />
          </div>

          {/* Scrubber */}
          {(() => {
            const total = (() => { const p = String(tr.len || '0:00').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); })();
            const elapsed = Math.round(total * 0.46);
            const remain = Math.max(0, total - elapsed);
            const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
            const pct = total ? Math.round((elapsed / total) * 100) : 0;
            return (
              <div style={{ marginTop: 14 }}>
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
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <button onClick={() => r.setPaused(p => !p)} style={{ borderRadius: 12,
              flex: 1, padding: '11px', background: TEAL, color: '#050707', border: 0, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {r.paused ? '▶  Resume' : '❚❚  Pause'}
            </button>
            <button onClick={() => r.setRadioPreference(false)} aria-label="Stop" style={{ borderRadius: 12,
              width: 46, background: 'transparent', color: CREAM, border: `1px solid ${CREAM25}`, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>■</button>
          </div>

          <style>{`@keyframes bs-beat-ring { 0% { transform: scale(0.92); opacity: 0.95; } 50% { transform: scale(1.0); opacity: 0.55; } 100% { transform: scale(1.18); opacity: 0; } }`}</style>

          {/* Heart-rate sync — stages: not connected → free → matching → in sync.
              Full-bleed opaque band so no glow / stage-light shows through (plain black). */}
          <div style={{ marginTop: 18, marginLeft: -t.padX, marginRight: -t.padX, marginBottom: -18, padding: `14px ${t.padX}px 18px`, background: t.PAPER, position: 'relative', zIndex: 3, borderTop: `1px solid ${CREAM25}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 4, height: 11, background: TEAL, display: 'inline-block' }} />
                Heart-rate sync
              </span>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: hrStage === 'off' ? CREAM50 : TEAL }}>
                {hrStatus}
              </span>
            </div>

            <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 14 }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>Track</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: CREAM, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 2 }}>{trackBpm}</div>
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
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>Awaiting signal</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  <div style={{ position: 'relative', width: '100%', height: 14, display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, transform: 'translateY(-50%)', background: CREAM25, borderRadius: 999 }} />
                    <div style={{ position: 'absolute', left: '58%', top: '50%', transform: 'translate(-50%,-50%)', width: 1.5, height: 14, background: CREAM50 }} />
                    <div style={{ position: 'absolute', left: `${Math.max(6, Math.min(94, 58 + signedDelta * 0.9))}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: TEAL, boxShadow: `0 0 0 3px ${t.PAPER}`, transition: 'left 0.24s linear' }} />
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: isSynced ? TEAL : CREAM50, fontWeight: 700 }}>
                    {isSynced ? 'In sync' : `${signedDelta > 0 ? '+' : ''}${signedDelta} BPM`}
                  </div>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>You</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: hrStage === 'off' ? CREAM50 : CREAM, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 2 }}>{hrStage === 'off' ? '— —' : demoHr}</div>
              </div>
            </div>

            {/* Stage controls */}
            <div style={{ marginTop: 13, display: 'flex', gap: 8 }}>
              {hrStage === 'off' ? (
                <button onClick={connectMonitor} style={{ borderRadius: 11, flex: 1,
                  border: `1px solid ${CREAM25}`, background: 'transparent', color: CREAM,
                  padding: '11px', cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800,
                }}>Connect monitor</button>
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
                    {matching ? (isSynced ? 'In sync' : 'Matching beat') : 'Match my BPM'}
                  </button>
                  <button onClick={disconnectHrm} aria-label="Disconnect monitor" style={{ borderRadius: 11, width: 44,
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

      {/* Below-fold panel — tracks paper mode */}
      <div style={{ background: isLight ? t.PAPER : 'rgba(5,7,7,0.92)' }}>
        {/* CHANNEL */}
        <DarkSection title="Channel" meta="Live channel" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        {false && (
        <DarkSection title="Channels" meta={onLive ? 'Live · always on' : 'Coach · sent to you'} cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        )}
        <DarkChannelRow
          active={onLive} onClick={() => r.setChannel('live')}
          eyebrow="LIVE · 24/7" eyebrowColor={TEAL}
          title={r.LIVE.show}
          meta={`Live station - ${r.LIVE.bpm} BPM - ${r.LIVE.listeners.toLocaleString()} listening now`}
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

        {/* RECENT TRACKS */}
        <DarkSection title="On the air" meta="Last 16 minutes" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        {r.LIVE.tracks.map((track, i) => (
          <DarkTrackRow
            key={i}
            time={track.t}
            title={track.a}
            sub={`${track.b} · ${track.bpm} BPM`}
            live={i === r.trackIdx}
            last={i === r.LIVE.tracks.length - 1}
            t={t} cream={CREAM} cream50={CREAM50} rule={RULE_DK} accent={TEAL}
          />
        ))}

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

        <div style={{
          padding: `14px ${t.padX}px 20px`,
          display: 'flex', justifyContent: 'space-between',
          fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM50,
        }}>
          <span>The Shape Daily</span>
          <span>Music</span>
        </div>
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
  return (
    <button onClick={onClick} style={{ borderRadius: t.RADIUS_SM,
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: `14px ${t.padX}px`, cursor: 'pointer', textAlign: 'left',
      background: active ? 'rgba(244,237,224,0.06)' : 'transparent',
      color: cream, border: 0, borderBottom: `1px solid ${rule}`,
      borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: eyebrowColor }}>{eyebrow}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: cream, marginTop: 4, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: cream50, marginTop: 4, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </button>
  );
}

function DarkTrackRow({ time, title, sub, live, last, t, cream, cream50, rule, accent }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 40px 1fr',
      alignItems: 'center', gap: 10, padding: `${t.rowY}px ${t.padX}px`,
      borderBottom: last ? 0 : `1px solid ${rule}`,
      color: cream,
    }}>
      <div style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: cream50 }}>{time}</div>
      <div style={{
        fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800,
        color: live ? '#050707' : cream50,
        background: live ? accent : 'transparent',
        border: live ? 0 : `1px solid ${rule}`,
        padding: '3px 6px', textAlign: 'center',
      }}>TRX</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: cream, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: cream50, marginTop: 3, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
    </div>
  );
}

function ChannelRow({ active, onClick, eyebrow, eyebrowColor, title, meta, right }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{ borderRadius: t.RADIUS_SM,
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: `14px ${t.padX}px`, cursor: 'pointer', textAlign: 'left',
      background: active ? t.PAPER2 : 'transparent',
      color: t.INK, border: 0, borderBottom: `1px solid ${t.RULE}`,
      borderLeft: active ? `3px solid ${t.ACCENT}` : '3px solid transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: eyebrowColor || t.INK50 }}>{eyebrow}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, marginTop: 4, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 4, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </button>
  );
}

// Expose
Object.assign(window, {
  BSRadioProvider, useBSRadio,
  BSRadioPrompt, BSNowPlaying, BSRadioScreen,
  BSEQ, BSHalftoneAurora, BSBeatRing, BSStageLight,
  BS_COACH_PLAYLISTS,
});
