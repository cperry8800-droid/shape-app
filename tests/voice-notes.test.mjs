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
  bsVoiceBodyTime, bsVoicePreview,
} from '../mobile-app/src/services/voiceNote.mjs';
import { noticeText, triggerCopy } from '../mobile-app/src/services/noticeCopy.mjs';
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
const AS_HER = { senderId: HER };
test('a note\'s metadata is read strictly, and only under the thread it was sent in', () => {
  assert.deepEqual(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV, senderId: HER }), { path: VOICE.path, duration: 7.3, mime: 'audio/mp4', peaks: [0.2, 0.5, 1, 0, 0], sender: HER });
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV.toUpperCase(), senderId: HER }).sender, HER, 'the thread id compares case-blind');
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'ch', threadId: CONV, senderId: HER }), null, 'a conversation\'s note in a channel');
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: 'bbbbbbbb-0000-4000-8000-000000000001', senderId: HER }), null, 'another conversation\'s note');
  for (const bad of [
    { ...VOICE, path: '../etc/passwd' }, { ...VOICE, path: `dm/${CONV}/${HER}/n1.exe` }, { ...VOICE, path: 7 },
    { ...VOICE, duration: 0 }, { ...VOICE, duration: -1 }, { ...VOICE, duration: BS_VOICE.MAX_SEC + 6 }, { ...VOICE, duration: 'long' },
    { ...VOICE, mime: 'text/html' }, { ...VOICE, mime: undefined },
  ]) assert.equal(bsVoiceFromMetadata({ voice: bad }, AS_HER), null, JSON.stringify(bad));
  for (const md of [null, {}, [], { voice: [] }, { voice: 'x' }, 'x']) assert.equal(bsVoiceFromMetadata(md, AS_HER), null, JSON.stringify(md));
  assert.equal(bsVoiceFromMetadata({ voice: { ...VOICE, peaks: Array(200).fill(0.5) } }, AS_HER).peaks.length, BS_VOICE.PEAKS_MAX, 'at most PEAKS_MAX bars');
  assert.deepEqual(bsVoiceFromMetadata({ voice: { ...VOICE, peaks: 'loud' } }, AS_HER).peaks, [], 'no waveform is a flat one');
  assert.ok(BS_VOICE_PATH.test(`ch/${CHAN}/${ME}/a_b-1.webm`));
});

test('a note plays only as the voice of the member who sent the message (Codex P1 on #2567)', () => {
  // ME copies HER path into a message of my own: it is no note, not her voice under my name.
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV, senderId: ME }), null, 'someone else\'s recording');
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV, senderId: HER.toUpperCase() }).sender, HER, 'the sender compares case-blind');
  for (const senderId of [undefined, null, '']) {
    assert.equal(bsVoiceFromMetadata({ voice: VOICE }, { kind: 'dm', threadId: CONV, senderId }), null, `read without its sender (${senderId})`);
  }
  assert.equal(bsVoiceFromMetadata({ voice: VOICE }), null, 'read with nothing to compare');
});

test('the clock and the words a note leaves', () => {
  assert.equal(bsVoiceClock(0), '0:00');
  assert.equal(bsVoiceClock(7.4), '0:07');
  assert.equal(bsVoiceClock(102), '1:42');
  assert.equal(bsVoiceClock(-3), '0:00');
  assert.equal(bsVoiceBody(12.2), 'Voice note · 0:12');
});

// A catalog's translator, as the app's i18next answers (a missing key: undefined).
const catTr = (locale) => {
  const cats = {};
  const load = (ns) => (cats[ns] ||= JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${locale}/${ns}.json`), 'utf8')));
  return (key, opts = {}) => {
    const [ns, k] = key.split(':');
    const msg = load(ns)[k];
    if (msg == null) return opts.defaultValue === '' ? k : opts.defaultValue;
    return new IntlMessageFormatR(msg, locale).format(opts);
  };
};
const { IntlMessageFormat: IntlMessageFormatR } = createRequire(import.meta.url)('intl-messageformat');

test('a note\'s words are said again in the reader\'s language: the preview line and the push (Codex P2 on #2567)', () => {
  assert.equal(bsVoiceBodyTime('Voice note · 0:12'), '0:12');
  assert.equal(bsVoiceBodyTime(bsVoiceBody(BS_VOICE.MAX_SEC + 5)), '2:05', 'the longest a note reads');
  for (const other of ['Voice note · 12', 'Voice note: 0:12', 'voice note · 0:12', 'Sam: Voice note · 0:12', 'Voice note · 0:12 later', null, 7]) {
    assert.equal(bsVoiceBodyTime(other), null, JSON.stringify(other));
  }
  const de = catTr('de');
  assert.equal(bsVoicePreview('Voice note · 0:12', de), 'Sprachnachricht · 0:12');
  assert.equal(bsVoicePreview('Voice note · 0:12', catTr('en')), 'Voice note · 0:12');
  assert.equal(bsVoicePreview('See you at 6', de), 'See you at 6', 'a member\'s own words, as written');
  assert.equal(bsVoicePreview('Voice note · 0:12', null), 'Voice note · 0:12', 'no translator, as stored');
  assert.equal(bsVoicePreview('Voice note · 0:12', () => ''), 'Voice note · 0:12', 'a translator with no answer, as stored');
  // The push and the bell: the trigger's row (notify_on_new_message) is said again from its shape.
  const row = { type: 'message', title: 'New message', body: 'Voice note · 0:12', data: { conversationId: CONV } };
  assert.deepEqual(triggerCopy(row), { title: ['message.title'], body: ['message.voiceBody', { time: '0:12' }] });
  assert.deepEqual(noticeText(row, de, { english: false, locale: 'de' }), { title: 'Neue Nachricht', body: 'Sprachnachricht · 0:12' });
  assert.deepEqual(noticeText(row, catTr('vi'), { english: false, locale: 'vi' }), { title: 'Tin nhắn mới', body: 'Tin nhắn thoại · 0:12' });
  assert.deepEqual(noticeText(row, de, { english: true, locale: 'en' }), { title: 'New message', body: 'Voice note · 0:12' }, 'English as stored');
  assert.deepEqual(noticeText({ ...row, body: 'Sam: see you at 6' }, de, { english: false, locale: 'de' }), { title: 'Neue Nachricht', body: 'Sam: see you at 6' }, 'typed words as written');
  // The chat list's preview line and a thread seeded from it both say it so.
  assert.match(CLIENT, /const last = bsVoicePreview\(f\.last \|\| \(f\.messages && f\.messages\.length \? \(f\.messages\[f\.messages\.length - 1\]\.t \|\| ''\) : ''\), tr\);/);
  assert.match(CLIENT, /\{ who: thread\.who, t: bsVoicePreview\(thread\.last, tr\), time:/);
});

// ── The wire ───────────────────────────────────────────────────────────────────────────────────
const VOICE_BLOCK = (() => {
  const start = BACKEND.indexOf('// ── Voice notes (owner, 2026-11-02');
  const end = BACKEND.indexOf('window.ShapeVoiceNotes = {', start);
  assert.ok(start > 0 && end > start, 'the voice-notes block moved');
  return BACKEND.slice(start, BACKEND.indexOf('\n', end) + 1);
})();
function loadVoiceWire({ user = { id: ME }, upload = async () => ({ error: null }), sign = async () => ({ data: { signedUrl: 'https://s/1' }, error: null }), remove = async () => ({ data: [], error: null }) } = {}) {
  const calls = { upload: [], sign: [], remove: [] };
  const supabase = { storage: { from: (bucket) => ({
    upload: (path, blob, opts) => { calls.upload.push({ bucket, path, blob, opts }); return upload(path, blob, opts); },
    createSignedUrl: (path, sec) => { calls.sign.push({ bucket, path, sec }); return sign(path, sec); },
    remove: (paths) => { calls.remove.push({ bucket, paths }); return remove(paths); },
  }) } };
  const window = {};
  let now = 1_000_000;
  const RealDate = Date;
  const FakeDate = { now: () => now };
  const state = { user };
  const api = new Function('supabase', 'state', 'window', 'BS_VOICE', 'bsVoicePath', 'Date',
    `${VOICE_BLOCK}; return { uploadVoiceNote, voiceNoteUrl, removeVoiceNote, _voiceUrls };`)(supabase, state, window, BS_VOICE, bsVoicePath, { now: () => FakeDate.now(), prototype: RealDate.prototype });
  return { ...api, calls, window, state, advance: (ms) => { now += ms; } };
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
  const out = loadVoiceWire({ user: null });
  await assert.rejects(out.voiceNoteUrl(VOICE.path), /No voice note/, 'signed out, no link');
  assert.equal(out.calls.sign.length, 0, 'and none asked for');
  assert.match(BACKEND, /\/\/ \.\.\.and so are the voice notes' signed links\.\n  try \{ _voiceUrls\.clear\(\); \} catch \(e\) \{\}/, 'sign-out forgets the links');
});

test('remove: an upload whose message was never stored is taken back out, and its link forgotten', async () => {
  const w = loadVoiceWire();
  await w.voiceNoteUrl(VOICE.path);
  assert.equal(w.window.ShapeVoiceNotes.remove, w.removeVoiceNote);
  assert.equal(await w.removeVoiceNote(VOICE.path), true);
  assert.deepEqual(w.calls.remove, [{ bucket: 'voice-notes', paths: [VOICE.path] }]);
  assert.equal(w._voiceUrls.size, 0, 'its link is forgotten');
  assert.equal(await w.removeVoiceNote(''), false, 'nothing to remove');
  assert.equal(w.calls.remove.length, 1);
  const refused = loadVoiceWire({ remove: async () => ({ data: null, error: new Error('denied') }) });
  assert.equal(await refused.removeVoiceNote(VOICE.path), false, 'a refusal is a no');
  const offline = loadVoiceWire({ remove: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(await offline.removeVoiceNote(VOICE.path), false, 'and so is no network: it never throws');
});

test('a link is one account\'s: one signed as the account changed is never kept or handed on (Codex P1 on #2567)', async () => {
  let release;
  const w = loadVoiceWire({ sign: () => new Promise((r) => { release = () => r({ data: { signedUrl: 'https://s/A' }, error: null }); }) });
  const asked = w.voiceNoteUrl(VOICE.path);
  w.state.user = null;              // signed out while it was being signed
  release();
  await assert.rejects(asked, /Signed out/);
  assert.equal(w._voiceUrls.size, 0, 'not kept');
  const ab = loadVoiceWire({ sign: () => new Promise((r) => { release = () => r({ data: { signedUrl: 'https://s/A' }, error: null }); }) });
  const forA = ab.voiceNoteUrl(VOICE.path);
  ab.state.user = { id: HER };      // switched to another account
  release();
  await assert.rejects(forA, /Signed out/, 'nor handed to the next account');
  // A link kept for one account is not the next one's: it asks again under its own.
  const two = loadVoiceWire();
  await two.voiceNoteUrl(VOICE.path);
  two.state.user = { id: HER };
  await two.voiceNoteUrl(VOICE.path);
  assert.equal(two.calls.sign.length, 2, 'each account signs its own');
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
    { id: 'c', sender_id: ME, body: 'Voice note · 0:07', metadata: { voice: VOICE }, created_at: '2026-11-02T09:02:00Z' },
  ];
  const coach = load('conversationToThread')({ id: CONV, provider_role: 'trainer', client_id: ME, title: 'Tom' }, msgs);
  const member = load('memberThreadFromRow')({ conversation_id: CONV, other_name: 'Ana' }, msgs);
  for (const th of [coach, member]) {
    assert.equal(th.messages[0].voice.path, VOICE.path);
    assert.equal(th.messages[1].voice, null, 'a path under another conversation is no note here');
    assert.equal(th.messages[2].voice, null, 'her recording in my message is no note');
  }
  const chVoice = { path: `ch/${CHAN}/${HER}/c.ogg`, duration: 3, mime: 'audio/ogg', peaks: [] };
  const rows = [
    { id: 'r', sender_id: HER, author_name: 'Ana', body: 'Voice note · 0:03', metadata: { voice: chVoice }, created_at: '2026-11-02T09:00:00Z' },
    { id: 's', sender_id: ME, author_name: 'Quinn', body: 'Voice note · 0:03', metadata: { voice: chVoice }, created_at: '2026-11-02T09:01:00Z' },
  ];
  const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
  const list = new Function('supabase', 'state', 'bsChatStamp', 'bsReplyFromMetadata', 'bsVoiceFromMetadata', `${fnSrc('chatTimeOf')}; ${fnSrc('listChannelMessages')}; return listChannelMessages;`)({ from: () => q }, { user: { id: ME } }, () => '', bsReplyFromMetadata, bsVoiceFromMetadata);
  assert.equal((await list(CHAN)).data[0].voice.path, `ch/${CHAN}/${HER}/c.ogg`);
  assert.equal((await list(CHAN)).data[1].voice, null, 'her recording in my channel message is no note');
  assert.equal((await list('dddddddd-0000-4000-8000-000000000001')).data[0].voice, null, 'another channel\'s note');
  // Live rows and the chat page's copy keep it too.
  assert.match(CLIENT, /voice: bsVoiceFromMetadata\(row\.metadata, \{ kind: 'ch', threadId: thread\.channelId, senderId: row\.sender_id \}\) \}\]\);/);
  assert.match(CLIENT, /voice: bsVoiceFromMetadata\(row\.metadata, \{ kind: 'dm', threadId: thread\.conversationId, senderId: row\.sender_id \}\) \}\]\);/);
  assert.equal((CLIENT.match(/bsVoiceFromMetadata\(/g) || []).length, 2, 'no other reader of a note in the client');
  assert.equal((BACKEND.match(/bsVoiceFromMetadata\((?:message|m)\.metadata, \{ kind: '(?:dm|ch)', threadId: [\w.]+, senderId: (?:message|m)\.sender_id \}\)/g) || []).length, 3, 'each backend reader names the row\'s sender');
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
  // Setting a source (even the same one) reloads it from the top, as a real player does.
  window.Audio = class { constructor() { this._src = ''; this.l = {}; this.playbackRate = 1; this.currentTime = 0; this.duration = NaN; st.audios.push(this); } get src() { return this._src; } set src(v) { this._src = v; this.currentTime = 0; this.sets = (this.sets || 0) + 1; } addEventListener(t, f) { (this.l[t] ||= []).push(f); } emit(t) { (this.l[t] || []).forEach((f) => f()); } async play() { this.played = (this.played || 0) + 1; this.emit('play'); } pause() { this.emit('pause'); } };
  window.ShapeVoiceNotes = { url: async (p) => { st.urls.push(p); return url(p); } };
  window.addEventListener = (type, fn) => { (st.listeners[type] ||= []).push(fn); };
  window.removeEventListener = (type, fn) => { st.listeners[type] = (st.listeners[type] || []).filter((f) => f !== fn); };
  window.dispatchEvent = (e) => { (st.listeners[e.type] || []).forEach((f) => f(e)); return true; };
  window.__bsToast = (m) => st.toasts.push(m);
  st.restore = () => Object.assign(window, { Audio: saved.Audio, ShapeVoiceNotes: saved.notes, addEventListener: saved.add, removeEventListener: saved.remove, dispatchEvent: saved.dispatch, __bsToast: saved.toast });
  return st;
}
const mountPlayer = (voice, extra = {}) => { EFFECTS.length = 0; const d = drive(BSVoiceNotePlayer, { voice, t: THEME, accent: '#0a8f87', ...extra }); return { d, effects: EFFECTS.splice(0) }; };

test('the player: its waveform and length; play fetches the hour\'s link and plays at the chosen speed', async () => {
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
    assert.equal(st.audios[0].src, `https://s/${VOICE.path}`, 'the same link while it is fresh (the backend keeps it)');
    assert.equal(st.audios[0].currentTime, 3.5, 'and the place it was paused');
    byAttr(d, 'data-voice-rate').props.onClick({ stopPropagation() {} });
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-rate')), '2×');
    byAttr(d, 'data-voice-rate').props.onClick({ stopPropagation() {} });
    d.render();
    assert.equal(textOf(byAttr(d, 'data-voice-rate')), '1×', '1 → 1.5 → 2 → 1');
    assert.equal(st.audios[0].playbackRate, 1, 'and the playing note follows');
  } finally { st.restore(); }
});

test('the player: a note left open past its hour is handed a new link, and takes it up where it was (Codex P2 on #2567)', async () => {
  let n = 1;
  const st = playerRig({ url: async (p) => `https://s/${p}?v=${n}` });
  try {
    const { d } = mountPlayer({ path: VOICE.path, duration: 7, peaks: [0.4], mime: 'audio/mp4' });
    const tap = async () => { await byAttr(d, 'data-voice-play').props.onClick({ stopPropagation() {} }); d.render(); };
    await tap();
    const a = st.audios[0];
    assert.equal(a.src, `https://s/${VOICE.path}?v=1`);
    a.currentTime = 4.2;
    await tap();                     // pause
    n = 2;                           // an hour on: the backend signs a new link
    await tap();
    assert.equal(st.urls.length, 2, 'asked again on the next play');
    assert.equal(a.src, `https://s/${VOICE.path}?v=2`, 'the new link replaces the old');
    assert.equal(a.currentTime, 0, 'a new source starts at the top...');
    a.emit('loadedmetadata');
    assert.equal(a.currentTime, 4.2, '...and is taken up where it was');
    // The phone's own copy never asks.
    const mine = mountPlayer({ localUrl: 'blob:mine', duration: 3, peaks: [], mime: 'audio/mp4' }, { mine: true });
    await byAttr(mine.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    mine.d.render();
    byAttr(mine.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    mine.d.render();
    await byAttr(mine.d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    assert.equal(st.urls.length, 2, 'no link asked for the phone\'s copy');
    assert.equal(st.audios[1].src, 'blob:mine');
    assert.equal(st.audios[1].sets, 1, 'and its copy is set once, never reloaded');
  } finally { st.restore(); }
});

test('the player: a play still waiting for its link when the thread closes never starts (Codex P2 on #2567)', async () => {
  let release;
  const st = playerRig({ url: () => new Promise((r) => { release = () => r(`https://s/${VOICE.path}`); }) });
  try {
    const { d, effects } = mountPlayer({ path: VOICE.path, duration: 5, peaks: [], mime: 'audio/mp4' });
    const cleanups = effects.map((fn) => fn()).filter((x) => typeof x === 'function');
    const tapped = byAttr(d, 'data-voice-play').props.onClick({ stopPropagation() {} });
    cleanups.forEach((fn) => fn());   // the thread closes
    release();
    await tapped;
    const a = st.audios[0];
    assert.equal(a.src, '', 'no source set');
    assert.equal(a.played, undefined, 'and it never plays');
    assert.deepEqual(st.toasts, [], 'nor says it could not');
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

async function sendThrough(thread, globals, before = null) {
  const saved = {};
  for (const k of Object.keys(globals)) saved[k] = window[k];
  Object.assign(window, globals);
  try {
    const d = mountThread(thread);
    if (before) { before(d); d.render(); }
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
  assert.equal(after.props.voice.path, `dm/${CONV}/${ME}/new.m4a`, 'it keeps where it is stored');
});

test('a phone that makes no copy of its own still plays the note it sent, from storage (Codex P2 on #2567)', async () => {
  const saved = URL.createObjectURL;
  URL.createObjectURL = () => { throw new Error('not here'); };
  try {
    const { pending, after } = await sendThrough(DM(), {
      ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/nc.m4a` }), remove: async () => true },
      ShapeMessages: { sendMessage: async () => ({ data: { id: 'm20' } }) },
    });
    assert.equal(pending.props.voice.localUrl, null, 'no copy on the phone');
    assert.equal(after.props.voice.localUrl, null);
    assert.equal(after.props.voice.path, `dm/${CONV}/${ME}/nc.m4a`, 'so it plays from where it is stored');
  } finally { URL.createObjectURL = saved; }
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

// Long-press her note and tap Reply, as a member does before recording an answer.
const replyToHers = (d) => {
  withAttr(d.nodes(), 'data-thread-theirs')[0].props.onContextMenu({ preventDefault() {} });
  d.render();
  named(d, 'BSReactionPicker')[0].props.onReply();
};

test('a note recorded while replying answers that message, in a conversation and in a channel (Codex P2 on #2567)', async () => {
  const sends = [];
  const { d } = await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/r.m4a` }) },
    ShapeMessages: { sendMessage: async (a) => { sends.push(a); return { data: { id: 'm10' } }; } },
  }, replyToHers);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].metadata.reply.id, 'm1', 'the reply rides with the note');
  assert.equal(sends[0].metadata.voice.path, `dm/${CONV}/${ME}/r.m4a`);
  const mine = withAttr(d.nodes(), 'data-thread-mine');
  assert.ok(textOf(mine[mine.length - 1]).includes(MAYA), 'the sent note shows what it answers');
  assert.doesNotMatch(textOf(named(d, 'BSMessageComposer')[0].props.above || ''), /Replying to/, 'and the reply bar is cleared');
  const chSends = [];
  const CH = { who: '# Runs', role: 'Channel', group: true, channelId: CHAN, messages: [
    { id: 'c1', who: 'Ana', userId: HER, t: 'Six tomorrow?', at: '2026-11-02T09:00:00Z', me: false },
  ] };
  await sendThrough(CH, {
    ShapeVoiceNotes: { upload: async () => ({ path: `ch/${CHAN}/${ME}/r.m4a` }) },
    ShapeChannels: { sendMessage: async (a) => { chSends.push(a); return { data: { id: 'c10' } }; } },
  }, replyToHers);
  assert.equal(chSends.length, 1);
  assert.equal(chSends[0].reply.id, 'c1');
  assert.equal(chSends[0].voice.path, `ch/${CHAN}/${ME}/r.m4a`);
  const plain = [];
  await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/p.m4a` }) },
    ShapeMessages: { sendMessage: async (a) => { plain.push(a); return { data: { id: 'm11' } }; } },
  });
  assert.equal('reply' in plain[0].metadata, false, 'a note that answers nothing carries no reply');
});

test('an uploaded note whose message is never stored is removed, not left behind (Codex P2 on #2567)', async () => {
  const removed = [];
  const { after } = await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/o.m4a` }), remove: async (p) => { removed.push(p); return true; } },
    ShapeMessages: { sendMessage: async () => { throw new Error('insert failed'); } },
    __bsToast: () => {},
  });
  assert.deepEqual(removed, [`dm/${CONV}/${ME}/o.m4a`]);
  assert.equal(after.props.voice.failed, true);
  const none = [];
  await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => { throw new Error('upload refused'); }, remove: async (p) => { none.push(p); return true; } },
    ShapeMessages: { sendMessage: async () => ({ data: { id: 'x' } }) },
    __bsToast: () => {},
  });
  assert.deepEqual(none, [], 'nothing uploaded, nothing to remove');
  const kept = [];
  await sendThrough(DM(), {
    ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/k.m4a` }), remove: async (p) => { kept.push(p); return true; } },
    ShapeMessages: { sendMessage: async () => ({ data: { id: 'm12' } }) },
  });
  assert.deepEqual(kept, [], 'a stored note is kept');
  const chRemoved = [];
  await sendThrough({ who: '# Runs', role: 'Channel', group: true, channelId: CHAN, messages: [] }, {
    ShapeVoiceNotes: { upload: async () => ({ path: `ch/${CHAN}/${ME}/o.m4a` }), remove: async (p) => { chRemoved.push(p); return true; } },
    ShapeChannels: { sendMessage: async () => { throw new Error('new row violates row-level security policy'); } },
    __bsToast: () => {},
  });
  assert.deepEqual(chRemoved, [`ch/${CHAN}/${ME}/o.m4a`], 'and in a channel');
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

test('a note\'s copy on the phone is let go: a failed one at once, the rest when the thread closes (Codex P2 on #2567)', async () => {
  const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const made = [], revoked = [];
  URL.createObjectURL = () => { const u = `blob:n${made.length}`; made.push(u); return u; };
  URL.revokeObjectURL = (u) => revoked.push(u);
  const globals = {
    ShapeVoiceNotes: { upload: async () => ({ path: `dm/${CONV}/${ME}/a.m4a` }), remove: async () => true },
    ShapeMessages: { sendMessage: async (a) => (a.body === 'Voice note · 0:09' ? Promise.reject(new Error('insert failed')) : { data: { id: 'm' + made.length } }) },
    __bsToast: () => {},
  };
  const keep = {};
  for (const k of Object.keys(globals)) keep[k] = window[k];
  Object.assign(window, globals);
  try {
    const d = mountThread(DM());
    const release = EFFECTS.find((fn) => String(fn).includes('localUrlsRef'));
    assert.ok(release, 'the thread lets its copies go when it closes');
    const cleanup = release();
    const send = (duration) => named(d, 'BSMessageComposer')[0].props.voiceNote.onSend({ blob: new Blob(['opus'], { type: 'audio/mp4' }), duration, peaks: [0.5], mime: 'audio/mp4', ext: 'm4a' });
    send(4); await tick(); await tick(); await tick(); d.render();
    assert.deepEqual(revoked, [], 'a sent note keeps playing from the phone while the thread is open');
    send(9); await tick(); await tick(); await tick(); d.render();
    assert.deepEqual(revoked, ['blob:n1'], 'a note that failed lets its copy go at once');
    cleanup();
    assert.deepEqual(revoked, ['blob:n1', 'blob:n0'], 'the rest when the thread closes, each once');
    cleanup();
    assert.equal(revoked.length, 2, 'never twice');
  } finally {
    for (const k of Object.keys(globals)) window[k] = keep[k];
    URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke;
  }
});

test('the iOS microphone purpose names voice notes; the copy is in all 13 catalogs', () => {
  assert.match(readFileSync(join(ROOT, 'mobile-app/ios/App/App/Info.plist'), 'utf8'), /<key>NSMicrophoneUsageDescription<\/key>\s*<string>Shape uses your microphone for voice notes in chat, for talking to Nora, and for video calls with your coach\.<\/string>/);
  const keys = ['voiceRecord', 'voiceRecordingLabel', 'voiceCancel', 'voiceSend', 'voiceUnsupported', 'voiceMicBlocked', 'voicePlay', 'voicePause', 'voiceSpeed', 'voiceUnplayable', 'voiceNotSent', 'voiceFailed'];
  for (const l of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${l}/feed.json`), 'utf8'));
    for (const k of [...keys, 'voicePreview']) assert.ok(typeof cat[`thread.${k}`] === 'string' && cat[`thread.${k}`], `${l} thread.${k}`);
    assert.ok(cat['thread.voicePlay'].includes('{time}'), `${l} keeps {time}`);
    const notice = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${l}/notice.json`), 'utf8'));
    for (const said of [cat['thread.voicePreview'], notice['message.voiceBody']]) {
      assert.ok(typeof said === 'string' && /^[^{}]+ · \{time\}$/.test(said), `${l}: ${said}`);
    }
    assert.equal(notice['message.voiceBody'], cat['thread.voicePreview'], `${l}: the push says what the list says`);
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
