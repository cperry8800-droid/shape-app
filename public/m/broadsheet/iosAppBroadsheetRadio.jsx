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
  show: 'Heavy Day with DJ Kaya Mars',
  bpm: 132,
  listeners: 3472,
  nextUp: 'Tempo Run · 6 PM · Nilo Ceza',
  // 3-4 minute rolling track list
  tracks: [
    { idx: 0, t: 'NOW',    a: 'Roots of the Machine', b: 'Merit',         bpm: 132, len: '3:42' },
    { idx: 1, t: '3 MIN',  a: 'Floor Program II',     b: 'Tariq Osei',    bpm: 130, len: '4:18' },
    { idx: 2, t: '7 MIN',  a: 'Ironwood',             b: 'Sable',         bpm: 134, len: '3:55' },
    { idx: 3, t: '11 MIN', a: 'Peak Set',             b: 'DJ Kaya Mars',  bpm: 132, len: '5:02' },
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
const BSRadioContext = createContextBR(null);

function BSRadioProvider({ children }) {
  const [radioOn, setRadioOn]       = useStateBR(true);
  const [askedPrompt, setAsked]     = useStateBR(true);
  const [showPrompt, setShowPrompt] = useStateBR(false);
  const [paused, setPaused]         = useStateBR(true);
  // currently-playing track index in BS_LIVE_STATION.tracks (0 == "NOW")
  const [trackIdx, setTrackIdx]     = useStateBR(1);
  const [activeChannel, setChannel] = useStateBR('live'); // 'live' or playlist id
  // Light-effects intensity: 'off' | 'subtle' | 'immersive' | 'hologram'
  const [fxMode, setFxMode]         = useStateBR('off');

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
    if (yes) setRadioOn(true);
  }

  function reopenPrompt() { setShowPrompt(true); }

  const value = {
    radioOn, setRadioOn, paused, setPaused,
    trackIdx, setTrackIdx, activeChannel, setChannel,
    showPrompt, askedPrompt, answerPrompt, reopenPrompt,
    fxMode, setFxMode,
    LIVE: BS_LIVE_STATION, PLAYLISTS: BS_COACH_PLAYLISTS,
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
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6,
        backgroundImage: `radial-gradient(${t.INK} 0.8px, transparent 1.2px)`,
        backgroundSize: '6px 6px',
        maskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 75%)',
        animation: paused ? 'none' : 'bs-halftone-pulse 1.8s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes bs-aurora-drift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(8%, -4%) scale(1.08); } }
        @keyframes bs-halftone-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.7; } }
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
            We'll stream Heavy Day in the background while the app is open. Ad-free, BPM-tagged. Pause it anytime — your coach's playlists will still come through.
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
        border: accent ? 'none' : `1px solid ${t.INK}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 26, color: on && accent ? t.INK : (accent ? t.PAPER : t.INK), display: 'flex', alignItems: 'flex-end' }}>
          {icon}
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
  if (!r.radioOn) return <BSNowPlayingMuted onTurnOn={() => r.setRadioOn(true)} onPrompt={r.reopenPrompt} onOpen={onOpen} />;

  const tr = r.LIVE.tracks[r.trackIdx];

  return (
    <div onClick={onOpen} style={{
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
      borderTop: `2px solid ${t.INK}`, borderBottom: `2px solid ${t.INK}`,
      background: t.PAPER, color: t.INK,
    }}>
      {/* Light effects layer */}
      <BSHalftoneAurora color={t.ACCENT} opacity={0.45} paused={r.paused} />
      <BSStageLight color={t.ACCENT} opacity={0.12} paused={r.paused} />

      <div style={{ position: 'relative', zIndex: 2, padding: `10px ${t.padX}px 10px` }}>
        {/* Eyebrow */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase',
          fontWeight: 700, color: t.INK50,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.ACCENT }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#d83a2c', animation: 'bs-blink 1.2s ease-in-out infinite' }} />
            ▍ Shape Radio
          </span>
          <span>{r.LIVE.listeners.toLocaleString()} ON · Open →</span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <BSBeatRing bpm={r.LIVE.bpm} color={t.INK} size={32} paused={r.paused} />
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

          {/* Pause/play */}
          <button onClick={(e) => { e.stopPropagation(); r.setPaused(p => !p); }} style={{
            width: 30, height: 30, flexShrink: 0,
            background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11,
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
          <span>{r.LIVE.listeners.toLocaleString()} ON · Open →</span>
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
function BSRadioScreen({ onBack }) {
  const t = useBS();
  const r = useBSRadio();
  const onLive = r.activeChannel === 'live';
  const playlist = onLive ? null : r.PLAYLISTS.find(p => p.id === r.activeChannel);
  const tr = r.LIVE.tracks[r.trackIdx];

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
      <div style={{ padding: `54px ${t.padX}px 14px`, borderBottom: `1px solid ${RULE_DK}`, position: 'relative' }}>
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
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700 }}>
          Section · Music
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 0.95, marginTop: 4, color: CREAM }}>
          Shape<br/><span style={{ fontStyle: 'italic', color: TEAL }}>Radio.</span>
        </div>
      </div>

      {/* HERO — translucent over the portraits */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderBottom: `1px solid ${RULE_DK}`,
        background: 'transparent',
      }}>
        <BSStageLight color={TEAL} opacity={0.18} paused={r.paused} />

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
            <span style={{ color: CREAM50 }}>{onLive ? `${r.LIVE.listeners.toLocaleString()} ON` : (playlist && `${playlist.tracks} TRACKS · ${playlist.len}`)}</span>
          </div>

          {/* EQ */}
          <div style={{ marginTop: 12 }}>
            <BSEQ bars={28} color={TEAL} height={48} gap={3} paused={r.paused} />
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
            <button onClick={() => r.setRadioOn(false)} style={{ borderRadius: t.RADIUS_SM,
              padding: '10px 14px', background: 'transparent', color: CREAM, border: `1px solid ${CREAM50}`, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
            }}>Stop</button>
            <BSBeatRing bpm={r.LIVE.bpm} color={TEAL} size={36} paused={r.paused} />
          </div>
        </div>
      </div>

      {/* Below-fold panel — tracks paper mode */}
      <div style={{ background: isLight ? t.PAPER : 'rgba(5,7,7,0.92)' }}>
        {/* CHANNELS */}
        <DarkSection title="Channels" meta={onLive ? 'Live · always on' : 'Coach · sent to you'} cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        <DarkChannelRow
          active={onLive} onClick={() => r.setChannel('live')}
          eyebrow="LIVE · 24/7" eyebrowColor={TEAL}
          title={r.LIVE.show}
          meta={`Heavy Day · ${r.LIVE.bpm} BPM · ${r.LIVE.listeners.toLocaleString()} listening`}
          right={<BSEQ bars={5} color={TEAL} height={28} gap={2} paused={r.paused || !onLive} />}
          t={t} cream={CREAM} cream50={CREAM50} rule={RULE_DK} accent={TEAL}
        />
        {r.PLAYLISTS.map(p => (
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

        {/* UP NEXT */}
        <DarkSection title="Up next" meta="06:00 PM" cream={CREAM} cream50={CREAM50} rule={RULE_DK} t={t} />
        <div style={{ padding: `14px ${t.padX}px`, borderTop: `1px solid ${RULE_DK}` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: CREAM50, fontWeight: 700 }}>▍ Tempo Run</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM, marginTop: 6 }}>Long-form 165 BPM block</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: CREAM70, marginTop: 6, fontWeight: 600 }}>Hosted by Nilo Ceza · 2h block</div>
        </div>

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
