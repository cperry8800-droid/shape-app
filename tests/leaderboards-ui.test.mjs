// The leaderboards, MOUNTED: the app's BSLeaderboard (mobile-app/src/broadsheet/BSLeaderboard.jsx)
// inside the real broadsheet chrome, and the website's MemberLeaderboard / CoachLeaderboard
// (public/newdesign/leaderboards.jsx), each against scripted routes in jsdom.
//
// What a source read cannot hold, these do: every state draws its own sentence and never an
// empty board, the team board asks before it shows you, the switches write the change they
// say, and the place line names the person you are actually chasing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const IMF = mobileRequire('intl-messageformat');
const IntlMessageFormat = IMF.IntlMessageFormat || IMF.default;

// i18next-icu formats the catalog string with the call's values; a missing key falls back to
// defaultValue, formatted the same way. This is that, without the catalogs.
window.ShapeI18n = { t: (key, opts = {}) => (opts.defaultValue == null ? key : new IntlMessageFormat(opts.defaultValue, 'en').format(opts)) };

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, root, text: () => host.textContent, unmount: () => act(async () => root.unmount()) };
}
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const byText = (host, sel, re) => [...host.querySelectorAll(sel)].find((b) => re.test(b.textContent));

// ── fixtures (invented people) ──────────────────────────────────────────────────────────────
// As the route sends them: training and nutrition only on your own row (null on everyone else's).
const member = (rank, name, points, extra = {}) => ({
  userId: 'u' + rank, name, avatarUrl: null, points, rank, prevRank: null, moved: null, tier: 'Form', isMe: false,
  ...(extra.isMe ? { streak: 3, trainingDays: 2, mealDays: 4 } : { streak: null, trainingDays: null, mealDays: null }),
  ...extra,
});
function memberBoard({ scope = 'everyone', me = true, hidden = null, extra = {} } = {}) {
  const entries = [member(1, 'Priya S.', 412), member(2, 'Marcus T.', 388), member(3, 'Aisha K.', 371), member(4, 'Devon R.', 340)];
  if (me) entries.push(member(9, 'Sam Q.', 260, { isMe: true, moved: 3 }));
  return { scope, period: 'week', total: 1284, entries, me: me ? { ...entries.at(-1), total: 1284 } : null, hidden, privacy: { leaderboard: true, teamBoard: null }, ...extra };
}
const coach = (rank, name, points, extra = {}) => ({ providerId: rank, name, specialty: 'Strength', avatarUrl: null, points, tier: 'Master', activeClients: 30, completionPct: 91, rank, prevRank: null, moved: null, gained: 100 - rank, isMe: false, listed: true, ...extra });
function coachBoard({ since = null, me = true, listed = true } = {}) {
  const entries = [coach(1, 'Maya Okafor', 18240), coach(2, 'Luis Ferreira', 16905), coach(3, 'Hana Sato', 14310), coach(13, 'Dana Ortiz', 6520)];
  if (me) entries.push(coach(14, 'Demo Coach', 6420, { isMe: true, listed }));
  entries.push(coach(15, 'Chris Lane', 6310));
  return { role: 'trainer', view: since ? 'climb' : 'standing', total: 212, since, entries, me: me ? entries.find((e) => e.isMe) : null };
}

// ── The app ────────────────────────────────────────────────────────────────────────────────
const chrome = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
void chrome;
// BSDetailHeader lives in the client module; the screen reads it from window at call time.
window.BSDetailHeader = ({ eyebrow, title }) => React.createElement('header', null, eyebrow, ' ', title);
const { BSLeaderboard, bsBoardRows, bsBoardAbove } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSLeaderboard.jsx'), { registry: new Map([['react', React]]) });
const inChrome = (el) => React.createElement(window.BSProvider, { paperMode: 'paper' }, el);

function fakeService({ member: m, coach: c, setPrivacy } = {}) {
  const calls = { member: [], coach: [], setPrivacy: [] };
  window.ShapeLeaderboard = {
    member: (scope, period) => { calls.member.push([scope, period]); return Promise.resolve(typeof m === 'function' ? m(scope, period) : m); },
    coach: (role, view) => { calls.coach.push([role, view]); return Promise.resolve(typeof c === 'function' ? c(role, view) : c); },
    setPrivacy: (change) => { calls.setPrivacy.push(change); return Promise.resolve(setPrivacy ? setPrivacy(change) : { leaderboard: true, teamBoard: change.teamBoard ?? null }); },
  };
  return calls;
}

test('app: the member board draws your place, the podium and the rows, with the gap where ranks jump', async () => {
  const calls = fakeService({ member: { kind: 'ready', data: memberBoard() } });
  const v = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {} })));
  const text = v.text();
  assert.deepEqual(calls.member[0], ['everyone', 'week']);
  assert.match(text, /#9/);
  assert.match(text, /81 pts to pass Devon R\./, 'the place line chases the wrong member');
  assert.match(text, /of 1,284 · ▲3/);
  for (const n of ['Priya S.', 'Marcus T.', 'Aisha K.']) assert.match(text, new RegExp(n));
  assert.match(text, /· · ·/, 'no gap between #4 and #9');
  assert.match(text, /Show me on leaderboards/);
  assert.ok(!/Sam Q\./.test(text), 'your own row shows your name instead of You');
  // other members' lines carry their tier and nothing about training; yours carries your streak
  assert.match(text, /Form · 3-day streak/);
  assert.equal((text.match(/day streak/g) || []).length, 1, 'another member\'s streak is on the board');
  await v.unmount();
});

test('app: the team board asks first, and the answer is the change it writes', async () => {
  const calls = fakeService({ member: (scope) => ({ kind: 'ready', data: memberBoard({ scope, hidden: scope === 'team' ? 'team_unasked' : null, extra: scope === 'team' ? { hasCoach: true } : {} }) }) });
  const v = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {} })));
  await click(byText(v.host, 'button[role="tab"]', /^My team$/));
  await flush();
  assert.deepEqual(calls.member.at(-1), ['team', 'week']);
  assert.match(v.text(), /Show yourself to your coach’s team\?/);
  assert.match(v.text(), /points and tier/);
  assert.ok(!/streak, so they/.test(v.text()), 'the question promises teammates your streak');
  await click(byText(v.host, 'button', /^Show me$/));
  await flush();
  assert.deepEqual(calls.setPrivacy, [{ teamBoard: true }]);
  assert.ok(calls.member.length >= 3, 'the board was not re-read after the answer');
  await v.unmount();

  // no coach: no question, and the board says why it is empty
  fakeService({ member: { kind: 'ready', data: memberBoard({ scope: 'team', me: false, hidden: 'team_unasked', extra: { hasCoach: false } }) } });
  const w = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {} })));
  await click(byText(w.host, 'button[role="tab"]', /^My team$/));
  await flush();
  assert.ok(!/Show yourself/.test(w.text()), 'a member with no coach is asked to join a team');
  assert.match(w.text(), /for members with a coach/);
  await w.unmount();
});

test('app: every state is a sentence, and "could not read" can be retried', async () => {
  const sentences = { anon: /Sign in/, forbidden: /coaches with a Shape listing/, not_ready: /switched on yet/, error: /couldn’t read/ };
  for (const [kind, re] of Object.entries(sentences)) {
    const calls = fakeService({ member: { kind }, coach: { kind } });
    const v = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {}, mode: kind === 'forbidden' ? 'coach' : 'member' })));
    assert.match(v.text(), re, kind);
    assert.ok(!/Nobody has earned|No coaches/.test(v.text()), kind + ' drew an empty board');
    if (kind === 'error') {
      await click(byText(v.host, 'button', /^Try again$/));
      await flush();
      assert.equal(calls.member.length, 2, 'Try again did not read again');
    }
    await v.unmount();
  }
});

test('app: the coach board, standing and climbers', async () => {
  const calls = fakeService({ coach: (role, view) => ({ kind: 'ready', data: view === 'climb' ? coachBoard({ since: null }) : coachBoard({ listed: false }) }) });
  const v = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {}, mode: 'coach', role: 'nutritionist' })));
  assert.deepEqual(calls.coach[0], ['nutritionist', 'standing']);
  assert.match(v.text(), /101 pts to pass Dana Ortiz/);
  assert.match(v.text(), /30 clients · 91% kept/);
  assert.match(v.text(), /Your listing isn’t live yet/);
  await click(byText(v.host, 'button[role="tab"]', /^Climbers$/));
  await flush();
  assert.deepEqual(calls.coach.at(-1), ['nutritionist', 'climb']);
  assert.match(v.text(), /needs a reading to compare against/);
  assert.ok(!/Maya Okafor/.test(v.text()), 'climbers with no history drew a board');
  await v.unmount();
});

test('a tie on the podium is two of the same place, on both surfaces (Codex, #2371)', async () => {
  const tied = () => { const d = memberBoard(); d.entries[1].rank = 1; d.entries[2].rank = 3; return d; }; // 1, 1, 3
  fakeService({ member: { kind: 'ready', data: tied() } });
  const v = await mount(inChrome(React.createElement(BSLeaderboard, { onBack: () => {} })));
  assert.match(v.text(), /1stPS[\s\S]*1stMT[\s\S]*3rdAK/, 'the second first-place member is labelled 2nd');
  await v.unmount();
  routes = { '/api/leaderboard': () => ({ status: 200, body: tied() }) };
  const w = await mount(React.createElement(window.MemberLeaderboard));
  assert.deepEqual([...w.host.querySelectorAll('.lb-pod .lb-place')].map((x) => x.textContent), ['1ST', '1ST', '3RD']);
  assert.equal(w.host.querySelectorAll('.lb-pod.lb-p1').length, 2);
  await w.unmount();
});

test('app: the rows helper puts one gap where someone ranked above is missing, never at a tie', () => {
  const r = (rank) => ({ rank });
  const a = [r(1), r(2), r(3), r(4), r(4), r(6), r(40), r(41)];
  const out = bsBoardRows(a, a.slice(0, 3));
  assert.deepEqual(out.map((x) => (x ? x.rank : 'gap')), [4, 4, 6, 'gap', 40, 41]);
  // the podium straight into you at #140
  assert.deepEqual(bsBoardRows([r(1), r(2), r(3), r(140)], [r(1)]).map((x) => (x ? x.rank : 'gap')).slice(-2), ['gap', 140]);
  const me = { rank: 5, points: 50, isMe: true };
  assert.equal(bsBoardAbove([{ rank: 4, points: 50 }, { rank: 3, points: 70 }, { rank: 1, points: 90 }, me], me, (e) => e.points).rank, 3, 'a tie is someone to pass');
});

// ── The website ────────────────────────────────────────────────────────────────────────────
globalThis.React = React;
window.React = React;
globalThis.DashSegmented = ({ label, items, value, onChange }) => React.createElement('div', { role: 'tablist', 'aria-label': label },
  items.map((it) => React.createElement('button', { key: it.key, type: 'button', role: 'tab', 'aria-selected': it.key === value, onClick: () => onChange(it.key) }, it.label)));
const fetchCalls = [];
let routes = {};
globalThis.fetch = window.fetch = (url, init = {}) => {
  fetchCalls.push([url, init]);
  const key = Object.keys(routes).find((k) => url.startsWith(k));
  const r = key ? routes[key](url, init) : { status: 404, body: {} };
  return Promise.resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, json: () => Promise.resolve(r.body) });
};
await loadRealModule(join(ROOT, 'public/newdesign/leaderboards.jsx'), { registry: new Map([['react', React]]) });
// The classic script's top-level functions are globals in the browser; here they are module
// scoped, and the file's own Object.assign(window, …) is what publishes them.
const { MemberLeaderboard, CoachLeaderboard } = window;

test('website: the member board, its switches, and the gap line', async () => {
  fetchCalls.length = 0;
  routes = {
    '/api/leaderboard': () => ({ status: 200, body: memberBoard() }),
    '/api/me/leaderboard-privacy': (u, init) => ({ status: 200, body: { leaderboard: JSON.parse(init.body).leaderboard ?? true, teamBoard: null } }),
  };
  const v = await mount(React.createElement(MemberLeaderboard));
  assert.match(fetchCalls[0][0], /^\/api\/leaderboard\?scope=everyone&period=week&limit=50$/);
  assert.match(v.text(), /81 points to pass Devon R\./);
  assert.match(v.text(), /of 1,284 · last 7 days/);
  assert.ok(v.host.querySelector('.lb-row--gap'), 'no gap row between #4 and #9');
  // no streak column, other members' lines name their tier, and only your row says how you train
  assert.ok(![...v.host.querySelectorAll('.lb-row--head span')].some((x) => /streak/i.test(x.textContent)), 'a Streak column is back');
  assert.deepEqual([...v.host.querySelectorAll('.lb-pod .lb-where')].map((x) => x.textContent), ['Form tier', 'Form tier', 'Form tier']);
  const ds = [...v.host.querySelectorAll('.lb-row:not(.lb-row--head) .lb-ds')].map((x) => x.textContent);
  assert.deepEqual(ds.filter(Boolean), ['Trained 2 days · logged meals 4 days'], 'another member\'s activity is on the board');
  assert.match(v.text(), /Other members see points and tier\./);
  const sw = byText(v.host, 'button[role="switch"]', /Show me on leaderboards/);
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  await click(sw);
  await flush();
  const put = fetchCalls.find((c) => c[1].method === 'PUT');
  assert.deepEqual(JSON.parse(put[1].body), { leaderboard: false });
  await v.unmount();
});

test('website: privacy saves go one at a time, so the last answer is the newest (Codex, #2371)', async () => {
  const sent = [];
  const pending = [];
  const prev = globalThis.fetch;
  globalThis.fetch = window.fetch = (url, init = {}) => {
    if (init.method !== 'PUT') return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ leaderboard: true, teamBoard: null }) });
    sent.push(JSON.parse(init.body));
    return new Promise((resolve) => pending.push(resolve));
  };
  const answer = (body) => ({ status: 200, ok: true, json: () => Promise.resolve(body) });
  let save = null;
  function Probe() {
    const [state, s] = window.useLeaderboardPrivacy();
    save = s;
    return React.createElement('i', null, state.kind === 'ready' ? JSON.stringify(state.value) : state.kind);
  }
  try {
    const v = await mount(React.createElement(Probe));
    // Settings: both switches tapped before either answers
    const a = save({ leaderboard: false });
    const b = save({ teamBoard: true });
    await flush();
    assert.deepEqual(sent, [{ leaderboard: false }], 'the second save went out before the first answered');
    pending[0](answer({ leaderboard: false, teamBoard: null }));
    await flush();
    assert.deepEqual(sent, [{ leaderboard: false }, { teamBoard: true }]);
    pending[1](answer({ leaderboard: false, teamBoard: true }));
    assert.equal(await a, true);
    assert.equal(await b, true);
    await flush();
    assert.equal(v.text(), '{"leaderboard":false,"teamBoard":true}');
    // a save that fails, or cannot be read, does not hold up the next one
    const c = window.lbPutPrivacy({ leaderboard: true });
    await flush();
    pending[2]({ status: 500, ok: false, json: () => Promise.reject(new Error('no body')) });
    assert.deepEqual(await c, { ok: false, d: null });
    const d = window.lbPutPrivacy({ leaderboard: true });
    await flush();
    assert.equal(sent.length, 4);
    pending[3](answer({ leaderboard: true, teamBoard: true }));
    assert.deepEqual(await d, { ok: true, d: { leaderboard: true, teamBoard: true } });
    await v.unmount();
  } finally {
    globalThis.fetch = window.fetch = prev;
  }
});

test('website: every state is a sentence; a hidden member is told by whom', async () => {
  for (const [status, re] of [[401, /Sign in/], [503, /switched on yet/], [500, /couldn’t read/]]) {
    routes = { '/api/leaderboard': () => ({ status, body: {} }) };
    const v = await mount(React.createElement(MemberLeaderboard));
    assert.match(v.text(), re, String(status));
    assert.ok(!v.host.querySelector('.lb-board'), status + ' drew a board');
    await v.unmount();
  }
  routes = { '/api/leaderboard': () => ({ status: 200, body: memberBoard({ hidden: 'private' }) }) };
  const v = await mount(React.createElement(MemberLeaderboard));
  assert.match(v.text(), /Only you see your place\. Your profile is private/);
  await v.unmount();
  // not ranked is not hidden
  routes = { '/api/leaderboard': () => ({ status: 200, body: memberBoard({ me: false }) }) };
  const w = await mount(React.createElement(MemberLeaderboard));
  assert.match(w.text(), /You’re not ranked for the last 7 days yet/);
  assert.ok(!/Only you see/.test(w.text()));
  await w.unmount();
});

test('website: the coach board, refused for members, and climbers before history', async () => {
  // On Climbers you gained 98: the coach to chase is Maya (+99), not Dana (more score, +87).
  const climbBoard = () => { const d = coachBoard({ since: '2026-09-15' }); d.entries.find((e) => e.isMe).gained = 98; return d; };
  routes = { '/api/coach/leaderboard': (u) => ({ status: 200, body: /view=climb/.test(u) ? climbBoard() : coachBoard() }) };
  const v = await mount(React.createElement(CoachLeaderboard, { role: 'trainer' }));
  assert.match(v.text(), /101 points to pass Dana Ortiz/);
  assert.match(v.text(), /of 212 trainers/);
  assert.match(v.text(), /Top 7% of trainers on Shape/);
  await click(byText(v.host, 'button[role="tab"]', /Climbers/));
  await flush();
  assert.match(fetchCalls.at(-1)[0], /view=climb/);
  assert.match(v.text(), /since Sep 15/i);
  assert.match(v.text(), /2 points of climb to pass Maya Okafor/, 'Climbers chases by score, not by points gained');
  await v.unmount();

  routes = { '/api/coach/leaderboard': () => ({ status: 403, body: {} }) };
  const w = await mount(React.createElement(CoachLeaderboard, { role: 'trainer' }));
  assert.match(w.text(), /for coaches with a Shape listing/);
  await w.unmount();

  routes = { '/api/coach/leaderboard': () => ({ status: 200, body: coachBoard({ since: null }) }) };
  const x = await mount(React.createElement(CoachLeaderboard, { role: 'trainer' }));
  await click(byText(x.host, 'button[role="tab"]', /Climbers/));
  await flush();
  assert.match(x.text(), /needs a reading to compare against/);
  await x.unmount();
});

test('website: the subtitle names a rank only when the board gave one', () => {
  const { coachStandingLine } = window;
  assert.equal(coachStandingLine('trainer', null), 'Your coach score drives marketplace ranking, verified badge, and payout tier.');
  assert.match(coachStandingLine('trainer', { total: 212, me: { rank: 14, listed: true } }), /^#14 of 212 trainers on Shape\. /);
  assert.match(coachStandingLine('nutritionist', { total: 9, me: { rank: 3, listed: false } }), /^#3 of 9 nutritionists on Shape once your listing is live\. /);
  assert.ok(!/#/.test(coachStandingLine('trainer', { total: 0, me: null })));
});
