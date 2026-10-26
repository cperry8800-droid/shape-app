// The app's coach Score page reads the COACH score (2026-10-18, WORKLOG known gap: "The app's coach
// Score page reads the member ledger"). MOUNTED: BSShapeScorePage and _bsUseLiveScore from the
// shipping iosAppBroadsheetClient.jsx in jsdom, against a scripted ShapeApi.fetch, reading the real
// English score catalog.
//
// A coach's page read /api/client/score (their personal member ledger) and renamed the tiers; it
// listed twelve invented "point values" (Live session completed +18-28, Plan sold +30 …) and wrote
// the member points over the coach tier the avatar reads. It now reads /api/coach/score, prints the
// route's breakdown and the route's formula, keeps the member economy off a coach's page, and shows
// an unread state, never the sample, when a signed-in coach's read fails.
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

// The chrome the module destructures off window at load.
globalThis.BSBackButton = ({ onClick }) => React.createElement('button', { type: 'button', onClick }, '← Back');
const MOD = await loadBroadsheet(['BSShapeScorePage', 'BSShapeStorePage', 'SHAPE_SCORE_PROFILES', '_bsUseLiveScore'], React);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Reduced motion: the count-ups print their figure at once.
globalThis.matchMedia = () => ({ matches: true });

// The English catalog the app ships, formatted as the app's i18next+ICU runtime formats it. A score:
// key missing from it fails here rather than falling back to the call site's English.
const SCORE = JSON.parse(readFileSync(`${ROOT}/mobile-app/src/i18n/catalogs/en/score.json`, 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    if (!key.startsWith('score:')) return undefined;
    const k = key.slice('score:'.length);
    assert.ok(k in SCORE, `${key} is not in the English score catalog`);
    return new IntlMessageFormat(SCORE[k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

const COACH = { id: 'coach-1' };
// What /api/coach/score answers for a trainer with 30 clients, 87% completion and no programs.
const TRAINER_SCORE = {
  total: 2370,
  breakdown: [
    { label: 'Active clients', points: 1500, sub: '30 clients' },
    { label: 'Session completion', points: 870, sub: '87% · last 90d' },
    { label: 'Programs published', points: 0, sub: '0 live' },
  ],
  current_tier: 'Elite', next_tier: 'Master', points_to_next: 2630,
};
const NUTRI_SCORE = {
  total: 6100,
  breakdown: [
    { label: 'Active clients', points: 5200, sub: '104 clients' },
    { label: 'Session completion', points: 900, sub: '90% · last 90d' },
  ],
  current_tier: 'Master', next_tier: 'Icon', points_to_next: 8900,
};
const MEMBER_SCORE = { points_total: 1840, current_tier: { name: 'Tempo' }, next_tier: { name: 'Form', threshold: 2000 }, points_to_next: 160, week_gain: 40, recent: [], spendable_balance: 900 };

// The services the page reads, scripted. `answers[path]` is a payload, a status number, an Error,
// or a function returning one of those (a fresh answer for each read).
function world({ signedIn = true, answers = {}, role = 'trainer' } = {}) {
  const st = { paths: [] };
  window.ShapeAuth = { getCachedState: () => ({ user: signedIn ? COACH : null, profile: { role } }) };
  window.ShapeScore = undefined;
  window.__bsSessionGen = 0;
  window.ShapeApi = {
    fetch: async (path) => {
      st.paths.push(path);
      let a = answers[path];
      if (typeof a === 'function') a = a();
      if (a instanceof Error) throw a;
      if (a === undefined) return { ok: false, status: 404, json: async () => ({ error: 'unscripted' }) };
      if (typeof a === 'number') return { ok: a >= 200 && a < 300, status: a, json: async () => ({ error: 'no' }) };
      return { ok: true, status: 200, json: async () => a };
    },
  };
  return st;
}

const flush = () => React.act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.getElementById('root');
  const root = createRoot(host);
  await React.act(async () => root.render(el));
  await flush();
  const text = () => host.textContent.replace(/\s+/g, ' ');
  const button = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
  const click = async (re) => {
    const b = button(re);
    assert.ok(b, `no button ${re} in: ${text().slice(0, 400)}`);
    await React.act(async () => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await flush();
  };
  return { host, text, button, click, unmount: () => React.act(async () => root.unmount()) };
}
const page = (profile) => React.createElement(MOD.BSShapeScorePage, { profile, onBack() {}, onOpenStore() {} });
const P = MOD.SHAPE_SCORE_PROFILES;

// What only a member's page shows: the ledger's week and streak, momentum, the weekly commitment,
// the Rewards and Ledger tabs, the Store's spend link, and the ledger's rules.
const MEMBER_ONLY = [/This wk/, /Streak/, /Momentum/, /commitment/i, /Rewards/, /Ledger/, /Spend points/, /lose at most 30 points/];
// What the old coach profiles invented.
const INVENTED = /Live session completed|Program block delivered|Plan sold|5-star review|Fast message reply|Consult completed|Meal plan delivered|New client onboarded|Retention streak/;

test('a signed-in trainer reads /api/coach/score, never the member ledger, and the page prints it', async () => {
  const st = world({ answers: { '/api/coach/score?role=trainer': TRAINER_SCORE } });
  const s = await mount(page(P.trainer));
  try {
    assert.deepEqual(st.paths, ['/api/coach/score?role=trainer']);
    const txt = s.text();
    // The headline is the coach total and the tier is the coach rung.
    assert.match(txt, /Elite, and climbing\./);
    assert.match(txt, /Score2,370/, 'the register prints the coach total');
    // The next rung and what's left to it: on the ladder's next rung and the plate's line (no figures
    // repeat them).
    assert.match(txt, /Master5,000\+· Next · 2,630 to go/);
    assert.match(txt, /370 into the tier — 2,630 from Master\./);
    assert.match(txt, /Your coach standing/);
    // The breakdown is the default tab: the route's rows, their figures said in the app's words.
    assert.match(txt, /Active clients\+1,500/);
    assert.match(txt, /30 clients/);
    assert.match(txt, /Session completion\+870/);
    assert.match(txt, /87% · last 90 days/);
    assert.match(txt, /Programs published\+0/);
    assert.match(txt, /0 live/);
    assert.match(txt, /Total2,370/);
    for (const re of MEMBER_ONLY) assert.doesNotMatch(txt, re, `a coach's page shows ${re}`);
    // The avatar's tier is the coach score's, as _bsHydrateProScore sets it.
    assert.deepEqual(window.ShapeScore, { points: 2370, tier: 'Elite' });
  } finally { await s.unmount(); }
});

test('how a coach earns points is the route\'s formula: three terms for a trainer, none invented', async () => {
  world({ answers: { '/api/coach/score?role=trainer': TRAINER_SCORE } });
  const s = await mount(page(P.trainer));
  try {
    await s.click(/^Points$/);
    const txt = s.text();
    assert.match(txt, /Active clients\s*\+50/);
    assert.match(txt, /Per client\s*·\s*Each client subscribed to you now/);
    assert.match(txt, /Session completion\s*\+10/);
    assert.match(txt, /Per 1% completed\s*·\s*Your sessions in the last 90 days · up to 1,000/);
    assert.match(txt, /Programs published\s*\+80/);
    assert.match(txt, /counted fresh from these figures/);
    assert.doesNotMatch(txt, INVENTED);
    for (const re of MEMBER_ONLY) assert.doesNotMatch(txt, re, `a coach's Points tab shows ${re}`);
  } finally { await s.unmount(); }
  // And the profiles carry no invented activities or demo ledger.
  for (const role of ['trainer', 'nutritionist']) {
    assert.equal(P[role].activities, undefined, `${role} still lists invented point values`);
    assert.equal(P[role].ledger, undefined, `${role} still carries a demo ledger`);
  }
});

test('a nutritionist, and a dietitian, read the nutritionist score, with no programs term', async () => {
  for (const roleLabel of ['Nutritionist', 'Dietitian']) {
    const st = world({ answers: { '/api/coach/score?role=nutritionist': NUTRI_SCORE } });
    const s = await mount(page({ ...P.nutritionist, roleLabel }));
    try {
      assert.deepEqual(st.paths, ['/api/coach/score?role=nutritionist'], roleLabel);
      const txt = s.text();
      assert.match(txt, /Master, and climbing\./, roleLabel);
      assert.match(txt, /Score6,100/, roleLabel);
      assert.match(txt, /104 clients/, roleLabel);
      await s.click(/^Points$/);
      assert.doesNotMatch(s.text(), /Programs published/, roleLabel);
      assert.match(s.text(), /Session completion\s*\+10/, roleLabel);
    } finally { await s.unmount(); }
  }
});

test('a failed read for a signed-in coach is an unread state, never the sample, and Try again reads again', async () => {
  for (const failure of [503, 500, 401, new Error('offline'), { error: 'not a score' }, { total: 10, breakdown: [] }]) {
    let next = failure;
    const st = world({ answers: { '/api/coach/score?role=trainer': () => next } });
    const s = await mount(page(P.trainer));
    try {
      const txt = s.text();
      const what = failure instanceof Error ? 'a thrown fetch' : JSON.stringify(failure);
      // The verdict itself says so (the Breakdown tab says it too, so the page text alone can't tell).
      const verdict = s.host.querySelector('[role="status"]');
      assert.match(verdict ? verdict.textContent : '', /^Your score couldn’t be read just now\./, what);
      // None of the sample's figures, and no rung.
      for (const sample of ['3,060', '1,700', '34 clients', '96%', '1,940', 'Elite', 'and climbing']) {
        assert.ok(!txt.includes(sample), `${what}: the unread page shows the sample's "${sample}"`);
      }
      assert.doesNotMatch(txt, /Score\d/, `${what}: a score register is printed`);
      assert.equal(window.ShapeScore, undefined, `${what}: the avatar tier was written`);
      assert.ok(!st.paths.includes('/api/client/score'), `${what}: fell back to the member ledger`);
      // Try again reads the route again, and a good answer lands.
      next = TRAINER_SCORE;
      await s.click(/^Try again$/);
      assert.deepEqual(st.paths, ['/api/coach/score?role=trainer', '/api/coach/score?role=trainer'], what);
      assert.match(s.text(), /Score2,370/, what);
    } finally { await s.unmount(); }
  }
});

test('while the read runs, the page says so and prints no figure', async () => {
  let release;
  world();
  // The read hangs until the test lets it answer.
  window.ShapeApi.fetch = () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => TRAINER_SCORE }); });
  const s = await mount(page(P.trainer));
  try {
    const txt = s.text();
    const verdict = s.host.querySelector('[role="status"]');
    assert.equal(verdict ? verdict.textContent : '', 'Reading your score…');
    for (const sample of ['3,060', '34 clients', 'Elite']) assert.ok(!txt.includes(sample), `loading shows "${sample}"`);
    await React.act(async () => { release(); });
    await flush();
    assert.match(s.text(), /Score2,370/);
  } finally { await s.unmount(); }
});

test('signed out, a coach sees the sample built on the formula, and nothing is read', async () => {
  const st = world({ signedIn: false });
  const s = await mount(page(P.trainer));
  try {
    assert.deepEqual(st.paths, []);
    const txt = s.text();
    assert.match(txt, /Score3,060/);
    assert.match(txt, /Elite, and climbing\./);
    assert.match(txt, /34 clients/);
    assert.match(txt, /Total3,060/);
    // The sample adds up on the formula.
    const b = P.trainer.breakdown;
    assert.equal(b.reduce((a, r) => a + r.points, 0), P.trainer.total);
    assert.equal(P.nutritionist.breakdown.reduce((a, r) => a + r.points, 0), P.nutritionist.total);
    // Its rows are the route's own terms, in the route's order.
    assert.deepEqual(b.map((r) => r.label), ['Active clients', 'Session completion', 'Programs published']);
    assert.deepEqual(P.nutritionist.breakdown.map((r) => r.label), ['Active clients', 'Session completion']);
    for (const re of MEMBER_ONLY) assert.doesNotMatch(txt, re, `the coach sample shows ${re}`);
  } finally { await s.unmount(); }
});

test('a member still reads /api/client/score, and keeps the member page', async () => {
  const st = world({ answers: { '/api/client/score': MEMBER_SCORE } });
  window.ShapeCommit = undefined;
  const s = await mount(page(P.client));
  try {
    assert.ok(st.paths.includes('/api/client/score'), st.paths.join(', '));
    assert.ok(!st.paths.some((p) => p.startsWith('/api/coach/score')), st.paths.join(', '));
    const txt = s.text();
    assert.match(txt, /Score1,840/);
    assert.match(txt, /This wk\+40/);
    assert.match(txt, /Tempo, and climbing\./);
    assert.deepEqual(window.ShapeScore, { points: 1840, tier: 'Tempo' });
    await s.click(/^Points$/);
    assert.match(s.text(), /Weekly check-in/);
    assert.match(s.text(), /Protect your points/);
  } finally { await s.unmount(); }
});

// The Shape Store spends the member ledger's balance, a coach's too, so it asks the hook for that
// ledger; that read must not write the member tier over the coach's avatar tier.
test('the Store\'s ledger read for a coach reads the member ledger and leaves the avatar tier alone', async () => {
  const st = world({ answers: { '/api/client/score': MEMBER_SCORE } });
  window.ShapeScore = { points: 2370, tier: 'Elite' };
  let seen = null;
  const Probe = () => { seen = MOD._bsUseLiveScore(P.trainer, { ledger: true }); return null; };
  const s = await mount(React.createElement(Probe));
  try {
    assert.deepEqual(st.paths, ['/api/client/score']);
    assert.equal(seen.available, 900, 'the spendable balance is the ledger\'s');
    assert.deepEqual(window.ShapeScore, { points: 2370, tier: 'Elite' });
  } finally { await s.unmount(); }
});

test('the Shape Store, for a coach, spends the member ledger\'s balance and leaves the coach\'s avatar tier alone', async () => {
  const st = world({ answers: { '/api/client/score': MEMBER_SCORE, '/api/store/redeem': 404 } });
  window.ShapeStore = { get: async () => null };
  window.ShapeTierRewards = { list: async () => [] };
  window.ShapeScore = { points: 2370, tier: 'Elite' };
  const s = await mount(React.createElement(MOD.BSShapeStorePage, { profile: P.trainer, onBack() {}, onOpenScore() {} }));
  try {
    assert.deepEqual(st.paths, ['/api/client/score'], 'the Store read the coach score for its balance');
    assert.match(s.text(), /Available900/, 'the balance is the ledger\'s spendable balance');
    assert.deepEqual(window.ShapeScore, { points: 2370, tier: 'Elite' });
  } finally { await s.unmount(); }
});

// The 10,000 celebration is a member's: it names Legend and writes the member's own account doc.
test('a coach past 10,000 is not toasted "Legend is in reach", and the member flag is not written', async () => {
  const toasts = [];
  const saved = [];
  world({ answers: { '/api/coach/score?role=trainer': { ...TRAINER_SCORE, total: 11000, current_tier: 'Master', next_tier: 'Icon', points_to_next: 4000 } } });
  window.__bsToast = (m) => toasts.push(m);
  window.shapeDb = { getUserGoals: async () => null, saveUserGoals: (...a) => { saved.push(a); } };
  const s = await mount(page(P.trainer));
  try {
    assert.match(s.text(), /Score11,000/);
    assert.deepEqual(toasts, []);
    assert.deepEqual(saved, []);
  } finally { await s.unmount(); window.__bsToast = undefined; window.shapeDb = undefined; }
});

test('a read still in flight at sign-out does not land the previous coach\'s score', async () => {
  let release;
  world();
  window.ShapeApi.fetch = () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => TRAINER_SCORE }); });
  const s = await mount(page(P.trainer));
  try {
    window.__bsSessionGen = 1; // the client module's sign-out sweep
    await React.act(async () => { release(); });
    await flush();
    assert.equal(window.ShapeScore, undefined);
    assert.ok(!s.text().includes('2,370'), 'the previous session\'s score landed');
  } finally { await s.unmount(); }
});

// Settings names the coach's tier on its avatar line from the same hook while the score is unread:
// the tier the avatar already holds (set from this route at startup), else the first rung.
test('an unread coach score names the tier the avatar holds, else the first rung, and prints no total', async () => {
  for (const [held, want] of [[{ points: 6000, tier: 'Master' }, 'Master'], [undefined, 'Certified']]) {
    world({ answers: { '/api/coach/score?role=trainer': 503 } });
    window.ShapeScore = held;
    let seen = null;
    const Probe = () => { seen = MOD._bsUseLiveScore(P.trainer); return null; };
    const s = await mount(React.createElement(Probe));
    try {
      assert.equal(seen.scoreState, 'failed');
      assert.equal(seen.tier, want);
      assert.equal(seen.total, null);
      assert.equal(seen.breakdown, null);
    } finally { await s.unmount(); }
  }
});

// Settings picks the score profile by the signed-in role; a role change re-renders the same hook.
test('a read made for one coach role is never shown for another', async () => {
  world();
  window.ShapeApi.fetch = (path) => (path === '/api/coach/score?role=trainer'
    ? Promise.resolve({ ok: true, status: 200, json: async () => TRAINER_SCORE })
    : new Promise(() => {}));
  // Every render is kept: the first render after the switch runs before the new read starts, and
  // it must not be the old role's score.
  const renders = [];
  const Probe = ({ profile }) => { renders.push(MOD._bsUseLiveScore(profile)); return null; };
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe, { profile: P.trainer })));
    await flush();
    assert.equal(renders[renders.length - 1].total, 2370);
    const before = renders.length;
    await React.act(async () => root.render(React.createElement(Probe, { profile: P.nutritionist })));
    const after = renders.slice(before);
    assert.ok(after.length >= 1 && after.every((r) => r.coachRole === 'nutritionist'));
    assert.deepEqual(after.map((r) => [r.scoreState, r.total]), after.map(() => ['loading', null]), 'the trainer read was shown as the nutritionist\'s');
  } finally { await React.act(async () => root.unmount()); }
});
