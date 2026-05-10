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

const BS_COACH_PLAYLISTS = [
  { id: 'p1', name: 'Pull day tempo',      by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '52m',     bpm: '95–138', tracks: 14, attached: 'Upper Pull · W6 D4',  sent: 'Mon', unplayed: true },
  { id: 'p2', name: 'Meal prep, low-key',  by: 'Dr. Maya Patel', role: 'Nutritionist', init: 'M', len: '45m',     bpm: '85–100', tracks: 12, attached: 'Sun prep · 8 meals',  sent: 'Sun' },
  { id: 'p3', name: 'Riverside long run',  by: 'Jordan Chen',    role: 'Coach',        init: 'J', len: '1h 50m',  bpm: '160–172',tracks: 24, attached: 'Sat Z2 run · 18k',    sent: 'last wk' },
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
  const logoSize = 'clamp(25px, 7.8vw, 34px)';
  const shapeTracking = '0.31em';
  const radioTracking = '0.27em';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      gap: 'clamp(18px, 4.4vw, 28px)',
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
        width: 'clamp(16px, 4.2vw, 21px)',
        height: 'clamp(18px, 4.7vw, 23px)',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-12%)',
          width: 0,
          height: 0,
          borderTop: 'clamp(5px, 1.25vw, 6.5px) solid transparent',
          borderBottom: 'clamp(5px, 1.25vw, 6.5px) solid transparent',
          borderLeft: `clamp(8px, 2.2vw, 11px) solid ${glow}`,
        }} />
        <span style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-88%)',
          width: 0,
          height: 0,
          borderTop: 'clamp(5px, 1.25vw, 6.5px) solid transparent',
          borderBottom: 'clamp(5px, 1.25vw, 6.5px) solid transparent',
          borderRight: `clamp(8px, 2.2vw, 11px) solid ${ink}`,
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
  const [choice, setChoice] = useStateBR(null);

  if (!r.showPrompt) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: t.PAPER, color: t.INK,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Scrollable upper region — hero + choices */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="bs-scroll">
      {/* Hero — masthead-style */}
      <div style={{
        position: 'relative',
        padding: `40px ${t.padX}px 0`,
        borderBottom: `2px solid ${t.INK}`,
      }}>
        <BSStageLight color={t.ACCENT} opacity={0.22} />
        <div style={{
          fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: t.INK50, fontWeight: 700,
          display: 'flex', justifyContent: 'space-between',
          paddingBottom: 10, borderBottom: `1px solid ${t.RULE}`,
          position: 'relative', zIndex: 2,
        }}>
          <span>Vol. 6 · No. 38</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#d83a2c', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
            LIVE NOW
          </span>
        </div>

        {/* Big EQ as hero visual */}
        <div style={{ marginTop: 22, position: 'relative', zIndex: 2 }}>
          <BSEQ bars={28} color={t.INK} height={84} gap={4} />
        </div>

        <div style={{ marginTop: 18, paddingBottom: 18, position: 'relative', zIndex: 2 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 10 }}>
            ▍ Shape Radio · 3,472 listening
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 44, letterSpacing: '-0.035em',
            lineHeight: 0.94, color: t.INK,
          }}>
            Music while<br/>
            <span style={{ fontStyle: 'italic', fontWeight: 500 }}>you move?</span>
          </h1>
          <div style={{
            marginTop: 12, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45,
            color: t.INK70, maxWidth: 320,
          }}>
            We'll stream Shape Radio in the background while the app is open. Ad-free, BPM-tagged. Pause it anytime from the home screen.
          </div>
        </div>
      </div>

      {/* Choice rows */}
      <div style={{ padding: `18px ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PromptChoice
          on={choice === 'on'}
          onClick={() => setChoice('on')}
          eyebrow="OPTION A · RECOMMENDED"
          title={<>Yes, <span style={{ fontStyle: 'italic' }}>play Radio.</span></>}
          meta="STREAMS IN APP · AD-FREE · PAUSE FROM HOME"
          icon={<BSEQ bars={5} height={26} gap={2} color={t.PAPER} paused={false} />}
          accent
        />
        <PromptChoice
          on={choice === 'off'}
          onClick={() => setChoice('off')}
          eyebrow="OPTION B"
          title="Keep it muted."
          meta="START SILENT · TURN ON LATER FROM HOME"
          icon={<span style={{ fontFamily: t.DISPLAY, fontSize: 22, color: t.INK }}>⏸</span>}
        />
      </div>
      </div>

      <div style={{ padding: `18px ${t.padX}px 28px`, borderTop: `2px solid ${t.INK}`, background: t.PAPER }}>
        <button
          disabled={!choice}
          onClick={() => r.answerPrompt(choice === 'on')}
          style={{ borderRadius: t.RADIUS_SM,
            width: '100%', padding: '16px', cursor: choice ? 'pointer' : 'default',
            background: choice ? t.INK : 'transparent',
            color: choice ? t.PAPER : t.INK30,
            border: `1px solid ${choice ? t.INK : t.RULE}`,
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em',
            textTransform: 'uppercase', fontWeight: 700,
          }}
        >Continue →</button>
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          Change anytime in settings
        </div>
      </div>

      <style>{`
        @keyframes bs-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}

function PromptChoice({ on, onClick, eyebrow, title, meta, icon, accent }) {
  const t = useBS();
  const clearIcon = title === 'Keep it muted.';
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '18px 16px', cursor: 'pointer', textAlign: 'left',
      background: on ? (accent ? t.INK : t.PAPER2) : 'transparent',
      color: on && accent ? t.PAPER : t.INK,
      border: `1px solid ${on ? t.INK : t.RULE}`,
      borderRadius: 0,
    }}>
      <div style={{
        width: 48, height: 48, flexShrink: 0,
        background: accent ? (on ? t.PAPER : t.INK) : 'transparent',
        border: accent || clearIcon ? 'none' : `1px solid ${t.INK}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 26, color: on && accent ? t.INK : (accent ? t.PAPER : t.INK), display: 'flex', alignItems: 'flex-end' }}>
          {clearIcon ? null : icon}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.65, marginBottom: 4 }}>{eyebrow}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.6, marginTop: 6 }}>{meta}</div>
      </div>
      <div style={{
        width: 18, height: 18, flexShrink: 0,
        border: `1px solid ${on && accent ? t.PAPER : t.INK}`,
        background: on ? (accent ? t.PAPER : t.INK) : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: on ? (accent ? t.INK : t.PAPER) : 'transparent',
        fontSize: 12, fontWeight: 700,
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
      borderTop: `2px solid ${t.INK}`, borderBottom: `2px solid ${t.INK}`,
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
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase',
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
              fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase',
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
            width: 30, height: 30, flexShrink: 0,
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
      borderTop: `1px solid ${t.RULE}`, borderBottom: `1px solid ${t.RULE}`,
      background: t.PAPER, color: t.INK, opacity: 0.92,
    }}>
      <div style={{ padding: `10px ${t.padX}px 10px` }}>
        {/* Eyebrow — static (no blinking dot, no pulsing rings) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase',
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
              fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase',
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
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>Song feedback</div>
        <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: faint, fontWeight: 700 }}>{(feedback.comments || []).length} comments</div>
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
              <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>{item.who}</span>
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
        fontSize: 8.5,
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
  const [demoHr, setDemoHr] = useStateBR(120);
  const trackBpm = tr.bpm;
  const syncDelta = Math.abs(demoHr - trackBpm);
  const isSynced = hrmConnected && syncDelta <= 6;
  const syncLabel = !hrmConnected ? 'HRM not connected' : isSynced ? 'In sync' : 'Out of sync';

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
      <div style={{ padding: `48px ${t.padX}px 11px`, borderBottom: `1px solid ${RULE_DK}`, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BSLogo size={16} color={CREAM} />
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM70 }}>
              Vol. 6 · No. 38
            </div>
          </div>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: CREAM, border: `1px solid ${CREAM50}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>← Back</button>
        </div>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, textAlign: 'center' }}>
          Section · Music
        </div>
        <div style={{
          marginTop: 7,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <BSShapeRadioLogo cream={CREAM} accent={TEAL} />
        </div>
        <div style={{ margin: '13px auto 0', width: '100%', maxWidth: 360, borderBottom: `2px solid ${CREAM}` }} />
      </div>

      {/* HERO — translucent over the portraits */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderBottom: `1px solid ${RULE_DK}`,
        background: 'transparent',
      }}>
        <div aria-hidden style={{
          position: 'absolute',
          left: t.padX,
          right: t.padX,
          top: 16,
          bottom: 16,
          zIndex: 0,
          border: `1px solid ${RULE_DK}`,
          backgroundImage: `radial-gradient(circle, ${isLight ? 'rgba(15,14,12,0.24)' : 'rgba(244,237,224,0.22)'} 1px, transparent 1.35px)`,
          backgroundSize: '8px 8px',
          opacity: isLight ? 0.34 : 0.42,
          pointerEvents: 'none',
        }} />
        <BSStageLight color={TEAL} opacity={0.18} paused={r.paused} />
        <div aria-hidden style={{
          position: 'absolute',
          inset: '28px 0 auto 0',
          height: 154,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          opacity: isLight ? 0.16 : 0.28,
          pointerEvents: 'none',
          maskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
        }}>
          {Array.from({ length: 44 }, (_, i) => {
            const h = 18 + Math.round(Math.abs(Math.sin((i + 1) * 0.58)) * 96);
            return (
              <span key={i} style={{
                width: 4,
                height: h,
                background: i % 5 === 0 ? TEAL : CREAM,
                transform: `translateY(${Math.sin(i * 0.7) * 10}px)`,
              }} />
            );
          })}
        </div>
        <div aria-hidden style={{
          position: 'absolute',
          right: -38,
          top: 34,
          zIndex: 1,
          width: 178,
          height: 178,
          borderRadius: 999,
          border: `1px solid ${CREAM25}`,
          boxShadow: `inset 0 0 0 18px ${isLight ? 'rgba(15,14,12,0.035)' : 'rgba(244,237,224,0.045)'}, inset 0 0 0 48px ${isLight ? 'rgba(15,14,12,0.025)' : 'rgba(244,237,224,0.032)'}`,
          opacity: 0.9,
          pointerEvents: 'none',
        }} />

        {/* Top breathing room before live readout */}
        <div style={{ height: 36 }} />

        <div style={{ position: 'relative', zIndex: 2, padding: `0 ${t.padX}px 18px` }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
            fontWeight: 700,
          }}>
            <span style={{ color: TEAL, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: '#ff5b4a', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
              {onLive ? 'On Air' : 'Coach Playlist'}
            </span>
            <span style={{ color: CREAM50 }}>{onLive ? `${r.LIVE.listeners.toLocaleString()} listening now` : (playlist && `${playlist.tracks} TRACKS · ${playlist.len}`)}</span>
          </div>

          {/* EQ */}
          <div style={{ marginTop: 12 }}>
            <BSEQ bars={28} color={TEAL} height={48} gap={3} paused={r.paused} />
          </div>

          {onLive && (
            <div style={{
              marginTop: 12,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 8,
              border: `1px solid ${CREAM25}`,
              padding: '7px 9px',
              background: 'rgba(5,7,7,0.34)',
            }}>
              <span style={{
                fontFamily: t.DISPLAY,
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 0.9,
                letterSpacing: '-0.04em',
                color: CREAM,
              }}>{r.LIVE.listeners.toLocaleString()}</span>
              <span style={{
                fontFamily: t.MONO,
                fontSize: 8.5,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: TEAL,
                fontWeight: 700,
              }}>listening now</span>
            </div>
          )}

          <div style={{
            marginTop: 14,
            border: `1px solid ${CREAM25}`,
            background: CARD,
            padding: 12,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
            }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 800 }}>
                  HRM sync
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 18, color: CREAM, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 3 }}>
                  Match your heart rate to the track.
                </div>
              </div>
              <span style={{
                flexShrink: 0,
                fontFamily: t.MONO,
                fontSize: 8,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 800,
                padding: '4px 6px',
                color: isSynced ? '#050707' : CREAM,
                background: isSynced ? TEAL : 'transparent',
                border: isSynced ? 0 : `1px solid ${CREAM25}`,
              }}>{syncLabel}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Track BPM', value: trackBpm, sub: onLive ? tr.a : playlist?.name, color: TEAL },
                { label: 'Your HR', value: hrmConnected ? demoHr : '--', sub: hrmConnected ? `${syncDelta} BPM off` : 'Connect HRM', color: TEAL },
              ].map(item => (
                <div key={item.label} style={{
                  border: `1px solid ${TEAL}`,
                  background: isLight ? 'rgba(10,143,135,0.12)' : 'rgba(10,143,135,0.16)',
                  padding: '10px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  minWidth: 0,
                }}>
                  <BSBeatRing bpm={Number(item.value) || trackBpm} color={item.color} size={48} paused={r.paused || !hrmConnected && item.label === 'Your HR'} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: TEAL, fontWeight: 900 }}>{item.label}</div>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 22, color: CREAM, lineHeight: 1, fontWeight: 800 }}>{item.value}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: isLight ? 'rgba(10,82,78,0.72)' : 'rgba(118,232,220,0.68)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginTop: 10 }}>
              <button onClick={() => setHrmConnected(true)} style={{ borderRadius: t.RADIUS_SM,
                border: `1px solid ${CREAM25}`,
                background: hrmConnected ? TEAL : 'transparent',
                color: hrmConnected ? '#050707' : CREAM,
                padding: '8px 5px',
                fontFamily: t.MONO,
                fontSize: 8,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}>{hrmConnected ? 'Connected' : 'Sync HRM'}</button>
              <button onClick={() => { setHrmConnected(true); setDemoHr(120); }} style={{ borderRadius: t.RADIUS_SM,
                border: `1px solid ${CREAM25}`,
                background: 'transparent',
                color: CREAM,
                padding: '8px 5px',
                fontFamily: t.MONO,
                fontSize: 8,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}>Demo HR 120</button>
              <button onClick={() => { setHrmConnected(true); setDemoHr(trackBpm); }} style={{ borderRadius: t.RADIUS_SM,
                border: 0,
                background: TEAL,
                color: '#050707',
                padding: '8px 5px',
                fontFamily: t.MONO,
                fontSize: 8,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}>Match BPM</button>
            </div>
          </div>

          {/* Track headline */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700, marginBottom: 4 }}>
              {onLive ? `▍ ${tr.t === 'NOW' ? 'Now Playing' : tr.t}` : `▍ ${playlist.attached}`}
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 0.98, color: CREAM }}>
              {onLive ? tr.a : playlist.name}
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, marginTop: 6, fontWeight: 600 }}>
              {onLive ? `${tr.b} · ${tr.bpm} BPM · ${tr.len}` : `From ${playlist.by} · ${playlist.role} · ${playlist.bpm} BPM`}
            </div>
          </div>

          {/* Transport */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => r.setPaused(p => !p)} style={{ borderRadius: t.RADIUS_SM,
              flex: 1, padding: '10px', background: TEAL, color: '#050707', border: 0, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {r.paused ? '▶ Resume' : '❚❚ Pause'}
            </button>
            <button onClick={() => r.setRadioPreference(false)} style={{ borderRadius: t.RADIUS_SM,
              padding: '10px 14px', background: 'transparent', color: CREAM, border: `1px solid ${CREAM50}`, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
            }}>Stop</button>
            <BSBeatRing bpm={r.LIVE.bpm} color={TEAL} size={36} paused={r.paused} />
          </div>

          {onLive && <BSRadioInlineFeedback track={tr} cream={CREAM} cream50={CREAM50} accent={TEAL} />}
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
          padding: `14px ${t.padX}px 20px`, borderTop: `1px solid ${RULE_DK}`,
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
});
