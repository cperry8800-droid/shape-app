// Voice notes in chat threads (owner, 2026-11-02: "build voice notes next"). The rules
// (services/voiceNote.mjs), the wire (shapeBackend.js's ShapeVoiceNotes and the readers), the recorder
// and player (BSVoiceNote.jsx) driven with a fake microphone, recorder and player, the thread and the
// composer drawn with the shipping module, and the migration's shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  BS_VOICE, BS_VOICE_PATH, bsVoicePickType, bsVoicePath, bsVoicePeaks, bsVoiceFromMetadata, bsVoiceClock, bsVoiceBody,
} from '../mobile-app/src/services/voiceNote.mjs';
import { loadBroadsheet, loadCarved, drive, textOf, ROOT, SHIM, THEME } from './helpers/broadsheet-mount.mjs';

const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const MIGRATION = readFileSync(join(ROOT, 'supabase-migrations/2026-11-03-voice-notes.sql'), 'utf8');
const CONV = 'aaaaaaaa-0000-4000-8000-000000000001';
const CHAN = 'cccccccc-0000-4000-8000-000000000001';
const ME = '11111111-1111-4111-8111-111111111111';
const HER = '22222222-2222-4222-8222-222222222222';
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── The rules ──────────────────────────────────────────────────────────────────────────────────
test('the recording type: MP4 first (it plays everywhere), then WebM, then Ogg; none, no recording', () => {
  assert.equal(bsVoicePickType(() => true).mime, 'audio/mp4');
  assert.deepEqual(bsVoicePickType((t) => t.startsWith('audio/webm')), { type: 'audio/webm;codecs=opus', mime: 'audio/webm', ext: 'webm' });
  assert.equal(bsVoicePickType((t) => t === 'audio/ogg;codecs=opus').ext, 'ogg');
  assert.equal(bsVoicePickType(() => false), null);
  assert.equal(bsVoicePickType(() => { throw new Error('nope'); }), null, 'a throwing check is a no');
  assert.equal(bsVoicePickType(null), null);
});

test('a note is stored under its thread, then its sender; any other shape is no path', () => {
  assert.equal(bsVoicePath({ kind: 'dm', threadId: CONV, userId: ME, name: 'abc-12', ext: 'm4a' }), `dm/${CONV}/${ME}/abc-12.m4a`);
  assert.equal(bsVoicePath({ kind: 'ch', threadId: CHAN.toUpperCase(), userId: ME, name: 'x', ext: 'ogg' }), `ch/${CHAN}/${ME}/x.ogg`, 'ids lowercased, as the bucket\'s rules read them');
  for (const bad of [
    { kind: 'other', threadId: CONV, userId: ME, name: 'x', ext: 'm4a' },
    { kind: 'dm', threadId: 'not-a-uuid', userId: ME, name: 'x', ext: 'm4a' },
    { kind: 'dm', threadId: CONV, userId: ME, name: '../x', ext: 'm4a' },
    { kind: 'dm', threadId: CONV, userId: ME, name: 'x', ext: 'exe' },
    { kind: 'dm', threadId: CONV, userId: '', name: 'x', ext: 'm4a' },
    {},
  ]) assert.equal(bsVoicePath(bad), null, JSON.stringify(bad));
});

test('a waveform: PEAKS bars, each its slice\'s loudest moment, scaled to the note\'s own loudest, to two places', () => {
  const p = bsVoicePeaks([0, 0.1, 0.9, 0.2, 0.333, 1.4, -1, NaN], 4);
  assert.deepEqual(p, [0.1, 0.9, 1, 0], 'clamped to 0..1, a bad level reads as silence');
  assert.deepEqual(bsVoicePeaks([0.01, 0.07, 0.02, 0.035], 4), [0.14, 1, 0.29, 0.5], 'a quiet microphone draws the same shape as a loud one');
  assert.deepEqual(bsVoicePeaks([0.004, 0.002], 2), [0, 0], 'near silence stays flat');
  assert.equal(bsVoicePeaks([0.5]).length, BS_VOICE.PEAKS, 'a short note fills the bars');
  assert.deepEqual(bsVoicePeaks([]), Array(BS_VOICE.PEAKS).fill(0));
  assert.deepEqual(bsVoicePeaks(null, 3), [0, 0, 0]);
});

const VOICE = { path: `dm/${CONV}/${HER}/n1.m4a`, duration: 7.26, mime: 'audio/mp4', peaks: [0.2, 0.501, 1.7, -3, 'x'] };
test('a note\'s metadata is read strictly, and only under the thread it was sent in', () => {
  assert.deepEqual(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV }), { path: VOICE.path, duration: 7.3, mime: 'audio/mp4', peaks: [0.2, 0.5, 1, 0, 0], sender: HER });
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV.toUpperCase() }).sender, HER, 'the thread id compares case-blind');
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'ch', threadId: CONV }), null, 'a conversation\'s note in a channel');
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: 'bbbbbbbb-0000-4000-8000-000000000001' }), null, 'another conversation\'s note');
  for (const bad of [
    { ...VOICE, path: '../etc/passwd' }, { ...VOICE, path: `dm/${CONV}/${HER}/n1.exe` }, { ...VOICE, path: 7 },
    { ...VOICE, duration: 0 }, { ...VOICE, duration: -1 }, { ...VOICE, duration: BS_VOICE.MAX_SEC + 6 }, { ...VOICE, duration: 'long' },
    { ...VOICE, mime: 'text/html' }, { ...VOICE, mime: undefined },
  ]) assert.equal(bsVoiceFromMetadata({ voice: bad }), null, JSON.stringify(bad));
  for (const md of [null, {}, [], { voice: [] }, { voice: 'x' }, 'x']) assert.equal(bsVoiceFromMetadata(md), null, JSON.stringify(md));
  assert.equal(bsVoiceFromMetadata({ voice: { ...VOICE, peaks: Array(200).fill(0.5) } }).peaks.length, BS_VOICE.PEAKS_MAX, 'at most PEAKS_MAX bars');
  assert.deepEqual(bsVoiceFromMetadata({ voice: { ...VOICE, peaks: 'loud' } }).peaks, [], 'no waveform is a flat one');
  assert.ok(BS_VOICE_PATH.test(`ch/${CHAN}/${ME}/a_b-1.webm`));
});

test('the clock and the words a note leaves', () => {
  assert.equal(bsVoiceClock(0), '0:00');
  assert.equal(bsVoiceClock(7.4), '0:07');
  assert.equal(bsVoiceClock(102), '1:42');
  assert.equal(bsVoiceClock(-3), '0:00');
  assert.equal(bsVoiceBody(12.2), 'Voice note · 0:12');
});

// ── The wire ───────────────────────────────────────────────────────────────────────────────────
const VOICE_BLOCK = (() => {
  const start = BACKEND.indexOf('// ── Voice notes (owner, 2026-11-02');
  const end = BACKEND.indexOf('window.ShapeVoiceNotes = {', start);
  assert.ok(start > 0 && end > start, 'the voice-notes block moved');
  return BACKEND.slice(start, BACKEND.indexOf('\n', end) + 1);
})();
function loadVoiceWire({ user = { id: ME }, upload = async () => ({ error: null }), sign = async () => ({ data: { signedUrl: 'https://s/1' }, error: null }) } = {}) {
  const calls = { upload: [], sign: [] };
  const supabase = { storage: { from: (bucket) => ({
    upload: (path, blob, opts) => { calls.upload.push({ bucket, path, blob, opts }); return upload(path, blob, opts); },
    createSignedUrl: (path, sec) => { calls.sign.push({ bucket, path, sec }); return sign(path, sec); },
  }) } };
  const window = {};
  let now = 1_000_000;
  const RealDate = Date;
  const FakeDate = { now: () => now };
  const api = new Function('supabase', 'state', 'window', 'BS_VOICE', 'bsVoicePath', 'Date',
    `${VOICE_BLOCK}; return { uploadVoiceNote, voiceNoteUrl, _voiceUrls };`)(supabase, { user }, window, BS_VOICE, bsVoicePath, { now: () => FakeDate.now(), prototype: RealDate.prototype });
  return { ...api, calls, window, advance: (ms) => { now += ms; } };
}
const blob = (size = 10) => ({ size });

test('upload: into the thread\'s folder under your own id, with its type, never overwriting', async () => {
  const w = loadVoiceWire();
  const { path } = await w.uploadVoiceNote({ kind: 'dm', threadId: CONV, blob: blob(), ext: 'm4a', mime: 'audio/mp4' });
  assert.match(path, new RegExp(`^dm/${CONV}/${ME}/[a-z0-9]+-[a-z0-9]+\\.m4a$`));
  assert.deepEqual(w.calls.upload.map((c) => [c.bucket, c.opts]), [['voice-notes', { contentType: 'audio/mp4', upsert: false }]]);
  assert.equal(w.window.ShapeVoiceNotes.upload, w.uploadVoiceNote);
  await assert.rejects(loadVoiceWire({ user: null }).uploadVoiceNote({ kind: 'dm', threadId: CONV, blob: blob(), ext: 'm4a', mime: 'audio/mp4' }), /Sign in/);
  await assert.rejects(w.uploadVoiceNote({ kind: 'dm', threadId: CONV, blob: blob(0), ext: 'm4a', mime: 'audio/mp4' }), /empty/);
  await assert.rejects(w.uploadVoiceNote({ kind: 'dm', threadId: CONV, blob: blob(BS_VOICE.MAX_BYTES + 1), ext: 'm4a', mime: 'audio/mp4' }), /too long/);
  await assert.rejects(w.uploadVoiceNote({ kind: 'dm', threadId: 'nope', blob: blob(), ext: 'm4a', mime: 'audio/mp4' }), /cannot take/);
  const refused = loadVoiceWire({ upload: async () => ({ error: new Error('new row violates row-level security policy') }) });
  await assert.rejects(refused.uploadVoiceNote({ kind: 'ch', threadId: CHAN, blob: blob(), ext: 'webm', mime: 'audio/webm' }), /row-level security/);
});

test('the playable link: signed for an hour, kept until five minutes before it ends, then asked again', async () => {
  const w = loadVoiceWire();
  assert.equal(await w.voiceNoteUrl(VOICE.path), 'https://s/1');
  assert.deepEqual(w.calls.sign, [{ bucket: 'voice-notes', path: VOICE.path, sec: BS_VOICE.SIGNED_SEC }]);
  w.advance((BS_VOICE.SIGNED_SEC - 301) * 1000);
  await w.voiceNoteUrl(VOICE.path);
  assert.equal(w.calls.sign.length, 1, 'still fresh');
  w.advance(2000);
  await w.voiceNoteUrl(VOICE.path);
  assert.equal(w.calls.sign.length, 2, 'asked again before it ends');
  const bad = loadVoiceWire({ sign: async () => ({ data: null, error: new Error('Object not found') }) });
  await assert.rejects(bad.voiceNoteUrl(VOICE.path), /not found/);
  await assert.rejects(w.voiceNoteUrl(''), /No voice note/);
  assert.match(BACKEND, /\/\/ \.\.\.and so are the voice notes' signed links\.\n  try \{ _voiceUrls\.clear\(\); \} catch \(e\) \{\}/, 'sign-out forgets the links');
});

const fnSrc = (name) => {
  const plain = BACKEND.indexOf(`function ${name}(`);
  assert.ok(plain > 0, `${name} is gone`);
  const at = BACKEND.slice(plain - 6, plain) === 'async ' ? plain - 6 : plain;
  let depth = 0, i = BACKEND.indexOf(') {', plain) + 2;
  for (; i < BACKEND.length; i++) { if (BACKEND[i] === '{') depth++; else if (BACKEND[i] === '}' && --depth === 0) break; }
  return BACKEND.slice(at, i + 1);
};
const MISSING = BACKEND.match(/const bsMissingMetadataColumn = [^\n]+\n/)[0];
const channelSender = (answers) => {
  const inserts = [];
  const supabase = { from: () => ({ insert: (row) => { inserts.push(row); return { select: () => ({ maybeSingle: async () => answers.shift() }) }; } }) };
  const send = new Function('supabase', 'state', 'channelDisplayName', `${MISSING}; ${fnSrc('sendChannelMessage')}; return sendChannelMessage;`)(supabase, { user: { id: ME } }, () => 'Quinn');
  return { send, inserts };
};

test('a channel note goes as metadata.voice, with a reply beside it if it answers one; without the column it never goes as words alone', async () => {
  const v = { path: `ch/${CHAN}/${ME}/a.webm`, duration: 3, peaks: [0.1], mime: 'audio/webm' };
  const a = channelSender([{ data: { id: 'c1' }, error: null }]);
  await a.send({ channelId: CHAN, body: 'Voice note · 0:03', voice: v });
  assert.deepEqual(a.inserts[0].metadata, { voice: v });
  const b = channelSender([{ data: { id: 'c2' }, error: null }]);
  await b.send({ channelId: CHAN, body: 'Voice note · 0:03', voice: v, reply: { id: 'r1', t: 'Six?' } });
  assert.deepEqual(b.inserts[0].metadata, { reply: { id: 'r1', t: 'Six?' }, voice: v });
  const missing = channelSender([{ data: null, error: { code: 'PGRST204', message: 'metadata column' } }]);
  await assert.rejects(missing.send({ channelId: CHAN, body: 'Voice note · 0:03', voice: v, reply: { id: 'r1', t: 'x' } }));
  assert.equal(missing.inserts.length, 1, 'no retry without the note');
  const plain = channelSender([{ data: { id: 'c3' }, error: null }]);
  await plain.send({ channelId: CHAN, body: 'Hi' });
  assert.equal('metadata' in plain.inserts[0], false, 'a plain message is unchanged');
});

test('every reader keeps a note, and only one stored under its own thread', async () => {
  const { isShapeWelcome } = await import('../mobile-app/src/services/shapeWelcome.mjs');
  const { bsGroceryFromMetadata } = await import('../mobile-app/src/services/groceryShare.mjs');
  const { bsReplyFromMetadata } = await import('../mobile-app/src/services/chatReply.mjs');
  const { bsChatStamp } = await import('../mobile-app/src/services/chatTime.mjs');
  const deps = { state: { user: { id: ME } }, isShapeWelcome, bsGroceryFromMetadata, bsReplyFromMetadata, bsVoiceFromMetadata, bsChatStamp };
  const load = (name) => new Function(...Object.keys(deps), `${fnSrc('chatTimeOf')}; ${fnSrc('bsViewIdOf')}; ${fnSrc(name)}; return ${name};`)(...Object.values(deps));
  const msgs = [
    { id: 'a', sender_id: HER, body: 'Voice note · 0:07', metadata: { voice: VOICE }, created_at: '2026-11-02T09:00:00Z' },
    { id: 'b', sender_id: HER, body: 'Voice note · 0:07', metadata: { voice: { ...VOICE, path: `dm/bbbbbbbb-0000-4000-8000-000000000001/${HER}/x.m4a` } }, created_at: '2026-11-02T09:01:00Z' },
  ];
  const coach = load('conversationToThread')({ id: CONV, provider_role: 'trainer', client_id: ME, title: 'Tom' }, msgs);
  const member = load('memberThreadFromRow')({ conversation_id: CONV, other_name: 'Ana' }, msgs);
  for (const th of [coach, member]) {
    assert.equal(th.messages[0].voice.path, VOICE.path);
    assert.equal(th.messages[1].voice, null, 'a path under another conversation is no note here');
  }
  const rows = [{ id: 'r', sender_id: HER, author_name: 'Ana', body: 'Voice note · 0:03', metadata: { voice: { path: `ch/${CHAN}/${HER}/c.ogg`, duration: 3, mime: 'audio/ogg', peaks: [] } }, created_at: '2026-11-02T09:00:00Z' }];
  const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
  const list = new Function('supabase', 'state', 'bsChatStamp', 'bsReplyFromMetadata', 'bsVoiceFromMetadata', `${fnSrc('chatTimeOf')}; ${fnSrc('listChannelMessages')}; return listChannelMessages;`)({ from: () => q }, { user: { id: ME } }, () => '', bsReplyFromMetadata, bsVoiceFromMetadata);
  assert.equal((await list(CHAN)).data[0].voice.path, `ch/${CHAN}/${HER}/c.ogg`);
  assert.equal((await list('dddddddd-0000-4000-8000-000000000001')).data[0].voice, null, 'another channel\'s note');
  // Live rows and the chat page's copy keep it too.
  assert.match(CLIENT, /voice: bsVoiceFromMetadata\(row\.metadata, \{ kind: 'ch', threadId: thread\.channelId \}\) \}\]\);/);
  assert.match(CLIENT, /voice: bsVoiceFromMetadata\(row\.metadata, \{ kind: 'dm', threadId: thread\.conversationId \}\) \}\]\);/);
  assert.match(CLIENT, /reply: m\.reply \|\| null, voice: m\.voice \|\| null \}\)\),/);
});

// ── The recorder and the player ────────────────────────────────────────────────────────────────
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const FEED_EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8'));
globalThis.window.ShapeI18n = { t: (key, opts = {}) => { const m = /^feed:(.+)$/.exec(key); const msg = m ? FEED_EN[m[1]] : null; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); } };
const EFFECTS = [];
const R = { ...SHIM, useEffect(fn) { EFFECTS.push(fn); } };
await loadBroadsheet(['BSChatThread'], R); // publishes the client's window globals first
const { BSVoiceRecorder, BSVoiceNotePlayer } = await loadCarved('BSVoiceNote.jsx', R);
const flat = (node, out = []) => { if (node == null || typeof node !== 'object') return out; if (Array.isArray(node)) { for (const c of node) flat(c, out); return out; } out.push(node); if (node.props) flat(node.props.children, out); return out; };
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
const byAttr = (d, attr) => withAttr(d.nodes(), attr)[0];

// A fake microphone, recorder, clock and timer, installed for one test.
function rig({ supported = ['audio/mp4'], denied = false, noRecorder = false, deferStop = false } = {}) {
  const saved = { MediaRecorder: window.MediaRecorder, AudioContext: window.AudioContext, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, now: Date.now, nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), toast: window.__bsToast };
  const st = { now: 10_000, tickFn: null, stopped: 0, toasts: [], recorders: [] };
  class FakeMR {
    static isTypeSupported(t) { return supported.includes(t); }
    constructor(stream, opts) { this.stream = stream; this.opts = opts; this.state = 'inactive'; this.stops = 0; st.recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.stops += 1; this.state = 'inactive'; if (deferStop) { st.flush = () => this.emit(); return; } this.emit(); }
    emit() { this.ondataavailable && this.ondataavailable({ data: new Blob(['opus'], { type: 'audio/mp4' }) }); this.onstop && this.onstop(); }
  }
  window.MediaRecorder = noRecorder ? undefined : FakeMR;
  window.AudioContext = class { createAnalyser() { return { fftSize: 0, getByteTimeDomainData(buf) { buf.fill(160); } }; } createMediaStreamSource() { return { connect() {} }; } close() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { mediaDevices: { getUserMedia: async () => { if (denied) throw new Error('NotAllowedError'); return { getTracks: () => [{ stop: () => { st.stopped += 1; } }] }; } } } });
  globalThis.setInterval = (fn) => { st.tickFn = fn; return 7; };
  globalThis.clearInterval = () => { st.tickFn = null; };
  Date.now = () => st.now;
  window.__bsToast = (msg) => st.toasts.push(msg);
  st.restore = () => {
    window.MediaRecorder = saved.MediaRecorder; window.AudioContext = saved.AudioContext;
    globalThis.setInterval = saved.setInterval; globalThis.clearInterval = saved.clearInterval; Date.now = saved.now;
    if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav); else delete globalThis.navigator;
    window.__bsToast = saved.toast;
  };
  st.advance = (ms) => { for (let t = 0; t < ms; t += 100) { st.now += 100; if (st.tickFn) st.tickFn(); } };
  return st;
}
function mountRecorder() {
  const props = { t: THEME, active: false, actives: [], sent: [] };
  props.onActive = (v) => { props.actives.push(v); props.active = v; };
  props.onSend = (x) => props.sent.push(x);
  EFFECTS.length = 0;
  const d = drive(BSVoiceRecorder, props);
  const effects = EFFECTS.splice(0);
  return { d, props, effects };
}

test('the recorder: tap the mic, talk, send; the note goes with its length, waveform and type', async () => {
  const st = rig();
  try {
    const { d, props } = mountRecorder();
    const mic = byAttr(d, 'data-voice-record');
    assert.equal(mic.props['aria-label'], 'Record a voice note');
    await mic.props.onClick();
    assert.deepEqual(props.actives, [true]);
    assert.equal(st.recorders[0].opts.mimeType, 'audio/mp4');
    d.render();
    assert.ok(byAttr(d, 'data-voice-recording'), 'the recording bar');
    st.advance(3000);
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-clock')), '0:03');
    byAttr(d, 'data-voice-send').props.onClick();
    assert.deepEqual(props.actives, [true, false]);
    assert.equal(props.sent.length, 1);
    const note = props.sent[0];
    assert.equal(note.duration, 3);
    assert.equal(note.mime, 'audio/mp4');
    assert.equal(note.ext, 'm4a');
    assert.equal(note.blob.type, 'audio/mp4');
    assert.ok(note.blob.size > 0);
    assert.equal(note.peaks.length, BS_VOICE.PEAKS);
    assert.ok(note.peaks.every((v) => v > 0), 'the levels it heard');
    assert.equal(st.stopped, 1, 'the microphone is released');
    assert.equal(st.recorders[0].stops, 1);
  } finally { st.restore(); }
});

test('the recorder: × throws it away; a tap shorter than a second is never sent; two minutes sends itself', async () => {
  let st = rig();
  try {
    const { d, props } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    d.render();
    st.advance(4000);
    byAttr(d, 'data-voice-cancel').props.onClick();
    assert.equal(props.sent.length, 0);
    assert.equal(st.stopped, 1, 'released');
    d.render();
    await byAttr(d, 'data-voice-record').props.onClick();
    d.render();
    st.advance(500);
    byAttr(d, 'data-voice-send').props.onClick();
    assert.equal(props.sent.length, 0, 'half a second is a slip of the finger');
  } finally { st.restore(); }
  st = rig();
  try {
    const { d, props } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    st.advance(BS_VOICE.MAX_SEC * 1000 + 500);
    assert.equal(props.sent.length, 1, 'sent at the limit');
    assert.equal(props.sent[0].duration, BS_VOICE.MAX_SEC);
    assert.equal(st.recorders[0].stops, 1, 'stopped once');
  } finally { st.restore(); }
});

test('the recorder stops once: a tick before the last chunk never finishes it early, and a cancel then still wins', async () => {
  const st = rig({ deferStop: true });
  try {
    const { d, props } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    d.render();
    st.advance(2000);
    byAttr(d, 'data-voice-send').props.onClick();
    st.advance(BS_VOICE.MAX_SEC * 1000);   // ticks while the last chunk is on its way
    assert.equal(st.recorders[0].stops, 1);
    assert.equal(props.sent.length, 0, 'not finished before onstop');
    st.flush();
    assert.equal(props.sent.length, 1);
    assert.equal(props.sent[0].duration, 2, 'its length is when send was tapped, not when the chunk came');
  } finally { st.restore(); }
  const st2 = rig({ deferStop: true });
  try {
    const { d, props } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    d.render();
    st2.advance(2000);
    byAttr(d, 'data-voice-send').props.onClick();
    d.render();
    byAttr(d, 'data-voice-cancel').props.onClick();
    st2.flush();
    assert.equal(props.sent.length, 0, 'cancelled before it was handed over');
  } finally { st2.restore(); }
});

test('the recorder says why it can\'t: a blocked microphone, or a device that can\'t record', async () => {
  let st = rig({ denied: true });
  try {
    const { d, props } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    assert.deepEqual(st.toasts, ['Allow the microphone to record a voice note.']);
    assert.deepEqual(props.actives, []);
  } finally { st.restore(); }
  st = rig({ noRecorder: true });
  try {
    const { d } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    assert.deepEqual(st.toasts, ['Voice notes aren’t available on this device.']);
  } finally { st.restore(); }
  st = rig({ supported: [] });
  try {
    const { d } = mountRecorder();
    await byAttr(d, 'data-voice-record').props.onClick();
    assert.equal(st.toasts.length, 1, 'no type it can make');
    assert.equal(st.recorders.length, 0);
  } finally { st.restore(); }
});

test('the recorder leaving mid-note throws the note away and releases the microphone', async () => {
  const st = rig();
  try {
    const { d, props, effects } = mountRecorder();
    const cleanups = effects.map((fn) => fn()).filter((x) => typeof x === 'function');
    await byAttr(d, 'data-voice-record').props.onClick();
    st.advance(5000);
    cleanups.forEach((fn) => fn());
    assert.equal(props.sent.length, 0);
    assert.equal(st.stopped, 1);
  } finally { st.restore(); }
});

// A fake player and window events.
function playerRig({ url = async (p) => `https://s/${p}` } = {}) {
  const saved = { Audio: window.Audio, notes: window.ShapeVoiceNotes, add: window.addEventListener, remove: window.removeEventListener, dispatch: window.dispatchEvent, toast: window.__bsToast };
  const st = { audios: [], urls: [], toasts: [], listeners: {} };
  window.Audio = class { constructor() { this.src = ''; this.l = {}; this.playbackRate = 1; this.currentTime = 0; this.duration = NaN; st.audios.push(this); } addEventListener(t, f) { (this.l[t] ||= []).push(f); } emit(t) { (this.l[t] || []).forEach((f) => f()); } async play() { this.emit('play'); } pause() { this.emit('pause'); } };
  window.ShapeVoiceNotes = { url: async (p) => { st.urls.push(p); return url(p); } };
  window.addEventListener = (type, fn) => { (st.listeners[type] ||= []).push(fn); };
  window.removeEventListener = (type, fn) => { st.listeners[type] = (st.listeners[type] || []).filter((f) => f !== fn); };
  window.dispatchEvent = (e) => { (st.listeners[e.type] || []).forEach((f) => f(e)); return true; };
  window.__bsToast = (m) => st.toasts.push(m);
  st.restore = () => Object.assign(window, { Audio: saved.Audio, ShapeVoiceNotes: saved.notes, addEventListener: saved.add, removeEventListener: saved.remove, dispatchEvent: saved.dispatch, __bsToast: saved.toast });
  return st;
}
const mountPlayer = (voice, extra = {}) => { EFFECTS.length = 0; const d = drive(BSVoiceNotePlayer, { voice, t: THEME, accent: '#0a8f87', ...extra }); return { d, effects: EFFECTS.splice(0) }; };

test('the player: its waveform and length; play fetches the hour\'s link once and plays at the chosen speed', async () => {
  const st = playerRig();
  try {
    const { d } = mountPlayer({ path: VOICE.path, duration: 7, peaks: [0.2, 0.9, 0.4], mime: 'audio/mp4' });
    const play = byAttr(d, 'data-voice-play');
    assert.equal(play.props['aria-label'], 'Play voice note, 0:07');
    assert.equal(withAttr(flat(byAttr(d, 'data-voice-wave')), 'style').length - 1, 3, 'one bar a peak');
    assert.equal(textOf(byAttr(d, 'data-voice-clock')), '0:07');
    byAttr(d, 'data-voice-rate').props.onClick({ stopPropagation() {} });
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-rate')), '1.5×');
    await byAttr(d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    d.render();
    assert.deepEqual(st.urls, [VOICE.path]);
    assert.equal(st.audios[0].src, `https://s/${VOICE.path}`);
    assert.equal(st.audios[0].playbackRate, 1.5);
    assert.equal(byAttr(d, 'data-voice-play').props['aria-label'], 'Pause voice note');
    st.audios[0].currentTime = 3.5;
    st.audios[0].emit('timeupdate');
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-clock')), '0:04', 'the time played, while it plays');
    byAttr(d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    d.render();
    await byAttr(d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    assert.equal(st.urls.length, 1, 'the link is asked for once');
    byAttr(d, 'data-voice-rate').props.onClick({ stopPropagation() {} });
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-rate')), '2×');
    byAttr(d, 'data-voice-rate').props.onClick({ stopPropagation() {} });
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-rate')), '1×', '1 → 1.5 → 2 → 1');
    assert.equal(st.audios[0].playbackRate, 1, 'and the playing note follows');
  } finally { st.restore(); }
});

test('the player: your own unsent note plays from the phone; pending spins; failed says Not sent; an unplayable one says so', async () => {
  const st = playerRig({ url: async () => { throw new Error('Object not found'); } });
  try {
    const mine = mountPlayer({ localUrl: 'blob:local', duration: 4, peaks: [], pending: true, mime: 'audio/mp4' }, { mine: true });
    assert.ok(flat(byAttr(mine.d, 'data-voice-play')).some((n) => n.props && n.props.style && /bsspin/.test(n.props.style.animation || '')), 'a spinner while it uploads');
    await byAttr(mine.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    assert.equal(st.audios[0].src, 'blob:local');
    assert.deepEqual(st.urls, [], 'no link asked for');
    const failed = mountPlayer({ localUrl: 'blob:x', duration: 4, peaks: [], failed: true, mime: 'audio/mp4' }, { mine: true });
    assert.equal(byAttr(failed.d, 'data-voice-play').props.disabled, true);
    assert.equal(textOf(byAttr(failed.d, 'data-voice-failed')), 'Not sent');
    const gone = mountPlayer({ path: VOICE.path, duration: 4, peaks: [], mime: 'audio/mp4' });
    await byAttr(gone.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    assert.deepEqual(st.toasts, ['This voice note can’t be played right now.']);
  } finally { st.restore(); }
});

test('one note plays at a time: another starting pauses this one', async () => {
  const st = playerRig();
  try {
    const a = mountPlayer({ path: VOICE.path, duration: 4, peaks: [], mime: 'audio/mp4' });
    const b = mountPlayer({ path: `dm/${CONV}/${ME}/n2.m4a`, duration: 5, peaks: [], mime: 'audio/mp4' });
    const cleanups = [...a.effects, ...b.effects].map((fn) => fn()).filter((x) => typeof x === 'function');
    await byAttr(a.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    a.d.render();
    assert.equal(byAttr(a.d, 'data-voice-play').props['aria-label'], 'Pause voice note');
    await byAttr(b.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    a.d.render();
    assert.equal(byAttr(a.d, 'data-voice-play').props['aria-label'], 'Play voice note, 0:04', 'paused by the other');
    cleanups.forEach((fn) => fn());
    assert.equal((st.listeners['shape:voicePlay'] || []).length, 0, 'both stop listening when they go');
  } finally { st.restore(); }
});

// ── The thread and the composer ────────────────────────────────────────────────────────────────
const { BSChatThread, BSMessageComposer } = await loadBroadsheet(['BSChatThread', 'BSMessageComposer'], R);
const MAYA = 'Maya Chen';
const DM = (extra = {}) => ({ who: MAYA, role: 'Trainer', conversationId: CONV, userId: HER, messages: [
  { id: 'm1', who: MAYA, userId: HER, t: 'Voice note · 0:07', at: '2026-11-02T09:00:00Z', me: false, voice: { path: VOICE.path, duration: 7, peaks: [0.4], mime: 'audio/mp4' } },
  { id: 'm2', who: 'You', t: 'Sounds good.', at: '2026-11-02T09:05:00Z', me: true },
], ...extra });
const mountThread = (thread) => { EFFECTS.length = 0; return drive(BSChatThread, { thread, eyebrow: 'Coach', onBack() {} }); };
const named = (d, name) => d.nodes().filter((n) => n && typeof n.type === 'function' && n.type.name === name);

test('a voice note draws its player where the words would be, and the composer offers the recorder', () => {
  const d = mountThread(DM());
  const players = named(d, 'BSVoiceNotePlayer');
  assert.equal(players.length, 1);
  assert.equal(players[0].props.voice.path, VOICE.path);
  assert.equal(players[0].props.mine, undefined, 'hers');
  const theirs = withAttr(d.nodes(), 'data-thread-theirs')[0];
  assert.ok(!textOf(theirs).includes('Voice note · 0:07'), 'not its words');
  const composer = named(d, 'BSMessageComposer')[0];
  assert.equal(typeof composer.props.voiceNote.onSend, 'function');
  const none = mountThread({ who: 'Demo', role: 'Trainer', messages: [] });
  assert.equal(named(none, 'BSMessageComposer')[0].props.voiceNote, null, 'a thread with nowhere to store a note offers none');
});

async function sendThrough(thread, globals) {
  const saved = {};
  for (const k of Object.keys(globals)) saved[k] = window[k];
  Object.assign(window, globals);
  try {
    const d = mountThread(thread);
    named(d, 'BSMessageComposer')[0].props.voiceNote.onSend({ blob: new Blob(['opus'], { type: 'audio/mp4' }), duration: 4.2, peaks: [0.3, 0.6], mime: 'audio/mp4', ext: 'm4a' });
    d.render();
    const pending = named(d, 'BSVoiceNotePlayer').find((p) => p.props.mine);
    await tick(); await tick(); await tick();
    d.render();
    return { d, pending, after: named(d, 'BSVoiceNotePlayer').find((p) => p.props.mine) };
  } finally { for (const k of Object.keys(globals)) window[k] = saved[k]; }
}

test('sending a note: shown at once from the phone, uploaded to the thread\'s folder, then stored with its path and the view\'s id', async () => {
  const calls = { upload: [], send: [] };
  const { pending, after } = await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async (a) => { calls.upload.push(a); return { path: `dm/${CONV}/${ME}/new.m4a` }; } },
    ShapeMessages: { sendMessage: async (a) => { calls.send.push(a); return { data: { id: 'm9', created_at: '2026-11-02T10:00:00Z' } }; } },
  });
  assert.equal(pending.props.voice.pending, true);
  assert.match(pending.props.voice.localUrl, /^blob:/);
  assert.deepEqual(calls.upload.map((a) => [a.kind, a.threadId, a.ext, a.mime]), [['dm', CONV, 'm4a', 'audio/mp4']]);
  assert.equal(calls.send.length, 1);
  assert.equal(calls.send[0].body, 'Voice note · 0:04');
  assert.deepEqual(calls.send[0].metadata.voice, { path: `dm/${CONV}/${ME}/new.m4a`, duration: 4.2, peaks: [0.3, 0.6], mime: 'audio/mp4' });
  assert.match(calls.send[0].metadata.cid, /^tmp-/);
  assert.equal(after.props.voice.pending, false);
  assert.equal(after.props.voice.failed, undefined);
});

test('a channel note goes as the channel\'s voice; a note that fails says Not sent and why', async () => {
  const sends = [];
  await sendThrough({ who: '# Runs', role: 'Channel', group: true, channelId: CHAN, messages: [] }, {
    ShapeVoiceNotes: { upload: async (a) => { assert.equal(a.kind, 'ch'); assert.equal(a.threadId, CHAN); return { path: `ch/${CHAN}/${ME}/c.m4a` }; } },
    ShapeChannels: { sendMessage: async (a) => { sends.push(a); return { data: { id: 'c9' } }; } },
  });
  assert.deepEqual(sends.map((a) => [a.channelId, a.body, a.voice.path]), [[CHAN, 'Voice note · 0:04', `ch/${CHAN}/${ME}/c.m4a`]]);
  const toasts = [];
  const { after } = await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => { throw new Error('new row violates row-level security policy'); } },
    ShapeMessages: { sendMessage: async () => { throw new Error('never'); } },
    __bsToast: (m) => toasts.push(m),
  });
  assert.equal(after.props.voice.failed, true);
  assert.deepEqual(toasts, ['Couldn’t send the voice note.']);
});

test('the composer: the recorder beside the field, and while it records the field steps aside', () => {
  const props = { value: '', onChange() {}, onSend() {}, tray: true, unlocked: true, voiceNote: { onSend() {} } };
  const d = drive(BSMessageComposer, props);
  const rec = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSVoiceRecorder');
  assert.ok(rec, 'the recorder');
  assert.equal(rec.props.active, false);
  assert.equal(d.nodes().filter((n) => n.type === 'textarea').length, 1);
  rec.props.onActive(true);
  d.render();
  assert.equal(d.nodes().filter((n) => n.type === 'textarea').length, 0, 'no field while it records');
  assert.equal(d.nodes().filter((n) => n.props && n.props['aria-label'] === 'Send').length, 0, 'nor its send');
  assert.equal(d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSVoiceRecorder').props.active, true, 'the same recorder, now recording');
  const plain = drive(BSMessageComposer, { value: '', onChange() {}, onSend() {}, tray: true, unlocked: true });
  assert.equal(plain.nodes().filter((n) => n && typeof n.type === 'function' && n.type.name === 'BSVoiceRecorder').length, 0, 'no recorder where no voiceNote is offered');
});

test('the iOS microphone purpose names voice notes; the copy is in all 13 catalogs', () => {
  assert.match(readFileSync(join(ROOT, 'mobile-app/ios/App/App/Info.plist'), 'utf8'), /<key>NSMicrophoneUsageDescription<\/key>\s*<string>Shape uses your microphone for voice notes in chat, for talking to Nora, and for video calls with your coach\.<\/string>/);
  const keys = ['voiceRecord', 'voiceRecordingLabel', 'voiceCancel', 'voiceSend', 'voiceUnsupported', 'voiceMicBlocked', 'voicePlay', 'voicePause', 'voiceSpeed', 'voiceUnplayable', 'voiceNotSent', 'voiceFailed'];
  for (const l of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${l}/feed.json`), 'utf8'));
    for (const k of keys) assert.ok(typeof cat[`thread.${k}`] === 'string' && cat[`thread.${k}`], `${l} thread.${k}`);
    assert.ok(cat['thread.voicePlay'].includes('{time}'), `${l} keeps {time}`);
  }
});

// ── The migration ──────────────────────────────────────────────────────────────────────────────
test('the migration: a private bucket of three audio types, and rules that follow the thread', () => {
  assert.match(MIGRATION, /^begin;$/m);
  assert.match(MIGRATION, /^commit;$/m);
  assert.match(MIGRATION, /values \('voice-notes', 'voice-notes', false, 5242880, array\['audio\/mp4', 'audio\/webm', 'audio\/ogg'\]\)\non conflict \(id\) do update\n\s+set public = false,/);
  assert.match(MIGRATION, /create or replace function public\.voice_note_path_ok\(p_name text, p_write boolean\)\nreturns boolean\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = public, pg_temp/);
  assert.match(MIGRATION, /if coalesce\(p_write, true\) and v_sender <> auth\.uid\(\) then\n\s+return false;/, 'your own folder only');
  assert.match(MIGRATION, /if v_kind = 'dm' then\n\s+return public\.can_access_conversation\(v_thread\);/);
  assert.match(MIGRATION, /return public\.is_channel_member\(v_thread\) or public\.is_channel_host\(v_thread\)\n\s+or \(not coalesce\(p_write, true\) and public\.is_public_channel\(v_thread\)\);/);
  assert.match(MIGRATION, /p_name !~ '\^\(dm\|ch\)\/\[0-9a-f\]\{8\}/, 'a path of this shape only');
  assert.match(MIGRATION, /^revoke all on function public\.voice_note_path_ok\(text, boolean\) from public, anon;$/m);
  assert.match(MIGRATION, /for select to authenticated\n\s+using \(bucket_id = 'voice-notes' and public\.voice_note_path_ok\(name, false\)\);/);
  assert.match(MIGRATION, /for insert to authenticated\n\s+with check \(bucket_id = 'voice-notes' and public\.voice_note_path_ok\(name, true\)\);/);
  assert.match(MIGRATION, /for delete to authenticated\n\s+using \(bucket_id = 'voice-notes' and \(storage\.foldername\(name\)\)\[3\] = auth\.uid\(\)::text\);/);
  assert.doesNotMatch(MIGRATION, /for update/, 'a note is never overwritten');
  assert.match(MIGRATION, /raise exception 'a voice note must never be overwritten/);
  assert.match(MIGRATION, /raise exception 'the voice-notes policies on storage\.objects are missing or changed'/);
  assert.deepEqual(MIGRATION.match(/^\s*drop .*$/gim).map((l) => l.trim().split(' on ')[0]), [
    'drop policy if exists "voice notes: a thread\'s people play them"',
    'drop policy if exists "voice notes: a sender records into a thread they may post in"',
    'drop policy if exists "voice notes: a sender removes their own"',
  ], 'nothing is dropped but a policy about to be created again');
  assert.equal(BS_VOICE_PATH.source.includes('m4a|webm|ogg'), true, 'the app\'s path shape is the bucket\'s');
});
