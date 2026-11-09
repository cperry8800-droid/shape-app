// The website's coach Score pages (public/newdesign/trainerScorePage.jsx, nutritionistScorePage.jsx),
// MOUNTED in jsdom against a scripted /api/coach/score.
//
// ⚠ A FAILED READ SHOWED THE SAMPLE AS THE COACH'S OWN SCORE. Both pages started from static figures
// (6,420 and Master; 5,340 and Master; "34 clients", reviews, Radio, endorsements) and kept them when
// the read failed, so a signed-in coach whose read failed (an auth outage, a 5xx, a dead network) was
// shown someone else's score as theirs. Only a 401 (signed out) shows the sample now, labelled; any
// other failure is an unread state. The sample, and "how you earn", are the route's formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#score' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
globalThis.React = React;
const { createRoot } = require_('react-dom/client');

// The shell the pages are drawn in (pageShell.jsx, trainerDashboard.jsx, coachNav.jsx, leaderboards.jsx,
// dashToday.jsx), reduced to what prints the page's own words. Since coach dashboard step 4c the page
// files mount coachGoalScore.jsx's board, which draws with dashBusiness.jsx's cards; without dashGrid.jsx
// its default cards stack, as a stale cache would show them.
const h = React.createElement;
Object.assign(globalThis, {
  INK: '#fff', PAPER: '#000', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', serif: 'serif', sans: 'sans',
  DashPage: ({ eyebrow, title, subtitle, actions, children }) => h('main', null, h('div', { 'data-eyebrow': '' }, eyebrow), h('h1', null, title), subtitle, actions, children),
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: null, nutriPayoutCard: null,
  useCoachStanding: () => null, coachStandingLine: () => 'standing',
  CoachScoreActions: () => null, CoachLeaderboard: () => null,
  DashDemoBand: () => h('div', { 'data-band': '' }, 'Preview · demo data — an example of a live account'),
  DashClientGem: () => null, dashRecordTier: () => null,
});

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), { appendExports: 'export { DbzCard, DbzChip, DbzGem, DBZ_FILLED, DBZ_OUTLINE, DBZ_NOTE, DBZ_LBL, DBZ_MONO, DBZ_INK, DBZ_INK50, DBZ_RULE };' });
Object.assign(globalThis, { DbzCard: B.DbzCard, DbzChip: B.DbzChip, DbzGem: B.DbzGem, DBZ_FILLED: B.DBZ_FILLED, DBZ_OUTLINE: B.DBZ_OUTLINE, DBZ_NOTE: B.DBZ_NOTE, DBZ_LBL: B.DBZ_LBL, DBZ_MONO: B.DBZ_MONO, DBZ_INK: B.DBZ_INK, DBZ_INK50: B.DBZ_INK50, DBZ_RULE: B.DBZ_RULE });
globalThis.CoachScoreBoard = (await loadRealModule(ND('coachGoalScore.jsx'), { appendExports: 'export { CoachScoreBoard };' })).CoachScoreBoard;
const PAGES = {
  trainer: (await loadRealModule(ND('trainerScorePage.jsx'), { appendExports: 'export { TrainerScorePage };' })).TrainerScorePage,
  nutritionist: (await loadRealModule(ND('nutritionistScorePage.jsx'), { appendExports: 'export { NutritionistScorePage };' })).NutritionistScorePage,
};

// `answer` is a payload, a status number, or an Error.
function scriptFetch(answer) {
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: answer >= 200 && answer < 300, status: answer, json: async () => ({ error: 'no' }) };
    return { ok: true, status: 200, json: async () => answer };
  };
  return paths;
}
async function mount(role) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(h(PAGES[role])));
  await React.act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  return {
    div,
    text: () => div.textContent.replace(/\s+/g, ' ').trim(),
    eyebrow: () => div.querySelector('[data-eyebrow]').textContent,
    title: () => div.querySelector('h1').textContent,
    unmount: () => React.act(async () => root.unmount()),
  };
}

// Every figure either page's old static sample printed, and every term it invented.
const OLD_SAMPLE = /6,420|5,340|8,580|9,660|34 clients · \+11|28 clients · \+7|1,284 reviews|612 reviews|Client adherence|Log adherence|Client PRs attributed|Client body-comp wins|Radio hosted|Community endorsements|Coach collaborations|Referrals in/;
const INVENTED = /Live session completed|Consult completed|Plan sold|5-star review|Fast message reply|New client onboarded|Retention streak|12 WAYS/;

const LIVE = {
  trainer: { total: 2370, current_tier: 'Elite', next_tier: 'Master', points_to_next: 2630, breakdown: [{ label: 'Active clients', points: 1500, sub: '30 clients' }, { label: 'Session completion', points: 870, sub: '87% · last 90d' }, { label: 'Programs published', points: 0, sub: '0 live' }] },
  nutritionist: { total: 6100, current_tier: 'Master', next_tier: 'Icon', points_to_next: 8900, breakdown: [{ label: 'Active clients', points: 5200, sub: '104 clients' }, { label: 'Session completion', points: 900, sub: '90% · last 90d' }] },
};

test('a signed-in coach whose read fails sees an unread state, never the sample', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    for (const failure of [503, 500, 404, new Error('offline'), { error: 'not a score' }]) {
      const what = `${role}, ${failure instanceof Error ? 'a thrown fetch' : JSON.stringify(failure)}`;
      const paths = scriptFetch(failure);
      const s = await mount(role);
      try {
        assert.deepEqual(paths, [`/api/coach/score?role=${role}`], what);
        assert.equal(s.title(), '—', `${what}: the headline is a figure`);
        assert.match(s.eyebrow(), /COULDN'T READ/, what);
        assert.match(s.text(), /Couldn't read your score just now\./, what);
        assert.doesNotMatch(s.text(), OLD_SAMPLE, what);
        // Not the sample either (nor the one before it), and no rung is marked, no way up offered.
        for (const sample of ['1,760', '1,510', '3,060', '2,340', '14 clients', '12 clients', 'SAMPLE', 'Sample', 'Fastest way up']) assert.ok(!s.text().includes(sample), `${what}: shows "${sample}"`);
        assert.ok(!s.div.querySelector('[data-band]'), `${what}: the demo band is up`);
        assert.ok(!s.div.querySelector('[data-cgs-current]'), `${what}: a rung is marked`);
      } finally { await s.unmount(); }
    }
  }
});

test('a signed-in coach reads their own score: total, rung, breakdown and the next rung', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const d = LIVE[role];
    scriptFetch(d);
    const s = await mount(role);
    try {
      assert.equal(s.title(), d.total.toLocaleString(), role);
      assert.equal(s.eyebrow(), `COACH SCORE · ${d.current_tier.toUpperCase()}`, role);
      // The five tiers mark the read's rung, and the way up counts to the next.
      const cur = s.div.querySelector('[data-cgs-current]');
      assert.equal(cur ? cur.getAttribute('data-cgs-tier') : null, d.current_tier, role);
      for (const b of d.breakdown) assert.ok(s.text().includes(b.label) && s.text().includes(b.points.toLocaleString()), `${role}: ${b.label}`);
      assert.match(s.text(), new RegExp(`${d.points_to_next.toLocaleString()} to ${d.next_tier}`), role);
      assert.doesNotMatch(s.text(), OLD_SAMPLE, role);
      assert.ok(!s.text().includes('SAMPLE'), role);
      assert.ok(!s.div.querySelector('[data-band]'), role);
    } finally { await s.unmount(); }
  }
});

test('while the read runs, no figure is printed', async () => {
  globalThis.fetch = () => new Promise(() => {});
  const s = await mount('trainer');
  try {
    assert.equal(s.title(), '—');
    assert.match(s.text(), /Reading your score…/);
    assert.doesNotMatch(s.text(), OLD_SAMPLE);
    assert.ok(!s.text().includes('1,760'));
  } finally { await s.unmount(); }
});

test('signed out (a 401), the sample is shown and labelled, and it is the route\'s formula', async () => {
  for (const [role, total, terms] of [['trainer', '1,760', 3], ['nutritionist', '1,510', 2]]) {
    scriptFetch(401);
    const s = await mount(role);
    try {
      assert.equal(s.title(), total, role);
      assert.match(s.eyebrow(), /· SAMPLE$/, role);
      assert.match(s.text(), /Sample · an example coach/, role);
      assert.ok(s.div.querySelector('[data-band]'), `${role}: the demo band labels the sample`);
      // The sample's rows add up to its total, and are the formula's terms.
      assert.match(s.text(), new RegExp(`${terms} TERMS`), role);
      assert.match(s.text(), /Active clients[\s\S]*\+50/, role);
      assert.match(s.text(), /Session completion[\s\S]*\+10/, role);
      assert.equal(/Programs published/.test(s.text()), role === 'trainer', role);
      if (role === 'trainer') assert.match(s.text(), /Programs published[\s\S]*\+80/);
      assert.doesNotMatch(s.text(), OLD_SAMPLE, role);
      assert.doesNotMatch(s.text(), INVENTED, role);
    } finally { await s.unmount(); }
  }
});
