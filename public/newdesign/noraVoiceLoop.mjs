// Talk to Nora: one spoken conversation, shared by the website's chat panel and the app's
// Nora sheet (owner, 2026-10-08: "a button in chat where you can initiate talking and her
// face appears"). It listens, hears when you have stopped, sends what you said as a normal
// message, reads her reply aloud, then listens again, until you end it.
//
// No React, no window: every browser capability is handed in, so the loop runs the same
// on both surfaces and under node:test with fakes.
//
// ⚠ start() MUST BE CALLED INSIDE THE TAP. Safari unlocks audio only for work started in
// the user's gesture: the AudioContext (which hears you stop) and the player (deps.prime)
// are both set up before the first await, or her first reply is silent.
//
// States: idle → starting → listening → thinking → speaking → listening … ; paused when
// nothing was said for a while (tap to listen again); error when the mic is refused.

/** Loudness of one analyser frame, 0..1. A byte frame is centred on 128. */
export function rmsLevel(frame) {
  if (!frame || !frame.length) return 0;
  const bytes = frame instanceof Uint8Array;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = bytes ? (frame[i] - 128) / 128 : frame[i];
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / frame.length));
}

/**
 * Decides when a spoken turn is over, one level reading at a time.
 * push(level, nowMs) → 'wait' (nothing said yet) · 'speech' · 'done' (said something, then
 * quiet for silenceMs) · 'nospeech' (nothing said for noSpeechMs) · and 'done' or
 * 'nospeech' at maxMs, so a stuck mic can never hold the turn open.
 * The threshold rises with a noisy room: two and a half times its quiet level.
 */
export function createSilenceGate({ speechLevel = 0.03, silenceMs = 1300, minSpeechMs = 200, noSpeechMs = 10000, maxMs = 30000 } = {}) {
  let started = null, lastAt = null, lastSpeech = null, speechMs = 0, floor = null;
  const heard = () => speechMs >= minSpeechMs;
  return {
    push(level, now) {
      if (started == null) started = now;
      const dt = lastAt == null ? 0 : Math.max(0, now - lastAt);
      lastAt = now;
      // The floor follows the quietest frames at once and a louder room slowly, so a
      // steady fan or street is not speech, and the dips between words keep it low.
      if (floor == null || level < floor) floor = level;
      else floor += (level - floor) * 0.005;
      if (level >= Math.max(speechLevel, floor * 2.5)) { speechMs += dt; lastSpeech = now; }
      if (now - started >= maxMs) return heard() ? 'done' : 'nospeech';
      if (!heard()) return now - started >= noSpeechMs ? 'nospeech' : 'wait';
      return now - lastSpeech >= silenceMs ? 'done' : 'speech';
    },
    heard,
  };
}

/** The transcription service names the format by the file's extension. */
export function audioFileName(mime, base = 'nora') {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return `${base}.m4a`;
  if (m.includes('ogg')) return `${base}.ogg`;
  if (m.includes('wav')) return `${base}.wav`;
  if (m.includes('mpeg') || m.includes('mp3')) return `${base}.mp3`;
  return `${base}.webm`;
}

/**
 * deps:
 *   getUserMedia(constraints) → Promise<MediaStream>
 *   MediaRecorder             the constructor
 *   AudioContext              optional; without it there is no level, so a turn ends on a tap or at maxMs
 *   prime()                   unlocks the reply player, called synchronously in the tap
 *   transcribe(blob, name)    → Promise<{ ok, transcript, status }>
 *   ask(text)                 → Promise<string|null>, her reply, already in the thread
 *   speak(text)               → Promise<{ ok, ended?, reason? }>; `ended` settles when she stops
 *   stopSpeaking()
 *   onState(state, info)      info: { heard, reply, reason, manual }
 *   onLevel(level)            0..1 while listening
 *   gate                      options for createSilenceGate
 *   now(), every(fn, ms) → handle, cancel(handle)   timers, for tests
 */
export function createVoiceLoop(deps) {
  const d = {
    now: () => Date.now(),
    every: (fn, ms) => setInterval(fn, ms),
    cancel: (h) => clearInterval(h),
    ...deps,
  };
  const maxMs = (d.gate && d.gate.maxMs) || 30000;
  let state = 'idle';
  let session = 0;  // bumped by end: a callback from an ended conversation does nothing
  let turn = 0;     // bumped by every listen and every interrupt: one turn's callbacks only
  let stream = null, opening = null, ctx = null, source = null, analyser = null, frame = null;
  let rec = null, timer = null;

  const set = (s, info) => { state = s; try { d.onState && d.onState(s, info || {}); } catch (e) { /* the view's problem */ } };
  const level = (v) => { try { d.onLevel && d.onLevel(v); } catch (e) {} };
  const stopTimer = () => { if (timer != null) { d.cancel(timer); timer = null; } };
  const dropRecorder = () => {
    const r = rec; rec = null;
    if (r) { r.__discard = true; try { if (r.state === 'recording') r.stop(); } catch (e) {} }
  };

  // ⚠ THE MIC IS OPEN ONLY WHILE SHE LISTENS. On an iPhone an open mic routes playback to
  // the earpiece and ducks it, and an open mic while she speaks would hear her. So each turn
  // opens it and closes it once the recording is in hand; the permission is asked once.
  function openMic() {
    if (stream) return Promise.resolve(true);
    if (opening) return opening;
    opening = Promise.resolve()
      .then(() => d.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }))
      .then((s) => {
        opening = null;
        if (state === 'idle') { try { s.getTracks().forEach((t) => t.stop()); } catch (e) {} return false; }
        stream = s;
        try {
          if (ctx && ctx.createMediaStreamSource && ctx.createAnalyser) {
            source = ctx.createMediaStreamSource(stream);
            if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; frame = new Uint8Array(analyser.fftSize); }
            source.connect(analyser);
          }
        } catch (e) { source = null; }
        return true;
      }, () => { opening = null; return false; });
    return opening;
  }
  function closeMic() {
    try { if (source) source.disconnect(); } catch (e) {}
    source = null;
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    stream = null;
  }

  function release() {
    stopTimer();
    dropRecorder();
    closeMic();
    try { if (ctx && ctx.close) ctx.close(); } catch (e) {}
    ctx = null; analyser = null; frame = null;
    level(0);
  }

  // A context the browser suspended (an iPhone does, around playback) is woken outside a
  // tap where it can be; one that stays asleep cannot hear, so that turn ends on a tap.
  function wake() {
    if (!ctx || !ctx.resume || ctx.state === 'running') return Promise.resolve();
    return Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
  }

  function start() {
    if (state !== 'idle' && state !== 'error') return undefined;
    const my = ++session;
    // Whatever she is reading stops first, or the mic would record her as your turn (Codex, #2252).
    try { d.stopSpeaking && d.stopSpeaking(); } catch (e) {}
    // Both unlocks happen here, before the first await, inside the tap.
    try { ctx = d.AudioContext ? new d.AudioContext() : null; if (ctx && ctx.resume) ctx.resume().catch(() => {}); } catch (e) { ctx = null; }
    try { d.prime && d.prime(); } catch (e) {}
    set('starting');
    return openMic().then((ok) => {
      if (my !== session) return;
      if (!ok) { release(); set('error', { reason: 'mic' }); return; }
      return listen(my);
    });
  }

  async function listen(my, info) {
    if (my !== session) return;
    const myTurn = ++turn;
    const live = () => my === session && myTurn === turn;
    stopTimer();
    dropRecorder();
    if (!(await openMic()) || !live()) {
      if (live()) { release(); set('error', { reason: 'mic' }); }
      return;
    }
    await wake();
    if (!live()) return;
    const chunks = [];
    let r;
    try { r = new d.MediaRecorder(stream); } catch (e) { release(); set('error', { reason: 'mic' }); return; }
    rec = r;
    r.ondataavailable = (e) => { if (e && e.data && e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      if (r.__discard || !live()) return;
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      closeMic();
      hear(my, myTurn, blob);
    };
    const gate = createSilenceGate(d.gate);
    const manual = !(analyser && source && ctx && (ctx.state === undefined || ctx.state === 'running'));
    const began = d.now();
    try { r.start(250); } catch (e) { release(); set('error', { reason: 'mic' }); return; }
    set('listening', { ...(info || {}), manual });
    timer = d.every(() => {
      if (!live()) return;
      if (manual) { if (d.now() - began >= maxMs) endTurn('done'); return; }
      let v = 0;
      try { analyser.getByteTimeDomainData(frame); v = rmsLevel(frame); } catch (e) { v = 0; }
      level(v);
      const verdict = gate.push(v, d.now());
      if (verdict === 'done' || verdict === 'nospeech') endTurn(verdict);
    }, 60);
  }

  function endTurn(verdict) {
    stopTimer();
    level(0);
    if (verdict === 'nospeech') { dropRecorder(); closeMic(); set('paused', { reason: 'quiet' }); return; }
    const r = rec; rec = null;
    set('thinking', {});
    try {
      if (r && r.state === 'recording') r.stop();
      else if (r && r.onstop) r.onstop();
    } catch (e) { closeMic(); set('paused', { reason: 'mic' }); }
  }

  async function hear(my, myTurn, blob) {
    const live = () => my === session && myTurn === turn;
    let heard = '';
    try {
      const res = await d.transcribe(blob, audioFileName(blob.type));
      if (!live()) return;
      heard = res && res.ok && typeof res.transcript === 'string' ? res.transcript.trim() : '';
      if (!heard) {
        if (res && (res.status === 401 || res.status === 402 || res.status === 403)) { release(); set('error', { reason: res.status === 401 ? 'signed_out' : 'members' }); return; }
        listen(my, { missed: true }); // nothing caught: listen again
        return;
      }
    } catch (e) {
      if (live()) set('paused', { reason: 'network' });
      return;
    }
    set('thinking', { heard });
    let reply = null;
    try { reply = await d.ask(heard); } catch (e) { reply = null; }
    if (!live()) return;
    if (!reply) { set('paused', { reason: 'network', heard }); return; }
    set('speaking', { heard, reply });
    let spoken = null;
    try { spoken = await d.speak(reply); } catch (e) { spoken = null; }
    if (!live()) return;
    if (spoken && spoken.ok && spoken.ended) {
      try { await spoken.ended; } catch (e) {}
      if (live()) listen(my);
      return;
    }
    // She could not be heard: the reply is in the thread as text. Wait for a tap, which
    // is also the gesture a blocked player needs.
    set('paused', { reason: (spoken && spoken.reason) || 'voice', heard, reply });
  }

  /** The face: send now while listening, interrupt while she speaks, resume when paused. */
  function tap() {
    if (state === 'idle' || state === 'error') return start();
    if (state === 'listening') return endTurn('done');
    if (state === 'speaking') {
      turn++;
      try { d.stopSpeaking && d.stopSpeaking(); } catch (e) {}
      return listen(session);
    }
    if (state === 'paused') {
      try { d.prime && d.prime(); } catch (e) {}
      try { if (ctx && ctx.resume) ctx.resume().catch(() => {}); } catch (e) {}
      return listen(session);
    }
    return undefined; // starting · thinking: nothing to do yet
  }

  function end() {
    session++; turn++;
    try { d.stopSpeaking && d.stopSpeaking(); } catch (e) {}
    set('idle', {});
    release();
  }

  return { start, tap, end, get state() { return state; } };
}

// A twentieth of a second of silence. Playing it from inside a tap unlocks a player
// element, so the reply set on that same element after a network wait may play
// (Safari blocks play() that is not started by a tap, element by element).
export const SILENT_CLIP = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
