// The coach dashboards' 90-day growth and funnel (src/lib/coach-growth.ts), and the two places
// that read them (dashToday.jsx), after the Business review of 2026-10-17: a new client is a person
// who started paying, once; the comparison is over equal spans; "signed" is the clients who found
// the coach on Shape, and more of them than consults is no close rate (the sweep after #2394 round
// 10; it was capped at 100).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const G = await loadRealModule(ROOT + 'src/lib/coach-growth.ts', {
  typescript: true,
  registry: new Map([
    ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(ROOT + 'src/lib/coach-trajectory.mjs').href)],
    ['@/lib/read-all-by-id', await loadRealModule(ROOT + 'src/lib/read-all-by-id.ts', { typescript: true })],
  ]),
});
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 17, 12);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const row = (client_id, d, over = {}) => ({ client_id, created_at: ago(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
const total = (g) => g.growth.weeklyAdds.reduce((s, w) => s + w.count, 0);

test('an abandoned checkout is not a new client, and a plan change is not a second one', () => {
  const g = G.growthFrom([
    row('a', 10),
    row('a', 5, { price_cents: 20000 }),          // a's plan change
    row('b', 8, { status: 'incomplete' }),          // never paid
    row('c', 7, { status: 'incomplete_expired' }),  // never paid
    row('d', 3, { status: 'canceled' }),            // paid, then left: still joined
  ], { consults90: 0, now: NOW });
  assert.equal(total(g), 2);
  assert.equal(g.growth.weeklyAdds.reduce((s, w) => s + w.addedCents, 0), 20000, 'each counted at its first row\'s price');
});

test('a client who was a client when the window opened is not new; one with no client_id stands alone', () => {
  const g = G.growthFrom([row('a', 10), row('b', 9), row(null, 8), row(null, 7)], { existing: new Map([['a', Infinity]]), consults90: 0, now: NOW });
  assert.equal(total(g), 3);
});

test('a client who leaves after the window opens and comes back inside it is new; a plan change that carried the membership on is not', async () => {
  // Through the route's own reads: coachGrowthAndFunnel works the window out from the clock.
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const sub = (client_id, d, over = {}) => ({ provider_role: 'trainer', provider_id: 7, client_id, created_at: at(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
  const db = fakeSupabase({ tables: { subscriptions: [
    sub('a', 120, { status: 'canceled', current_period_end: at(70) }), // a left 70 days ago...
    sub('a', 20),                                                     // ...and came back
    sub('b', 200),                                                    // b is still on her first plan
    sub('b', 30),                                                     // so this is a plan change
    sub('c', 150, { status: 'canceled', current_period_end: at(40) }), // c's first plan ran out 40 days ago,
    sub('c', 50, { status: 'canceled', current_period_end: at(10) }),  // after she moved to this one,
    sub('c', 30),                                                     // and then to this one: never away
    sub('d', 300),                                                    // d's first plan still runs, whatever
    sub('d', 120, { status: 'canceled', current_period_end: at(60) }), // order the earlier rows are read in,
    sub('d', 30),                                                     // so this is a plan change
    sub('e', 120, { status: 'canceled', current_period_end: at(60) }), // e moved, inside the window,
    sub('e', 70, { status: 'past_due' }),                             // to a plan that is still open,
    sub('e', 30),                                                     // so this is a plan change too
    sub('f', 120, { status: 'canceled', current_period_end: at(50) }), // f's next plan began the moment
    sub('f', 50),                                                     // the last one ended: never away
  ] } });
  // (f's rows share a timestamp, at(50): the second starts exactly when the first ends.)
  const g = await G.coachGrowthAndFunnel(db, 'trainer', 7, 0);
  assert.equal(total(g), 1, 'a\'s return is a new client; b, c, d, e and f never left');
  assert.equal(g.funnel.signed90, 1);
});

test('a failed read is an error, not an empty history: the dashboards show growth and the funnel as unread', async () => {
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const sub = (client_id, d, over = {}) => ({ provider_role: 'trainer', provider_id: 7, client_id, created_at: at(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
  const tables = { subscriptions: [sub('a', 200), sub('a', 30)] };
  // Read through, a's in-window row is a plan change, so no one is new.
  assert.equal(total(await G.coachGrowthAndFunnel(fakeSupabase({ tables }), 'trainer', 7, 0)), 0);
  await assert.rejects(G.coachGrowthAndFunnel(fakeSupabase({ tables, fail: ['subscriptions'] }), 'trainer', 7, 0), /coach growth/);
  // Only the read of the earlier subscriptions fails: a must not turn into a new client.
  const failNth = (db, n) => {
    let k = 0;
    return { ...db, from(t) {
      const chain = db.from(t);
      if (++k === n) chain.then = (res, rej) => Promise.resolve({ data: null, error: { message: 'timeout' } }).then(res, rej);
      return chain;
    } };
  };
  await assert.rejects(G.coachGrowthAndFunnel(failNth(fakeSupabase({ tables }), 2), 'trainer', 7, 0), /coach growth: timeout/);
  // Both dashboards turn the error into null, which their panels read as not available.
  for (const role of ['trainer', 'nutritionist']) {
    const src = readFileSync(ROOT + `src/app/api/${role}/dashboard/route.ts`, 'utf8');
    assert.match(src, /const g = await coachGrowthAndFunnel\([^)]*\);\s*growth = g\.growth;\s*funnel = g\.funnel;\s*\} catch/);
  }
});

test('the comparison is the last 30 days against the 30 before, not a part-month against a whole one', () => {
  const g = G.growthFrom([row('a', 5), row('b', 12), row('c', 29), row('d', 35), row('e', 50), row('f', 70)], { consults90: 0, now: NOW });
  assert.equal(g.growth.momPct, 50, '3 in the last 30 days against 2 in the 30 before');
  assert.equal(G.growthFrom([row('a', 5)], { consults90: 0, now: NOW }).growth.momPct, null, 'no base to compare with');
});

test('"signed" counts the clients who found the coach on Shape; a row with no stored fee is one', () => {
  const g = G.growthFrom([row('a', 5, { fee_bps: 0 }), row('b', 6), row('c', 7, { fee_bps: null }), row('d', 8, { status: 'incomplete' })], { consults90: 4, now: NOW });
  assert.equal(g.funnel.signed90, 2);
  assert.equal(g.funnel.consults90, 4);
  assert.equal(g.funnel.views, null);
});

// ── The sweep after #2394 round 10: new clients and signings over the same 90 days ──
test('new clients over 90 days are counted over the rows the signings are: never fewer than "Signed from Shape · 90d"', async () => {
  // A Monday: the 13 weekly buckets open on the Monday of twelve weeks ago, 84.5 days back, while the
  // read (and the signings) reach 90 days back. Two clients joined in the five days between.
  const MON = Date.UTC(2026, 9, 19, 12);
  const back = (d) => new Date(MON - d * DAY).toISOString();
  const g = G.growthFrom([
    { client_id: 'a', created_at: back(88), status: 'active', price_cents: 10000, fee_bps: 1500 },
    { client_id: 'b', created_at: back(86), status: 'active', price_cents: 10000, fee_bps: 1500 },
    { client_id: 'c', created_at: back(10), status: 'active', price_cents: 10000, fee_bps: 0 },
  ], { consults90: 5, now: MON });
  assert.equal(g.growth.weeklyAdds[0].weekOf, '2026-07-27', 'the weeks open after a and b joined');
  assert.equal(total(g), 1, 'the weeks hold c alone');
  assert.equal(g.funnel.signed90, 2, 'a and b found the coach on Shape');
  assert.equal(g.growth.added90, 3, 'a, b and c joined in the 90 days');
  // Today's card prints that count, not the summed weeks, beside the funnel's signings.
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const pick = (re) => re.exec(src)[0];
  const code = [
    pick(/const DASH_FUNNEL_BENCHMARK = [^\n]*/),
    pick(/function dashCloseRate\(f\) \{[\s\S]*?\n\}/),
    pick(/function dashCloseWhy\(f\) \{[\s\S]*?\n\}/),
    pick(/function DashBusinessSummary\([\s\S]*?\n\}/),
  ].join('\n');
  const js = babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const { DashBusinessSummary } = new Function('React', 'serif', 'dashMoney', 'DASH_MONO_LINK', 'DASH_DEMO_GROWTH', 'DASH_DEMO_FUNNEL',
    js + '\nreturn { DashBusinessSummary };')(React, 'serif', (c) => '$' + c / 100, {}, {}, {});
  const card = renderToStaticMarkup(React.createElement(DashBusinessSummary, { live: { growth: g.growth, funnel: g.funnel, kpis: { monthlyNetCents: 1 } }, role: 'trainer', clients: [] })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(card, /\+3 New clients · 90d/);
  // And the preview's own figures keep the rule: its signings are some of its new clients.
  const demoCode = [pick(/const dashDemoGrowth = [\s\S]*?\n\}\);/), pick(/const DASH_DEMO_GROWTH = \{[\s\S]*?\n\};/), pick(/const DASH_DEMO_FUNNEL = [^\n]*/)].join('\n');
  const { DASH_DEMO_GROWTH, DASH_DEMO_FUNNEL } = new Function(demoCode + '\nreturn { DASH_DEMO_GROWTH, DASH_DEMO_FUNNEL };')();
  for (const role of ['trainer', 'nutritionist']) {
    const demo = DASH_DEMO_GROWTH[role];
    assert.equal(demo.added90, demo.weeklyAdds.reduce((s, w) => s + w.count, 0), role);
    assert.ok(DASH_DEMO_FUNNEL.signed90 <= demo.added90, role + ': ' + DASH_DEMO_FUNNEL.signed90 + ' signed of ' + demo.added90 + ' new');
  }
});

// ⚠ The sweep after #2394 round 10: this pinned close({ consults90: 4, signed90: 6 }) at 100, a
// capped figure the funnel then printed as a measured rate "above the ~30% marketplace benchmark".
// More signed than consulted is no close rate, and says so in its own words.
test('consult → signed: more clients signed than booked a consult is no rate, said in its own words, apart from an unread one', () => {
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const fn = /function dashCloseRate\(f\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'dashCloseRate moved');
  const close = new Function(fn[0] + '\nreturn dashCloseRate;')();
  assert.equal(close({ consults90: 4, signed90: 6 }), null, 'more signed than consulted is no rate, not 100%');
  assert.equal(close({ consults90: 4, signed90: 4 }), 100, 'every consult signed is 100%');
  assert.equal(close({ consults90: 10, signed90: 3 }), 30);
  assert.equal(close({ consults90: 0, signed90: 3 }), null);
  assert.equal(close(null), null);
  const whyFn = /function dashCloseWhy\(f\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(whyFn, 'dashCloseWhy moved');
  const why = new Function(fn[0] + '\n' + whyFn[0] + '\nreturn dashCloseWhy;')();
  assert.deepEqual([{ consults90: 4, signed90: 6 }, { consults90: 0, signed90: 3 }, { consults90: 10, signed90: null }, { consults90: 0, signed90: 0 }, { consults90: 10, signed90: 3 }].map(why), ['over', 'over', 'unread', 'none', null]);
  assert.equal((src.match(/const close = dashCloseRate\(f\);/g) || []).length, 2, 'both readers use it');
  assert.ok(!/MoM/.test(src), 'no month-over-month label is left for a 30-day comparison');
  assert.ok(!/function DashGrowthPanel\(/.test(src), 'the growth panel nothing showed is gone');
  assert.equal(close({ consults90: 10, signed90: null }), null, 'unread signings are no rate, not 0%');
});

// ── The dashboard routes themselves (src/app/api/{role}/dashboard/route.ts), run on a fake database ──
const COACH = '33333333-3333-4333-8333-333333333333';
const ROLES = [['trainer', 'trainers'], ['nutritionist', 'nutritionists']];
// The coach's own listing (id 7) and profile, beside the rows a test gives.
const coachTables = (table, rows) => ({ [table]: [{ id: 7, owner_id: COACH }], profiles: [{ id: COACH, full_name: 'Casey Coach' }], sessions: [], ...rows });
// A role's dashboard as that coach sees it, read through `db` (fakeSupabase, or recorded() around one).
async function dashboardGET(role, db) {
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const client = { ...db, auth: { getUser: async () => ({ data: { user: { id: COACH, email: 'casey@shape.test' } }, error: null }) } };
  const route = await loadRealModule(ROOT + `src/app/api/${role}/dashboard/route.ts`, {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/time', await loadRealModule(ROOT + 'src/lib/time.ts', { typescript: true })],
      ['@/lib/coach-growth', G],
      ['@/lib/platform-fee', await import(pathToFileURL(ROOT + 'src/lib/platform-fee.mjs').href)],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(ROOT + 'src/lib/coach-trajectory.mjs').href)],
      ['@/lib/read-all-by-id', await loadRealModule(ROOT + 'src/lib/read-all-by-id.ts', { typescript: true })],
    ]),
  });
  return (await route.GET()).json();
}

// ── The sweep after #2394 round 10: Today counts today's practice by the Business page's rule ──
// The dashboards' kpis (Today's Business card and sidebar, the KPI picker, the other pages' sidebars)
// took active and trialing rows and counted rows. Business counts today's clients from the
// trajectory: people, a client whose payment is retrying (past_due) among them.
test('both dashboards count today\'s clients and net as the Business page does: a retrying payment counts, a client on two plans is one', async () => {
  const trajectory = await import(pathToFileURL(ROOT + 'src/lib/coach-trajectory.mjs').href);
  const fee = await import(pathToFileURL(ROOT + 'src/lib/platform-fee.mjs').href);
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  for (const [role, table] of ROLES) {
    const sub = (id, client_id, over = {}) => ({ id, provider_role: role, provider_id: 7, client_id, created_at: at(200), status: 'active', price_cents: 18000, fee_bps: 1500, ...over });
    const subs = [
      sub('s1', 'a'),
      sub('s2', 'a', { status: 'trialing', price_cents: 5000 }),        // a's second plan: one client
      sub('s3', 'a', { price_cents: 2000 }),                            // and a third
      sub('s4', 'b', { fee_bps: 0 }),                                   // brought: no fee
      sub('s5', 'c', { status: 'past_due' }),                           // retrying: still a client
      sub('s6', 'd', { status: 'canceled', current_period_end: at(-10) }), // paid through, but gone
      sub('s7', 'e', { status: 'incomplete' }),                         // never a client
      sub('s8', 'f', { provider_id: 8 }),                               // another coach's
    ];
    const body = await dashboardGET(role, fakeSupabase({ tables: coachTables(table, { subscriptions: subs }) }));
    // What the Business page counts: the trajectory's latest week over this coach's rows.
    const last = trajectory.buildTrajectory({ subs: subs.filter((r) => r.provider_id === 7), cutCents: (p, bps) => fee.coachCutCents(p, fee.bpsToRate(bps ?? 1500)) }).weeks.slice(-1)[0];
    assert.deepEqual([body.kpis.activeClients, body.kpis.monthlyNetCents], [last.active, last.mrrNetCents], role + ': Today says what Business says');
    assert.deepEqual([body.kpis.activeClients, body.kpis.monthlyNetCents], [3, 15300 + 4250 + 1700 + 18000 + 15300], role + ': a, b and c; b keeps all of hers');
  }
});

// ── The dashboards after #2395: a failed read is null, not 0 clients and $0 ──
// The read's error was dropped (`subRows ?? []`), so a failed read sent 0 clients and $0 net, and every
// reader printed them as a measurement.
test('when the subscriptions can\'t be read, both dashboards send today\'s clients and net as null, not 0 and $0, and log why', async () => {
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  for (const [role, table] of ROLES) {
    const tables = coachTables(table, { subscriptions: [{ id: 's1', provider_role: role, provider_id: 7, client_id: 'a', created_at: at(200), status: 'active', price_cents: 18000, fee_bps: 1500 }] });
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => { warned.push(args.join(' ')); };
    let body;
    try { body = await dashboardGET(role, fakeSupabase({ tables, fail: ['subscriptions'] })); } finally { console.warn = warn; }
    assert.deepEqual([body.kpis.activeClients, body.kpis.monthlyNetCents], [null, null], role + ': unread, not 0 clients and $0');
    assert.ok(warned.some((w) => w.startsWith(`[shape-app] ${role} dashboard: subscriptions read failed`) && w.endsWith('fake failure on subscriptions')), role + ': the failure is logged with its reason: ' + JSON.stringify(warned));
    // The rest of the payload still answers: this is a coach, and the funnel keeps the consults it counted.
    assert.equal(body[role === 'trainer' ? 'isTrainer' : 'isNutritionist'], true, role);
    assert.deepEqual([body.growth, body.funnel], [null, { views: null, consults90: 0, signed90: null }], role);
    // Read through, the same tables count the client; a practice with no one in it is a measured 0.
    const read = await dashboardGET(role, fakeSupabase({ tables }));
    assert.deepEqual([read.kpis.activeClients, read.kpis.monthlyNetCents], [1, 15300], role);
    const none = await dashboardGET(role, fakeSupabase({ tables: { ...tables, subscriptions: [] } }));
    assert.deepEqual([none.kpis.activeClients, none.kpis.monthlyNetCents], [0, 0], role + ': no clients is a measured 0');
  }
});

test('Today\'s Business card and sidebar say today\'s clients and Shape\'s fee, not "active subs" and a flat 15%', async () => {
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const pick = (re) => re.exec(src)[0];
  const code = [
    pick(/function dashMoney\(cents\) \{[\s\S]*?\n\}/),
    pick(/function dashLivePayoutCard\(k\) \{[\s\S]*?\n\}/),
    pick(/const DASH_FUNNEL_BENCHMARK = [^\n]*/),
    pick(/function dashCloseRate\(f\) \{[\s\S]*?\n\}/),
    pick(/function dashCloseWhy\(f\) \{[\s\S]*?\n\}/),
    pick(/function DashBusinessSummary\([\s\S]*?\n\}/),
  ].join('\n');
  const js = babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const { dashLivePayoutCard, DashBusinessSummary } = new Function('React', 'serif', 'DASH_MONO_LINK', 'DASH_DEMO_GROWTH', 'DASH_DEMO_FUNNEL',
    js + '\nreturn { dashLivePayoutCard, DashBusinessSummary };')(React, 'serif', {}, {}, {});
  const card = renderToStaticMarkup(React.createElement(DashBusinessSummary, { live: { growth: null, funnel: null, kpis: { activeClients: 13, monthlyNetCents: 182700 } }, role: 'trainer', clients: [] })).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  assert.match(card, /\$1,827 Monthly · net today's clients · after Shape's fee/);
  assert.doesNotMatch(card, /15%|active subs/);
  assert.deepEqual(dashLivePayoutCard({ activeClients: 13, monthlyNetCents: 182700 }), { label: 'MONTHLY · NET', amount: '$1,827', sub: '13 clients · payouts connect soon' });
  assert.equal(dashLivePayoutCard({ activeClients: 1, monthlyNetCents: 15300 }).sub, '1 client · payouts connect soon');
  // Every page's sidebar reads it, or says clients in its own words (the app frame has no dashToday.jsx).
  const page = (f) => readFileSync(ROOT + 'public/newdesign/' + f, 'utf8');
  assert.match(src, /payoutCard=\{live \? dashLivePayoutCard\(live\.kpis\) : cfg\.payoutCard\(\)\}/);
  assert.match(page('dashMealBuilder.jsx'), /payoutCard=\{live \? dashLivePayoutCard\(live\.kpis\) : nutriPayoutCard\}/);
  assert.match(page('dashBuilder.jsx'), /payoutCard=\{live\?dashLivePayoutCard\(live\.kpis\):trainerPayoutCard\}/);
  for (const f of ['dashToday.jsx', 'dashMealBuilder.jsx', 'dashBuilder.jsx', 'trainerDashboard.jsx']) assert.doesNotMatch(page(f), /active subs/, f);
});

// ── The dashboards after #2395: every reader says an unread figure couldn't be read ──
// The routes send today's clients and net as null when the subscriptions couldn't be read. The other
// pages' sidebar printed that as "0 clients", Today's card as "— · payouts connect soon", and Today's
// summary as "no subscription data".
test('when the dashboards can\'t read the subscriptions, Today\'s card, every page\'s sidebar and the summary say so: never "0 clients" or "no subscription data"', async () => {
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const pick = (re) => re.exec(src)[0];
  const code = [
    pick(/function dashMoney\(cents\) \{[\s\S]*?\n\}/),
    pick(/function dashLivePayoutCard\(k\) \{[\s\S]*?\n\}/),
    pick(/const DASH_FUNNEL_BENCHMARK = [^\n]*/),
    pick(/function dashCloseRate\(f\) \{[\s\S]*?\n\}/),
    pick(/function dashCloseWhy\(f\) \{[\s\S]*?\n\}/),
    pick(/function DashBusinessSummary\([\s\S]*?\n\}/),
  ].join('\n');
  const js = babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const { dashLivePayoutCard, DashBusinessSummary } = new Function('React', 'serif', 'DASH_MONO_LINK', 'DASH_DEMO_GROWTH', 'DASH_DEMO_FUNNEL',
    js + '\nreturn { dashLivePayoutCard, DashBusinessSummary };')(React, 'serif', {}, {}, {});
  const unread = { activeClients: null, monthlyNetCents: null };
  // Today's card, which Workouts and Meal plans hand the sidebar too (the callers above).
  assert.deepEqual(dashLivePayoutCard(unread), { label: 'MONTHLY · NET', amount: '—', sub: "clients couldn't be read just now" });
  assert.deepEqual(dashLivePayoutCard({ activeClients: 0, monthlyNetCents: 0 }), { label: 'MONTHLY · NET', amount: '$0', sub: '0 clients · payouts connect soon' }, 'a measured 0 is still a figure');
  // Every other page's sidebar builds its own card (trainerDashboard.jsx): its hook, run against each route's answer.
  const shell = readFileSync(ROOT + 'public/newdesign/trainerDashboard.jsx', 'utf8');
  const lift = (re) => { const m = re.exec(shell); assert.ok(m, re + ' moved'); return m[0]; };
  const hookSrc = [
    lift(/const _dsbCache = new Map\(\);/),
    lift(/async function dsbFetch\(url\) \{[\s\S]*?\n\}/),
    lift(/function dsbMoney\(cents\) \{[\s\S]*?\n\}/),
    lift(/function useDashSidebarLive\(role\) \{[\s\S]*?\n\}/),
  ].join('\n');
  const sidebar = async (role, kpis) => {
    let state = null;
    const R = { useState: (init) => [init, (v) => { state = v; }], useEffect: (fn) => { fn(); } };
    const answer = { [role === 'trainer' ? 'isTrainer' : 'isNutritionist']: true, kpis };
    new Function('React', 'window', hookSrc + '\nreturn useDashSidebarLive;')(R, { dashJson: async () => answer })(role);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    return state;
  };
  for (const [role] of ROLES) {
    const s = await sidebar(role, unread);
    assert.deepEqual([s.kind, s.count, s.card], ['live', null, dashLivePayoutCard(unread)], role + ': the sidebar says what Today\'s card says, and puts no count on Clients');
    for (const kpis of [{ activeClients: 13, monthlyNetCents: 182700 }, { activeClients: 1, monthlyNetCents: 15300 }, { activeClients: 0, monthlyNetCents: 0 }]) {
      const live = await sidebar(role, kpis);
      assert.deepEqual([live.count, live.card], [kpis.activeClients, dashLivePayoutCard(kpis)], role + ': ' + kpis.activeClients + ' clients');
    }
  }
  // Today's summary: the net is a dash, said as unread.
  const card = renderToStaticMarkup(React.createElement(DashBusinessSummary, { live: { growth: null, funnel: null, kpis: unread }, role: 'trainer', clients: [] })).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  assert.match(card, /— Monthly · net couldn't be read just now/);
  assert.doesNotMatch(card, /\$0|no subscription data/);
});

test('when the subscriptions can\'t be read, Today and the funnel say so: the consults stay, nothing claims none', async () => {
  // The dashboards keep the consults they counted from the calendar, and send the signings as null.
  for (const role of ['trainer', 'nutritionist']) {
    const route = readFileSync(ROOT + `src/app/api/${role}/dashboard/route.ts`, 'utf8');
    assert.match(route, /\} catch \(e\) \{[^}]*funnel = \{ views: null, consults90, signed90: null \};\s*\}/, role);
  }
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const pick = (re) => re.exec(src)[0];
  const code = [
    pick(/const DASH_FUNNEL_BENCHMARK = [^\n]*/),
    pick(/function dashCloseRate\(f\) \{[\s\S]*?\n\}/),
    pick(/function dashCloseWhy\(f\) \{[\s\S]*?\n\}/),
    pick(/function DashFunnelPanel\([\s\S]*?\n\}/),
    pick(/function DashBusinessSummary\([\s\S]*?\n\}/),
  ].join('\n');
  const js = babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const { DashFunnelPanel, DashBusinessSummary } = new Function('React', 'serif', 'dashMoney', 'DASH_MONO_LINK', 'DASH_DEMO_GROWTH', 'DASH_DEMO_FUNNEL',
    js + '\nreturn { DashFunnelPanel, DashBusinessSummary };')(React, 'serif', (c) => '$' + c / 100, {}, {}, {});
  const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
  const live = { growth: null, funnel: { views: null, consults90: 7, signed90: null }, kpis: { monthlyNetCents: 120000 } };
  const card = text(React.createElement(DashBusinessSummary, { live, role: 'trainer', clients: [] }));
  assert.match(card, /— New clients · 90d couldn't be read just now/);
  assert.doesNotMatch(card, /none in the 30 days before/);
  // (The sweep after #2394 round 10) the card's close rate says so too, as the funnel does.
  assert.match(card, /— Consult → signed couldn't be read just now/);
  // More signed than consulted: no rate, in its own words, on the funnel and the card alike.
  const over = { ...live, growth: { weeklyAdds: [{ weekOf: 'w', count: 6, addedCents: 6 }], added90: 6, momPct: null }, funnel: { views: null, consults90: 4, signed90: 6 } };
  const overFunnel = text(React.createElement(DashFunnelPanel, { live: over }));
  assert.match(overFunnel, /More clients signed than booked a consult, so there's no close rate to show/);
  assert.doesNotMatch(overFunnel, /100%|benchmark\. The lever|YOU ·|couldn't be read|Book consults/);
  const overCard = text(React.createElement(DashBusinessSummary, { live: over, role: 'trainer', clients: [] }));
  assert.match(overCard, /— Consult → signed more signed than booked a consult/);
  assert.doesNotMatch(overCard, /100%|couldn't be read/);
  const funnel = text(React.createElement(DashFunnelPanel, { live }));
  assert.match(funnel, /Consults · 90d 7/);
  assert.match(funnel, /Signed from Shape · 90d couldn't be read just now/);
  assert.match(funnel, /Your signings couldn't be read just now/);
  assert.doesNotMatch(funnel, /Funnel data connects soon|Book consults/);
  // A read that worked with no one in the 30 days before still says that.
  const none = text(React.createElement(DashBusinessSummary, { live: { ...live, growth: { weeklyAdds: [{ weekOf: 'w', count: 1, addedCents: 1 }], added90: 1, momPct: null } }, role: 'trainer', clients: [] }));
  assert.match(none, /none in the 30 days before to compare/);
});

// ── Every row, a page at a time (Codex on #2394) ──
// One select returns at most 1,000 rows and no error (PostgREST's db-max-rows, fakeSupabase's
// maxRows). The window's read went oldest first, so what it cut was the newest rows; the read of
// the earlier subscriptions could cut the row that proves a client never left.
const pad = (n) => String(n).padStart(6, '0');
// fakeSupabase applies the filters but doesn't record them, so this records each read's builder
// calls by name: a filter no figure can show (the earlier read's client list) is pinned this way.
function recorded(db) {
  const reads = [];
  return { reads, from(table) {
    const chain = db.from(table);
    const ops = [];
    reads.push({ table, ops });
    const proxy = new Proxy(chain, { get(t, k) {
      const v = t[k];
      if (k === 'then' || typeof v !== 'function') return v;
      return (...args) => { ops.push([k, ...args]); v(...args); return proxy; };
    } });
    return proxy;
  } };
}
const op = (r, name, col) => r.ops.find((o) => o[0] === name && (col === undefined || o[1] === col));
// Ids shuffled against the dates and against the order the rows are stored in (7919 is prime, so
// i·7919 mod n visits every id once): the walk can lean on neither.
const withIds = (rows) => rows.map((r, i) => ({ ...r, id: 's' + pad((i * 7919) % rows.length) }));
// Each page asks for this coach's rows in id order, 1,000 at most, after the last id the page before read.
function assertWalk(pages, matching, label) {
  const ids = matching.map((r) => r.id).sort();
  assert.equal(pages.length, Math.floor(ids.length / 1000) + 1, label + ': a page per 1,000 rows, not the first 1,000');
  pages.forEach((p, k) => {
    assert.deepEqual(op(p, 'eq', 'provider_role'), ['eq', 'provider_role', 'trainer'], label + ': this role only');
    assert.deepEqual(op(p, 'eq', 'provider_id'), ['eq', 'provider_id', 7], label + ': this coach only');
    assert.deepEqual(op(p, 'order'), ['order', 'id', { ascending: true }], label + ': in id order');
    assert.deepEqual(op(p, 'limit'), ['limit', 1000], label);
    assert.deepEqual(op(p, 'gt')?.slice(1) ?? null, k === 0 ? null : ['id', ids[k * 1000 - 1]], label + ': after the last id read');
  });
}

test('every subscription in the window is read, a page at a time: the newest are the recent weeks, the last 30 days and the signings', async () => {
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const sub = (client_id, d, over = {}) => ({ provider_role: 'trainer', provider_id: 7, client_id, created_at: at(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
  const table = withIds([
    // 1,000 clients joined 55 to 41 days ago, stored oldest first...
    ...Array.from({ length: 1000 }, (_, i) => sub('o' + pad(i), 55 - Math.floor((i * 15) / 1000))),
    // ...and 300 in the last 20 days: 100 the coach brought, 40 already clients (below), 160 found on Shape.
    ...Array.from({ length: 300 }, (_, k) => sub('n' + pad(k), 20 - Math.floor((k * 19) / 300), { fee_bps: k < 100 ? 0 : 1500 })),
    // Not this coach's window: another role, another coach, and rows from before the window.
    ...Array.from({ length: 50 }, (_, k) => sub('z' + pad(k), 5, { provider_role: 'nutritionist' })),
    ...Array.from({ length: 50 }, (_, k) => sub('y' + pad(k), 5, { provider_id: 8 })),
    ...Array.from({ length: 30 }, (_, k) => sub('q' + pad(k), 120, { status: 'canceled', current_period_end: at(100) })),
    // n000100 to n000139 have been clients since before the window, on a plan that still runs.
    ...Array.from({ length: 40 }, (_, k) => sub('n' + pad(100 + k), 200)),
  ]);
  const db = recorded(fakeSupabase({ tables: { subscriptions: table }, maxRows: 1000 }));
  const g = await G.coachGrowthAndFunnel(db, 'trainer', 7, 0);
  assert.equal(total(g), 1260, '1,000 + the 260 newest who were not already clients');
  assert.equal(g.growth.momPct, -74, '260 in the last 30 days against 1,000 in the 30 before (the oldest 1,000 alone read -100)');
  assert.equal(g.funnel.signed90, 1160, 'the 100 the coach brought are not signings');
  const recent = g.growth.weeklyAdds.filter((w) => w.weekOf > new Date(T - 35 * DAY).toISOString().slice(0, 10)).reduce((s, w) => s + w.count, 0);
  assert.equal(recent, 260, 'the recent weeks have the newest clients in them');
  // Every page is this coach's window in id order, and the earlier read asks for those clients only.
  const pages = db.reads.filter((r) => op(r, 'gte'));
  const since = op(pages[0], 'gte', 'created_at')[2];
  assert.ok(pages.every((p) => op(p, 'gte', 'created_at')[2] === since), 'every page is the same 90 days');
  const inWindow = table.filter((r) => r.provider_role === 'trainer' && r.provider_id === 7 && r.created_at >= since);
  assertWalk(pages, inWindow, 'window');
  const earlier = db.reads.filter((r) => op(r, 'lt'));
  assert.equal(earlier.length, 1);
  assert.deepEqual(op(earlier[0], 'lt'), ['lt', 'created_at', since], 'the earlier read ends where the window starts');
  assert.deepEqual([...op(earlier[0], 'in', 'client_id')[2]].sort(), [...new Set(inWindow.map((r) => r.client_id))].sort());
});

test('a membership from before the window is found past the first 1,000 earlier rows: a client who never left is not new', async () => {
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const sub = (client_id, d, over = {}) => ({ provider_role: 'trainer', provider_id: 7, client_id, created_at: at(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
  const gone = (client_id, d) => sub(client_id, d, { status: 'canceled', current_period_end: at(d - 30) });
  const table = withIds([
    // 600 clients joined in the window.
    ...Array.from({ length: 600 }, (_, k) => sub('c' + pad(k), 10 + (k % 60))),
    // Before it, each had two plans that ended before it opened (1,200 rows), so each came back...
    ...Array.from({ length: 1200 }, (_, j) => gone('c' + pad(j % 600), 300 - Math.floor(j / 600) * 100)),
    // ...a plan with another coach, or as another role, doesn't make 20 of them clients here...
    ...Array.from({ length: 10 }, (_, k) => sub('c' + pad(k), 200, { provider_id: 8 })),
    ...Array.from({ length: 10 }, (_, k) => sub('c' + pad(10 + k), 200, { provider_role: 'nutritionist' })),
    // ...but 100 of them also hold a plan from before the window that still runs, stored last: they never left.
    ...Array.from({ length: 100 }, (_, k) => sub('c' + pad(500 + k), 150)),
  ]);
  const db = recorded(fakeSupabase({ tables: { subscriptions: table }, maxRows: 1000 }));
  const g = await G.coachGrowthAndFunnel(db, 'trainer', 7, 0);
  assert.equal(total(g), 500, 'the 100 who never left are not new (the first 1,000 earlier rows alone read 600)');
  assert.equal(g.funnel.signed90, 500);
  const pages = db.reads.filter((r) => op(r, 'lt'));
  const since = op(db.reads.find((r) => op(r, 'gte')), 'gte', 'created_at')[2];
  assert.ok(pages.every((p) => op(p, 'lt', 'created_at')[2] === since), 'every page ends where the window starts');
  const ids = Array.from({ length: 600 }, (_, k) => 'c' + pad(k));
  assert.ok(pages.every((p) => JSON.stringify([...op(p, 'in', 'client_id')[2]].sort()) === JSON.stringify(ids)), 'every page is the window\'s clients, not every client the coach had');
  assertWalk(pages, table.filter((r) => r.provider_role === 'trainer' && r.provider_id === 7 && r.created_at < since), 'earlier');
});

test('a read past the walk\'s ceiling is unknown, not short: it throws, as a failed read does', async () => {
  // Every page of one read comes back full, so the walk reaches its 50 pages; one select would have
  // handed back 1,000 rows and no error, and the dashboards would have shown them as the whole story.
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const stub = (full) => ({ from() {
    const ops = [];
    const chain = new Proxy({}, { get(_, k) {
      if (k !== 'then') return (...args) => { ops.push([k, ...args]); return chain; };
      return (res, rej) => {
        const inWindow = ops.some((o) => o[0] === 'gte');
        const after = ops.find((o) => o[0] === 'gt')?.[2];
        const from = after ? Number(after.slice(1)) + 1 : 0;
        const n = (inWindow ? full === 'window' : full === 'earlier') ? 1000 : 1;
        const data = Array.from({ length: n }, (_, k) => inWindow
          ? { id: 'r' + pad(from + k), client_id: 'c' + pad(from + k), created_at: at(10), status: 'active', price_cents: 1000, fee_bps: 1500 }
          : { id: 'r' + pad(from + k), client_id: 'c' + pad(0), created_at: at(200), status: 'canceled', current_period_end: at(150) });
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
    } });
    return chain;
  } });
  await assert.rejects(G.coachGrowthAndFunnel(stub('window'), 'trainer', 7, 0), /coach growth: more than 50000 rows/);
  await assert.rejects(G.coachGrowthAndFunnel(stub('earlier'), 'trainer', 7, 0), /coach growth: more than 50000 rows/);
  // And a walk that ends below the ceiling reads through: the one client left and came back.
  assert.equal(total(await G.coachGrowthAndFunnel(stub(null), 'trainer', 7, 0)), 1);
});

// ── The dashboards after #2395: today's clients and net are every open row, a page at a time ──
// Today's practice was one select, which stops at 1,000 rows with no error (maxRows here), so past
// 1,000 open plans Today's clients and net came out short; the analytics routes already walk the rows.
test('both dashboards read every open subscription, a page at a time: 2,500 clients today are 2,500, not the first 1,000 rows', async () => {
  const fee = await import(pathToFileURL(ROOT + 'src/lib/platform-fee.mjs').href);
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  for (const [role, table] of ROLES) {
    const sub = (client_id, over = {}) => ({ provider_role: role, provider_id: 7, client_id, created_at: at(200), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
    const subs = withIds([
      // 2,500 clients today: a tenth retrying a payment, a tenth on a trial, a tenth brought by the coach (no fee)...
      ...Array.from({ length: 2500 }, (_, i) => sub('c' + pad(i), i % 10 === 3 ? { status: 'past_due' } : i % 10 === 5 ? { status: 'trialing' } : i % 10 === 7 ? { fee_bps: 0 } : {})),
      // ...and rows that are not today's practice: plans that ended, another coach's, the other role's.
      ...Array.from({ length: 300 }, (_, k) => sub('e' + pad(k), { status: 'canceled', current_period_end: at(30) })),
      ...Array.from({ length: 200 }, (_, k) => sub('y' + pad(k), { provider_id: 8 })),
      ...Array.from({ length: 200 }, (_, k) => sub('z' + pad(k), { provider_role: role === 'trainer' ? 'nutritionist' : 'trainer' })),
    ]);
    const db = recorded(fakeSupabase({ tables: coachTables(table, { subscriptions: subs }), maxRows: 1000 }));
    const body = await dashboardGET(role, db);
    const cut = fee.coachCutCents(10000, fee.bpsToRate(1500));
    assert.deepEqual([body.kpis.activeClients, body.kpis.monthlyNetCents], [2500, 2250 * cut + 250 * 10000], role + ': every client today, and each one\'s net');
    // Every page asks for this coach's open rows in id order, 1,000 at most, after the last id the page before read.
    const open = subs.filter((r) => r.provider_role === role && r.provider_id === 7 && r.status !== 'canceled').map((r) => r.id).sort();
    const pages = db.reads.filter((r) => r.table === 'subscriptions' && op(r, 'in', 'status'));
    assert.equal(pages.length, 3, role + ': a page per 1,000 rows, not one read');
    pages.forEach((p, k) => {
      assert.deepEqual(op(p, 'eq', 'provider_role'), ['eq', 'provider_role', role], role + ': this role only');
      assert.deepEqual(op(p, 'eq', 'provider_id'), ['eq', 'provider_id', 7], role + ': this coach only');
      assert.deepEqual(op(p, 'in', 'status'), ['in', 'status', ['active', 'trialing', 'past_due']], role + ': every open status');
      assert.deepEqual(op(p, 'order'), ['order', 'id', { ascending: true }], role + ': in id order');
      assert.deepEqual(op(p, 'limit'), ['limit', 1000], role + ': a page of 1,000 at most');
      assert.deepEqual(op(p, 'gt')?.slice(1) ?? null, k === 0 ? null : ['id', open[k * 1000 - 1]], role + ': after the last id read');
    });
  }
});
