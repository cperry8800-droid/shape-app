// Coach dashboard step 5b (the owner's coach review, 2026-11-09): the Week as a fixed tool page.
// These mount the SHIPPED page (dashWeek.jsx) in jsdom over the real review store (dashData.jsx's
// useCoachWeekReviews, read before every write, against a stubbed shapeDb), the real tier marks,
// row keys and reply routes (dashToday.jsx), the real zone and tier modules, and read what a coach
// reads:
//   1. the head: "N check-ins to review", the ring (one segment per client who checked in, reviewed
//      or waiting) and Start review, with a count that couldn't be read as "—", never 0;
//   2. the heatmap: each rating a labelled good, middling or low tile with its number, a missing
//      rating an empty tile that says so, and "No check-in" as a row, not a row of empties;
//   3. what stands out: each pattern worked out from the week's real check-ins on the form's own
//      scale (10 is good on every question), and left out when it has nothing to say;
//   4. read, reply, next: selecting a row, ↑ ↓, and "Reply & mark reviewed", which marks the week
//      reviewed only if the reply opened and says so when the review write fails;
//   5. the demo only in the signed-out preview, under the band.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#week', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
globalThis.React = React;
const { createRoot } = require_('react-dom/client');
const DashSignals = require_('../public/newdesign/dashSignals.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const U = await import('../public/newdesign/unitText.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors });
// The page-shell globals the dashboard modules read (pageShell.jsx / trainerDashboard.jsx), stubbed:
// what is under test is the Week inside them.
Object.assign(globalThis, {
  DashSignals, serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', PAPER: '#1a1612', ink50: 'rgba(0,0,0,.5)',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
});

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const share = (mod) => {
  for (const [k, v] of Object.entries(mod)) globalThis[k] = v;
  for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } }
};
const D = await loadRealModule(ND('dashData.jsx'), {
  registry: new Map([['/newdesign/unitText.mjs', U]]),
  appendExports: 'export { useCoachWeekReviews, useCoachDoc, useSignedIn, dashCheckinReviewed, readoutStamp, readoutWeekKey, useWeekClock, dashWeighInDelta, dashUnitsApi, dashUnitPrefs };',
});
share(D);
const T = await loadRealModule(ND('dashToday.jsx'), {
  appendExports: 'export { dashMessageHref, dashMessageClient, dashMessageDraft, dashClientHref, DashClientGem, dashRecordTier, dashTierMark, dashRowKeyOpen, DashPill, DASH_SEV_COLORS };',
});
share(T);
const W = await loadRealModule(ND('dashWeek.jsx'), {
  appendExports: 'export { CoachWeekPage, DwkCheckinPanel, dwkRating, dwkBand, dwkPatterns, dwkHeadModel, dwkHeadTitle, dwkEntries, dwkCheckinOf, dwkNextWaiting, dwkIso, dwkMonday, dwkToday, dwkAddDays, DWK_LOW_AT, DWK_GOOD_AT, DWK_REPLY_TAB };',
});
const units = D.dashUnitsApi(U, D.dashUnitPrefs('Metric · kg / km'));
Object.assign(globalThis, {
  useDashUnits: () => units,
  DashPage: ({ title, actions, children }) => React.createElement('main', null, React.createElement('h1', null, title), React.createElement('nav', { 'data-actions': '' }, actions), children),
  DashDemoBand: () => React.createElement('b', { 'data-band': '' }, 'PREVIEW'),
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: null, nutriPayoutCard: null,
});

const MON = W.dwkIso(W.dwkMonday(W.dwkToday()));
const LAST = W.dwkAddDays(MON, -7);
const id = (n) => '0f8fad5b-d9cb-469f-a165-70867728950' + n;
const ck = (weekOf, ratings, extra) => ({ week_of: weekOf, ratings, wins: 'Hit every session', struggles: 'Late nights', question: null, weight: 80, unit: 'kg', created_at: weekOf + 'T09:00:00Z', ...(extra || {}) });
function rec(n, name, { checkins, logs = 5, points = null, loading = false } = {}) {
  return { profile: { id: id(n), name }, rankPoints: points, checkins, foodLogs: logs == null ? null : { daysLogged7d: logs }, progressRead: { state: loading ? 'loading' : 'ready' }, weighIns: [] };
}
const row = (r, flags) => ({ client: r, severity: 'green', flags: flags || [] });

// The coach's store: getSession, getUser, and the one whole-doc read and write, logged in order.
function makeDb({ uid = 'coach-1', doc = {}, readFails = false, saveFails = false } = {}) {
  const log = [];
  const state = { doc: JSON.parse(JSON.stringify(doc)), saves: [], log, saveFails, readFails };
  const chain = { select() { return chain; }, in() { return chain; }, eq() { return Promise.resolve({ data: [], error: null }); } };
  return {
    state,
    getSession: async () => { log.push('session'); return { data: { session: null } }; },
    getUser: async () => (uid ? { id: uid } : null),
    getUserGoals: async (kind) => { log.push('read:' + kind); return state.readFails ? null : JSON.parse(JSON.stringify(state.doc)); },
    saveUserGoals: async (kind, next, opts) => {
      log.push('save:' + kind);
      state.saves.push({ kind, doc: JSON.parse(JSON.stringify(next)), opts });
      if (state.saveFails) return { error: { message: 'nope' } };
      state.doc = JSON.parse(JSON.stringify(next));
      return { error: null };
    },
    client: { rpc: async () => ({ data: [], error: null }), from: () => chain },
  };
}

const roots = new Set();
after(async () => { for (const close of [...roots]) { try { await close(); } catch (e) { /* gone */ } } });
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 2)); }); };
async function page({ rows, source = 'live', db, role = 'trainer' }) {
  window.shapeDb = db;
  globalThis.useDashboard = () => ({ loading: false, triage: rows, source });
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  const close = async () => { roots.delete(close); await React.act(async () => root.unmount()); div.remove(); };
  roots.add(close);
  await React.act(async () => root.render(React.createElement(W.CoachWeekPage, { role })));
  await settle();
  const q = (sel) => div.querySelector(sel);
  const all = (sel) => [...div.querySelectorAll(sel)];
  // Text nodes joined with a space, as a reader takes them ("8 Good", never "8Good").
  const text = (el) => {
    if (!el) return '';
    const out = [], walk = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.nodeValue);
    return out.join(' ').replace(/\s+/g, ' ').trim();
  };
  const rowEl = (n) => all('[data-dwk-row]').find((r) => r.getAttribute('data-dwk-row') === id(n));
  return {
    div, q, all, close, text,
    head: () => text(q('[data-dwk-head]')),
    facts: () => text(q('[data-dwk-facts]')),
    panelId: () => (q('[data-dwk-panel]') ? q('[data-dwk-panel]').getAttribute('data-dwk-panel') : null),
    panelText: () => text(q('[data-dwk-panel]')),
    segs: () => all('[data-dwk-seg]').map((s) => s.getAttribute('data-dwk-seg')),
    rowEl,
    bands: (n) => [...rowEl(n).querySelectorAll('[data-dwk-band]')].map((t) => t.getAttribute('data-dwk-band')),
    click: (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }),
    key: (el, key) => React.act(async () => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })); }),
    button: (words) => all('button').find((b) => b.textContent.trim() === words),
  };
}

// The cast: Ada waiting with a question, Ben already reviewed, Cal with no check-in, Dee unread.
const ADA_CK = ck(MON, { trainingAdherence: 8, nutritionAdherence: 5, sleep: 4, energy: 7, stress: 2 }, { question: 'Should I add creatine?' });
const BEN_CK = ck(MON, { trainingAdherence: 9, nutritionAdherence: 8, sleep: 8, energy: 8, stress: 3, hunger: 7 });
const cast = () => [
  row(rec(1, 'Ada L.', { checkins: [ADA_CK], points: 5180 })),
  row(rec(2, 'Ben K.', { checkins: [BEN_CK] })),
  row(rec(3, 'Cal M.', { checkins: [ck(LAST, { sleep: 6 })] })),
  row(rec(4, 'Dee P.', { checkins: null, logs: null })),
];
const reviewedDoc = () => ({ [MON]: { [id(2)]: { reviewedAt: new Date().toISOString(), checkinSignature: JSON.stringify(BEN_CK) } } });

// ── 1. The head ────────────────────────────────────────────────────────────────
test('the head: how many wait, a ring segment per client who checked in, the facts, and Start review', async () => {
  const db = makeDb({ doc: reviewedDoc() });
  const p = await page({ rows: cast(), db });
  assert.equal(p.head(), '1 check-in to review');
  assert.deepEqual(p.segs(), ['reviewed', 'waiting'], 'one segment each for Ada and Ben, the reviewed first; none for Cal or Dee');
  assert.equal(p.facts(), "2 of 4 checked in · 1 haven't yet · 1 couldn't be read · 1 of 2 reviewed");
  assert.equal(/1 waiting/.test(p.text(p.q('[data-dwk-ring-key]'))) && /1 reviewed/.test(p.text(p.q('[data-dwk-ring-key]'))), true, 'the states in words beside the ring');
  assert.equal(p.q('[role="img"]').getAttribute('aria-label'), 'Check-ins this week: 1 waiting, 1 reviewed');
  // The session bridge comes before the reviews read.
  assert.equal(db.state.log.indexOf('session') > -1 && db.state.log.indexOf('session') < db.state.log.indexOf('read:coach_week_reviews'), true);
  // Height means priority: the head at Lift 2, the patterns resting at 1, the table at 0.
  assert.equal(p.q('section[aria-label="To review"]').getAttribute('data-dash-lift'), '2');
  assert.equal(p.q('section[aria-label="What stands out"]').getAttribute('data-dash-lift'), '1');
  assert.equal(p.q('section[aria-label="The roster\'s check-ins"]').getAttribute('data-dash-lift'), '0');
  assert.equal(p.panelId(), '', 'nothing open until the coach picks');
  // Start review opens the first one waiting, beside the table, and lifts its row to the panel.
  await p.click(p.q('[data-dwk-start]'));
  assert.equal(p.panelId(), id(1));
  assert.equal(p.rowEl(1).getAttribute('aria-current'), 'true');
  assert.equal(p.rowEl(1).getAttribute('data-dash-lift'), '1');
  assert.equal(p.q('[data-dwk-panel]').getAttribute('data-dash-lift'), '1');
  assert.equal(document.activeElement.getAttribute('data-dwk-row'), id(1), 'the row takes focus, so ↑ ↓ go on from it');
  await p.close();

  // Nobody waiting: Start review has nothing to open.
  const done = makeDb({ doc: { [MON]: { [id(1)]: { reviewedAt: new Date().toISOString(), checkinSignature: JSON.stringify(ADA_CK) }, [id(2)]: reviewedDoc()[MON][id(2)] } } });
  const q = await page({ rows: cast().slice(0, 2), db: done });
  assert.equal(q.head(), 'Every check-in reviewed ✓');
  assert.equal(q.q('[data-dwk-start]').disabled, true);
  await q.close();
});

test('a count that couldn\'t be read is "—", never 0', async () => {
  // The reviews could not be read: nothing is waiting or reviewed, so the count is unread.
  const p = await page({ rows: cast(), db: makeDb({ readFails: true }) });
  assert.equal(p.head(), '— check-ins to review');
  assert.deepEqual(p.segs(), ['unknown', 'unknown']);
  assert.equal(/your reviews couldn't be read/.test(p.facts()), true);
  assert.equal(/\b0\b/.test(p.head()), false);
  await p.close();
  // Not one client's check-ins could be read.
  const none = await page({ rows: [row(rec(1, 'Ada L.', { checkins: null })), row(rec(2, 'Ben K.', { checkins: null }))], db: makeDb() });
  assert.equal(none.head(), '— check-ins to review');
  assert.equal(/this week's check-ins couldn't be read/.test(none.facts()), true);
  assert.equal(/couldn't be read/.test(none.text(none.q('[data-dwk-patterns]'))), true, 'and no pattern is claimed over them');
  await none.close();
  // Still loading, as the model reads it.
  const loading = W.dwkHeadModel(W.dwkEntries([row(rec(1, 'Ada L.', { checkins: null, loading: true }))], { weekOf: MON, thisMonday: MON, live: true, weekDoc: {} }), { reviewsRead: true, isCurrent: true });
  assert.equal(loading.toReview, null);
  assert.equal(loading.facts[0], "this week's check-ins are still loading");
  const pastUnread = W.dwkHeadModel(W.dwkEntries([row(rec(1, 'Ada L.', { checkins: null }))], { weekOf: LAST, thisMonday: MON, live: true, weekDoc: {} }), { reviewsRead: true, isCurrent: false });
  assert.equal(pastUnread.facts[0], "that week's check-ins couldn't be read", 'a past week is named as that week');
  // A measured nothing is said in words, not as an unread dash.
  const empty = W.dwkHeadModel(W.dwkEntries([row(rec(3, 'Cal M.', { checkins: [] }))], { weekOf: MON, thisMonday: MON, live: true, weekDoc: {} }), { reviewsRead: true, isCurrent: true });
  assert.equal(W.dwkHeadTitle(empty), 'No check-ins to review');
  assert.equal(empty.toReview, 0);
  // The reviews still loading: unread too, and said.
  const pending = W.dwkHeadModel(W.dwkEntries(cast(), { weekOf: MON, thisMonday: MON, live: true, weekDoc: {} }), { reviewsRead: false, reviewsLoading: true, isCurrent: true });
  assert.equal(pending.toReview, null);
  assert.equal(pending.facts.includes('loading your reviews'), true);
  // A past week: who didn't check in, not who hasn't yet.
  const past = W.dwkHeadModel(W.dwkEntries(cast(), { weekOf: LAST, thisMonday: MON, live: true, weekDoc: {} }), { reviewsRead: true, isCurrent: false });
  assert.equal(past.facts[0], '1 of 4 checked in');
  assert.equal(past.facts.includes("2 didn't"), true);
});

// ── 2. The heatmap ─────────────────────────────────────────────────────────────
test('the heatmap: labelled bands with the number printed, a missing rating that says so, and "No check-in"', async () => {
  // The bands, on the form's own 1-10 where 10 is good: low is the engine's line, 4 or under.
  assert.equal(W.DWK_LOW_AT, DashSignals.THRESHOLDS.CHECKIN_RATING_LOW, 'the same line Needs you draws');
  assert.deepEqual([1, 4, 5, 6, 7, 10].map(W.dwkBand), ['low', 'low', 'mid', 'mid', 'good', 'good']);
  assert.deepEqual([0, 11, null, undefined, '', 'x', true, NaN].map(W.dwkBand), [null, null, null, null, null, null, null, null], 'off the scale is not a rating');
  assert.equal(W.dwkBand('8'), 'good');
  // "No check-in" is a claim: a week older than the four check-ins the overview fetched is not read.
  const four = rec(9, 'Fay', { checkins: [0, 1, 2, 3].map((n) => ck(W.dwkAddDays(MON, -7 * n), { sleep: 7 })) });
  assert.equal(W.dwkCheckinOf(four, W.dwkAddDays(MON, -28), MON, true).state, 'beyond');
  assert.equal(W.dwkCheckinOf({ ...four, checkins: four.checkins.slice(0, 3) }, W.dwkAddDays(MON, -28), MON, true).state, 'none', 'fewer than four fetched: all of them, so an absence is real');
  assert.equal(W.dwkCheckinOf(four, W.dwkAddDays(MON, -14), MON, true).state, 'in');
  const p = await page({ rows: cast(), db: makeDb({ doc: reviewedDoc() }) });
  // Ada: 8 · 5 · 4 · 7 · 2 · (hunger not rated).
  assert.deepEqual(p.bands(1), ['good', 'mid', 'low', 'good', 'low', 'none']);
  const tiles = [...p.rowEl(1).querySelectorAll('[data-dwk-band]')].map((t) => p.text(t));
  assert.deepEqual(tiles, ['8 Good', '5 Middling', '4 Low', '7 Good', '2 Low', 'not rated']);
  assert.equal(/\b0\b/.test(tiles[5]), false, 'a missing rating is never 0');
  // Cal checked in last week, not this one: one line that says so, no tiles.
  assert.deepEqual(p.bands(3), []);
  assert.equal(p.text(p.rowEl(3).querySelector('[data-dwk-nockin]')).startsWith('No check-in yet'), true);
  assert.equal(p.rowEl(3).getAttribute('data-dwk-state'), 'none');
  // Dee's check-ins were not sent: unread, never "no check-in".
  assert.equal(p.text(p.rowEl(4).querySelector('[data-dwk-nockin]')), "Check-in couldn't be read");
  // Status as a labelled chip.
  assert.equal(p.text(p.rowEl(1)).endsWith('Waiting'), true);
  assert.equal(p.text(p.rowEl(2)).endsWith('Reviewed ✓'), true);
  // The client's colour is their tier's, on a mark before the name; an unknown tier is hollow.
  const adaMark = p.rowEl(1).querySelector('.sh-tier-mark');
  assert.equal(!!adaMark && adaMark.getAttribute('data-tier') === ShapeClientColors.clientTier(5180).key, true);
  assert.equal(!!p.rowEl(2).querySelector('[data-tier-unknown]') && !p.rowEl(2).querySelector('.sh-tier-mark'), true);
  const adaLabel = p.rowEl(1).getAttribute('aria-label');
  assert.equal(adaLabel.includes(', ' + ShapeClientColors.clientTier(5180).title + ', '), true, 'the tier in words for assistive tech: ' + adaLabel);
  assert.equal(adaLabel.endsWith('waiting: Training 8 of 10, good; Nutrition 5 of 10, middling; Sleep 4 of 10, low; Energy 7 of 10, good; Calm 2 of 10, low; Hunger control not rated'), true, adaLabel);
  // The page's paging keeps the week: last week, Cal's check-in is there and Ada's row says "No check-in".
  await p.click(p.all('button').find((b) => b.getAttribute('aria-label') === 'Previous week'));
  assert.deepEqual(p.bands(3), ['none', 'none', 'mid', 'none', 'none', 'none']);
  assert.equal(/^No check-in · last one [A-Z][a-z]{2} \d{1,2}$/.test(p.text(p.rowEl(1).querySelector('[data-dwk-nockin]'))), true, 'a past week: "No check-in", not "yet"');
  await p.close();
});

// ── 3. What stands out ─────────────────────────────────────────────────────────
const entry = (n, ratings, { question = null, reviewed = false, logs = 5, none = false } = {}) => ({
  id: id(n), row: row(rec(n, 'C' + n)), state: none ? 'none' : 'in', ck: none ? null : { ratings, question }, reviewed, food: { n: logs },
});
test('what stands out: the weakest rating on the real scale, the questions waiting, thin logging, and nothing invented', () => {
  // Calm is stored as calm (10 = calm): three of four rated it 4 or under.
  const weak = W.dwkPatterns([entry(1, { stress: 2 }), entry(2, { stress: 3 }), entry(3, { stress: 4 }), entry(4, { stress: 9 })], true);
  assert.deepEqual(weak.map((l) => l.text), ["Calm is the week's weak spot: 3 of 4 rated it 4/10 or under (10 = calm)"]);
  // ⚠ The scale is not inverted: high calm is good, so a calm roster with poor sleep is a sleep week.
  const sleep = W.dwkPatterns([entry(1, { stress: 9, sleep: 2 }), entry(2, { stress: 10, sleep: 3 }), entry(3, { stress: 8, sleep: 8 })], true);
  assert.deepEqual(sleep.map((l) => l.text), ["Sleep is the week's weak spot: 2 of 3 rated it 4/10 or under"]);
  // Out of the clients who answered that question, not everyone who checked in.
  assert.equal(W.dwkPatterns([entry(1, { stress: 2 }), entry(2, { stress: 3 }), entry(3, { sleep: 8 })], true)[0].text, "Calm is the week's weak spot: 2 of 2 rated it 4/10 or under (10 = calm)");
  // One client's low is their own row's, not a pattern.
  assert.deepEqual(W.dwkPatterns([entry(1, { energy: 2 }), entry(2, { energy: 8 })], true), []);
  // A tie goes to the lower average.
  const tie = W.dwkPatterns([entry(1, { sleep: 1, energy: 4 }), entry(2, { sleep: 2, energy: 4 }), entry(3, { sleep: 8, energy: 9 }), entry(4, { sleep: 8, energy: 9 })], true);
  assert.equal(tie[0].rating, 'sleep');
  // Questions still waiting, grouped only where they name the same thing.
  const asks = W.dwkPatterns([
    entry(1, {}, { question: 'Should I add creatine?' }), entry(2, {}, { question: 'Creatine on rest days too?' }),
    entry(3, {}, { question: 'Can we swap Friday?' }), entry(4, {}, { question: 'Is creatine safe?', reviewed: true }), entry(5, {}, { question: '   ' }),
  ], true);
  assert.deepEqual(asks.map((l) => l.text), ['2 asked about creatine, answer both; 1 more asked you something']);
  assert.equal(asks[0].n, 3, 'the reviewed one and the blank one are not waiting questions');
  const three = W.dwkPatterns([1, 2, 3].map((n) => entry(n, {}, { question: 'How much protein?' })), true);
  assert.deepEqual(three.map((l) => l.text), ['3 asked about protein, answer all 3']);
  assert.deepEqual(W.dwkPatterns([entry(1, {}, { question: 'Can we swap Friday?' }), entry(2, {}, { question: 'Is 1,900 kcal too low?' })], true).map((l) => l.text), ['2 asked you something']);
  assert.deepEqual(W.dwkPatterns([entry(1, {}, { question: 'Can we swap Friday?' })], true).map((l) => l.text), ['1 client asked you something']);
  // Thin food logging, out of the clients whose logs were read.
  const food = W.dwkPatterns([entry(1, {}, { logs: 2 }), entry(2, {}, { logs: 3 }), entry(3, {}, { logs: 4 }), entry(4, {}, { logs: null }), entry(5, {}, { logs: 0, none: true })], true);
  assert.deepEqual(food.map((l) => l.text), ['Food logging is thin for 3 of 4: 3 days or fewer logged in the last 7']);
  assert.equal(W.dwkPatterns([entry(1, {}, { logs: 1 })], false)[0].text, 'Food logging is thin for 1 of 1: 3 days or fewer logged that week');
  assert.deepEqual(W.dwkPatterns([entry(1, {}, { logs: 4 }), entry(2, {}, { logs: null })], true), []);
  // At most three, in their order; nothing to say is nothing.
  const all3 = W.dwkPatterns([entry(1, { stress: 2 }, { question: 'Creatine?', logs: 1 }), entry(2, { stress: 1 }, { question: 'More creatine?' })], true);
  assert.deepEqual(all3.map((l) => l.key), ['weak', 'asks', 'food']);
  assert.deepEqual(W.dwkPatterns([], true), []);
});

test('the page works its patterns out of the week it shows, and says when there is nothing', async () => {
  const p = await page({ rows: cast(), db: makeDb({ doc: reviewedDoc() }) });
  // Ada's 2 and Ben's 3 on calm; Ada's creatine question waits (Ben was reviewed).
  assert.deepEqual(p.all('[data-dwk-pattern]').map((l) => p.text(l)), ["Calm is the week's weak spot: 2 of 2 rated it 4/10 or under (10 = calm)", '1 client asked you something']);
  await p.close();
  const quiet = await page({ rows: [row(rec(1, 'Ada L.', { checkins: [ck(MON, { sleep: 8 })] }))], db: makeDb() });
  assert.equal(quiet.text(quiet.q('[data-dwk-patterns="0"]')), "Nothing stands out across this week's check-ins.");
  await quiet.close();
});

// ── 4. Read, reply, next ───────────────────────────────────────────────────────
test('selecting a row opens its check-in beside the table, and ↑ ↓ and Enter move through the rows', async () => {
  const p = await page({ rows: cast(), db: makeDb({ doc: reviewedDoc() }) });
  await p.click(p.rowEl(2));
  assert.equal(p.panelId(), id(2));
  const panel = p.panelText();
  for (const words of ['Ben K.', 'Reviewed ✓', 'Training 9 /10 Good', 'Calm 3 /10 Low', 'Win Hit every session', 'Struggle Late nights', 'Weigh-in 80 kg', 'Adherence · this week', 'closes Sunday', 'Message', '＋ Note', 'Client file →', 'Reviewed']) {
    assert.equal(panel.includes(words), true, words + ' in ' + panel);
  }
  assert.equal(p.q('[data-dwk-panel] a').getAttribute('href'), 'TrainerClient.html?id=' + id(2));
  assert.equal(!!p.q('[data-dwk-panel] [data-dwk-reply]'), false, 'a reviewed check-in has nothing to reply-and-mark');
  // ↓ from Ben's row opens Cal and moves focus with it; ↑ comes back.
  p.rowEl(2).focus();
  await p.key(p.rowEl(2), 'ArrowDown');
  assert.equal(p.panelId(), id(3));
  assert.equal(document.activeElement.getAttribute('data-dwk-row'), id(3));
  assert.equal(p.panelText().includes('No check-in yet'), true);
  await p.key(p.rowEl(3), 'ArrowUp');
  assert.equal(p.panelId(), id(2));
  // Enter on a row opens it; an arrow off the end stays.
  await p.key(p.rowEl(1), 'Enter');
  assert.equal(p.panelId(), id(1));
  await p.key(p.rowEl(1), 'ArrowUp');
  assert.equal(p.panelId(), id(1));
  // Ada's question, and the private note, kept.
  assert.equal(p.panelText().includes('Asked you Should I add creatine?'), true);
  await p.click(p.button('＋ Note'));
  assert.equal(!!p.q('[data-dwk-panel] textarea'), true);
  await p.close();
});

test('Reply & mark reviewed: the reply first, the review only if it opened, then the next one waiting', async () => {
  const opened = [];
  window.open = (href, target) => { opened.push([href, target]); return { focus() {} }; };
  const ED_CK = ck(MON, { sleep: 7 }, { question: 'Can we swap Friday?' });
  const rows = [...cast(), row(rec(5, 'Ed R.', { checkins: [ED_CK] }))];
  const db = makeDb({ doc: reviewedDoc() });
  const p = await page({ rows, db });
  await p.click(p.q('[data-dwk-start]'));
  assert.equal(p.panelId(), id(1));
  // Another tab writes a note on Ed after this page read the store: the write must keep it.
  db.state.doc[MON] = { ...db.state.doc[MON], [id(5)]: { note: 'from the other tab' } };
  await p.click(p.q('[data-dwk-reply]'));
  await settle();
  assert.deepEqual(opened, [['/newdesign/TrainerMessages.html?client=' + id(1), W.DWK_REPLY_TAB]], 'the thread the client sees, in the one reply tab');
  assert.equal(db.state.saves.length, 1);
  const wrote = db.state.saves[0].doc[MON];
  assert.equal(typeof wrote[id(1)].reviewedAt === 'string' && wrote[id(1)].checkinSignature === JSON.stringify(ADA_CK), true);
  assert.equal(wrote[id(5)].note, 'from the other tab', 'read before write: a change made elsewhere survives');
  assert.equal(wrote[id(2)].checkinSignature, JSON.stringify(BEN_CK));
  assert.equal(db.state.saves[0].opts.expectedUserId, 'coach-1');
  const lastRead = db.state.log.lastIndexOf('read:coach_week_reviews');
  assert.equal(lastRead > -1 && lastRead < db.state.log.lastIndexOf('save:coach_week_reviews'), true);
  // Then on to Ed, the next one waiting, with the last reply said.
  assert.equal(p.panelId(), id(5));
  assert.equal(p.text(p.q('[data-dwk-notice]')), 'Replied to Ada L. and marked reviewed ✓');
  assert.equal(p.text(p.rowEl(1)).endsWith('Reviewed ✓'), true);
  assert.equal(p.head(), '1 check-in to review');
  // Ed is the last: the reply says so and stays on him.
  await p.click(p.q('[data-dwk-reply]'));
  await settle();
  assert.equal(p.panelId(), id(5));
  assert.equal(p.text(p.q('[data-dwk-notice]')), 'Replied to Ed R. and marked reviewed ✓ · that was the last check-in waiting');
  // Dee's check-ins were never read, so this is not "every check-in reviewed": the facts say why.
  assert.equal(p.head(), 'No check-ins to review');
  assert.equal(/1 couldn't be read/.test(p.facts()), true);
  await p.close();
});

test('a reply that could not open marks nothing; a review write that fails says so and stays', async () => {
  // The tab was blocked: nothing is written, and the coach is told.
  window.open = () => null;
  const db = makeDb({ doc: reviewedDoc() });
  const p = await page({ rows: cast(), db });
  await p.click(p.q('[data-dwk-start]'));
  await p.click(p.q('[data-dwk-reply]'));
  await settle();
  assert.equal(db.state.saves.length, 0);
  assert.equal(p.q('[data-dwk-notice]').getAttribute('data-dwk-notice'), 'noopen');
  assert.equal(p.q('[data-dwk-notice]').getAttribute('role'), 'alert');
  assert.equal(p.panelId(), id(1));
  assert.equal(p.head(), '1 check-in to review');
  await p.close();

  // The reply opened but the write failed: the paint rolls back, the panel stays and says so.
  window.open = () => ({ focus() {} });
  const bad = makeDb({ doc: reviewedDoc(), saveFails: true });
  const q = await page({ rows: [...cast(), row(rec(5, 'Ed R.', { checkins: [ck(MON, { sleep: 7 })] }))], db: bad });
  await q.click(q.q('[data-dwk-start]'));
  await q.click(q.q('[data-dwk-reply]'));
  await settle();
  assert.equal(bad.state.saves.length, 1, 'the write was tried');
  assert.equal(q.q('[data-dwk-notice]').getAttribute('data-dwk-notice'), 'failed');
  assert.equal(q.text(q.q('[data-dwk-notice]')), "The reply to Ada L. opened, but marking it reviewed didn't save. Try Mark reviewed again.");
  assert.equal(q.panelId(), id(1), 'no step past a review that did not save');
  assert.equal(q.text(q.rowEl(1)).endsWith('Waiting'), true, 'the failed tick is not left painted');
  assert.equal(q.head(), '2 check-ins to review');
  assert.equal(/Couldn't save/.test(q.text(q.div)), true);
  await q.close();
});

test('in the preview the reply opens the chat bubble and the tick stays on this tab', async () => {
  const chats = [];
  window.__openChatTo = (opts) => chats.push(opts);
  const p = await page({ rows: DashSignals.getTriageFeed('trainer', DashSignals.buildMockClients(new Date())), source: 'demo', db: makeDb({ uid: null }) });
  await p.click(p.q('[data-dwk-start]'));
  const first = p.panelId();
  await p.click(p.q('[data-dwk-reply]'));
  await settle();
  assert.equal(chats.length, 1);
  assert.equal(typeof chats[0].who === 'string' && chats[0].who.length > 0, true);
  assert.equal(p.q('[data-dwk-notice]').getAttribute('data-dwk-notice'), 'local');
  assert.equal(/the preview doesn't save/.test(p.text(p.q('[data-dwk-notice]'))), true);
  assert.notEqual(p.panelId(), first, 'on to the next one waiting');
  delete window.__openChatTo;
  await p.close();
});

// ── 5. Live versus sample ──────────────────────────────────────────────────────
const SAMPLE = DashSignals.buildMockClients(new Date()).map((c) => c.profile.name);
test('the sample roster only in the signed-out preview, under the band; a coach\'s failed roster says so', async () => {
  const demoRows = DashSignals.getTriageFeed('trainer', DashSignals.buildMockClients(new Date()));
  const signedOut = await page({ rows: demoRows, source: 'demo', db: makeDb({ uid: null }) });
  assert.equal(!!signedOut.q('[data-band]'), true);
  assert.equal(signedOut.all('[data-dwk-row]').length, SAMPLE.length);
  assert.equal(/check-ins? to review/.test(signedOut.head()), true);
  assert.equal(signedOut.all('[data-dwk-pattern]').length > 0, true, 'the preview works its patterns out of its own sample');
  await signedOut.close();

  // Signed in, and the roster read failed (useDashboard fell back to its demo): no sample people.
  const failed = await page({ rows: demoRows, source: 'demo', db: makeDb({ uid: 'coach-1' }) });
  assert.equal(!!failed.q('[data-band]'), false);
  assert.equal(failed.all('[data-dwk-row]').length, 0);
  assert.equal(SAMPLE.some((n) => failed.text(failed.div).includes(n)), false);
  assert.equal(failed.head(), '— check-ins to review');
  assert.equal(failed.text(failed.q('[data-dwk-roster="unread"]')), "Your roster couldn't be read just now. Nothing is lost; reload to try again.");
  assert.equal(failed.q('[data-dwk-start]').disabled, true);
  assert.equal(/Preview/.test(failed.text(failed.div)), false, 'not told it is a preview either');
  await failed.close();

  // Live: never the band.
  const live = await page({ rows: cast(), db: makeDb() });
  assert.equal(!!live.q('[data-band]'), false);
  await live.close();
});

test('the week picker, Mark all reviewed and the note are kept', async () => {
  const db = makeDb({ doc: reviewedDoc() });
  const p = await page({ rows: cast(), db });
  await p.click(p.button('Mark all reviewed'));
  await settle();
  const wrote = db.state.saves[0].doc[MON];
  assert.deepEqual(Object.keys(wrote).sort(), [id(1), id(2), id(3), id(4)].sort(), 'one write closes the week');
  assert.equal(wrote[id(1)].checkinSignature, JSON.stringify(ADA_CK));
  assert.equal(wrote[id(3)].checkinSignature, null, 'no check-in, no signature');
  // The private note, saved per client per week.
  await p.click(p.rowEl(3));
  await p.click(p.button('＋ Note'));
  const ta = p.q('[data-dwk-panel] textarea');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), 'value').set.call(ta, 'Ask about travel');
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await p.click(p.button('Save note'));
  await settle();
  assert.equal(db.state.saves[db.state.saves.length - 1].doc[MON][id(3)].note, 'Ask about travel');
  // The picker pages back and forward again.
  const title = () => p.text(p.q('h1'));
  const now = title();
  await p.click(p.all('button').find((b) => b.getAttribute('aria-label') === 'Previous week'));
  assert.notEqual(title(), now);
  await p.click(p.button('This week'));
  assert.equal(title(), now);
  await p.close();
});

test('next waiting skips the open one and wraps round', () => {
  const list = [
    { id: 'a', state: 'in', reviewed: false }, { id: 'b', state: 'none', reviewed: false },
    { id: 'c', state: 'in', reviewed: true }, { id: 'd', state: 'in', reviewed: false },
  ];
  assert.equal(W.dwkNextWaiting(list, 'a').id, 'd');
  assert.equal(W.dwkNextWaiting(list, 'd').id, 'a', 'wraps round');
  assert.equal(W.dwkNextWaiting([list[0]], 'a'), null, 'never the one open');
  assert.equal(W.dwkNextWaiting(list, 'zz').id, 'a', 'from nowhere, the first one waiting');
});
