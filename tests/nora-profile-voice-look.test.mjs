// Nora's profile in the profiles' look and her voice screen as a night room (owner, 2026-11-01: "also
// need to update design of this page", "has old masthead", "lets also make this screen look cooler"),
// and her face's fallback ("avatar broken here also"). Driven with the shipping modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBroadsheet, loadCarved, drive, textOf, THEME, ROOT } from './helpers/broadsheet-mount.mjs';
import { BS_NORA_MARK, bsNoraPhotoError } from '../mobile-app/src/broadsheet/noraFace.mjs';

await loadBroadsheet(['BSChatThread']); // publishes the client's window globals the carved modules read
const { BSNoraProfile } = await loadCarved('BSNoraProfile.jsx');
const { BSNoraTalk } = await loadCarved('BSNoraTalk.jsx');
const TALK_SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSNoraTalk.jsx'), 'utf8');

// WCAG 2 contrast, worked out here on its own.
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);

test('a face that will not load is asked for once more, then her N, then steps aside', () => {
  const attrs = {};
  const img = { src: '/m/nora-avatar.png', style: {}, getAttribute: (k) => (k === 'src' ? img.src : attrs[k] || null), setAttribute: (k, v) => { attrs[k] = v; } };
  bsNoraPhotoError({ currentTarget: img });
  assert.match(img.src, /^\/m\/nora-avatar\.png\?r=\d+$/);
  bsNoraPhotoError({ currentTarget: img });
  assert.equal(img.src, BS_NORA_MARK);
  bsNoraPhotoError({ currentTarget: img });
  assert.equal(img.style.visibility, 'hidden');
});

test('her profile: the cover under the full masthead, her face over its edge, the counts, two ways to reach her', () => {
  let closed = 0, left = 0;
  const d = drive(BSNoraProfile, { onClose: () => closed++, onLeave: () => left++, avatar: '/m/nora-avatar.png', cover: '/m/nora/skyline-lo.webp' });
  const nodes = d.nodes();
  const [cover] = withAttr(nodes, 'data-nora-cover');
  assert.ok(cover && nodes.some((n) => n.type === 'img' && n.props.src === '/m/nora/skyline-lo.webp'), 'the night city is her cover');
  const face = nodes.find((n) => n.type === 'img' && n.props.src === '/m/nora-avatar.png');
  assert.equal(face.props.onError, bsNoraPhotoError, 'her face falls back, never a broken image');
  // The masthead's ✦ ⌕ (BSSearchCorner) and ⚙, each taking the page and the sheet down first.
  const search = nodes.find(named('BSSearchCorner'));
  assert.ok(search, 'the ✦ ⌕ corner is back on her masthead');
  search.props.close();
  assert.equal(left, 1, '✦ and ⌕ leave through onLeave');
  assert.match(d.text, /Instant.*Replies.*24\/7.*Hours.*Human.*Backup/);
  const [message] = withAttr(nodes, 'data-nora-message');
  message.props.onClick();
  assert.equal(closed, 1, 'Message Nora goes back to her');
  const [email] = withAttr(nodes, 'data-nora-email');
  assert.equal(email.props.href, 'mailto:info@theshapecommunity.com');
  const [helps] = withAttr(nodes, 'data-nora-helps');
  assert.match(textOf(helps), /01.*02.*03.*04.*05/);
  assert.match(textOf(helps), /Matching you with vetted trainers and nutritionists/);
});

test('Message Nora reads on either paper\'s teal (Copilot on #2556)', () => {
  const had = globalThis.window.useBS;
  try {
    for (const isLight of [true, false]) {
      globalThis.window.useBS = () => ({ ...THEME, isLight, MONO: 'mono', DISPLAY: 'display', padX: 18 });
      const [message] = withAttr(drive(BSNoraProfile, { onClose() {}, avatar: '/n.png' }).nodes(), 'data-nora-message');
      const teal = isLight ? '#0a8f87' : '#34d6c5';
      assert.equal(message.props.style.background, teal);
      assert.ok(contrast(teal, message.props.style.color) >= 4.5, `${message.props.style.color} on ${teal}`);
    }
  } finally { globalThis.window.useBS = had; }
});

test('the voice screen: a night room on the dark ink, a wave, End in a red that reads, reduced motion holds still', () => {
  const talk = (state) => ({ state, info: {}, heard: 'a long thing I said', reply: 'Her answer.', ringRef: { current: null }, barsRef: { current: null }, tap() {}, end() {} });
  for (const isLight of [true, false]) {
    const t = { ...THEME, isLight, INK: isLight ? '#0f0e0c' : '#f5f0e6', PAPER: isLight ? '#f5f0e6' : '#0f0e0c', MONO: 'mono', DISPLAY: 'display', BODY: 'body', padX: 18 };
    const nodes = drive(BSNoraTalk, { talk: talk('listening'), t, tint: '#0ac5a8', avatar: '/n.png' }).nodes();
    const [room] = withAttr(nodes, 'data-nora-talk');
    assert.equal(room.props.style.background, '#0f0e0c', 'the dark ink on either paper');
    const [wave] = withAttr(nodes, 'data-nora-wave');
    assert.equal(wave.props.children.length, 18);
    const [middle] = withAttr(nodes, 'data-nora-talk-middle');
    assert.equal(middle.props.style.overflowY, 'auto', 'a short phone scrolls the middle, never clips her face');
    const end = nodes.find((n) => n.type === 'button' && textOf(n).trim().startsWith('End'));
    assert.ok(contrast(end.props.style.background, end.props.style.color) >= 4.5, 'End\'s label reads');
    assert.equal(nodes.find((n) => n.type === 'img').props.onError, bsNoraPhotoError);
  }
  const onLevel = TALK_SRC.slice(TALK_SRC.indexOf('onLevel: (level) => {'), TALK_SRC.indexOf('bars.children[i].style.transform'));
  assert.ok(onLevel.indexOf('if (bsReducedMotion()) return;') > 0 && onLevel.indexOf('if (bsReducedMotion()) return;') < onLevel.indexOf('el.style.transform'), 'reduced motion returns before the ring or the wave moves');
});
