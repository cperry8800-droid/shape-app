import React from 'react';
import { createVoiceLoop } from '../../../public/newdesign/noraVoiceLoop.mjs';
import { bsNoraPhotoError } from './noraFace.mjs';
// ─── TALK TO NORA (the Nora sheet's voice view) ──────────────────────────────
// Owner, 2026-10-08: "a button in chat where you can initiate talking and her face
// appears". The Talk button opens this view over the sheet: her face, a ring that moves
// with your voice while she listens, and one line saying what she is doing. She hears
// when you stop, answers in the thread as usual, reads the answer aloud, and listens
// again until you end it. The engine is public/newdesign/noraVoiceLoop.mjs, the same
// one the website's chat panel runs.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (ShapeVoice, ShapeSupport, ShapeLocale), never
// at module top: this module is a static import of the client module, so it evaluates
// before anything is put on window (see BSIntegrationsPage.jsx).
//
// ⚠ start() RUNS INSIDE THE TALK TAP, not in an effect: the browser unlocks the mic's
// level meter and her player only for work the tap itself starts.

function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// Whether the reader asked the OS for reduced motion (read at each level, so a change applies live).
function bsReducedMotion() {
  try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

/** The voice loop for one sheet. `ask(text)` sends what was heard and resolves to her reply. */
export function useNoraTalk(ask) {
  const askRef = React.useRef(ask);
  askRef.current = ask;
  const [view, setView] = React.useState({ state: 'idle', info: {}, heard: '', reply: '' });
  const ringRef = React.useRef(null);
  const barsRef = React.useRef(null);
  const loopRef = React.useRef(null);
  if (!loopRef.current) {
    loopRef.current = createVoiceLoop({
      getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
      MediaRecorder: typeof window !== 'undefined' ? window.MediaRecorder : undefined,
      AudioContext: typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : undefined,
      prime: () => window.ShapeVoice?.prime?.(),
      transcribe: (blob, filename) => window.ShapeSupport.transcribe(blob, { filename, context: 'nora', language: window.ShapeLocale?.get?.() }),
      ask: (text) => askRef.current(text),
      speak: (text) => window.ShapeVoice.speak(text, undefined, { force: true }),
      stopSpeaking: () => window.ShapeVoice?.stop?.(),
      onState: (state, info) => setView((v) => ({
        state,
        info,
        heard: info.heard != null ? info.heard : (state === 'starting' ? '' : v.heard),
        reply: info.reply != null ? info.reply : (state === 'thinking' && info.heard != null) || state === 'starting' ? '' : v.reply,
      })),
      onLevel: (level) => {
        // Reduced motion holds the ring and the wave still: the media query in KEYFRAMES stops the
        // CSS animations, but these transforms are written by hand (Copilot on #2556).
        if (bsReducedMotion()) return;
        const lv = Math.min(1, level * 5);
        const el = ringRef.current;
        if (el) el.style.transform = `scale(${(1 + lv * 0.3).toFixed(3)})`;
        // The wave under her face rises with your voice, each bar by its own weight, written
        // straight to the nodes as the ring is (16 times a second, no re-render).
        const bars = barsRef.current;
        if (bars && bars.children) {
          for (let i = 0; i < bars.children.length; i++) {
            bars.children[i].style.transform = `scaleY(${(BAR_REST + lv * BAR_WEIGHTS[i % BAR_WEIGHTS.length] * (1 - BAR_REST)).toFixed(3)})`;
          }
        }
      },
    });
  }
  React.useEffect(() => () => { loopRef.current?.end(); }, []);
  const loop = loopRef.current;
  // Talk takes the mic: the composer drops a dictation in progress first, or its recorder
  // stays live behind this view (Codex, #2252). Still synchronous, still inside the tap.
  const start = () => {
    try { window.dispatchEvent(new CustomEvent('shape:stopDictation')); } catch (e) {}
    return loop.start();
  };
  return { ...view, ringRef, barsRef, start, tap: () => loop.tap(), end: () => loop.end() };
}

export function bsNoraTalkStatus(tr, state, info) {
  const i = info || {};
  if (state === 'starting') return tr('feed:support.voice.starting', { defaultValue: 'Starting…' });
  if (state === 'listening') {
    if (i.missed) return tr('feed:support.voice.missed', { defaultValue: "I didn't catch that. Go ahead." });
    return i.manual
      ? tr('feed:support.voice.listeningTap', { defaultValue: "Listening. Tap me when you're done." })
      : tr('feed:support.voice.listening', { defaultValue: 'Listening…' });
  }
  if (state === 'thinking') return tr('feed:support.voice.thinking', { defaultValue: 'Thinking…' });
  if (state === 'speaking') return tr('feed:support.voice.speaking', { defaultValue: 'Speaking. Tap me to interrupt.' });
  if (state === 'paused') {
    if (i.reason === 'network') return tr('feed:support.voice.noAnswer', { defaultValue: "I couldn't answer just now. Tap me to try again." });
    if (i.reason === 'signed_out') return tr('feed:support.voice.signIn', { defaultValue: "Sign in to hear Nora's voice." });
    if (i.reason === 'members') return tr('feed:support.voice.memberOnly', { defaultValue: "Nora's voice is a member feature." });
    if (i.reason && i.reason !== 'quiet') return tr('feed:support.voice.unheard', { defaultValue: 'My answer is in the chat. Tap me to keep talking.' });
    return tr('feed:support.voice.paused', { defaultValue: 'Paused. Tap me to talk.' });
  }
  if (state === 'error') {
    if (i.reason === 'signed_out') return tr('feed:support.voice.signIn', { defaultValue: "Sign in to hear Nora's voice." });
    return i.reason === 'members'
      ? tr('feed:support.voice.talkMembers', { defaultValue: 'Talking to Nora is a member feature.' })
      : tr('feed:support.voice.micBlocked', { defaultValue: 'Allow the microphone to talk to Nora.' });
  }
  return '';
}

// The wave: a bar's share of the level, so the middle of the wave rises highest.
const BAR_WEIGHTS = [0.32, 0.5, 0.42, 0.7, 0.58, 0.86, 0.66, 1, 0.78, 0.94, 0.62, 0.84, 0.54, 0.72, 0.46, 0.6, 0.36, 0.48];
const BAR_REST = 0.16;

const KEYFRAMES = `
@keyframes bsNoraTalkPulse { 0% { transform: scale(1); opacity: .6 } 100% { transform: scale(1.55); opacity: 0 } }
@keyframes bsNoraTalkDot { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
@keyframes bsNoraTalkSpin { to { transform: rotate(360deg) } }
@keyframes bsNoraTalkBar { 0%, 100% { transform: scaleY(.22) } 50% { transform: scaleY(1) } }
@keyframes bsNoraTalkAura { 0%, 100% { opacity: .55; transform: scale(1) } 50% { opacity: 1; transform: scale(1.08) } }
@keyframes bsNoraTalkLive { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
@media (prefers-reduced-motion: reduce) { [data-nora-talk] * { animation: none !important; transition: none !important } }
`;

// #rrggbb at an alpha, for the glows (a colour in any other form is used as it is).
function hexA(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The view: her face in a live ring, the wave, one status line, the last exchange, and End.
 *
 * Owner, 2026-11-01, on the plain paper view: "lets also make this screen look cooler". It is a
 * night room now, on whichever of the theme's two inks is the dark one: a teal aura behind her
 * face, the ring and a wave that rise with your voice while she listens, a ring that turns while
 * she thinks, rings that spread while she speaks, and End as a red key at the foot. */
export function BSNoraTalk({ talk, t, tint, avatar }) {
  const tr = useShapeTr();
  if (!talk || talk.state === 'idle') return null;
  const { state, info } = talk;
  const status = bsNoraTalkStatus(tr, state, info);
  const faceLabel = state === 'listening'
    ? tr('feed:support.voice.done', { defaultValue: 'Done talking' })
    : state === 'speaking'
      ? tr('feed:support.voice.interrupt', { defaultValue: 'Interrupt Nora' })
      : tr('feed:support.talk', { defaultValue: 'Talk to Nora' });
  const size = 168;
  const quiet = state === 'paused' || state === 'error';
  // The room is the theme's dark ink on either paper (the desk's ink on a light one, the paper
  // itself on a dark one), so its teal is the dark surface's.
  const DARK = t.isLight ? t.INK : t.PAPER;
  const LIGHT = t.isLight ? t.PAPER : t.INK;
  const glow = '#34d6c5';
  const live = state === 'listening' || state === 'speaking' || state === 'thinking';
  const eyebrow = { fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 };
  const barStyle = (i) => {
    const base = { flex: 'none', width: 3, height: 34, borderRadius: 2, background: glow, transformOrigin: '50% 50%' };
    // Listening: the level writes each bar (useNoraTalk); React leaves the transform alone.
    if (state === 'listening') return { ...base, opacity: 0.95, transition: 'transform 90ms linear' };
    if (state === 'speaking') return { ...base, opacity: 0.95, animation: `bsNoraTalkBar ${(0.7 + (i % 5) * 0.12).toFixed(2)}s ease-in-out ${(i * 0.06).toFixed(2)}s infinite` };
    if (state === 'thinking') return { ...base, transform: `scaleY(${BAR_REST})`, animation: `bsNoraTalkDot 1.2s ${(i * 0.05).toFixed(2)}s infinite` };
    return { ...base, opacity: quiet ? 0.3 : 0.5, transform: `scaleY(${BAR_REST})` };
  };
  return (
    <div data-nora-talk role="dialog" aria-label={tr('feed:support.voice.title', { defaultValue: 'Talking to Nora' })}
      style={{ position: 'absolute', inset: 0, zIndex: 3, overflow: 'hidden', background: DARK, color: LIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `22px ${t.padX}px calc(22px + env(safe-area-inset-bottom, 0px))`, textAlign: 'center' }}>
      <style>{KEYFRAMES}</style>
      {/* The room's light: a teal wash behind where her face sits. */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: '40%', width: 560, height: 560, marginLeft: -280, marginTop: -280, borderRadius: '50%', background: `radial-gradient(closest-side, ${hexA(glow, quiet ? 0.12 : 0.3)}, ${hexA(glow, 0.06)} 55%, transparent 100%)`, animation: state === 'speaking' ? 'bsNoraTalkAura 2.4s ease-in-out infinite' : 'none', transition: 'opacity 300ms', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, ...eyebrow, color: hexA(LIGHT, 0.62) }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: live ? glow : hexA(LIGHT, 0.4), boxShadow: live ? `0 0 10px ${glow}` : 'none', animation: live ? 'bsNoraTalkLive 1.6s ease-in-out infinite' : 'none' }} />
        {tr('feed:support.voice.title', { defaultValue: 'Talking to Nora' })}
      </div>
      {/* The middle scrolls when it is taller than a short phone leaves it (Copilot on #2556): an
          inner column with auto margins centres it when it fits and starts at the top when it
          doesn't, so her face, the tap that resumes her, is never clipped above the fold. */}
      <div data-nora-talk-middle style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', scrollbarWidth: 'none' }}>
      <div style={{ margin: 'auto 0', padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
        <button type="button" onClick={talk.tap} aria-label={faceLabel}
          style={{ position: 'relative', width: size, height: size, borderRadius: '50%', border: 0, padding: 0, background: 'transparent', cursor: 'pointer', flex: 'none', marginBottom: 14 }}>
          {/* Thinking: a sweep of teal turns round her. */}
          {state === 'thinking' && (
            <span aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `conic-gradient(from 0deg, transparent 0deg, ${glow} 110deg, transparent 220deg)`, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))', animation: 'bsNoraTalkSpin 1.1s linear infinite' }} />
          )}
          {/* The ring moves with your voice while she listens (written straight to the node, 16 times a second). */}
          <span ref={talk.ringRef} aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: `2px solid ${glow}`, boxShadow: state === 'listening' ? `0 0 26px ${hexA(glow, 0.55)}, inset 0 0 18px ${hexA(glow, 0.25)}` : 'none', opacity: state === 'listening' ? 1 : state === 'thinking' ? 0 : 0.22, transition: 'transform 90ms linear, opacity 200ms, box-shadow 200ms' }} />
          {state === 'speaking' && [0, 1, 2].map((n) => (
            <span key={n} aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: `2px solid ${glow}`, animation: `bsNoraTalkPulse 2.1s ease-out ${n * 0.7}s infinite` }} />
          ))}
          <img src={avatar} alt="" draggable={false} onError={bsNoraPhotoError}
            style={{ position: 'relative', display: 'block', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 32%', filter: quiet ? 'grayscale(0.7)' : 'none', opacity: quiet ? 0.7 : 1, transition: 'filter 200ms, opacity 200ms', boxShadow: `0 0 0 4px ${DARK}, 0 18px 50px ${hexA('#000000', 0.45)}` }} />
        </button>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color: LIGHT }}>
          Nora<span style={{ color: glow }}>.</span>
        </div>
        {/* The wave: your voice while she listens, hers while she speaks. */}
        <div ref={talk.barsRef} aria-hidden data-nora-wave style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34 }}>
          {BAR_WEIGHTS.map((w, i) => <span key={i} style={barStyle(i)} />)}
        </div>
        <div aria-live="polite" style={{ minHeight: 24, maxWidth: 340, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 500, lineHeight: 1.25, color: state === 'error' ? '#ff8a70' : LIGHT, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          {status}
          {state === 'thinking' && [0, 1, 2].map((n) => <span key={n} aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: glow, animation: `bsNoraTalkDot 1.2s ${n * 0.16}s infinite` }} />)}
        </div>
        {(talk.heard || talk.reply) && (
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', marginTop: 4, padding: '14px 16px', borderRadius: 18, background: hexA(LIGHT, 0.06), border: `1px solid ${hexA(LIGHT, 0.1)}`, boxSizing: 'border-box' }}>
            {talk.heard && (
              <div>
                <div style={{ ...eyebrow, color: hexA(LIGHT, 0.5), marginBottom: 4 }}>{tr('feed:support.voice.you', { defaultValue: 'You' })}</div>
                <div style={{ fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: hexA(LIGHT, 0.72), display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{talk.heard}”</div>
              </div>
            )}
            {talk.reply && (
              <div>
                <div style={{ ...eyebrow, color: glow, marginBottom: 4 }}>Nora</div>
                <div style={{ fontFamily: t.BODY, fontSize: 15, lineHeight: 1.5, color: LIGHT, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{talk.reply}</div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
      {/* End's red is deep enough for its white 10.5px label: 5.42:1 (#d4553c read 4.07:1; Copilot on #2556). */}
      <button type="button" onClick={talk.end}
        style={{ position: 'relative', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, minWidth: 150, minHeight: 50, padding: '0 28px', borderRadius: 999, border: 0, background: '#b8432b', color: '#ffffff', boxShadow: `0 10px 28px ${hexA('#b8432b', 0.4)}`, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {tr('feed:support.voice.end', { defaultValue: 'End' })}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

/** What a Listen tap that could not play says. */
export function bsNoraVoiceFail(tr, reason) {
  if (reason === 'playback_blocked') return tr('feed:support.voice.tapAgain', { defaultValue: 'Tap Listen again to hear Nora.' });
  if (reason === 'signed_out') return tr('feed:support.voice.signIn', { defaultValue: "Sign in to hear Nora's voice." });
  if (reason === 'members') return tr('feed:support.voice.memberOnly', { defaultValue: "Nora's voice is a member feature." });
  return tr('feed:support.voice.unavailable', { defaultValue: 'Voice is unavailable right now.' });
}
