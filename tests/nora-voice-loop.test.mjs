// Talk to Nora's engine (public/newdesign/noraVoiceLoop.mjs), driven with fakes for the mic,
// the recorder, the analyser and the timers: what it hears, when a turn ends, and that the mic
// is closed while she speaks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmsLevel, createSilenceGate, audioFileName, createVoiceLoop } from '../public/newdesign/noraVoiceLoop.mjs';

const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test('rmsLevel: a byte frame centred on 128 is silence; full swing is loud', () => {
  assert.equal(rmsLevel(new Uint8Array(64).fill(128)), 0);
  const loud = new Uint8Array(64).map((_, i) => (i % 2 ? 255 : 0));
  assert.ok(rmsLevel(loud) > 0.95);
  assert.ok(Math.abs(rmsLevel(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9, 'a float frame reads as is');
  assert.equal(rmsLevel(null), 0);
});

test('the gate: nothing said pauses; speech then quiet ends the turn; a cough does not', () => {
  const quiet = createSilenceGate();
  let v;
  for (let t = 0; t <= 10020; t += 60) v = quiet.push(0.005, t);
  assert.equal(v, 'nospeech');

  const g = createSilenceGate();
  for (let t = 0; t < 1000; t += 60) g.push(0.004, t);
  for (let t = 1000; t < 2000; t += 60) { const v2 = g.push(0.2, t); if (t >= 1300) assert.equal(v2, 'speech'); }
  assert.equal(g.push(0.004, 2500), 'speech', 'half a second of quiet is a pause for breath');
  assert.equal(g.push(0.004, 3400), 'done');

  const cough = createSilenceGate();
  cough.push(0.004, 0); cough.push(0.3, 60); cough.push(0.004, 120);
  assert.equal(cough.push(0.004, 2000), 'wait', 'sixty milliseconds is not speech');

  const room = createSilenceGate();
  for (let t = 0; t < 2000; t += 60) room.push(0.05, t); // a noisy room learns its floor
  assert.equal(room.push(0.06, 2100), 'wait', 'the noise floor raises the threshold');

  const long = createSilenceGate({ maxMs: 5000 });
  for (let t = 0; t < 5000; t += 60) long.push(t % 120 ? 0.3 : 0.01, t); // talking without a pause
  assert.equal(long.push(0.3, 5000), 'done', 'a turn that never pauses ends at the limit');
  const hum = createSilenceGate({ maxMs: 5000 });
  for (let t = 0; t < 5000; t += 60) hum.push(0.3, t);
  assert.equal(hum.push(0.3, 5000), 'nospeech', 'a level that never moves is the room, not a voice');
});

test('audioFileName names the format the service reads it by', () => {
  assert.equal(audioFileName('audio/mp4'), 'nora.m4a', 'Safari records mp4');
  assert.equal(audioFileName('audio/webm;codecs=opus'), 'nora.webm');
  assert.equal(audioFileName('audio/ogg'), 'nora.ogg');
  assert.equal(audioFileName(''), 'nora.webm');
});

// ── The loop ──────────────────────────────────────────────────────────────────────
function rig({ noContext = false, transcripts = ['what is on today'], replies = ['Leg day.'], speakOk = true, micOk = true } = {}) {
  const log = { states: [], prime: 0, mics: 0, stopped: 0, recorders: [], spoke: [], asked: [], stops: 0 };
  let levelNow = 0.004, clock = 0;
  const ticks = new Set();
  const ends = [];
  class Track { stop() { log.stopped++; } }
  class Recorder {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4'; log.recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['x'], { type: 'audio/mp4' }) }); Promise.resolve().then(() => this.onstop()); }
  }
  class Ctx {
    constructor() { this.state = 'running'; }
    resume() { return Promise.resolve(); }
    close() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData(f) { const a = Math.round(levelNow * 128); for (let i = 0; i < f.length; i++) f[i] = 128 + (i % 2 ? a : -a); } }; }
  }
  const loop = createVoiceLoop({
    getUserMedia: async () => { log.mics++; if (!micOk) throw new Error('denied'); return { getTracks: () => [new Track()] }; },
    MediaRecorder: Recorder,
    AudioContext: noContext ? undefined : Ctx,
    prime: () => { log.prime++; },
    transcribe: async (blob, name) => { log.name = name; return { ok: true, status: 200, transcript: transcripts.shift() ?? '' }; },
    ask: async (text) => { log.asked.push(text); return replies.shift() ?? null; },
    speak: async (text) => { log.spoke.push(text); if (!speakOk) return { ok: false, reason: 'playback_blocked' }; let end; const ended = new Promise((r) => { end = r; }); ends.push(end); return { ok: true, ended }; },
    stopSpeaking: () => { log.stops++; ends.splice(0).forEach((e) => e()); },
    onState: (s, info) => log.states.push([s, info]),
    now: () => clock,
    every: (fn) => { ticks.add(fn); return fn; },
    cancel: (fn) => ticks.delete(fn),
  });
  const run = async (ms, level) => { if (level != null) levelNow = level; for (let t = 0; t < ms; t += 60) { clock += 60; [...ticks].forEach((f) => f()); await flush(2); } };
  return { loop, log, run, ends, names: () => log.states.map((s) => s[0]) };
}

test('a whole turn: listen, hear the end, send, speak, listen again, with the mic closed while she speaks', async () => {
  const r = rig({ transcripts: ['what is on today', 'thanks'], replies: ['Leg day.', 'Any time.'] });
  r.loop.start();
  assert.equal(r.log.prime, 1, 'the player is unlocked inside the tap, before any await');
  await flush();
  assert.equal(r.loop.state, 'listening');
  await r.run(600, 0.004);
  await r.run(900, 0.25);   // speech
  await r.run(1500, 0.004); // quiet: the turn ends
  await flush();
  assert.deepEqual(r.log.asked, ['what is on today']);
  assert.equal(r.log.name, 'nora.m4a');
  assert.equal(r.loop.state, 'speaking');
  assert.deepEqual(r.log.spoke, ['Leg day.']);
  assert.equal(r.log.stopped, 1, 'the mic is closed while she speaks');
  r.ends.shift()();          // her clip ends
  await flush();
  assert.equal(r.loop.state, 'listening', 'and she listens again');
  assert.equal(r.log.mics, 2, 'the mic reopens for the next turn');
  const speaking = r.log.states.find((s) => s[0] === 'speaking');
  assert.deepEqual(speaking[1], { heard: 'what is on today', reply: 'Leg day.' });
});

test('tapping her face while she speaks interrupts and listens; her clip ending later starts nothing', async () => {
  const r = rig();
  r.loop.start(); await flush();
  r.loop.tap(); await flush(); // send now
  assert.equal(r.loop.state, 'speaking');
  const before = r.log.recorders.length;
  r.loop.tap(); await flush();
  assert.equal(r.log.stops, 1);
  assert.equal(r.loop.state, 'listening');
  await flush();
  assert.equal(r.log.recorders.length, before + 1, 'one new turn, not two');
});

test('nothing said pauses; a tap listens again', async () => {
  const r = rig();
  r.loop.start(); await flush();
  await r.run(10200, 0.003);
  assert.equal(r.loop.state, 'paused');
  assert.deepEqual(r.log.states.at(-1)[1], { reason: 'quiet' });
  assert.deepEqual(r.log.asked, [], 'a quiet turn sends nothing');
  r.loop.tap(); await flush();
  assert.equal(r.loop.state, 'listening');
});

test('a turn that caught nothing listens again and says so', async () => {
  const r = rig({ transcripts: [''] });
  r.loop.start(); await flush();
  r.loop.tap(); await flush();
  assert.equal(r.loop.state, 'listening');
  assert.equal(r.log.states.at(-1)[1].missed, true);
  assert.deepEqual(r.log.asked, []);
});

test('a refused mic is an error, not a hang', async () => {
  const r = rig({ micOk: false });
  r.loop.start(); await flush();
  assert.deepEqual(r.log.states.at(-1), ['error', { reason: 'mic' }]);
});

test('ending while she thinks drops the reply: no speech after End', async () => {
  const r = rig();
  r.loop.start(); await flush();
  r.loop.tap();
  r.loop.end();
  await flush();
  assert.equal(r.loop.state, 'idle');
  assert.deepEqual(r.log.spoke, []);
});

test('with no audio context there is no level, so only a tap ends the turn', async () => {
  const r = rig({ noContext: true });
  r.loop.start(); await flush();
  assert.equal(r.log.states.at(-1)[1].manual, true);
  await r.run(12000, 0);
  assert.equal(r.loop.state, 'listening', 'no level is not silence');
  r.loop.tap(); await flush();
  assert.deepEqual(r.log.asked, ['what is on today']);
});

test('a reply she could not say leaves her paused for a tap, which unlocks the player', async () => {
  const r = rig({ speakOk: false });
  r.loop.start(); await flush();
  r.loop.tap(); await flush();
  assert.equal(r.loop.state, 'paused');
  assert.equal(r.log.states.at(-1)[1].reason, 'playback_blocked');
  r.loop.tap(); await flush();
  assert.equal(r.log.prime, 2);
  assert.equal(r.loop.state, 'listening');
});

test('a refused transcription says why: signed out, or not a member', async () => {
  for (const [status, reason] of [[401, 'signed_out'], [402, 'members'], [403, 'members']]) {
    let last = null;
    const loop = createVoiceLoop({
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      MediaRecorder: class { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; Promise.resolve().then(() => this.onstop()); } },
      transcribe: async () => ({ ok: false, status, transcript: '' }),
      ask: async () => null, speak: async () => ({ ok: false }), stopSpeaking() {},
      onState: (s, info) => { last = [s, info]; },
      every: () => 1, cancel() {},
    });
    loop.start(); await flush();
    loop.tap(); await flush();
    assert.deepEqual(last, ['error', { reason }], `status ${status}`);
  }
});
