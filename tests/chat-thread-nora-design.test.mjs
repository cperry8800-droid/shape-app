// A chat thread in Nora's sheet's design (owner, 2026-11-01, on a screenshot of her sheet: "also use
// this chat design for the rest of messaging on chat page"). The desk is an ink band holding the
// masthead, ← and who you are talking to; your words are an ink bubble on the right with no face;
// theirs sit on the paper with no box, under their face and name once for a run of messages from the
// same person; the tray composer docks at the foot. Driven with the shipping module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, textOf, THEME, SRC } from './helpers/broadsheet-mount.mjs';

const { BSChatThread } = await loadBroadsheet(['BSChatThread']);
const CLIENT = readFileSync(SRC, 'utf8');
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);

const MAYA = 'Maya Chen';
const thread = (messages, extra = {}) => ({ who: MAYA, role: 'Trainer', messages, ...extra });
const talk = [
  { who: MAYA, t: 'Morning! How did the squats feel?', time: '2h', me: false },
  { who: MAYA, t: 'Keep the tempo slow today.', time: '2h', me: false },
  { who: 'You', t: 'Heavy but good.', time: '1h', me: true },
  { who: 'You', t: 'Will do.', time: '1h', me: true },
  { who: MAYA, t: 'Great.', time: 'now', me: false },
];

test('the desk: the masthead and Back on the ink band, then their name', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  const nodes = d.nodes();
  const [desk] = withAttr(nodes, 'data-thread-desk');
  assert.ok(desk, 'the desk is drawn');
  assert.equal(desk.props.style.background, THEME.INK);
  assert.equal(desk.props.style.color, THEME.PAPER);
  const back = nodes.find(named('BSBackRow'));
  assert.ok(back && back.props.ink === THEME.PAPER, 'Back reads in the band\'s ink');
  const [name] = withAttr(nodes, 'data-thread-name');
  assert.equal(textOf(name), MAYA);
});

test('yours: an ink bubble with no face; theirs on the paper, a byline once per run', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  const nodes = d.nodes();
  const mine = withAttr(nodes, 'data-thread-mine');
  const theirs = withAttr(nodes, 'data-thread-theirs');
  assert.deepEqual(mine.map((n) => textOf(n).trim()), ['Heavy but good.', 'Will do.']);
  assert.deepEqual(theirs.map((n) => textOf(n).trim()), ['Morning! How did the squats feel?', 'Keep the tempo slow today.', 'Great.']);
  for (const b of mine) {
    assert.equal(b.props.style.background, THEME.INK);
    assert.equal(b.props.style.color, THEME.PAPER);
    assert.equal(b.props.style.borderRadius, 20);
  }
  for (const b of theirs) assert.equal(b.props.style.background, undefined, 'their words have no box');
  // Their name heads the first of each run (the first two messages, then the last), never yours.
  const bylines = nodes.filter((n) => n.type === 'button' && !withAttr(flat(n), 'data-thread-name').length && textOf(n).includes(MAYA));
  assert.equal(bylines.length, 2, 'one byline for her first two messages, one for her last');
  assert.ok(!nodes.some(named('BSFacetAvatar')), 'faces are round photos, as Nora\'s are, and none beside yours');
  assert.ok(!nodes.some((n) => n.type === 'button' && /^You/.test(textOf(n).trim())), 'no byline on your own words');
});

test('two accounts with one display name are two runs; one account is one run (Codex P2 on #2556)', () => {
  const d = drive(BSChatThread, {
    thread: thread([
      { who: 'Alex', userId: 'u-1', t: 'First Alex.', time: '3h', me: false },
      { who: 'Alex', userId: 'u-2', t: 'Second Alex.', time: '3h', me: false },
      { who: 'Alex', userId: 'u-2', t: 'Second Alex again.', time: '2h', me: false },
    ], { who: 'Saturday runs', role: 'Channel', group: true, channelId: 7 }),
    eyebrow: 'Channels', onBack() {},
  });
  const bylines = d.nodes().filter((n) => n.type === 'button' && !withAttr(flat(n), 'data-thread-name').length && textOf(n).includes('Alex'));
  assert.equal(bylines.length, 2, 'u-2 gets its own face and name, then keeps one run');
});

test('the sticky desk carries the masthead, so BSPage pins none over it (Codex P2 on #2556)', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  // The harness's BSPage is a nameless stand-in: the page is the root, the one that takes tabBarHeight.
  const page = d.nodes().find((n) => n && n.props && n.props.tabBarHeight === 0);
  assert.ok(page, 'the thread is a BSPage with no tab bar');
  assert.equal(page.props.mast, false);
  const [desk] = withAttr(d.nodes(), 'data-thread-desk');
  assert.equal(desk.props.style.position, 'sticky');
  assert.ok(d.nodes().some(named('BSBackRow')), 'Back stays in the desk');
});

test('the tray composer docks at the foot, pinned', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  const composer = d.nodes().find(named('BSMessageComposer'));
  assert.ok(composer && composer.props.pinned === true && composer.props.tray === true);
  assert.ok(CLIENT.includes("if (pinned) return slot ? createPortal(<div style={{ pointerEvents: 'auto', background: t.PAPER, ") && CLIENT.includes('{trayBox}</div>, slot) : null;'), 'pinned, the tray goes through the composer slot');
});

test('a channel: a # in the ring, and each sender\'s tier on their byline', () => {
  const d = drive(BSChatThread, {
    thread: thread([
      { who: 'Ari', t: 'Who is in for Saturday?', time: '3h', me: false, tier: 'TEMPO' },
      { who: 'Sam', t: 'Me.', time: '2h', me: false, tier: 'PEAK' },
    ], { who: 'Saturday runs', role: 'Channel', group: true, channelId: 7 }),
    eyebrow: 'Channels', onBack() {},
  });
  const text = d.text;
  assert.match(text, /#/);
  assert.match(text, /AriTEMPO/);
  assert.match(text, /SamPEAK/);
});

function flat(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const c of node) flat(c, out); return out; }
  out.push(node);
  if (node.props) flat(node.props.children, out);
  return out;
}
