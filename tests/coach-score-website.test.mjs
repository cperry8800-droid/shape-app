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
// dashToday.jsx), reduced to what prints the page's own words.
const h = React.createElement;
Object.assign(globalThis, {
  INK: '#fff', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', serif: 'serif',
  DashPage: ({ eyebrow, title, subtitle, actions, children }) => h('main', null, h('div', { 'data-eyebrow': '' }, eyebrow), h('h1', null, title), subtitle, actions, children),
  Card: ({ children }) => h('section', null, children),
  SectionTitle: ({ children, right }) => h('header', null, h('span', null, children), right ? h('span', { 'data-right': '' }, right) : null),
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: null, nutriPayoutCard: null,
  useCoachStanding: () => null, coachStandingLine: () => 'standing',
  CoachScoreActions: () => null, CoachLeaderboard: () => null,
  DashDemoBand: () => h('div', { 'data-band': '' }, 'Preview · demo data — an example of a live account'),
});

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
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
        // Not the new sample either, and no rung is marked or named.
        for (const sample of ['3,060', '2,340', '34 clients', '28 clients', 'SAMPLE', 'PATH TO']) assert.ok(!s.text().includes(sample), `${what}: shows "${sample}"`);
        assert.ok(!s.div.querySelector('[data-band]'), `${what}: the demo band is up`);
        const tiersHead = [...s.div.querySelectorAll('header')].find((x) => /^Tiers/.test(x.textContent));
        assert.equal(tiersHead.querySelector('[data-right]').textContent, '—', `${what}: the Tiers card names a rung`);
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
      // The Tiers card names the read's rung.
      const tiersHead = [...s.div.querySelectorAll('header')].find((x) => /^Tiers/.test(x.textContent));
      assert.equal(tiersHead && tiersHead.querySelector('[data-right]').textContent, d.current_tier.toUpperCase(), role);
      for (const b of d.breakdown) assert.ok(s.text().includes(b.label) && s.text().includes(b.sub), `${role}: ${b.label}`);
      assert.match(s.text(), new RegExp(`PATH TO ${d.next_tier.toUpperCase()}`), role);
      assert.match(s.text(), new RegExp(`${d.points_to_next.toLocaleString()} more points`), role);
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
    assert.ok(!s.text().includes('3,060'));
  } finally { await s.unmount(); }
});

test('signed out (a 401), the sample is shown and labelled, and it is the route\'s formula', async () => {
  for (const [role, total, terms] of [['trainer', '3,060', 3], ['nutritionist', '2,340', 2]]) {
    scriptFetch(401);
    const s = await mount(role);
    try {
      assert.equal(s.title(), total, role);
      assert.match(s.eyebrow(), /· SAMPLE$/, role);
      assert.match(s.text(), /SAMPLE · TOTAL/, role);
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
