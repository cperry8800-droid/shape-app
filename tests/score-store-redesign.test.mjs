// The Score and Store pages, redesigned (owner, 2026-10-26: "need to also imrpove look and design of
// these 2 pages", then, of three designs each, "A for score and do B for store but include the
// 'closest to you'"). MOUNTED: BSShapeScorePage and BSShapeStorePage from the shipping
// iosAppBroadsheetClient.jsx in jsdom, a signed-in member against a scripted ShapeApi.fetch, reading
// the real English score and store catalogs.
//
// - Score (A): the ladder is the page's one picture of the tiers (top rung first, the member's rung
//   and the next one named on it, a ✓ on each rung reached), under a plate that says what the next
//   rung unlocks. The old Tiers and Rewards tabs are gone; the record is Ledger and Points.
// - Store (B): a ruled balance (Available, Worth), then "Closest to you": the nearest unlocked
//   things out of reach by points to go, one per variant group, which a tap jumps to. The balance's
//   own Closest box is gone (owner, 2026-10-26: "drop the closest box, keep the row").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet, ROOT } from './helpers/broadsheet-mount.mjs';

const require_ = createRequire(import.meta.url);
const { IntlMessageFormat } = require_('intl-messageformat');

// The shared back row (BSBackRow): ← Back on its own row, the page's eyebrow beside it.
globalThis.BSBackRow = ({ onBack, label, trailing, disabled }) => React.createElement('div', { 'data-chrome': 'BSBackRow' }, React.createElement('button', { type: 'button', onClick: onBack, disabled }, '← ' + (label || 'Back')), trailing);
globalThis.BSBackButton = ({ onClick }) => React.createElement('button', { type: 'button', onClick }, '← Back');
const MOD = await loadBroadsheet(['BSShapeScorePage', 'BSShapeStorePage', 'SHAPE_SCORE_PROFILES', 'BS_STORE_PRODUCTS', 'BS_SHAPE_PTS_PER_USD'], React);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.matchMedia = () => ({ matches: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () { window.__scrolledTo = this.id; };

// The English catalogs the app ships. A score: or store: key missing from them fails here rather
// than falling back to the call site's English.
const CAT = Object.fromEntries(['score', 'store'].map((ns) => [ns, JSON.parse(readFileSync(`${ROOT}/mobile-app/src/i18n/catalogs/en/${ns}.json`, 'utf8'))]));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.split(':');
    if (!CAT[ns]) return undefined;
    assert.ok(k in CAT[ns], `${key} is not in the English ${ns} catalog`);
    return new IntlMessageFormat(CAT[ns][k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

// A signed-in member at 1,840 (Tempo, 160 from Form) with 900 to spend.
const MEMBER_SCORE = { points_total: 1840, current_tier: { name: 'Tempo' }, next_tier: { name: 'Form', threshold: 2000 }, points_to_next: 160, week_gain: 40, recent: [], spendable_balance: 900 };
function world(balance = 900) {
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' }, profile: { role: 'client' } }) };
  window.ShapeScore = undefined;
  window.__bsSessionGen = 0;
  window.ShapeStore = { get: async () => null };
  window.ShapeTierRewards = { list: async () => [] };
  window.ShapeCommit = { get: async () => null, progress: async () => null };
  window.ShapeApi = {
    fetch: async (path) => (path === '/api/client/score'
      ? { ok: true, status: 200, json: async () => ({ ...MEMBER_SCORE, spendable_balance: balance }) }
      : { ok: false, status: 404, json: async () => ({ error: 'unscripted' }) }),
  };
}

const flush = () => React.act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.getElementById('root');
  const root = createRoot(host);
  await React.act(async () => root.render(el));
  await flush();
  const text = () => host.textContent.replace(/\s+/g, ' ');
  const click = async (b) => {
    await React.act(async () => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await flush();
  };
  return { host, text, click, unmount: () => React.act(async () => root.unmount()) };
}
const P = MOD.SHAPE_SCORE_PROFILES;
const buttonsIn = (el) => [...el.querySelectorAll('button')];
const byText = (host, re) => buttonsIn(host).find((b) => re.test(b.textContent.trim()));

test('Score: the ladder runs top rung first, names the member\'s rung and the next, and ticks each rung reached', async () => {
  world();
  const s = await mount(React.createElement(MOD.BSShapeScorePage, { profile: P.client, onBack() {}, onOpenStore() {} }));
  try {
    const txt = s.text();
    assert.match(txt, /Tempo, and climbing\./);
    // The plate: how far into the tier, and what the next rung unlocks.
    assert.match(txt, /1,090 into the tier — 160 from Form\./);
    assert.match(txt, /Form unlocks: Free coach workout or plan/);
    // The ladder, top first, with the member's rung and the next one named on it.
    const ladder = txt.slice(txt.indexOf('The ladder'));
    const order = ['Legend', 'Peak', 'Form', 'Tempo', 'Raw'].map((n) => ladder.indexOf(n + ' ') >= 0 ? ladder.indexOf(n + ' ') : ladder.indexOf(n));
    assert.ok(order.every((i) => i > 0), `a rung is missing: ${ladder.slice(0, 300)}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'the ladder is not top rung first');
    assert.match(ladder, /Form2,000\+· Next · 160 to go/);
    assert.match(ladder, /Tempo750\+· you/);
    // A ✓ on each rung reached (Tempo, Raw), none on the rungs above.
    const ticks = [...s.host.querySelectorAll('[aria-label="Unlocked"]')];
    assert.equal(ticks.length, 2, 'two rungs reached, two ticks');
    // The old Tiers and Rewards tabs are gone; the record opens on the Ledger.
    assert.ok(!byText(s.host, /^Tiers$/) && !byText(s.host, /^Rewards$/), 'a Tiers or Rewards tab is back');
    assert.ok(byText(s.host, /^Ledger$/) && byText(s.host, /^Points$/));
    // The week and the stake are sections under the page's own heads, the ladder's kind.
    const heads = [...s.host.querySelectorAll('[data-bst-head="mag"]')].map((h) => h.textContent.trim());
    assert.deepEqual(heads.map((h) => h.replace(/\s+/g, ' ')), ['The ladder', 'This week', 'This week’s commitment']);
  } finally { await s.unmount(); }
});

// The member's departments, the products a member can buy, and the one entry a product shows under
// (a merch product's variants share their base name: "Shape Cap · Black" is "Shape Cap").
const MEMBER_CATS = ['Shape Merch', 'Training', 'Nutrition', 'Shape Perks'];
const BUYABLE = MOD.BS_STORE_PRODUCTS.filter((p) => MEMBER_CATS.includes(p.cat) && !p.locked);
const entryName = (p) => (p.cat === 'Shape Merch' ? String(p.name).split(' · ')[0] : p.name);
const storePage = () => mount(React.createElement(MOD.BSShapeStorePage, { profile: P.client, onBack() {}, onOpenScore() {} }));

// The rail's cards, read off the page: each card's name and its points to go.
function closestRail(host) {
  const head = [...host.querySelectorAll('[data-bst-head="mag"]')].find((h) => /Closest to you/.test(h.textContent));
  if (!head) return null;
  return buttonsIn(head.parentElement).map((b) => {
    const spans = [...b.querySelectorAll(':scope > span')];
    const name = spans[1].textContent.trim();
    const m = spans[2].textContent.match(/^([\d,]+) to go$/);
    assert.ok(m, `${name}: the card says no points to go ("${spans[2].textContent}")`);
    return { b, name, gap: Number(m[1].replace(/,/g, '')) };
  });
}

test('Store: the balance is Available and Worth, at the points rate; what it is nearest is only the row', async () => {
  world();
  const s = await storePage();
  try {
    const txt = s.text();
    assert.match(txt, new RegExp(`Available900ptsWorth\\$${(900 / MOD.BS_SHAPE_PTS_PER_USD).toFixed(2).replace('.', '\\.')}150 pts = \\$1`));
    // No Closest box: "Closest" is read only as the row's head.
    assert.doesNotMatch(txt.replace(/Closest to you/g, ''), /Closest/);
    assert.ok(closestRail(s.host).length > 0);
  } finally { await s.unmount(); }
});

// Codex on #2469: a balance that covers four entries filled the rail with them, with the dearer
// things still out of reach.
test('Store: a balance that covers four or more entries still names the next thing to earn toward', async () => {
  const costs = [...new Set(BUYABLE.map((p) => p.cost))].sort((a, b) => a - b);
  const balance = costs.find((c) => new Set(BUYABLE.filter((p) => p.cost <= c).map(entryName)).size >= 5);
  assert.ok(balance && balance < costs[costs.length - 1], 'the catalogue has no such balance');
  const above = BUYABLE.filter((p) => p.cost > balance).sort((a, b) => a.cost - b.cost);
  world(balance);
  const s = await storePage();
  try {
    const rail = closestRail(s.host);
    assert.ok(rail && rail.length, 'the rail is empty with things still out of reach');
    for (const c of rail) assert.ok(c.gap > 0, `${c.name} is within the balance`);
    assert.equal(rail[0].gap, above[0].cost - balance, 'the rail does not open on the nearest thing out of reach');
  } finally { await s.unmount(); }
});

test('Store: a balance that covers everything shows no rail', async () => {
  world(Math.max(...BUYABLE.map((p) => p.cost)));
  const s = await storePage();
  try {
    assert.equal(closestRail(s.host), null);
  } finally { await s.unmount(); }
});

test('Store: Closest to you lists the nearest unlocked things out of reach by points to go, one per variant group, at most four', async () => {
  world();
  const s = await storePage();
  try {
    const rail = closestRail(s.host);
    assert.ok(rail && rail.length > 0 && rail.length <= 4, `rail of ${rail && rail.length}`);
    assert.equal(new Set(rail.map((c) => c.name)).size, rail.length, 'a variant group shows twice');
    for (let i = 1; i < rail.length; i++) assert.ok(rail[i].gap >= rail[i - 1].gap, 'not by points to go');
    // Each card is a real, unlocked product the member can buy, its gap read off the catalogue.
    for (const c of rail) {
      const ps = BUYABLE.filter((p) => entryName(p) === c.name);
      assert.ok(ps.length, `${c.name} is not an unlocked member product`);
      assert.ok(ps.some((p) => p.cost - 900 === c.gap), `${c.name}: ${c.gap} to go matches no variant`);
    }
    // Nothing out of reach is nearer than the last card shown and missing from the rail.
    const nearer = BUYABLE.filter((p) => p.cost > 900 && p.cost - 900 < rail[rail.length - 1].gap);
    for (const p of nearer) assert.ok(rail.some((c) => c.name === entryName(p)), `${p.name} is nearer and missing`);
    // A tap goes to the card's entry in the catalogue.
    window.__scrolledTo = null;
    await s.click(rail[0].b);
    assert.match(String(window.__scrolledTo), /^bs-store-/);
    assert.ok(document.getElementById(window.__scrolledTo), 'the jump target is not on the page');
  } finally { await s.unmount(); }
});

test('Store: the rail is All\'s only, and leaves under Within balance, which stays in view beside the categories', async () => {
  world();
  const s = await storePage();
  try {
    assert.ok(closestRail(s.host));
    const within = byText(s.host, /^Within balance$/);
    assert.ok(within);
    // Only the categories scroll; the toggle is outside that scroller, so six categories can't push
    // it past the edge.
    const scroller = byText(s.host, /^Merch$/).parentElement;
    assert.equal(scroller.style.overflowX, 'auto');
    assert.ok(!scroller.contains(within), 'Within balance scrolls with the categories');
    assert.ok(scroller.parentElement === within.parentElement, 'Within balance is not in the categories\' row');
    await s.click(within);
    assert.equal(closestRail(s.host), null, 'the rail lists what the balance can\'t reach, under Within balance');
    await s.click(within);
    assert.ok(closestRail(s.host));
    await s.click(byText(s.host, /^Training$/));
    assert.equal(closestRail(s.host), null, 'the rail shows on a single category');
  } finally { await s.unmount(); }
});
