// A client whose renewal payment is retrying keeps their coach (owner, 2026-10-18).
//
// The owner chose "Keep full access": "They stay normal clients until Stripe gives up: on the list,
// with logs visible, and the coach can still send them plans. Members keep their membership during
// the retry, so coaches keep coaching." A retrying renewal is subscription status past_due.
// Membership and Business already counted it (membership-core.ts ACTIVE_SUB, coach-trajectory.mjs
// OPEN_SUB_STATUSES); every check of whether a coach and a client are in a relationship stopped at
// active and trialing, in the database and in src/.
//
// This file holds the three parts of the change the runner can see:
//   1. supabase-migrations/2026-10-18-coach-access-past-due.sql: every widened function is the
//      previous body with past_due added to each status list and NOTHING else changed, still a
//      definer pinned to public, pg_temp, with its grants as they were; the four policies; what is
//      left alone; and the guard the file runs before it commits. (CI has no Postgres: the file is
//      read, as the repo's other migration tests read theirs.)
//   2. src/: no coach↔client read stops at active and trialing (a sweep, with the one deliberate
//      exception written down), and the statuses come from the one shared list.
//   3. The Clients list and the Clients badge count the same people: the roster route, the
//      website's count over it, and the dashboard route's activeClients, on the same rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { splitStatements } from './helpers/sql-scan.mjs';
import * as M from './helpers/definer-model.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase-migrations');
const FILE = '2026-10-18-coach-access-past-due.sql';
const SQL = readFileSync(join(DIR, FILE), 'utf8');
const require_ = createRequire(import.meta.url);

// ── 1. The migration ─────────────────────────────────────────────────────────────────────────────

// Each widened function, as the guard names it, and whether production holds it STABLE (read with
// pg_proc.provolatile on 2026-10-18; the others are volatile). A create or replace sets every
// attribute it does not name back to its default, so the header has to say it again.
const WIDENED = {
  is_coach_on_client: ['public.is_coach_on_client(uuid)', true],
  is_discipline_coach_on_client: ['public.is_discipline_coach_on_client(uuid, text)', true],
  can_access_conversation: ['public.can_access_conversation(uuid)', true],
  notify_on_new_message: ['public.notify_on_new_message()', false],
  get_or_create_coach_coach_conversation: ['public.get_or_create_coach_coach_conversation(uuid, uuid)', false],
  get_or_create_client_conversation: ['public.get_or_create_client_conversation(uuid, text)', false],
  get_client_coaches: ['public.get_client_coaches(uuid)', true],
  get_my_coach_playlists: ['public.get_my_coach_playlists(text)', true],
  get_my_shared_clients: ['public.get_my_shared_clients(uuid)', true],
  get_roster_weekend_split: ['public.get_roster_weekend_split(uuid[])', false],
  get_roster_weekly_adherence: ['public.get_roster_weekly_adherence(uuid[])', false],
  member_dobs_for_viewer: ['public.member_dobs_for_viewer(uuid, uuid[])', true],
  publish_client_week: ['public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', false],
  regenerate_client_workouts: ['public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb)', false],
  shape_member_board: ['public.shape_member_board(text, text, integer)', true],
  shape_pr_wall: ['public.shape_pr_wall(integer, text, text)', true],
};
// The policies that inline the check, and the column each one ties to the client.
const POLICIES = [
  ['activities', 'activities_provider_read', 'activities.user_id'],
  ['client_profiles', 'providers_read_subscriber_profiles', 'client_profiles.user_id'],
  ['daily_health_snapshot', 'providers_read_subscriber_snapshots', 'daily_health_snapshot.user_id'],
  ['profiles', 'providers_read_subscriber_profiles_base', 'profiles.id'],
];
const count = (s, word) => (String(s).match(new RegExp(word, 'g')) || []).length;
const after = M.replayDir(DIR);
const before = M.replayDir(DIR, { before: '2026-10-18' });
const only = (model, name) => {
  const fns = [...model.fns.values()].filter((f) => f.name === name);
  assert.equal(fns.length, 1, `${name}: ${fns.length} overloads`);
  return fns[0];
};
const STMTS = splitStatements(SQL, FILE);
const createOf = (name) => {
  const hits = STMTS.filter((s) => new RegExp(`^create or replace function public\\.${name}\\(`, 'i').test(s.text));
  assert.equal(hits.length, 1, `${name}: ${hits.length} create statements in ${FILE}`);
  return hits[0].text;
};

test('every coach↔client function is restated with past_due in each status list, and nothing else in its body changes', () => {
  for (const name of Object.keys(WIDENED)) {
    const now = only(after, name);
    const was = only(before, name);
    assert.equal(now.file, FILE, `${name}: its latest definition is this file`);
    // Each list that names trialing names past_due beside it, as the file's guard requires.
    assert.ok(count(now.body, 'past_due') >= 1, `${name}: past_due is in it`);
    assert.equal(count(now.body, 'past_due'), count(now.body, 'trialing'), `${name}: a status list still stops at trialing`);
    assert.equal(count(now.body, 'trialing'), count(was.body, 'trialing'), `${name}: the same lists as before, no more and no fewer`);
    // ⚠ AND ONLY THAT. Take past_due back out and the body is the previous one, byte for byte
    // (production's bodies read the same, line endings aside, on 2026-10-18).
    assert.equal(now.body.replace(/,(\s*)'past_due'/g, ''), was.body.replace(/\r\n/g, '\n'), `${name}: the body changed beyond its status lists`);
  }
});

test('each one is still a definer pinned to public, pg_temp, with the volatility and the grants it had', () => {
  for (const [name, [, stable]] of Object.entries(WIDENED)) {
    const now = only(after, name);
    const was = only(before, name);
    assert.equal(now.definer, true, `${name}: SECURITY DEFINER`);
    assert.deepEqual(now.searchPath, ['public', 'pg_temp'], `${name}: pinned to public, pg_temp`);
    // Production was pinned too (the 2026-08-09 sweep appended pg_temp to the three whose own file
    // says `public` alone), so restating `public` would have UNPINNED them.
    assert.deepEqual(was.searchPath, ['public', 'pg_temp'], `${name}: as production holds it`);
    assert.deepEqual(now.acl, was.acl, `${name}: a create or replace keeps the grants, and nothing here grants or revokes`);
    assert.equal(now.language, was.language, `${name}: the same language`);
    const head = createOf(name).split(/\bas \$/)[0].replace(/--[^\n]*/g, '');
    assert.equal(/\bstable\b/i.test(head), stable, `${name}: ${stable ? 'STABLE' : 'VOLATILE'}, as production holds it`);
    assert.match(head, /security definer\s+(?:set|$)/i, `${name}: the header says security definer`);
  }
});

test('the four policies that inline the check let a coach read a retrying client, and only their own', () => {
  for (const [table, name, col] of POLICIES) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(SQL, new RegExp(`drop policy if exists "${name}" on public\\.${table};\\ncreate policy "${name}"\\n  on public\\.${table} for select\\n  to authenticated\\n  using \\(`), name);
    const at = SQL.indexOf(`create policy "${name}"`);
    const body = SQL.slice(at, SQL.indexOf(');', at));
    assert.match(body, new RegExp(`where s\\.client_id = ${esc(col)}\\n\\s+and s\\.status in \\('active','trialing','past_due'\\)\\n\\s+and \\(t\\.owner_id = auth\\.uid\\(\\) or n\\.owner_id = auth\\.uid\\(\\)\\)`), `${name}: the client, an open status, and a listing the caller owns`);
    assert.match(body, /left join public\.trainers t\s+on t\.id = s\.provider_id and s\.provider_role = 'trainer'/);
    assert.match(body, /left join public\.nutritionists n\s+on n\.id = s\.provider_id and s\.provider_role = 'nutritionist'/);
  }
});

test('the score counts and the functions that already count past_due are left alone, and nothing grants, revokes or drops a function', () => {
  for (const name of ['get_coach_scores', 'shape_coach_score_parts', 'admin_overview_stats', 'get_funnel']) {
    assert.ok(!STMTS.some((s) => new RegExp(`function public\\.${name}\\(`, 'i').test(s.text)), `${name} is not restated`);
    assert.notEqual(only(after, name).file, FILE, name);
  }
  for (const s of STMTS) {
    assert.doesNotMatch(s.text.replace(/--[^\n]*/g, ''), /^(grant|revoke|alter function|drop function)\b/i, s.text.slice(0, 60));
  }
  const fns = STMTS.filter((s) => /^create or replace function/i.test(s.text)).map((s) => /function public\.([a-z_]+)\(/.exec(s.text)[1]);
  assert.deepEqual(fns.sort(), Object.keys(WIDENED).sort(), 'the file restates exactly the widened functions');
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});

test('the file refuses to commit unless every widened function and policy names past_due, and every function is still a pinned definer', () => {
  const guards = STMTS.filter((s) => /^do \$check\$/.test(s.text));
  assert.equal(guards.length, 1);
  const g = guards[0].text;
  assert.ok(SQL.indexOf(g) > SQL.lastIndexOf('create policy'), 'it runs after the last change');
  assert.ok(SQL.indexOf(g) < SQL.lastIndexOf('commit;'), 'and before the commit, so a failure rolls everything back');
  // It checks exactly what this file widens: a function or policy added without its check fails here.
  const sigs = [...g.matchAll(/'(public\.[a-z_]+\([^']*\))'/g)].map((m) => m[1]);
  assert.deepEqual(sigs.sort(), Object.values(WIDENED).map(([sig]) => sig).sort());
  const pols = [...g.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]).filter((p) => !p.startsWith('public.'));
  assert.deepEqual(pols.sort(), POLICIES.map(([t, n]) => `${t}.${n}`).sort());
  // Each check, and each raises.
  assert.match(g, /v_trialing := \(length\(v_src\) - length\(replace\(v_src, 'trialing', ''\)\)\) \/ length\('trialing'\);/);
  assert.match(g, /v_past_due := \(length\(v_src\) - length\(replace\(v_src, 'past_due', ''\)\)\) \/ length\('past_due'\);/);
  assert.match(g, /if v_past_due = 0 or v_past_due <> v_trialing then\s+raise exception/);
  assert.match(g, /and p\.prosecdef\s+and p\.proconfig @> array\['search_path=public, pg_temp'\]\s+\) then\s+raise exception/);
  assert.match(g, /and pp\.cmd = 'SELECT'\s+and pp\.roles = array\['authenticated'\]::name\[\];\s+if v_qual is null or position\('past_due' in v_qual\) = 0 then\s+raise exception/);
  // It reads the catalog and changes nothing: no dynamic SQL, no function statement.
  const c = M.classifyDoBlock(guards[0].tokens);
  assert.equal(c.effect, false, c.why || '');
  // The rule it applies, applied here to each body the file writes: it would pass.
  for (const name of Object.keys(WIDENED)) {
    const body = only(after, name).body;
    assert.ok(count(body, 'past_due') > 0 && count(body, 'past_due') === count(body, 'trialing'), name);
  }
});

// ── 2. src/ ──────────────────────────────────────────────────────────────────────────────────────

// Reads that stop at active and trialing ON PURPOSE. Each says why; an entry whose file no longer
// has such a list fails below, so a stale exemption cannot outlive the reason.
const ALLOW_TWO = {
  'src/app/api/coach/score/route.ts':
    'The coach score counts active and trialing subscriptions for its "Active clients" points, kept in step with get_coach_scores and shape_coach_score_parts (left alone by the migration). A count inside a score, not a relationship; whether a retrying client earns the coach points is the owner\'s call, and all three change together.',
};
// The only places a literal (active, trialing, past_due) list may be written. Everything that
// decides a coach↔client relationship reads coach-trajectory.mjs OPEN_SUB_STATUSES instead.
const ALLOW_THREE = {
  'src/lib/coach-trajectory.mjs': 'OPEN_SUB_STATUSES itself.',
  'src/lib/membership-core.ts': 'ACTIVE_SUB: membership, the rule OPEN_SUB_STATUSES follows.',
  'src/app/dashboard/layout.tsx': 'The dashboard\'s membership gate (ACTIVE_SUB).',
  'src/app/api/stripe/subscription/route.ts': 'The platform plan (Settings), not a coach.',
  'src/lib/ai/memberReads.mjs': 'PLATFORM_ACTIVE: the platform plan, read beside /api/stripe/subscription.',
  'src/lib/queries.ts': 'A member\'s own subscriptions and the Subscribed badge; these already read past_due before the shared list existed.',
};
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mjs|js|jsx)$/.test(name) && !name.endsWith('.d.ts') && !name.endsWith('.d.mts')) out.push(p);
  }
  return out;
}
// A bracketed or parenthesised list of string literals, and the statuses in it.
const LIST = /[[(]\s*((?:(['"])[a-z_]+\2\s*,\s*)+(['"])[a-z_]+\3)\s*,?\s*[\])]/g;
function statusLists(code) {
  const out = [];
  for (const m of code.matchAll(LIST)) {
    const items = [...m[1].matchAll(/(['"])([a-z_]+)\1/g)].map((x) => x[2]);
    out.push({ items, at: code.slice(0, m.index).split('\n').length });
  }
  return out;
}
function scan() {
  const two = [];
  const three = [];
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    // The War Room is a status board of sentences (one quotes a SQL query in a string); it reads nothing.
    if (rel === 'src/lib/warroom.ts') continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const l of statusLists(code)) {
      const s = new Set(l.items);
      if (s.has('active') && s.has('trialing') && !s.has('past_due')) two.push(`${rel}:${l.at} [${l.items.join(', ')}]`);
      if (s.size === 3 && s.has('active') && s.has('trialing') && s.has('past_due')) three.push(rel);
    }
    // `status === 'active' || status === 'trialing'`, the form the consoles used.
    code.split('\n').forEach((line, i) => {
      if (/===\s*(['"])active\1\s*\|\|.*===\s*(['"])trialing\2/.test(line) && !/past_due/.test(line)) two.push(`${rel}:${i + 1} ${line.trim()}`);
    });
  }
  return { two, three };
}

test('no coach↔client read in src/ stops at active and trialing', () => {
  const { two } = scan();
  const unexplained = two.filter((hit) => !Object.keys(ALLOW_TWO).some((f) => hit.startsWith(f + ':')));
  assert.deepEqual(unexplained, [], 'a relationship read that drops a client whose payment is retrying: read coach-trajectory.mjs OPEN_SUB_STATUSES (or add it to ALLOW_TWO, with the reason)');
  for (const [file, why] of Object.entries(ALLOW_TWO)) {
    assert.ok(why.length > 60, `${file}: say why`);
    assert.ok(two.some((hit) => hit.startsWith(file + ':')), `${file}: no longer stops at active and trialing; drop its exemption`);
  }
});

test('the statuses come from one shared list: no third (active, trialing, past_due) list is written in src/', () => {
  const { three } = scan();
  const stray = [...new Set(three)].filter((f) => !(f in ALLOW_THREE));
  assert.deepEqual(stray, [], 'use OPEN_SUB_STATUSES from src/lib/coach-trajectory.mjs');
  for (const file of Object.keys(ALLOW_THREE)) assert.ok(three.includes(file), `${file}: writes no such list any more; drop its exemption`);
});

// The relationship reads the change widened, each through the shared list.
const SITES = {
  'src/lib/coach-roster.ts': 1,
  'src/app/api/trainer/adjust/route.ts': 1,
  'src/app/api/trainer/week/route.ts': 1,
  'src/app/api/trainer/workout/route.ts': 1,
  'src/app/api/program-tools/templates/route.ts': 1,
  'src/app/api/sessions/request/route.ts': 1,
  'src/app/api/sessions/manage/route.ts': 1,
  'src/app/api/clients/[id]/week-one/route.ts': 1,
  'src/app/api/client/team/route.ts': 1,
  'src/app/api/client/plan/route.ts': 1,
  'src/app/api/client/onboarding/route.ts': 1,
  'src/app/api/client/dashboard/route.ts': 1,
  'src/app/api/nutritionist/meal-plan/route.ts': 1,
  'src/app/api/nutrition/meal-note/route.ts': 1,
  'src/app/api/leaderboard/route.ts': 1,
  'src/lib/shared-overview.ts': 1,
  'src/lib/session-emails.ts': 1,
  'src/lib/ai/memberReads.mjs': 2,
  'src/app/api/trainer/analytics/route.ts': 1,
  'src/app/api/nutritionist/analytics/route.ts': 1,
};
test('each widened read uses OPEN_SUB_STATUSES, and the consoles count an open plan as current', async () => {
  const { OPEN_SUB_STATUSES } = await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href);
  assert.deepEqual(OPEN_SUB_STATUSES, ['active', 'trialing', 'past_due']);
  for (const [rel, n] of Object.entries(SITES)) {
    const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    assert.equal((code.match(/\.in\(\s*'status',\s*OPEN_SUB_STATUSES\s*\)/g) || []).length, n, rel);
    assert.match(code, /import \{[^}]*\bOPEN_SUB_STATUSES\b[^}]*\} from '(?:@\/lib\/|(?:\.\.?\/)+(?:lib\/)?)coach-trajectory\.mjs';/, rel + ' imports the shared list');
  }
  for (const role of ['trainer', 'nutritionist']) {
    const code = stripComments(readFileSync(join(ROOT, `src/app/api/${role}/console/route.ts`), 'utf8'));
    assert.match(code, /if \(OPEN_SUB_STATUSES\.includes\(sub\.status\)\) e\.status = 'current';/, role);
  }
});

test('the member dashboard\'s coach team reads the member\'s own plans, not a coach\'s clients\' plans', () => {
  // RLS shows a coach the plans their clients hold with them, so a read with no client filter
  // listed a member-and-coach account's own listing as one of its coaches.
  const code = stripComments(readFileSync(join(ROOT, 'src/app/api/client/dashboard/route.ts'), 'utf8'));
  assert.match(code, /\.from\('subscriptions'\)\s*\.select\('provider_id, provider_role, status'\)\s*\.eq\('client_id', user\.id\)\s*\.in\('status', OPEN_SUB_STATUSES\)/);
});

// ── 3. The Clients list and the Clients badge count the same people ──────────────────────────────

test('the roster\'s client count is the dashboard\'s activeClients on the same rows: a retrying client in both, a session-only person in neither', async () => {
  const trajectory = await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href);
  const fee = await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href);
  const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });
  const G = await loadRealModule(join(ROOT, 'src/lib/coach-growth.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/coach-trajectory.mjs', trajectory],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
    ]),
  });
  const messages = await loadRealModule(join(ROOT, 'src/lib/coach-messages.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  // The website's own reading of the roster payload: dashData.jsx, compiled as the browser compiles it.
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const compiled = babel.transformSync(readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const web = new Function('React', 'DashSignals', 'window', `${compiled}\n;return { _dashRecordFromLive, dashPlanClientCount };`)(require_('react'), require_(join(ROOT, 'public/newdesign/dashSignals.js')), {});

  const COACH = '33333333-3333-4333-8333-333333333333';
  const DAY = 86400000;
  const at = (d) => new Date(Date.now() - d * DAY).toISOString();
  for (const [role, table] of [['trainer', 'trainers'], ['nutritionist', 'nutritionists']]) {
    const sub = (id, client_id, over = {}) => ({ id, provider_role: role, provider_id: 7, client_id, created_at: at(200), status: 'active', price_cents: 18000, fee_bps: 1500, ...over });
    const subs = [
      sub('s1', 'a'),
      sub('s2', 'a', { status: 'trialing', price_cents: 5000 }),         // a's second plan: one client
      sub('s3', 'b', { fee_bps: 0 }),
      sub('s4', 'c', { status: 'past_due' }),                            // retrying: still a client
      sub('s5', 'd', { status: 'canceled', current_period_end: at(-10) }), // paid through, but gone
      sub('s6', 'e', { status: 'incomplete' }),                          // never a client
      sub('s7', 'f', { provider_id: 8 }),                                // another coach's
      sub('s8', 'h', { status: 'past_due', created_at: at(-1) }),        // dated tomorrow: not open yet
    ];
    const sessions = [
      { provider_role: role, provider_id: 7, client_id: 'a', client_name: 'Ana', scheduled_at: at(2), duration_min: 60, type: 'video', status: 'completed', topic: null },
      { provider_role: role, provider_id: 7, client_id: 'g', client_name: 'Gus', scheduled_at: at(3), duration_min: 15, type: 'video', status: 'completed', topic: 'Intro' },
    ];
    const names = { a: 'Ana', b: 'Bea', c: 'Cleo', g: 'Gus' };
    const db = fakeSupabase({
      tables: { [table]: [{ id: 7, owner_id: COACH }], profiles: [{ id: COACH, full_name: 'Casey Coach' }], subscriptions: subs, sessions },
      rpcs: { get_display_names: ({ p_ids }) => p_ids.filter((id) => names[id]).map((id) => ({ user_id: id, full_name: names[id] })) },
    });
    const client = { ...db, auth: { getUser: async () => ({ data: { user: { id: COACH, email: 'casey@shape.test' } }, error: null }) } };

    const roster = await loadRealModule(join(ROOT, 'src/lib/coach-roster.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', require_('next/server')],
        ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: COACH }) }],
        ['@/lib/time', time],
        ['@/lib/coach-messages', messages],
      ]),
    });
    const list = await (await roster.coachClientsResponse(role, new Request(`https://x/api/${role}/clients`))).json();
    const dash = await loadRealModule(join(ROOT, `src/app/api/${role}/dashboard/route.ts`), {
      typescript: true,
      registry: new Map([
        ['next/server', require_('next/server')],
        ['@/lib/supabase/server', { createClient: async () => client }],
        ['@/lib/time', time],
        ['@/lib/coach-growth', G],
        ['@/lib/platform-fee', fee],
        ['@/lib/coach-trajectory.mjs', trajectory],
        ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
      ]),
    });
    const badge = (await (await dash.GET()).json()).kpis.activeClients;
    assert.equal(badge, 3, role + ': the badge counts a, b and c');

    // The list: everyone with a plan, and the person from a recent session, who stays on it.
    assert.deepEqual(list.clients.map((c) => c.id).sort(), ['a', 'b', 'c', 'g'], role);
    const byId = Object.fromEntries(list.clients.map((c) => [c.id, c]));
    assert.deepEqual([byId.c.name, byId.c.paymentRetrying, byId.c.onPlan, byId.c.mrrCents], ['Cleo', true, true, 18000], role + ': Cleo is listed, named, flagged and counted');
    assert.equal(byId.g.onPlan, false, role + ': Gus is on the list, not on a plan');
    // The count, three ways, is the badge.
    assert.equal(list.totals.onPlan, badge, role + ': the route\'s count');
    const records = list.clients.map((row) => web._dashRecordFromLive(row, null, {}, null));
    assert.equal(web.dashPlanClientCount(records), badge, role + ': the Clients page\'s count');
    assert.equal(records.find((r) => r.profile.id === 'c').payments.status, 'past_due', role);
    assert.equal(new Set(list.clients.filter((c) => c.onPlan).map((c) => c.id)).size, badge, role);
  }
});

test('the Clients pages count people on a plan, as the badge does, and say "—" when the plans could not be read', () => {
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const compiled = babel.transformSync(readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
  const { dashPlanClientCount } = new Function('React', 'DashSignals', 'window', `${compiled}\n;return { dashPlanClientCount };`)(require_('react'), {}, {});
  const rec = (onPlan) => ({ payments: onPlan === 'absent' ? { mrrCents: 0 } : { onPlan } });
  assert.equal(dashPlanClientCount([rec(true), rec(true), rec(false)]), 2, 'a session-only person is not an active client');
  assert.equal(dashPlanClientCount([rec(true), rec(null)]), null, 'unread is unknown, never a count');
  assert.equal(dashPlanClientCount([rec('absent'), rec('absent')]), 2, 'a record with no flag (the preview, an older route) counts, as before');
  assert.equal(dashPlanClientCount([]), 0);
  for (const page of ['trainerClientsPage.jsx', 'nutritionistClientsPage.jsx']) {
    const src = stripComments(readFileSync(join(ROOT, 'public/newdesign', page), 'utf8'));
    assert.match(src, /const activeCount = dashPlanClientCount\(clients\);/, page);
    assert.doesNotMatch(src, /const activeCount = clients\.length;/, page);
    assert.match(src, /const activeWord = activeCount == null \? "\\u2014" : String\(activeCount\);/, page);
    assert.match(src, /eyebrow=\{activeWord \+ " ACTIVE CLIENT" \+ \(activeCount === 1 \? "" : "S"\)/, page);
    assert.match(src, /\{ key: "all", label: "Your clients", count: loading \? null : activeCount \}/, page);
    // The list itself, its search and its export still say how many rows there are.
    assert.match(src, /placeholder=\{`Search \$\{clients\.length\} clients`\}/, page);
  }
});
