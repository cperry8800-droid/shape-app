import React from 'react';
import { createVoiceLoop } from '../../../public/newdesign/noraVoiceLoop.mjs';
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

/** The voice loop for one sheet. `ask(text)` sends what was heard and resolves to her reply. */
export function useNoraTalk(ask) {
  const askRef = React.useRef(ask);
  askRef.current = ask;
  const [view, setView] = React.useState({ state: 'idle', info: {}, heard: '', reply: '' });
  const ringRef = React.useRef(null);
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
        const el = ringRef.current;
        if (el) el.style.transform = `scale(${(1 + Math.min(1, level * 5) * 0.3).toFixed(3)})`;
      },
    });
  }
  React.useEffect(() => () => { loopRef.current?.end(); }, []);
  const loop = loopRef.current;
  return { ...view, ringRef, start: () => loop.start(), tap: () => loop.tap(), end: () => loop.end() };
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
    if (i.reason === 'members' || i.reason === 'signed_out') return tr('feed:support.voice.memberOnly', { defaultValue: "Nora's voice is a member feature." });
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

const KEYFRAMES = `
@keyframes bsNoraTalkPulse { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.32); opacity: 0 } }
@keyframes bsNoraTalkDot { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { [data-nora-talk] * { animation: none !important; transition: none !important } }
`;

/** The view: her face, the ring, one status line, the last exchange, and End. */
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
  const size = 176;
  const quiet = state === 'paused' || state === 'error';
  return (
    <div data-nora-talk role="dialog" aria-label={tr('feed:support.voice.title', { defaultValue: 'Talking to Nora' })}
      style={{ position: 'absolute', inset: 0, zIndex: 3, background: t.PAPER, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `28px ${t.padX}px 24px`, textAlign: 'center' }}>
      <style>{KEYFRAMES}</style>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{tr('feed:support.voice.title', { defaultValue: 'Talking to Nora' })}</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, width: '100%' }}>
        <button type="button" onClick={talk.tap} aria-label={faceLabel}
          style={{ position: 'relative', width: size, height: size, borderRadius: '50%', border: 0, padding: 0, background: 'transparent', cursor: 'pointer', flex: 'none' }}>
          {/* The ring moves with your voice while she listens (written straight to the node, 16 times a second). */}
          <span ref={talk.ringRef} aria-hidden style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: `3px solid ${tint}`, opacity: state === 'listening' ? 0.9 : 0.25, transition: 'transform 90ms linear, opacity 200ms' }} />
          {state === 'speaking' && [0, 1].map((n) => (
            <span key={n} aria-hidden style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: `2px solid ${tint}`, animation: `bsNoraTalkPulse 1.6s ease-out ${n * 0.8}s infinite` }} />
          ))}
          <img src={avatar} alt="" draggable={false}
            style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 32%', filter: quiet ? 'grayscale(0.6)' : 'none', opacity: quiet ? 0.75 : 1, transition: 'filter 200ms, opacity 200ms', boxShadow: `0 0 0 4px ${t.PAPER}` }} />
        </button>
        <div aria-live="polite" style={{ minHeight: 22, fontFamily: t.BODY, fontSize: 15, fontWeight: 650, color: state === 'error' ? '#c0533b' : t.INK, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {status}
          {state === 'thinking' && [0, 1, 2].map((n) => <span key={n} aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: tint, animation: `bsNoraTalkDot 1.2s ${n * 0.16}s infinite` }} />)}
        </div>
        {(talk.heard || talk.reply) && (
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {talk.heard && <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.4, color: t.INK50 }}>“{talk.heard}”</div>}
            {talk.reply && <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.45, color: t.INK, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{talk.reply}</div>}
          </div>
        )}
      </div>
      <button type="button" onClick={talk.end}
        style={{ flex: 'none', minWidth: 140, padding: '12px 26px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {tr('feed:support.voice.end', { defaultValue: 'End' })}
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
