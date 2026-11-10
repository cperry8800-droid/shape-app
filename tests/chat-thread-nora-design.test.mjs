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

// Owner, 2026-11-09, of the cream band over a dark thread: "remove the white color from the top part of chat
// screen. Make it all same color". The desk is on the page's own paper, a hairline under it.
test('the desk: the masthead and Back on the page\'s own paper, then their name', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  const nodes = d.nodes();
  const [desk] = withAttr(nodes, 'data-thread-desk');
  assert.ok(desk, 'the desk is drawn');
  assert.equal(desk.props.style.background, THEME.PAPER, 'the desk is an inverted band again');
  assert.equal(desk.props.style.color, THEME.INK);
  assert.match(String(desk.props.style.borderBottom), /^1px solid /, 'no hairline between the desk and the talk');
  const back = nodes.find(named('BSBackRow'));
  assert.ok(back && back.props.ink === THEME.INK, 'Back reads in the page\'s ink');
  // Codex P2 on #2651: on Steel's metal or a texture the desk shows the page's own background, a layer of
  // it as tall as the screen, clipped to the desk, under its content.
  const [paper] = withAttr(nodes, 'data-thread-desk-paper');
  assert.ok(paper, 'the desk lays the page\'s background under itself');
  assert.equal(paper.props.style.background, `${THEME.TEXTURE}, ${THEME.PAPER_BG}`);
  assert.equal(paper.props.style.zIndex, -1);
  assert.equal(paper.props.style.top, 0);
  assert.equal(desk.props.style.overflow, 'hidden', 'the layer runs past the desk');
  assert.equal(desk.props.style.isolation, 'isolate', 'the layer falls behind the page');
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

test('a boost line in your ink bubble takes the bubble\'s ink, not the paper\'s teal (Copilot on #2556)', () => {
  const d = drive(BSChatThread, { thread: thread([{ who: 'You', t: 'Last set!', time: 'now', me: true, boost: 'workout' }]), eyebrow: 'Coach', onBack() {} });
  const [mine] = withAttr(d.nodes(), 'data-thread-mine');
  const boost = flat(mine).find((n) => n.type === 'div' && /Live boost/.test(textOf(n)) && n.props.style && n.props.style.fontSize === 7.5);
  assert.ok(boost, 'the boost line is drawn');
  assert.match(String(boost.props.style.color), /^rgba\(255,\s*255,\s*255,\s*0\.78\)$|^#ffffffc7$/i, `the bubble's ink (THEME.PAPER) at 0.78, got ${boost.props.style.color}`);
});

test('the tray composer docks at the foot, pinned', () => {
  const d = drive(BSChatThread, { thread: thread(talk), eyebrow: 'Coach', onBack() {} });
  const composer = d.nodes().find(named('BSMessageComposer'));
  assert.ok(composer && composer.props.pinned === true && composer.props.tray === true);
  assert.ok(CLIENT.includes("if (pinned) return slot ? createPortal(<div style={{ pointerEvents: 'auto', background: t.PAPER, ") && CLIENT.includes('{trayBox}</div>, slot) : null;'), 'pinned, the tray goes through the composer slot');
});

// The ring held a "#" until the owner, 2026-11-10: "rethink these icons for the channels", "make shape
// hq one be the triangles": it holds the channel's mark (BSChannelMark; tests/channel-mark.test.mjs).
test('a channel: its mark in the ring, and each sender\'s tier on their byline', () => {
  const d = drive(BSChatThread, {
    thread: thread([
      { who: 'Ari', t: 'Who is in for Saturday?', time: '3h', me: false, tier: 'TEMPO' },
      { who: 'Sam', t: 'Me.', time: '2h', me: false, tier: 'PEAK' },
    ], { who: 'Saturday runs', role: 'Channel', group: true, channelId: 7 }),
    eyebrow: 'Channels', onBack() {},
  });
  const text = d.text;
  const mark = d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSChannelMark');
  assert.ok(mark, 'the ring does not hold the channel\'s mark');
  assert.equal(mark.props.ch.name, 'Saturday runs', 'the mark is not the channel\'s');
  assert.equal(mark.props.size, 40);
  assert.doesNotMatch(text, /#/, 'a "#" in the ring again');
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
