// Day dividers and swipe to reply in a chat thread (owner, 2026-11-01: "build the day dividers and swipe
// to reply"). Each day is said once over its messages and a message says only its clock; a message swiped
// left (or Reply after a long press) is quoted over the composer, sent as metadata.reply, and drawn over
// the answer, from the quoted message itself when it is loaded. Driven with the shipping modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { bsChatDayKey, bsChatDayLabel, bsChatClock, bsChatDividerIndexes, bsChatStamp } from '../mobile-app/src/services/chatTime.mjs';
import {
  BS_REPLY_SNIPPET, BS_REPLY_SWIPE, bsReplySnippet, bsReplyFromMetadata, bsReplyFor,
  bsReplySwipeDecide, bsReplySwipeOffset, bsReplySwipeCommits,
} from '../mobile-app/src/services/chatReply.mjs';
import { loadBroadsheet, drive, textOf, ROOT } from './helpers/broadsheet-mount.mjs';

const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const MIGRATION = readFileSync(join(ROOT, 'supabase-migrations/2026-11-01-channel-message-replies.sql'), 'utf8');
const { BSChatThread, BSReactionPicker } = await loadBroadsheet(['BSChatThread', 'BSReactionPicker']);
// The English feed catalog, formatted as the app's ICU runtime formats it ("Replying to {name}").
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const FEED_EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8'));
globalThis.window.ShapeI18n = {
  t: (key, opts = {}) => {
    const m = /^feed:(.+)$/.exec(key);
    const msg = m ? FEED_EN[m[1]] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
};
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
const flat = (node, out = []) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const c of node) flat(c, out); return out; }
  out.push(node);
  if (node.props) flat(node.props.children, out);
  return out;
};

// Local noon on a given day, so a test reads the same in every zone.
const day = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2026, 10, 1, 15, 0); // Sun 1 Nov 2026, 15:00 local

test('a day key is the reader\'s local date; a message with no stamp has none', () => {
  assert.equal(bsChatDayKey(day(2026, 11, 1, 23, 50)), '2026-11-01');
  assert.equal(bsChatDayKey(day(2026, 11, 2, 0, 10)), '2026-11-02', 'ten past midnight is the next day');
  assert.equal(bsChatDayKey(null), '');
  assert.equal(bsChatDayKey('not a date'), '');
});

test('a divider says Today, Yesterday, the weekday this past week, else the date (the year only when not this one)', () => {
  assert.deepEqual(bsChatDayLabel(day(2026, 11, 1, 8), 'en-US', { now: NOW }), { kind: 'today' });
  assert.deepEqual(bsChatDayLabel(day(2026, 10, 31, 23), 'en-US', { now: NOW }), { kind: 'yesterday' });
  assert.deepEqual(bsChatDayLabel(day(2026, 10, 27), 'en-US', { now: NOW }), { kind: 'weekday', text: 'Tuesday' });
  assert.deepEqual(bsChatDayLabel(day(2026, 10, 25), 'en-US', { now: NOW }), { kind: 'date', text: 'Sun, Oct 25' }, 'seven days back is a date');
  assert.deepEqual(bsChatDayLabel(day(2025, 12, 30), 'en-US', { now: NOW }), { kind: 'date', text: 'Tue, Dec 30, 2025' });
  assert.equal(bsChatDayLabel(day(2026, 10, 27), 'de-DE', { now: NOW }).text, 'Dienstag', 'in the reader\'s language');
  assert.equal(bsChatDayLabel(null, 'en-US', { now: NOW }), null);
  assert.match(bsChatClock(day(2026, 11, 1, 9, 5), 'en-US'), /^9:05\sAM$/, 'the clock alone');
  assert.equal(bsChatClock(null, 'en-US'), '');
});

test('a divider goes before the first stamped message and each change of day; an unstamped one breaks nothing', () => {
  const msgs = [
    { t: 'demo, no stamp' },
    { t: 'a', at: day(2026, 10, 30, 9) },
    { t: 'b', at: day(2026, 10, 30, 18) },
    { t: 'no stamp between' },
    { t: 'c', at: day(2026, 10, 30, 21) },
    { t: 'd', at: day(2026, 10, 31, 8) },
  ];
  assert.deepEqual([...bsChatDividerIndexes(msgs)], [1, 5]);
  assert.deepEqual([...bsChatDividerIndexes([{ t: 'x' }, { t: 'y' }])], [], 'a demo thread draws none');
  assert.deepEqual([...bsChatDividerIndexes(null)], []);
});

test('a reply keeps short strings only: the words run together and cut, the name cut, junk dropped', () => {
  assert.equal(bsReplySnippet('  two\n\nlines  '), 'two lines');
  const long = 'x'.repeat(400);
  assert.equal(bsReplySnippet(long).length, BS_REPLY_SNIPPET);
  assert.ok(bsReplySnippet(long).endsWith('…'));
  assert.deepEqual(bsReplyFromMetadata({ reply: { id: 'm1', from: 'u1', who: ' Maya   Chen ', t: 'Keep the tempo slow.' } }), { id: 'm1', from: 'u1', who: 'Maya Chen', t: 'Keep the tempo slow.' });
  assert.equal(bsReplyFromMetadata({ reply: { id: 'm1', t: '' } }), null, 'no words and no name is no reply');
  assert.equal(bsReplyFromMetadata({ reply: ['t'] }), null);
  assert.equal(bsReplyFromMetadata({ reply: Object.assign(['x'], { t: 'words', who: 'Ana' }) }), null, 'an array is no reply, whatever it carries');
  assert.equal(bsReplyFromMetadata({ reply: 'quote' }), null);
  assert.equal(bsReplyFromMetadata({}), null);
  assert.equal(bsReplyFromMetadata(null), null);
  const odd = bsReplyFromMetadata({ reply: { id: { evil: 1 }, from: 42, who: 'W'.repeat(200), t: 7 } });
  assert.deepEqual(odd, { id: null, from: '42', who: 'W'.repeat(60), t: '' }, 'objects are no id, numbers are, names are cut, non-strings are no words');
});

test('the reply stored for a message names its row, its sender\'s account and name, its words', () => {
  assert.deepEqual(bsReplyFor({ id: 'm9', who: 'Maya Chen', userId: 'u-maya', t: 'How did it go?' }, { myId: 'u-me', myName: 'Quinn' }), { id: 'm9', from: 'u-maya', who: 'Maya Chen', t: 'How did it go?' });
  assert.deepEqual(bsReplyFor({ who: 'You', me: true, t: 'Heavy but good.' }, { myId: 'u-me', myName: 'Quinn Harper' }), { id: null, from: 'u-me', who: 'Quinn Harper', t: 'Heavy but good.' }, 'your own is stored under your name');
  assert.equal(bsReplyFor(null), null);
});

test('the swipe: a leftward drag past the slop replies, a vertical one scrolls, past ARM it commits', () => {
  assert.equal(bsReplySwipeDecide({ dx: -5, dy: 2 }), null, 'not decided inside the slop');
  assert.equal(bsReplySwipeDecide({ dx: -20, dy: 4 }), 'reply');
  assert.equal(bsReplySwipeDecide({ dx: 20, dy: 0 }), 'scroll', 'rightward is Back\'s, never a reply');
  assert.equal(bsReplySwipeDecide({ dx: -12, dy: 14 }), 'scroll', 'a diagonal is a scroll');
  assert.equal(bsReplySwipeOffset(-200), -BS_REPLY_SWIPE.MAX);
  assert.equal(bsReplySwipeOffset(30), 0);
  assert.equal(bsReplySwipeCommits(-(BS_REPLY_SWIPE.ARM - 1)), false);
  assert.equal(bsReplySwipeCommits(-BS_REPLY_SWIPE.ARM), true);
});

// ── The thread ─────────────────────────────────────────────────────────────────────────────────
const MAYA = 'Maya Chen';
const talk = () => [
  { id: 'm1', who: MAYA, userId: 'u-maya', t: 'Morning! How did the squats feel?', at: day(2026, 10, 30, 9), me: false },
  { id: 'm2', who: MAYA, userId: 'u-maya', t: 'Keep the tempo slow today.', at: day(2026, 10, 30, 9, 2), me: false },
  { id: 'm3', who: MAYA, userId: 'u-maya', t: 'Ready for Saturday?', at: day(2026, 10, 31, 8), me: false },
  { id: 'm4', who: 'You', t: 'Heavy but good.', at: day(2026, 10, 31, 8, 30), me: true },
];
const mount = (messages = talk(), extra = {}) => drive(BSChatThread, { thread: { who: MAYA, role: 'Trainer', conversationId: 'c-1', messages, ...extra }, eyebrow: 'Coach', onBack() {} });

test('each day is said once over its messages, a new day starts a new byline, and a message says its clock', () => {
  const d = mount();
  const nodes = d.nodes();
  const dividers = withAttr(nodes, 'data-thread-day');
  assert.equal(dividers.length, 2, 'Oct 30 and Oct 31');
  assert.equal(dividers[0].props.role, 'separator');
  // Her byline heads her first message of each day: m1, then m3 after the divider (m2 continues m1's run).
  const bylines = nodes.filter((n) => n.type === 'button' && !withAttr(flat(n), 'data-thread-name').length && textOf(n).includes(MAYA) && !withAttr(flat(n), 'data-thread-quote').length);
  assert.equal(bylines.length, 2);
  const clock = bsChatClock(talk()[3].at, undefined);
  assert.ok(d.text.includes(clock), `the clock, ${clock}`);
  // ...alone: the day is the divider's to say (talk() is dated before today, so a full stamp has a day in it).
  const full = bsChatStamp(talk()[3].at, undefined);
  assert.notEqual(full, clock);
  assert.ok(!d.text.includes(full), `never the full stamp, ${full}`);
});

// A fake bubble: the touch handlers find the row by closest() and slide it.
const fakeRow = () => {
  const mark = { style: {} };
  const row = { style: {}, parentElement: { querySelector: () => mark } };
  return { row, mark, target: { closest: () => row } };
};
const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });
// The quote rides in the composer's `above` (a prop, which the harness does not draw as a child).
const composerQuote = (d) => d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.above;

test('swiping a message left past ARM quotes it over the composer; a short swipe springs back', () => {
  const d = mount();
  const bubble = () => withAttr(d.nodes(), 'data-thread-theirs').find((n) => textOf(n).includes('Ready for Saturday?'));
  const { row, mark, target } = fakeRow();
  // Short: springs back, no quote.
  bubble().props.onTouchStart({ ...touch(200, 300), currentTarget: target });
  bubble().props.onTouchMove(touch(170, 302));
  assert.equal(row.style.transform, 'translateX(-30px)', 'the row follows the finger');
  assert.ok(Number(mark.style.opacity) > 0 && Number(mark.style.opacity) < 1, 'the reply mark comes up');
  bubble().props.onTouchEnd({});
  d.render();
  assert.equal(row.style.transform, '', 'and settles back');
  assert.equal(composerQuote(d), null, 'a short swipe quotes nothing');
  // Long: replies.
  bubble().props.onTouchStart({ ...touch(200, 300), currentTarget: target });
  bubble().props.onTouchMove(touch(120, 304));
  assert.equal(row.style.transform, `translateX(-${BS_REPLY_SWIPE.MAX}px)`, 'no further than MAX');
  bubble().props.onTouchEnd({});
  d.render();
  const composer = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
  const quote = flat(composer.props.above).find((n) => n.props && n.props['data-composer-quote'] !== undefined);
  assert.ok(quote, 'the composer carries the quote');
  assert.match(textOf(quote), /Replying to Maya Chen/);
  assert.match(textOf(quote), /Ready for Saturday\?/);
  // × lets it go.
  flat(quote).find((n) => n.type === 'button').props.onClick();
  d.render();
  assert.equal(d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.above, null);
});

test('a vertical drag scrolls and never replies; the bubble claims horizontal touches from the shell', () => {
  const d = mount();
  const bubble = withAttr(d.nodes(), 'data-thread-theirs')[0];
  assert.equal(bubble.props.style.touchAction, 'pan-y', 'the shell\'s tab swipe lets it be (bsSwipeBlocked)');
  const { row, target } = fakeRow();
  bubble.props.onTouchStart({ ...touch(200, 300), currentTarget: target });
  bubble.props.onTouchMove(touch(196, 360));
  bubble.props.onTouchMove(touch(100, 380));
  assert.equal(row.style.transform, undefined, 'a scroll never moves the row');
  bubble.props.onTouchEnd({});
  d.render();
  assert.equal(composerQuote(d), null, 'a scroll quotes nothing');
});

test('Reply after a long press quotes it too, for a mouse, a keyboard or a screen reader', () => {
  const d = mount();
  const mine = withAttr(d.nodes(), 'data-thread-mine')[0];
  mine.props.onContextMenu({ preventDefault() {} });
  d.render();
  // The picker is drawn one level down (the harness renders the thread's own tree); its Reply is onReply.
  const picker = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSReactionPicker');
  assert.ok(picker && typeof picker.props.onReply === 'function', 'the picker carries Reply');
  picker.props.onReply();
  d.render();
  assert.equal(d.nodes().filter((n) => n && typeof n.type === 'function' && n.type.name === 'BSReactionPicker').length, 0, 'Reply shuts the picker');
  const composer = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
  assert.match(textOf(composer.props.above), /Replying to You.*Heavy but good\./);
});

test('the picker draws Reply after the reactions only when the thread hands it one', () => {
  let replied = 0;
  const t = { PAPER2: '#eee', SURFACE_BORDER: '#ddd', ELEVATION: 'none', INK: '#111', MONO: 'mono' };
  const withReply = drive(BSReactionPicker, { t, anchorRight: false, current: null, onPick() {}, onReply: () => replied++ });
  const btn = withReply.nodes().find((n) => n.type === 'button' && n.props['data-reply-action'] !== undefined);
  assert.ok(btn && /Reply$/.test(textOf(btn).trim()));
  btn.props.onClick();
  assert.equal(replied, 1);
  const bare = drive(BSReactionPicker, { t, anchorRight: false, current: null, onPick() {} });
  assert.equal(bare.nodes().filter((n) => n.props && n.props['data-reply-action'] !== undefined).length, 0, 'the feed\'s picker is unchanged');
});

test('what you send carries the quote: a direct message\'s metadata.reply, a channel\'s reply', async () => {
  const calls = [];
  globalThis.window.ShapeMessages = { sendMessage: (a) => { calls.push(['dm', a]); return Promise.resolve({ data: { id: 'm5' } }); } };
  globalThis.window.ShapeChannels = { sendMessage: (a) => { calls.push(['ch', a]); return Promise.resolve({ data: { id: 'c5' } }); } };
  try {
    const d = mount();
    const bubble = withAttr(d.nodes(), 'data-thread-theirs').find((n) => textOf(n).includes('Keep the tempo slow today.'));
    const { target } = fakeRow();
    bubble.props.onTouchStart({ ...touch(200, 300), currentTarget: target });
    bubble.props.onTouchMove(touch(100, 300));
    bubble.props.onTouchEnd({});
    d.render();
    let composer = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
    composer.props.onChange('Will do.');
    d.render();
    composer = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
    composer.props.onSend();
    d.render();
    assert.deepEqual(calls[0], ['dm', { conversationId: 'c-1', body: 'Will do.', metadata: { reply: { id: 'm2', from: 'u-maya', who: MAYA, t: 'Keep the tempo slow today.' } } }]);
    assert.equal(d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.above, null, 'the quote goes with the send');
    // ...and the sent message draws it over its words.
    const sent = withAttr(d.nodes(), 'data-thread-mine').find((n) => textOf(n).includes('Will do.'));
    assert.match(textOf(withAttr(flat(sent), 'data-thread-quote')[0]), /Maya Chen.*Keep the tempo slow today\./);
    // A message that is no reply sends exactly as before.
    composer = d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer');
    composer.props.onChange('Plain.');
    d.render();
    d.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.onSend();
    assert.deepEqual(calls[1], ['dm', { conversationId: 'c-1', body: 'Plain.' }]);
    // A channel's reply goes as `reply`.
    const ch = drive(BSChatThread, { thread: { who: 'Run club', role: 'Channel', group: true, channelId: 'ch-1', messages: talk() }, eyebrow: 'Channels', onBack() {} });
    const cb = withAttr(ch.nodes(), 'data-thread-theirs')[0];
    cb.props.onTouchStart({ ...touch(200, 300), currentTarget: fakeRow().target });
    cb.props.onTouchMove(touch(100, 300));
    cb.props.onTouchEnd({});
    ch.render();
    ch.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.onChange('In!');
    ch.render();
    ch.nodes().find((n) => n && typeof n.type === 'function' && n.type.name === 'BSMessageComposer').props.onSend();
    assert.deepEqual(calls[2], ['ch', { channelId: 'ch-1', body: 'In!', reply: { id: 'm1', from: 'u-maya', who: MAYA, t: 'Morning! How did the squats feel?' } }]);
  } finally {
    delete globalThis.window.ShapeMessages;
    delete globalThis.window.ShapeChannels;
  }
});

test('a quote is drawn from the quoted message when it is loaded, so a stored quote cannot misquote it', () => {
  const msgs = [
    ...talk(),
    { id: 'm6', who: MAYA, userId: 'u-maya', t: 'Sure.', at: day(2026, 10, 31, 9), me: false, reply: { id: 'm4', from: 'u-me', who: 'Quinn', t: 'I quit the plan.' } },
    { id: 'm7', who: MAYA, userId: 'u-maya', t: 'About that.', at: day(2026, 10, 31, 9, 5), me: false, reply: { id: 'gone', from: 'u-x', who: 'Sam', t: 'An old message' } },
  ];
  const d = mount(msgs);
  const quotes = withAttr(d.nodes(), 'data-thread-quote');
  assert.equal(quotes.length, 2);
  assert.match(textOf(quotes[0]), /You.*Heavy but good\./, 'the real message\'s sender and words, not the stored ones');
  assert.doesNotMatch(textOf(quotes[0]), /I quit the plan/);
  assert.ok(quotes[0].props['aria-label'], 'a loaded quote is a way to the message it answers');
  assert.match(textOf(quotes[1]), /Sam.*An old message/, 'one not loaded shows its stored words');
  assert.equal(quotes[1].props['aria-label'], undefined);
  const anchors = withAttr(d.nodes(), 'data-msg-id').map((n) => n.props['data-msg-id']);
  assert.ok(anchors.includes('m4'), 'each message with an id is a place a quote can go to');
});

test('a finger that travels is no long press', async () => {
  const d = mount();
  const bubble = withAttr(d.nodes(), 'data-thread-theirs')[0];
  bubble.props.onTouchStart({ ...touch(200, 300), currentTarget: fakeRow().target });
  bubble.props.onTouchMove(touch(200, 330));
  await new Promise((r) => setTimeout(r, 450));
  bubble.props.onTouchEnd({});
  d.render();
  const pickers = () => d.nodes().filter((n) => n && typeof n.type === 'function' && n.type.name === 'BSReactionPicker').length;
  assert.equal(pickers(), 0, 'the reactions stay shut');
  // Held still, it opens them.
  const again = withAttr(d.nodes(), 'data-thread-theirs')[0];
  again.props.onTouchStart({ ...touch(200, 300), currentTarget: fakeRow().target });
  await new Promise((r) => setTimeout(r, 450));
  again.props.onTouchEnd({});
  d.render();
  assert.equal(pickers(), 1);
});

// ── The backend ────────────────────────────────────────────────────────────────────────────────
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
  const send = new Function('supabase', 'state', 'channelDisplayName', `${MISSING}; ${fnSrc('sendChannelMessage')}; return sendChannelMessage;`)(supabase, { user: { id: 'u-me' } }, () => 'Quinn');
  return { send, inserts };
};
const REPLY = { id: 'm1', from: 'u-maya', who: MAYA, t: 'Morning!' };

test('a channel reply stores its quote as metadata; a plain message sends as it always did', async () => {
  const a = channelSender([{ data: { id: 'c1' }, error: null }]);
  await a.send({ channelId: 'ch-1', body: ' In! ', reply: REPLY });
  assert.deepEqual(a.inserts, [{ channel_id: 'ch-1', sender_id: 'u-me', author_name: 'Quinn', body: 'In!', metadata: { reply: REPLY } }]);
  const b = channelSender([{ data: { id: 'c2' }, error: null }]);
  await b.send({ channelId: 'ch-1', body: 'Plain' });
  assert.deepEqual(b.inserts, [{ channel_id: 'ch-1', sender_id: 'u-me', author_name: 'Quinn', body: 'Plain' }], 'no metadata key at all');
});

test('before the migration has run, a channel reply still goes, without its quote; any other error is an error', async () => {
  for (const error of [{ code: 'PGRST204', message: "Could not find the 'metadata' column of 'channel_messages' in the schema cache" }, { code: '42703', message: 'column "metadata" of relation "channel_messages" does not exist' }]) {
    const s = channelSender([{ data: null, error }, { data: { id: 'c3' }, error: null }]);
    const r = await s.send({ channelId: 'ch-1', body: 'In!', reply: REPLY });
    assert.equal(s.inserts.length, 2);
    assert.equal('metadata' in s.inserts[1], false, 'the second try has no quote');
    assert.deepEqual(r.data, { id: 'c3' });
  }
  const denied = channelSender([{ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }]);
  await assert.rejects(denied.send({ channelId: 'ch-1', body: 'In!', reply: REPLY }), (e) => /row-level security/.test(e.message));
  assert.equal(denied.inserts.length, 1, 'a refusal is never retried');
  const plainMissing = channelSender([{ data: null, error: { code: 'PGRST204', message: 'metadata column' } }]);
  await assert.rejects(plainMissing.send({ channelId: 'ch-1', body: 'Plain' }));
  assert.equal(plainMissing.inserts.length, 1, 'a plain message never needed the column, so it is not retried');
});

test('channel history keeps each row\'s id and its reply, reading every column', async () => {
  const rows = [
    { id: 'r1', sender_id: 'u-ana', author_name: 'Ana', body: 'Six?', created_at: day(2026, 10, 31, 18), metadata: {} },
    { id: 'r2', sender_id: 'u-me', author_name: 'Me', body: 'In', created_at: day(2026, 10, 31, 19), metadata: { reply: { id: 'r1', from: 'u-ana', who: 'Ana', t: 'Six?' } } },
    { id: 'r3', sender_id: 'u-ana', author_name: 'Ana', body: 'Old row', created_at: day(2026, 10, 31, 20) },
  ];
  let selected = null;
  const q = { select: (c) => { selected = c; return q; }, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
  const list = new Function('supabase', 'state', 'bsChatStamp', 'bsReplyFromMetadata', `${fnSrc('chatTimeOf')}; ${fnSrc('listChannelMessages')}; return listChannelMessages;`)({ from: () => q }, { user: { id: 'u-me' } }, () => '', bsReplyFromMetadata);
  const { data } = await list('ch-1');
  assert.equal(selected, '*', 'naming metadata before the migration has run would fail the read');
  assert.deepEqual(data.map((m) => m.id), ['r1', 'r2', 'r3']);
  assert.deepEqual(data.map((m) => m.reply), [null, { id: 'r1', from: 'u-ana', who: 'Ana', t: 'Six?' }, null]);
});

test('a message arriving live keeps its reply, and a channel\'s its id', () => {
  const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(CLIENT, /setExtras\(e => \[\.\.\.e, \{ id: row\.id \|\| null, who: row\.author_name \|\| 'Member', t: row\.body, time: 'now', at: row\.created_at \|\| null, me: false, userId: row\.sender_id \|\| null, reply: bsReplyFromMetadata\(row\.metadata\) \}\]\);/, 'a channel row');
  assert.match(CLIENT, /grocery: bsGroceryFromMetadata\(row\.metadata\), reply: bsReplyFromMetadata\(row\.metadata\) \}\]\);/, 'a direct row');
});

test('both direct-message readers keep the reply; the migration adds a capped object column, re-runnable, guarded', () => {
  assert.equal((BACKEND.match(/\n\s+reply: bsReplyFromMetadata\(message\.metadata\),\n/g) || []).length, 2);
  assert.match(MIGRATION, /^begin;$/m);
  assert.match(MIGRATION, /^commit;$/m);
  assert.match(MIGRATION, /add column if not exists metadata jsonb not null default '\{\}'::jsonb;/);
  assert.match(MIGRATION, /check \(jsonb_typeof\(metadata\) = 'object' and pg_column_size\(metadata\) <= 4096\)/);
  assert.match(MIGRATION, /if not exists \(\s*select 1 from pg_constraint[\s\S]*?conname = 'channel_messages_metadata_shape'\s*\) then\s*alter table/, 'the check is added once');
  assert.match(MIGRATION, /raise exception 'channel_messages lost its metadata shape check'/);
  assert.doesNotMatch(MIGRATION, /drop (table|column|policy)/i, 'nothing is dropped');
});
