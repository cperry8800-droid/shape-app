import React from 'react';
import { BS_VOICE, bsVoicePickType, bsVoicePeaks, bsVoiceClock } from '../services/voiceNote.mjs';
// ─── VOICE NOTES (owner, 2026-11-02: "build voice notes next") ───────────────────────────────────
// The recorder that sits in a chat thread's tray composer, and the player a note draws in its bubble.
//
//   BSVoiceRecorder   idle: a mic key beside the field. Tap it and the tray becomes the recording
//                     bar: × (throw it away), the running clock and the live level, and ↑ (send).
//                     It stops itself, and sends, at BS_VOICE.MAX_SEC; a tap shorter than MIN_SEC is
//                     never sent. The composer hides its field while `active`, and keeps this one
//                     element mounted in one place, so the recording survives the swap.
//   BSVoiceNotePlayer play/pause, the note's waveform filling as it plays (tap it to jump), the clock,
//                     and 1× / 1.5× / 2×. One note plays at a time across the app (shape:voicePlay).
//
// Uploading and the playable link are window.ShapeVoiceNotes (shapeBackend.js).
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, as in every feature module carved out of the client.

const { useState, useRef, useEffect } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
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

const hexA = (hex, a) => {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const toast = (msg) => { try { window.__bsToast?.(msg, 'err'); } catch (e) { /* no toast here */ } };
const MIC = (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v4" /></svg>;
const UP = (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
const PLAY = (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" /></svg>;
const PAUSE = (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
const LIVE_BARS = 28;

export function BSVoiceRecorder({ t, active = false, onActive = () => {}, onSend = () => {} }) {
  const tr = useShapeTr();
  const [secs, setSecs] = useState(0);
  const [live, setLive] = useState([]);
  const rec = useRef(null); // { mr, stream, ctx, timer, type, startAt, levels, cancel }
  const gone = useRef(false);

  const release = (r) => {
    if (!r) return;
    clearInterval(r.timer);
    try { r.stream && r.stream.getTracks().forEach((track) => track.stop()); } catch (e) { /* already stopped */ }
    try { r.ctx && r.ctx.close && r.ctx.close(); } catch (e) { /* already closed */ }
  };
  // Stops once: the recorder's last chunk arrives before onstop, so a second stop must never finish it
  // early. A cancel after a send still wins, until the note is handed over.
  const stop = (cancel) => {
    const r = rec.current;
    if (!r) return;
    if (cancel) r.cancel = true;
    if (r.stopping) return;
    r.stopping = true;
    // Its length is when it was stopped, not when the last chunk arrives.
    r.stopAt = r.stopAt || Date.now();
    try { if (r.mr.state !== 'inactive') r.mr.stop(); else r.finish(); } catch (e) { r.finish(); }
  };
  useEffect(() => () => { gone.current = true; stop(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (rec.current) return;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const MR = window.MediaRecorder;
    const type = MR && bsVoicePickType((x) => (typeof MR.isTypeSupported === 'function' ? MR.isTypeSupported(x) : false));
    if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia || !MR || !type) {
      toast(tr('feed:thread.voiceUnsupported', { defaultValue: 'Voice notes aren’t available on this device.' }));
      return;
    }
    let stream;
    try { stream = await nav.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
      toast(tr('feed:thread.voiceMicBlocked', { defaultValue: 'Allow the microphone to record a voice note.' }));
      return;
    }
    if (gone.current || rec.current) { try { stream.getTracks().forEach((track) => track.stop()); } catch (e) { /* stopped */ } return; }
    let mr;
    try { mr = new MR(stream, { mimeType: type.type }); } catch (e) {
      try { stream.getTracks().forEach((track) => track.stop()); } catch (e2) { /* stopped */ }
      toast(tr('feed:thread.voiceUnsupported', { defaultValue: 'Voice notes aren’t available on this device.' }));
      return;
    }
    const r = { mr, stream, ctx: null, timer: null, type, startAt: Date.now(), stopAt: 0, levels: [], cancel: false, stopping: false, chunks: [], done: false };
    // The level, ten times a second, for the live bars and the note's waveform.
    let read = null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        r.ctx = new Ctx();
        const an = r.ctx.createAnalyser();
        an.fftSize = 512;
        r.ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        read = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; sum += v * v; }
          return Math.min(1, Math.sqrt(sum / buf.length) * 3);
        };
      }
    } catch (e) { read = null; }
    r.finish = () => {
      if (r.done) return;
      r.done = true;
      r.stopAt = r.stopAt || Date.now();
      release(r);
      rec.current = null;
      if (!gone.current) { setSecs(0); setLive([]); onActive(false); }
      const duration = (r.stopAt - r.startAt) / 1000;
      if (r.cancel || gone.current || duration < BS_VOICE.MIN_SEC) return;
      const blob = new Blob(r.chunks, { type: type.mime });
      if (!blob.size) return;
      onSend({ blob, duration: Math.min(duration, BS_VOICE.MAX_SEC), peaks: bsVoicePeaks(r.levels), mime: type.mime, ext: type.ext });
    };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = () => r.finish();
    r.timer = setInterval(() => {
      if (r.stopping) return;
      const level = read ? read() : 0;
      r.levels.push(level);
      const s = (Date.now() - r.startAt) / 1000;
      setSecs(s);
      setLive((l) => [...l, level].slice(-LIVE_BARS));
      if (s >= BS_VOICE.MAX_SEC) { r.stopAt = r.startAt + BS_VOICE.MAX_SEC * 1000; stop(false); }
    }, 100);
    rec.current = r;
    try { mr.start(250); } catch (e) { r.cancel = true; r.finish(); return; }
    onActive(true);
  };

  const ink = t.INK;
  if (!active) {
    return (
      <button type="button" data-voice-record="" onClick={start} aria-label={tr('feed:thread.voiceRecord', { defaultValue: 'Record a voice note' })}
        title={tr('feed:thread.voiceRecord', { defaultValue: 'Record a voice note' })}
        style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        {MIC(18)}
      </button>
    );
  }
  // Relative to the loudest of the last few seconds, as the note's own waveform will be.
  const top = Math.max(0.05, ...live);
  const bars = Array.from({ length: LIVE_BARS }, (_, i) => (live[i - (LIVE_BARS - live.length)] ?? 0) / top);
  return (
    <div data-voice-recording="" role="group" aria-label={tr('feed:thread.voiceRecordingLabel', { defaultValue: 'Recording a voice note' })}
      style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" data-voice-cancel="" onClick={() => stop(true)} aria-label={tr('feed:thread.voiceCancel', { defaultValue: 'Cancel recording' })}
        style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
      <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: t.RUST }} />
      <span aria-hidden data-voice-clock="" style={{ flex: 'none', fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: ink, minWidth: 36 }}>{bsVoiceClock(secs)}</span>
      <span aria-hidden style={{ flex: 1, minWidth: 0, height: 28, display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
        {bars.map((v, i) => <span key={i} style={{ flex: 1, minWidth: 2, maxWidth: 4, height: `${Math.max(12, Math.round(v * 100))}%`, borderRadius: 2, background: hexA(ink, 0.25 + v * 0.6) }} />)}
      </span>
      <button type="button" data-voice-send="" onClick={() => stop(false)} aria-label={tr('feed:thread.voiceSend', { defaultValue: 'Send voice note' })}
        style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        {UP(16)}
      </button>
    </div>
  );
}

const RATES = [1, 1.5, 2];
let _voicePlayerSeq = 0;

export function BSVoiceNotePlayer({ voice, mine = false, t, accent }) {
  const tr = useShapeTr();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const audioRef = useRef(null);
  const idRef = useRef(null);
  if (idRef.current == null) { _voicePlayerSeq += 1; idRef.current = `vn-${_voicePlayerSeq}`; }
  const duration = Number(voice && voice.duration) || 0;
  const peaks = voice && Array.isArray(voice.peaks) && voice.peaks.length ? voice.peaks : Array(BS_VOICE.PEAKS).fill(0);

  // One note at a time: another one starting pauses this one.
  useEffect(() => {
    const other = (e) => { if (e && e.detail !== idRef.current && audioRef.current) { try { audioRef.current.pause(); } catch (err) { /* paused */ } } };
    try { window.addEventListener('shape:voicePlay', other); } catch (e) { /* no window events here */ }
    return () => {
      try { window.removeEventListener('shape:voicePlay', other); } catch (e) { /* as above */ }
      if (audioRef.current) { try { audioRef.current.pause(); } catch (e) { /* paused */ } }
    };
  }, []);

  const audio = () => {
    if (audioRef.current) return audioRef.current;
    const A = window.Audio;
    if (typeof A !== 'function') return null;
    const a = new A();
    a.preload = 'auto';
    a.addEventListener('timeupdate', () => {
      const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
      setProgress(total ? Math.min(1, a.currentTime / total) : 0);
    });
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('ended', () => { setPlaying(false); setProgress(0); });
    audioRef.current = a;
    return a;
  };
  const source = async () => {
    if (voice.localUrl) return voice.localUrl;
    if (!voice.path || !window.ShapeVoiceNotes?.url) throw new Error('no source');
    return window.ShapeVoiceNotes.url(voice.path);
  };
  const toggle = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const a = audio();
    if (!a || voice.failed) return;
    if (playing) { a.pause(); return; }
    try {
      if (!a.src) {
        setLoading(true);
        a.src = await source();
      }
      a.playbackRate = rate;
      try { window.dispatchEvent(new CustomEvent('shape:voicePlay', { detail: idRef.current })); } catch (err) { /* no events here */ }
      await a.play();
    } catch (err) {
      toast(tr('feed:thread.voiceUnplayable', { defaultValue: 'This voice note can’t be played right now.' }));
    } finally { setLoading(false); }
  };
  const seek = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const a = audioRef.current;
    if (!a || !a.src || !e || !e.currentTarget || !e.currentTarget.getBoundingClientRect) return;
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / (box.width || 1)));
    const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
    a.currentTime = f * total;
    setProgress(f);
  };
  const nextRate = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };

  const fg = mine ? t.PAPER : (accent || t.INK);
  const dim = mine ? hexA(t.PAPER, 0.35) : hexA(t.INK, 0.2);
  const busy = loading || (voice && voice.pending);
  const elapsed = progress * duration;
  const clock = bsVoiceClock(playing || progress > 0 ? elapsed : duration);
  return (
    <div data-voice-note="" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, maxWidth: 280 }}>
      <button type="button" data-voice-play="" onClick={toggle} disabled={!!(voice && voice.failed)}
        aria-label={playing ? tr('feed:thread.voicePause', { defaultValue: 'Pause voice note' }) : tr('feed:thread.voicePlay', { defaultValue: 'Play voice note, {time}', time: bsVoiceClock(duration) })}
        style={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', border: 0, background: mine ? hexA(t.PAPER, 0.16) : hexA(fg, 0.14), color: fg, cursor: voice && voice.failed ? 'default' : 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
        {busy ? <span aria-hidden style={{ width: 14, height: 14, border: `2px solid ${fg}`, borderTopColor: 'transparent', borderRadius: 999, display: 'inline-block', animation: 'bsspin 0.7s linear infinite' }} /> : playing ? PAUSE(15) : PLAY(15)}
      </button>
      <span data-voice-wave="" aria-hidden onClick={seek} style={{ flex: 1, minWidth: 0, height: 30, display: 'flex', alignItems: 'center', gap: 2, cursor: audioRef.current && audioRef.current.src ? 'pointer' : 'default' }}>
        {peaks.map((v, i) => <span key={i} style={{ flex: 1, minWidth: 2, height: `${Math.max(14, Math.round(v * 100))}%`, borderRadius: 2, background: (i + 0.5) / peaks.length <= progress ? fg : dim }} />)}
      </span>
      <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {voice && voice.failed
          ? <span data-voice-failed="" role="status" style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: mine ? t.PAPER : t.RUST }}>{tr('feed:thread.voiceNotSent', { defaultValue: 'Not sent' })}</span>
          : <span data-voice-clock="" style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: mine ? hexA(t.PAPER, 0.8) : t.INK50 }}>{clock}</span>}
        <button type="button" data-voice-rate="" onClick={nextRate} aria-label={tr('feed:thread.voiceSpeed', { defaultValue: 'Playback speed' })}
          style={{ border: 0, padding: '1px 5px', borderRadius: 8, background: mine ? hexA(t.PAPER, 0.14) : hexA(t.INK, 0.07), color: mine ? t.PAPER : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>{`${rate}×`}</button>
      </span>
    </div>
  );
}
