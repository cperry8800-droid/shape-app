// A client's colour on the coach website is their current Shape Score tier's (the owner,
// 2026-11-06: "client colors should match their current tier in shape score", then "client colors
// dont change"). Held here:
//   1. the five colours are the canonical ones (tierColors.jsx, the app's BS_TIER_COLORS) at the
//      rank thresholds the Score page and the database use, the same on every paper;
//   2. a tier comes only from rank points (or a tier's name): anything else is unknown, never Raw;
//   3. the roster route reads each client's rank points with the existing get_user_points, sends
//      null (unknown) for a read that failed and 0 (Raw) for a member with no ledger, privately;
//   4. the dashboard's record carries them, keeps a tier through a quiet re-read whose rank read
//      failed, and the preview's cast has standings that agree with its own weekly points.
// The marks' contrast on each paper is tests/dash-depth.test.mjs's; the board's drawing of them is
// tests/dash-today-board.test.mjs's. Compares booleans and strings, never DOM nodes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as CC from '../public/newdesign/clientColors.mjs';
import * as CCApp from '../mobile-app/src/services/clientColors.mjs';
import { rosterRankPoints, RANK_POINTS_CHUNK } from '../src/lib/roster-rank-points.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require_ = createRequire(import.meta.url);

// ── 1. The canonical ladder ────────────────────────────────────────────────────────────────
test('the five tiers are the canonical colours, at the rank thresholds every other surface uses', () => {
  const keys = CC.MEMBER_TIERS.map((t) => t.key);
  assert.deepEqual(keys, ['raw', 'tempo', 'form', 'peak', 'legend']);
  // tierColors.jsx's member ladder, read out of the shipped file.
  const site = source('public/newdesign/tierColors.jsx');
  const member = /var MEMBER = \{([^}]*)\}/.exec(site);
  assert.ok(member, 'tierColors.jsx moved its member ladder');
  const siteMap = Object.fromEntries([...member[1].matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
  // The app's BS_TIER_COLORS holds the same.
  const app = source('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const at = app.indexOf('const BS_TIER_COLORS = {');
  const appMap = Object.fromEntries([...app.slice(at, app.indexOf('};', at)).matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
  for (const t of CC.MEMBER_TIERS) {
    assert.equal(siteMap[t.key], t.color, `${t.label} is not tierColors.jsx's`);
    assert.equal(appMap[t.key], t.color, `${t.label} is not the app's`);
  }
  // The thresholds: the Score route's tier table, award_tier_bonuses' unlocks, tierColorByPoints.
  const route = source('src/app/api/client/score/route.ts');
  const table = [...route.matchAll(/\['(Raw|Tempo|Form|Peak|Legend)',\s*(\d+),/g)].map((m) => [m[1], +m[2]]);
  assert.deepEqual(table, CC.MEMBER_TIERS.map((t) => [t.label, t.min]));
  const unlocks = /v_thresh integer\[\] := array\[([\d, ]+)\]/.exec(source('supabase-migrations/2026-10-16-tier-up-notice.sql'));
  assert.deepEqual(unlocks[1].split(',').map(Number), CC.MEMBER_TIERS.slice(1).map((t) => t.min));
  const byPoints = [...site.matchAll(/if \(p >= (\d+)\)/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(byPoints, CC.MEMBER_TIERS.slice(1).map((t) => t.min));
});

// ── 2. Points or a name, else no tier ──────────────────────────────────────────────────────
test('a tier comes from rank points or a tier\'s name, and anything else is unknown, never Raw', () => {
  const key = (v) => (CC.clientTier(v) ? CC.clientTier(v).key : null);
  assert.deepEqual([0, 1, 749, 750, 1999, 2000, 4999, 5000, 14999, 15000, 1e9, 749.9].map(key),
    ['raw', 'raw', 'raw', 'tempo', 'tempo', 'form', 'form', 'peak', 'peak', 'legend', 'legend', 'raw']);
  assert.deepEqual(['form', 'Form', ' PEAK '].map(key), ['form', 'form', 'peak']);
  for (const v of [null, undefined, NaN, -1, -0.5, Infinity, -Infinity, '', '2400', '0', 'base', 'gold', true, {}, [], { key: 'form' }]) {
    assert.equal(CC.clientTier(v), null, `${JSON.stringify(v)} read as a tier`);
    assert.equal(CC.clientTierVars(v), null);
  }
  const form = CC.clientTier(2400);
  assert.deepEqual(form, { key: 'form', label: 'Form', min: 2000, color: '#e0463c', title: 'Form tier' });
  assert.deepEqual(CC.clientTierVars(2400), { '--tier-mark': '#e0463c' });
  // The colour is the tier's, whatever the paper: there is no per-paper value to pick.
  assert.equal(Object.keys(form).some((k) => /light|dark|paper/.test(k)), false);
  // The old id-hash palette is gone: an id is not a tier.
  for (const gone of ['CLIENT_PALETTE', 'clientColor', 'clientColorVars', 'clientColorIndex']) assert.equal(gone in CC, false, `${gone} is still exported`);
  assert.equal(CC.clientTier('8f0e4c2a-1111-4222-8333-444455556666'), null);
  // The app's entry point is the same module.
  assert.equal(CCApp.clientTier === CC.clientTier && CCApp.clientTierVars === CC.clientTierVars, true);
});

// ── 3. The roster's read ───────────────────────────────────────────────────────────────────
const uuid = (i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
function fakeDb(answer) {
  const calls = [];
  return { calls, rpc: async (fn, args) => { calls.push({ fn, ids: args.p_ids }); return answer(fn, args.p_ids, calls.length); } };
}

test('the roster reads rank points with get_user_points: unread is absent, no ledger is 0', async () => {
  const A = uuid(1), B = uuid(2), C = uuid(3), D = uuid(4);
  const db = fakeDb((fn, ids) => ({ data: [{ user_id: A, points: 2400 }, { user_id: B.toUpperCase(), points: '16000' }, { user_id: D, points: 'n/a' }], error: null }));
  const got = await rosterRankPoints(db, [A, B, C, D, 'name:Ana', null, A]);
  assert.deepEqual(db.calls.map((c) => c.fn), ['get_user_points']);
  assert.deepEqual(db.calls[0].ids, [A, B, C, D], 'only real ids, once each');
  assert.equal(got.get(A), 2400);
  assert.equal(got.get(B), 16000);
  assert.equal(got.get(C), 0, 'a member with no ledger is a measured 0 (Raw)');
  assert.equal(got.has(D), false, 'a row whose points are not a number is unknown, never 0');

  // A failed read, an error answer and a throw: every id in it is unknown.
  for (const answer of [() => ({ data: null, error: { message: 'boom' } }), () => ({ data: { not: 'rows' }, error: null }), () => { throw new Error('network'); }]) {
    const warn = console.warn; console.warn = () => {};
    try { assert.equal((await rosterRankPoints(fakeDb(answer), [A, B])).size, 0); } finally { console.warn = warn; }
  }
  // Chunked; one chunk failing costs only its own ids.
  const many = Array.from({ length: RANK_POINTS_CHUNK * 2 + 5 }, (_, i) => uuid(100 + i));
  const warn = console.warn; console.warn = () => {};
  try {
    const chunked = fakeDb((fn, ids, n) => (n === 2 ? { data: null, error: { message: 'second chunk down' } } : { data: ids.map((id) => ({ user_id: id, points: 800 })), error: null }));
    const out = await rosterRankPoints(chunked, many);
    assert.deepEqual(chunked.calls.map((c) => c.ids.length), [RANK_POINTS_CHUNK, RANK_POINTS_CHUNK, 5]);
    assert.equal(out.size, RANK_POINTS_CHUNK + 5);
    assert.equal(chunked.calls[1].ids.some((id) => out.has(id)), false, 'the failed chunk\'s ids were given a tier');
  } finally { console.warn = warn; }
  // No ids, no client: no call, nothing known.
  const idle = fakeDb(() => ({ data: [], error: null }));
  assert.equal((await rosterRankPoints(idle, [])).size + (await rosterRankPoints(null, [A])).size, 0);
  assert.equal(idle.calls.length, 0);
});

test('the roster route sends each client\'s rank points, null when unread, and answers privately', () => {
  const roster = source('src/lib/coach-roster.ts');
  assert.match(roster, /import \{ rosterRankPoints \} from '\.\/roster-rank-points\.mjs';/);
  assert.match(roster, /rosterRankPoints\(supabase, rosterIds\)/);
  assert.match(roster, /rankPoints: e\.id \? rankPoints\.get\(e\.id\.toLowerCase\(\)\) \?\? null : null,/, 'an unread tier must ship as null, never 0');
  // Every answer, the 401 and the not-a-coach one included, goes out private and unstored.
  assert.match(roster, /const PRIVATE_HEADERS = \{ 'Cache-Control': 'private, no-store, max-age=0' \};/);
  assert.equal((roster.match(/NextResponse\.json\(/g) || []).length, 1, 'a response skips the private headers');
  assert.equal((roster.match(/return privateJson\(/g) || []).length, 3);
  // It reads the caller the app's way (a Bearer token or the cookie), and the War Room lists both routes.
  assert.match(roster, /const user = await currentUser\(request\);[\s\S]*const supabase = await clientForRequest\(request\);/);
  const war = source('src/lib/warroom.ts');
  for (const r of ['/api/trainer/clients', '/api/nutritionist/clients']) assert.equal(war.includes(`['${r}', 'GET'],`), true, `${r} is not in RAW_ROUTES`);
  // No new definer: the read is the one the app's avatar tiers already make.
  assert.match(source('src/lib/roster-rank-points.mjs'), /supabase\.rpc\('get_user_points', \{ p_ids: chunk \}\)/);
});

// ── 4. The dashboard's record and the preview ──────────────────────────────────────────────
const DashSignals = require_(join(ROOT, 'public/newdesign/dashSignals.js'));
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const DATA = source('public/newdesign/dashData.jsx');

test('a roster row\'s rank points ride on the record; anything but a number is unknown', () => {
  const at = DATA.indexOf('function _dashRecordFromLive(');
  let depth = 0, end = -1;
  for (let j = DATA.indexOf('{', at); j < DATA.length; j++) { if (DATA[j] === '{') depth++; else if (DATA[j] === '}' && --depth === 0) { end = j + 1; break; } }
  // Lifted out on its own, as tests/dash-live-record.test.mjs does: it must not lean on a helper.
  const fromLive = new Function('DashSignals', DATA.slice(at, end) + '; return _dashRecordFromLive;')(DashSignals);
  const rp = (v) => fromLive({ id: 'u1', name: 'Ana', ...(v === 'absent' ? {} : { rankPoints: v }) }, null, {}, null).rankPoints;
  assert.deepEqual([2400, 0, 15000].map(rp), [2400, 0, 15000]);
  assert.deepEqual(['absent', null, NaN, -3, '2400', Infinity, {}].map(rp), [null, null, null, null, null, null, null]);
});

test('the roster row: the tier gem before the name, the name in ink, the status only as a labelled pill', () => {
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const compile = (src) => babel.transformSync(src, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const web = new Function('React', 'DashSignals', 'window', compile(DATA) + '\nreturn { _dashRecordFromLive, dashUnitsApi, dashMilestonesIn, dashWeighIn, dashWeighInDelta };')(React, DashSignals, {});
  const rec = (row) => web._dashRecordFromLive(row, null, {}, null);
  const people = [rec({ id: 'u1', name: 'Ana R.', rankPoints: 5200, onPlan: true }), rec({ id: 'u2', name: 'Ben T.', rankPoints: 0, onPlan: true }), rec({ id: 'u3', name: 'Cy D.', onPlan: true })];
  const colours = { unknown: '#999999', green: '#7bbf5a', amber: '#d8a23a', red: '#e0644b', new: '#2ee0c4' };
  const roster = (win) => new Function('React', 'ReactDOM', 'DashSignals', 'DASH_SEV_COLORS', 'useRememberedSet', 'DashPill', 'dashClientHref', 'dashMessageClient', 'dashRelDay', 'useDashUnits', 'dashMilestonesIn', 'dashWeighIn', 'dashWeighInDelta', 'window',
    compile(source('public/newdesign/dashRoster.jsx')) + '\nreturn { DashRosterTable };')(
    React, {}, DashSignals, colours, () => [[], () => {}], ({ c, children }) => React.createElement('span', { 'data-pill': c }, children), () => null, () => {}, () => null,
    () => web.dashUnitsApi(null, null), web.dashMilestonesIn, web.dashWeighIn, web.dashWeighInDelta, win).DashRosterTable;
  const draw = (win) => renderToStaticMarkup(React.createElement(roster(win), { triage: DashSignals.getTriageFeed('trainer', people), role: 'trainer', filter: 'all', query: '' }));
  const rowsOf = (html) => Object.fromEntries(html.split('aria-label="Open ').slice(1).map((r) => [r.slice(0, r.indexOf(' drilldown')), r]));
  const rows = rowsOf(draw({ ShapeClientColors: CC }));
  assert.match(rows['Ana R.'], /^Ana R\. drilldown, Peak tier"/, 'the row\'s name for assistive tech does not say the tier');
  assert.match(rows['Ana R.'], /class="sh-tier-mark" data-tier="peak" role="img" aria-label="Peak tier" title="Peak tier" style="--tier-mark:#8fe3e6/);
  assert.match(rows['Ben T.'], /data-tier="raw"/, 'a measured 0 is Raw');
  assert.match(rows['Cy D.'], /^Cy D\. drilldown"/);
  assert.equal(/sh-tier-mark/.test(rows['Cy D.']) || !/data-tier-unknown=""/.test(rows['Cy D.']), false, 'an unread tier is not a hollow square');
  for (const [name, r] of Object.entries(rows)) {
    // No colour on the name, and no bare status square: every status colour is a tier now.
    assert.equal(new RegExp(`color:[^;"]*;?[^>]*>${name.replace('.', '\\.')}<`).test(r), false, `${name}'s name is tinted`);
    assert.equal(/background:#(7bbf5a|d8a23a|e0644b|2ee0c4|999999)/.test(r), false, `${name}'s row draws a status colour with no label`);
  }
  // Without the module on the page: no tier on any row, and nothing claims one.
  const bare = rowsOf(draw({}));
  assert.equal(Object.values(bare).some((r) => /sh-tier-mark|tier"/.test(r)), false);
});

test('the preview\'s cast has standings that agree with its own weekly points', () => {
  const cast = DashSignals.buildMockClients(new Date('2026-11-06T12:00:00Z'));
  assert.equal(cast.every((c) => typeof c.rankPoints === 'number'), true, 'a preview client has no standing');
  const tiers = new Set(cast.map((c) => CC.clientTier(c.rankPoints).key));
  assert.equal(tiers.size >= 4, true, `the preview shows ${tiers.size} tiers`);
  for (const c of cast) {
    const recent = (c.shapeScoreHistory || []).reduce((s, w) => s + w.points, 0);
    // The high-water mark of points earned holds at least the eight weeks the cast shows.
    assert.equal(c.rankPoints >= recent, true, `${c.profile.name}: ${c.rankPoints} rank points under the ${recent} their weeks add to`);
  }
  // Tess joined this week: her standing is her two weeks exactly.
  const tess = cast.find((c) => c.profile.name === 'Tess B.');
  assert.equal(tess.rankPoints, tess.shapeScoreHistory.reduce((s, w) => s + w.points, 0));
  // The engine's push snapshot never carries it: it is the website's, and no rule reads it.
  assert.equal('rankPoints' in DashSignals.engineSnapshot(cast[0]), false);
});

// The real hook, mounted, with the server answering as the roster route does (the focus-refresh
// harness's shape: tests/coach-dashboard-focus-refresh.test.mjs).
test('a quiet re-read keeps a tier the page had read when the rank read fails, and takes a new one', async () => {
  const { JSDOM } = require_('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test', pretendToBeVisual: true });
  const saved = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, now: Date.now, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  const React = require_('react');
  const { createRoot } = require_('react-dom/client');
  const compiled = babel.transformSync(DATA, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const web = new Function('React', 'DashSignals', 'window', 'document', `${compiled}\n;return { useDashboard };`)(React, DashSignals, dom.window, dom.window.document);
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let clock = Date.UTC(2026, 10, 6, 15, 0, 0);
  Date.now = () => clock;
  let points = { [A]: 2400, [B]: 800 };
  let overviewsUp = true;
  let rosterReads = 0;
  globalThis.fetch = async (url, init) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    const u = String(url);
    if (u.startsWith('/api/trainer/clients')) rosterReads += 1;
    if (u.startsWith('/api/trainer/clients')) return json({ isTrainer: true, clients: [A, B].map((id) => ({ id, name: id.slice(0, 3), rankPoints: points[id] })), totals: { onPlan: 2 } });
    if (u.startsWith('/api/trainer/dashboard')) return json({ isTrainer: true, kpis: {}, today: [] });
    if (u === '/api/clients/shared-overview' && init && init.method === 'POST') {
      if (!overviewsUp) return { ok: false, status: 503, json: async () => ({}) };
      return json({ results: Object.fromEntries([A, B].map((id) => [id, { client: { id } }])), failed: [] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const seen = [];
  const Probe = () => { seen.push(web.useDashboard('trainer', { refreshOnFocus: true })); return null; };
  const flush = async () => { for (let i = 0; i < 6; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const tiers = () => seen[seen.length - 1].clients.map((c) => c.rankPoints);
  const back = async () => { clock += 61_000; await React.act(async () => { dom.window.dispatchEvent(new dom.window.Event('focus')); }); await flush(); };
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe)));
    await flush();
    assert.equal(seen[seen.length - 1].source, 'live');
    assert.deepEqual(tiers(), [2400, 800]);
    // The rank read fails on the return: the page keeps the tiers it had read, not "unknown".
    points = { [A]: null, [B]: null };
    const reads = rosterReads;
    await back();
    assert.equal(rosterReads > reads, true, 'the return did not re-read the roster');
    assert.deepEqual(tiers(), [2400, 800]);
    // B climbs to Tempo while their overview fails: the new tier lands on the record the page kept.
    points = { [A]: 2400, [B]: 1200 };
    overviewsUp = false;
    await back();
    assert.deepEqual(tiers(), [2400, 1200]);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    globalThis.window = saved.window; globalThis.document = saved.document; globalThis.fetch = saved.fetch; Date.now = saved.now; globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
  }
});
