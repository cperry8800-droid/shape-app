// tests/short-age.test.mjs
// Short ages ("6m", "3h", "2d", "1w", "now") in the reader's language (owner, 2026-10-30: "Yes,
// translate the short ages too"). The code that makes an age keeps the token; the screen says it
// through bsShortAge, so a language switch reaches cards already loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IntlMessageFormat } from 'intl-messageformat';
import { bsShortAge } from '../mobile-app/src/services/shortAge.mjs';
import { ACTIVE_LOCALES, intlLocaleOf } from '../mobile-app/src/i18n/locales.mjs';

const CAT_DIR = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);
const catalog = (loc, ns) => JSON.parse(readFileSync(new URL(`${loc}/${ns}.json`, CAT_DIR), 'utf8'));
// The runtime's resolution order: the reader's locale, then en, then defaultValue.
const trFor = (loc) => {
  const cats = {};
  return (key, opts = {}) => {
    const [ns, k] = key.split(':');
    cats[loc + ns] ||= catalog(loc, ns);
    cats['en' + ns] ||= catalog('en', ns);
    const raw = cats[loc + ns][k] ?? cats['en' + ns][k];
    if (raw == null) return opts.defaultValue ?? key;
    return String(new IntlMessageFormat(raw, intlLocaleOf(loc)).format(opts));
  };
};
const UNITS = ['m', 'h', 'd', 'w'];

test('English reads as the token it was', () => {
  const tr = trFor('en');
  for (const ago of ['1m', '52m', '3h', '6d', '2w', 'now']) assert.equal(bsShortAge(ago, tr), ago);
});

test('every language has the four units and now, each with its number', () => {
  for (const loc of ACTIVE_LOCALES) {
    const common = catalog(loc, 'common');
    for (const u of UNITS) {
      assert.match(common['age.' + u] || '', /\{n\}/, `${loc} age.${u}`);
      assert.ok(bsShortAge('7' + u, trFor(loc)).includes('7'), `${loc} 7${u}`);
    }
    assert.ok((common['age.now'] || '').trim(), `${loc} age.now`);
  }
});

test('German says the unit its own way, and the card wraps it in its "ago"', () => {
  const tr = trFor('de');
  assert.equal(bsShortAge('2d', tr), '2 T.');
  assert.equal(bsShortAge('3h', tr), '3 Std.');
  assert.equal(bsShortAge('now', tr), 'jetzt');
  assert.equal(tr('feed:card.ago', { defaultValue: '{time} ago', time: bsShortAge('5m', tr) }), 'vor 5 Min.');
  assert.equal(bsShortAge('2d', trFor('ha')), 'kwana 2', 'Hausa puts the unit first');
});

test('what is not a short age prints as it is', () => {
  const tr = trFor('de');
  for (const s of ['3. Okt.', 'Oct 3', '8:48 AM', '14:05', 'synced', '2 days', 'd2', '12mo']) assert.equal(bsShortAge(s, tr), s);
  assert.equal(bsShortAge('', tr), '');
  assert.equal(bsShortAge(null, tr), '');
  assert.equal(bsShortAge(undefined, tr), '');
});

test('the screens that print an age say it through bsShortAge', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../mobile-app/src/broadsheet/BSTrainerProfile.jsx', import.meta.url), 'utf8');
  // The feed card and its detail, the Wall's records, the board, the team list and a chat's bubbles.
  for (const raw of ['time: a.ago })', 'time: d.ago })', '>{a.ago}<', '>{p.time}<', '>{m.time}<', '>{time}<', '>{bsAgoShort(']) {
    assert.ok(!client.includes(raw), `the client prints ${raw} raw`);
  }
  // A coach's Replays: the cards' badges and the sheet's eyebrow.
  for (const raw of ['>{w.ago}<', '>{r.ago}<', '${r.ago}']) assert.ok(!profile.includes(raw), `the profile prints ${raw} raw`);
});

// The real feed card, read in German: the byline's "vor 6 Min." and a profile's bare "6 Min.".
const { loadBroadsheet, drive, THEME } = await import('./helpers/broadsheet-mount.mjs');
const { BSActivityCard, COMMUNITY_ACTIVITIES } = await loadBroadsheet(['BSActivityCard', 'COMMUNITY_ACTIVITIES']);
const ctx = {
  t: THEME, cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
  actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
  exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
  tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null,
  myFollowingSet: new Map(),
  setOpenProfile() {}, setActivityDetail() {}, setLikerSheetFor() {}, setSendPostFor() {},
  feedApplyReaction() {},
};
const leaves = (node, out = []) => {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { for (const n of node) leaves(n, out); return out; }
  if (typeof node !== 'object' || !node.props) return out;
  const kids = [].concat(node.props.children == null ? [] : node.props.children).flat(Infinity);
  const own = kids.filter((k) => typeof k === 'string' || typeof k === 'number').join('');
  if (own.trim()) out.push(own.trim());
  for (const k of ['meta']) if (typeof node.props[k] === 'string') out.push(node.props[k]);
  for (const k of kids) if (k && typeof k === 'object') leaves(k, out);
  return out;
};
const inGerman = (fn) => {
  const had = globalThis.ShapeI18n;
  const tr = trFor('de');
  globalThis.ShapeI18n = { t: (key, opts) => { const v = tr(key, opts); return v === key ? undefined : v; } };
  try { return fn(); } finally { globalThis.ShapeI18n = had; }
};

test('a feed card says its age in the reader\'s language, on the Wall and on a profile', () => {
  const a = COMMUNITY_ACTIVITIES.find((x) => x.ago === '6m');
  assert.ok(a, 'the demo feed has a 6m card');
  for (const variant of ['feed', 'wall']) {
    const text = inGerman(() => leaves(drive(BSActivityCard, { a, ctx, isLast: true, pagePad: 0, variant }).nodes()[0]).join(' | '));
    assert.ok(text.includes('vor 6 Min.'), `${variant}: ${text.slice(0, 200)}`);
    assert.ok(!/\b6m\b/.test(text), `${variant}: no English age left`);
  }
  const own = inGerman(() => leaves(drive(BSActivityCard, { a, ctx, isLast: true, pagePad: 0, variant: 'feed', hideAuthor: true }).nodes()[0]).join(' | '));
  assert.ok(own.includes('6 Min.') && !/\b6m\b/.test(own), own.slice(0, 200));
});
