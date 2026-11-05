// How many people open a coach's public page (owner, 2026-11-05: "Profile-view counting: 4 = yes",
// aggregate counts only), for the Growth funnel's top bar: the rules (src/lib/profile-views.mjs), the
// beacon route, the migration, the two beacons (the website's coach profile and the Next pages), and
// the funnel's read of the counts.
// Run: node --test tests/profile-views.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as PV from '../src/lib/profile-views.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require_ = createRequire(join(ROOT, 'package.json'));

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,3; iOS 18_1; en_US)';

// ── The rules ───────────────────────────────────────────────────────────────────────────────
test('rules: a bot, a script or a test browser is not a view; a person in any browser is', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'curl/8.4.0', 'python-requests/2.31.0', 'Wget/1.21.4', 'Go-http-client/1.1', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    '', null, undefined, 'Mozilla/5.0',
  ]) assert.equal(PV.isLikelyBot(ua), true, String(ua));
  for (const ua of [
    CHROME,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    IPHONE_INSTAGRAM,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97]',
    // a phone made by Cubot is a person's phone
    'Mozilla/5.0 (Linux; Android 12; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; Cubot Note 20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ]) assert.equal(PV.isLikelyBot(ua), false, ua);
});

test('rules: a beacon is a role and a listing id, nothing else', () => {
  assert.deepEqual(PV.cleanProfileView({ role: 'trainer', id: 7 }), { role: 'trainer', id: 7 });
  assert.deepEqual(PV.cleanProfileView({ role: 'nutritionist', id: '12' }), { role: 'nutritionist', id: 12 });
  assert.deepEqual(PV.cleanProfileView({ role: 'trainer', id: 7, visitor: 'x', email: 'a@b.c' }), { role: 'trainer', id: 7 }, 'anything else is dropped');
  for (const bad of [null, 'x', [], {}, { role: 'client', id: 7 }, { role: 'trainer' }, { role: 'trainer', id: 0 }, { role: 'trainer', id: -1 },
    { role: 'trainer', id: 1.5 }, { role: 'trainer', id: '7; drop' }, { role: 'trainer', id: Number.MAX_SAFE_INTEGER + 2 }, { role: 'trainer', id: true }]) {
    assert.equal(PV.cleanProfileView(bad), null, JSON.stringify(bad));
  }
});

test('rules: the address becomes two keyed hashes, never itself', () => {
  const a = PV.viewBuckets('secret', '203.0.113.9', 'trainer', 7);
  assert.match(a.view, /^[0-9a-f]{40}$/);
  assert.match(a.addr, /^[0-9a-f]{40}$/);
  assert.notEqual(a.view, a.addr);
  assert.deepEqual(PV.viewBuckets('secret', '203.0.113.9', 'trainer', 7), a, 'the same visit, the same buckets');
  assert.notEqual(PV.viewBuckets('secret', '203.0.113.9', 'trainer', 8).view, a.view, 'another listing, another bucket');
  assert.equal(PV.viewBuckets('secret', '203.0.113.9', 'trainer', 8).addr, a.addr, 'the address bucket is across listings');
  assert.notEqual(PV.viewBuckets('other', '203.0.113.9', 'trainer', 7).view, a.view, 'keyed: a caller who knows the address cannot forge the bucket');
  assert.notEqual(PV.viewBuckets('secret', '203.0.113.10', 'trainer', 7).view, a.view);
  assert.ok(!JSON.stringify(a).includes('203.0.113'));
  assert.match(PV.viewBuckets('', '', 'trainer', 7).view, /^[0-9a-f]{40}$/, 'no secret, no address: still a hash');
  const h = new Headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' });
  assert.equal(PV.callerAddress(h), '198.51.100.4');
  assert.equal(PV.callerAddress(new Headers({ 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '198.51.100.4' })), '192.0.2.1');
  assert.equal(PV.callerAddress(new Headers()), '');
});

test('the funnel reads 90 days of the listing\'s views, today included; unread is null, not 0', async () => {
  const NOW = Date.UTC(2026, 10, 5, 12);
  assert.equal(PV.viewsSinceDay(NOW), '2026-08-08');
  const db = fakeSupabase({ tables: { coach_profile_views: [
    { provider_role: 'trainer', provider_id: 7, day: '2026-11-05', views: 4 },
    { provider_role: 'trainer', provider_id: 7, day: '2026-08-08', views: 10 },
    { provider_role: 'trainer', provider_id: 7, day: '2026-08-07', views: 1000 }, // 91 days back
    { provider_role: 'trainer', provider_id: 8, day: '2026-11-05', views: 50 }, // another coach
    { provider_role: 'nutritionist', provider_id: 7, day: '2026-11-05', views: 60 }, // another role
  ] } });
  assert.equal(await PV.coachProfileViews(db, 'trainer', 7, { now: NOW }), 14);
  assert.equal(await PV.coachProfileViews(fakeSupabase({ tables: { coach_profile_views: [] } }), 'trainer', 7, { now: NOW }), 0, 'no views is a measured 0');
  assert.equal(await PV.coachProfileViews(fakeSupabase({ fail: ['coach_profile_views'] }), 'trainer', 7, { now: NOW }), null, 'the table not there yet');
  assert.equal(await PV.coachProfileViews({ from() { throw new Error('boom'); } }, 'trainer', 7), null);
});

test('the dashboards\' funnel carries the views beside the consults and signings', async () => {
  const G = await loadRealModule(join(ROOT, 'src/lib/coach-growth.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
      ['@/lib/profile-views.mjs', PV],
    ]),
  });
  const today = new Date().toISOString().slice(0, 10);
  const g = await G.coachGrowthAndFunnel(fakeSupabase({ tables: { subscriptions: [], coach_profile_views: [{ provider_role: 'trainer', provider_id: 7, day: today, views: 31 }] } }), 'trainer', 7, 3);
  assert.deepEqual(g.funnel, { views: 31, consults90: 3, signed90: 0 });
  const unread = await G.coachGrowthAndFunnel(fakeSupabase({ tables: { subscriptions: [] }, fail: ['coach_profile_views'] }), 'trainer', 7, 3);
  assert.equal(unread.funnel.views, null, 'before the migration the funnel still says view tracking connects soon');
  const today2 = stripComments(read('public/newdesign/dashToday.jsx'));
  assert.match(today2, /\{ l: "Profile views · 90d", v: f\.views, note: f\.views == null \? "view tracking connects soon" : null \}/);
});

// ── The route ───────────────────────────────────────────────────────────────────────────────
async function loadRoute({ user = null, rpcError = null } = {}) {
  const calls = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/analytics/profile-view/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/gpc', await loadRealModule(join(ROOT, 'src/lib/gpc.ts'), { typescript: true })],
      ['@/lib/profile-views.mjs', PV],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true })],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: rpcError }; } }) }],
    ]),
  });
  return { route, calls };
}
const post = (body, headers = {}) =>
  new Request('https://theshapecommunity.com/api/analytics/profile-view', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': CHROME, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('route: a view is recorded with the listing, the viewer only to leave the coach out, and the address only as hashes', async () => {
  const { route, calls } = await loadRoute({ user: { id: 'u-1' } });
  const res = await route.POST(post({ role: 'trainer', id: 7 }, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
  assert.equal(res.status, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'record_coach_profile_view');
  const { p_role, p_provider_id, p_viewer, p_bucket, p_addr, ...rest } = calls[0].args;
  assert.deepEqual([p_role, p_provider_id, p_viewer], ['trainer', 7, 'u-1']);
  assert.deepEqual(rest, {}, 'nothing else goes to the database');
  assert.match(p_bucket, /^[0-9a-f]{40}$/);
  assert.match(p_addr, /^[0-9a-f]{40}$/);
  assert.ok(!JSON.stringify(calls[0].args).includes('203.0.113.9'), 'never the address itself');
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  assert.deepEqual({ view: p_bucket, addr: p_addr }, PV.viewBuckets(secret, '203.0.113.9', 'trainer', 7));
  const visitor = await loadRoute();
  await visitor.route.POST(post({ role: 'nutritionist', id: '12' }));
  assert.equal(visitor.calls[0].args.p_viewer, null, 'no session: a visitor');
  assert.equal(visitor.calls[0].args.p_provider_id, 12);
});

test('route: a bot, GPC, junk and a failed store are all 204 and count nothing', async () => {
  const { route, calls } = await loadRoute({ user: { id: 'u-1' } });
  assert.equal((await route.POST(post({ role: 'trainer', id: 7 }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }))).status, 204);
  assert.equal((await route.POST(post({ role: 'trainer', id: 7 }, { 'user-agent': '' }))).status, 204);
  assert.equal((await route.POST(post({ role: 'trainer', id: 7 }, { 'sec-gpc': '1' }))).status, 204);
  for (const body of ['not json', { role: 'client', id: 7 }, { role: 'trainer', id: 'x' }, 'x'.repeat(5000)]) {
    assert.equal((await route.POST(post(body))).status, 204);
  }
  assert.equal(calls.length, 0);
  const failing = await loadRoute({ rpcError: { message: 'function record_coach_profile_view does not exist' } });
  const warn = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    assert.equal((await failing.route.POST(post({ role: 'trainer', id: 7 }))).status, 204);
  } finally {
    console.warn = warn;
  }
  assert.match(warned.join('\n'), /record_coach_profile_view does not exist/, 'a dead pipeline (the migration not run) is logged');
});

test('route: it reads the caller through request-auth, so the installed app\'s Bearer token is a viewer too', () => {
  const src = stripComments(read('src/app/api/analytics/profile-view/route.ts'));
  assert.match(src, /import \{ currentUser \} from '@\/lib\/request-auth';/);
  assert.doesNotMatch(src, /@\/lib\/supabase\/server/);
});

test('route: on the War Room\'s API surface', async () => {
  const src = read('src/lib/warroom.ts');
  for (const [path, methods] of [['/api/analytics/profile-view', 'POST'], ['/api/coach/score/history', 'GET'], ['/api/coach/goal-readings', 'GET']]) {
    assert.ok(src.includes(`['${path}', '${methods}'],`), path);
  }
});

// ── The migration ───────────────────────────────────────────────────────────────────────────
test('migration: a day\'s count per listing, nothing about the visitor; only the coach reads it, only the service role writes it', () => {
  const code = read('supabase-migrations/2026-11-05-coach-profile-views.sql').replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  const table = /create table if not exists public\.coach_profile_views \(([\s\S]*?)\n\);/.exec(code)[1];
  assert.deepEqual([...table.matchAll(/^\s+(\w+)\s/gm)].map((m) => m[1]), ['provider_role', 'provider_id', 'day', 'views', 'primary'], 'no account, address, device or cookie column');
  assert.match(code, /alter table public\.coach_profile_views enable row level security;/);
  assert.match(code, /revoke all on table public\.coach_profile_views from public, anon, authenticated;/);
  assert.match(code, /grant select on table public\.coach_profile_views to authenticated;/);
  assert.match(code, /create policy coach_profile_views_owner_read on public\.coach_profile_views\s+for select to authenticated/);
  assert.match(code, /t\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(code, /n\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(code, /revoke all on function public\.record_coach_profile_view\(text, bigint, uuid, text, text\) from public, anon, authenticated;/);
  assert.match(code, /grant execute on function public\.record_coach_profile_view\(text, bigint, uuid, text, text\) to service_role;/);
  assert.match(code, /security definer\s+set search_path = public, pg_temp/);
  // The coach's own visit, a listing with no coach, and repeat views are not counted.
  assert.match(code, /if v_owner is null then\s+return false;/);
  assert.match(code, /if p_viewer is not null and p_viewer = v_owner then\s+return false;/);
  assert.match(code, /_rate_limit_bump\('fn:pview:' \|\| p_bucket, 1, 1800\)/);
  assert.match(code, /_rate_limit_bump\('fn:pview-addr:' \|\| p_addr, 60, 3600\)/);
  assert.match(code, /p_bucket !~ '\^\[0-9a-f\]\{16,128\}\$'/, 'only a hash reaches the bucket name');
  assert.match(code, /do update set views = v\.views \+ 1;/);
  assert.match(code, /do \$guard\$[\s\S]*raise exception/);
});

// ── The beacons ─────────────────────────────────────────────────────────────────────────────
test('website: the coach profile counts a listed coach\'s page once, never their own, through the kit', async () => {
  const web = stripComments(read('public/newdesign/coachProfileWeb.jsx'));
  assert.match(web, /React\.useEffect\(\(\) => \{ if \(listed && !isSelf && K\.countProfileView\) K\.countProfileView\(role, providerId\); \}, \[listed, isSelf, role, providerId\]\);/);
  assert.equal((web.match(/countProfileView/g) || []).length, 2, 'one line on the page, nothing else');
  const K = await import('../public/newdesign/coachProfileKit.mjs');
  assert.equal(typeof K.countProfileView, 'function');
});

test('website: once per listing, only with consent, waiting for the consent script, never from a test browser', async () => {
  const { countProfileView, PROFILE_VIEW_PATH, PROFILE_VIEW_TRIES } = await import('../public/newdesign/profileView.mjs');
  assert.equal(PROFILE_VIEW_PATH, '/api/analytics/profile-view');
  const allow = ({ gpc, consent }) => !gpc && consent !== 'reject';
  const win = (over = {}) => ({ localStorage: { getItem: () => over.consent ?? null }, navigator: { globalPrivacyControl: !!over.gpc, webdriver: !!over.webdriver }, shapeClickCapture: over.noRule ? undefined : { trackingAllowed: allow } });
  const run = (w, role = 'trainer', id = 7, extra = {}) => {
    const sent = [];
    const ok = countProfileView(role, id, { win: w, send: (b) => sent.push(b), sent: extra.sent || new Set(), timers: extra.timers });
    return { ok, sent };
  };
  assert.deepEqual(run(win()).sent, [{ role: 'trainer', id: 7 }]);
  assert.deepEqual(run(win({ gpc: true })).sent, [], 'Global Privacy Control');
  assert.deepEqual(run(win({ consent: 'reject' })).sent, [], 'a Reject');
  assert.deepEqual(run(win({ webdriver: true })).sent, [], 'a test browser');
  assert.deepEqual(run(win(), 'client').sent, []);
  assert.equal(run(win(), 'trainer', 0).ok, false);
  // Once per listing on a page.
  const seen = new Set();
  assert.deepEqual(run(win(), 'trainer', 7, { sent: seen }).sent.length, 1);
  assert.deepEqual(run(win(), 'trainer', 7, { sent: seen }).sent.length, 0);
  assert.deepEqual(run(win(), 'nutritionist', 7, { sent: seen }).sent.length, 1, 'another listing counts');
  // The consent script arrives after the listing: the beacon waits for it, then asks it.
  const later = [];
  const w = win({ noRule: true });
  const r = run(w, 'trainer', 9, { timers: { setTimeout: (fn) => later.push(fn) } });
  assert.deepEqual(r.sent, []);
  w.shapeClickCapture = { trackingAllowed: allow };
  later.shift()();
  assert.deepEqual(r.sent, [{ role: 'trainer', id: 9 }]);
  // ...and with no consent rule at all, it gives up and counts nothing.
  const never = [];
  const r2 = run(win({ noRule: true }), 'trainer', 10, { timers: { setTimeout: (fn) => never.push(fn) } });
  for (let i = 0; i < PROFILE_VIEW_TRIES + 2 && never.length; i += 1) never.shift()();
  assert.equal(never.length, 0, 'it stops asking');
  assert.deepEqual(r2.sent, []);
});

test('Next pages: /trainers/<id> and /nutritionists/<id> send one view, with consent, through the same route', () => {
  const beacon = stripComments(read('src/components/ProfileViewBeacon.tsx'));
  assert.match(beacon, /^'use client';/);
  assert.match(beacon, /import \{ allowedOn \} from '@\/lib\/signup-source\.mjs';/);
  assert.match(beacon, /if \(window\.navigator\.webdriver === true \|\| !allowedOn\(window\)\) return;/);
  assert.match(beacon, /fetch\('\/api\/analytics\/profile-view'/);
  assert.match(beacon, /body: JSON\.stringify\(\{ role, id: providerId \}\)/);
  assert.match(beacon, /if \(sent\.has\(key\)\) return;\s+sent\.add\(key\);/);
  assert.match(stripComments(read('src/app/trainers/[id]/page.tsx')), /<ProfileViewBeacon role="trainer" providerId=\{trainer\.id\} \/>/);
  assert.match(stripComments(read('src/app/nutritionists/[id]/page.tsx')), /<ProfileViewBeacon role="nutritionist" providerId=\{nutritionist\.id\} \/>/);
});
