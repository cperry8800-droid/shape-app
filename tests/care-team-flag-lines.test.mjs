// Joint attention reads the co-coach's side of a joint note at the co-coach's own flag tuning (owner,
// 2026-11-10: "yes fix this please"). Three pieces, each held here:
// - get_care_team_flag_lines (supabase-migrations/2026-11-10-care-team-flag-lines.sql) returns a
//   client's other coaches' thresholds to a coach on that client, and nothing to anyone else. Probed
//   on a PostgreSQL 16 copy before it shipped: a current trainer read the past-due nutritionist's
//   numbers, and the nutritionist the trainer's; a former coach, an unrelated coach, the member, a
//   signed-out caller and a null client read nothing; anon could not execute it; strings, lower-case
//   keys, the rest of the settings document and other user_goals kinds never left it; a second run
//   changed nothing. The runner has no Postgres, so the rules that decided those answers are held here.
// - src/lib/shared-overview.ts puts each co-coach's numbers on their care-team entry (flagLines).
// - public/newdesign/dashSignals.js reads the co-coach's side at those numbers (jointLeg), and at the
//   role's house defaults when the record has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const S = require(join(ROOT, 'public/newdesign/dashSignals.js'));
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-11-10-care-team-flag-lines.sql'), 'utf8');
const body = SQL.slice(SQL.indexOf('create or replace function public.get_care_team_flag_lines'), SQL.indexOf('revoke all on function'));
const code = (s) => s.replace(/--[^\n]*/g, '');

// ── the migration ────────────────────────────────────────────────────────────
test('only a coach on the client reads it, never their own row, and only live subscriptions count', () => {
  assert.match(body, /security definer\nset search_path = public, pg_temp\nas \$\$/, 'a pinned definer');
  assert.match(body, /where auth\.uid\(\) is not null\n\s+and p_client_id is not null/, 'signed out, or no client: nothing');
  assert.match(body, /\n\s+and public\.is_coach_on_client\(p_client_id\)\n/, 'the caller coaches this client now');
  assert.ok(!/auth\.uid\(\) = p_client_id/.test(code(body)), 'the member reads none of their coaches\' tuning');
  assert.match(body, /\n\s+and s\.status in \('active', 'trialing', 'past_due'\)\n/, 'the coaches is_coach_on_client counts; a cancelled one is not on the team');
  assert.match(body, /and c\.owner_id is distinct from auth\.uid\(\)/, 'the caller\'s own tuning is theirs already');
  assert.match(body, /returns table \(owner_id uuid, provider_role text, thresholds jsonb\)/);
});

test('of the settings document it returns only numeric policy thresholds', () => {
  assert.match(body, /ug\.user_id = c\.owner_id\n\s+and ug\.kind = 'coach_settings'/, 'the coach\'s own settings, no other kind');
  assert.match(body, /jsonb_each\(case when jsonb_typeof\(ug\.data -> 'thresholds'\) = 'object'\n\s+then ug\.data -> 'thresholds' else '\{\}'::jsonb end\)/,
    'the thresholds object, nothing beside it');
  assert.match(body, /and jsonb_typeof\(e\.value\) = 'number'/, 'numbers only');
  assert.match(body, /and e\.key ~ '\^\[A-Z\]\[A-Z_\]\{0,39\}\$'/, 'a capitalised policy name only');
  assert.match(body, /\), '\{\}'::jsonb\) as thresholds/, 'a coach who tuned nothing reads as an empty set');
  assert.ok(!/stripe|email|phone|price/i.test(code(body)));
});

test('anon cannot run it, and the file proves its own grants', () => {
  assert.match(SQL, /revoke all on function public\.get_care_team_flag_lines\(uuid\) from public, anon;/);
  assert.match(SQL, /grant execute on function public\.get_care_team_flag_lines\(uuid\) to authenticated, service_role;/);
  assert.match(SQL, /if has_function_privilege\('anon', 'public\.get_care_team_flag_lines\(uuid\)', 'execute'\)/);
  assert.match(SQL, /not p\.prosecdef or not exists \(select 1 from unnest\(coalesce\(p\.proconfig/);
  assert.match(SQL, /if exists \(select 1 from public\.get_care_team_flag_lines\(\(select client_id from public\.subscriptions limit 1\)\)\) then/);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});

// ── the overview ─────────────────────────────────────────────────────────────
const COACH = '11111111-1111-4111-8111-111111111111';
const NUTRI = '33333333-3333-4333-8333-333333333333';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEGS = await import(pathToFileURL(join(ROOT, 'src/lib/coach-client-legs.mjs')).href);
const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only'); } }],
    ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
    ['@/lib/vitals-leg.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/vitals-leg.mjs')).href)],
    ['@/lib/coach-client-legs.mjs', LEGS],
  ]),
});
function db(lines) {
  const base = fakeSupabase({
    tables: {
      trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH }],
      nutritionists: [],
      subscriptions: [{ client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null, created_at: new Date().toISOString() }],
      conversations: [], messages: [], client_workouts: [], client_meal_plans: [], client_programs: [],
    },
    rpcs: {
      get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: 'Jordan Reyes', avatar_url: null })),
      get_my_shared_clients: () => [{ counterpart_user_id: NUTRI, counterpart_role: 'nutritionist', counterpart_provider_id: 9, counterpart_name: 'Nia' }],
      get_client_coaches: () => [
        { provider_role: 'trainer', provider_id: 7, name: 'Coach Q', owner_id: COACH, since: null },
        { provider_role: 'nutritionist', provider_id: 9, name: 'Nia', owner_id: NUTRI, since: null },
      ],
    },
  });
  const rpc = base.rpc.bind(base);
  base.rpc = async (name, args) => (name === 'get_care_team_flag_lines' ? lines(args) : rpc(name, args));
  return base;
}
const build = (d) => lib.buildSharedOverview(d, { clientId: A, me: { userId: COACH, trainerId: 7, nutritionistId: null } });
const quiet = async (fn) => { const e = console.error, seen = []; console.error = (...a) => seen.push(a.join(' ')); try { return [await fn(), seen]; } finally { console.error = e; } };

test('the overview puts each co-coach\'s numbers on their care-team entry, and never the caller\'s', async () => {
  let asked = null;
  const ov = await build(db((args) => { asked = args; return { data: [
    { owner_id: NUTRI, provider_role: 'nutritionist', thresholds: { FOOD_GAP_DAYS: 4, PROTEIN_UNDER_PCT: 20, SNEAKY: 'x', NAN: null } },
    { owner_id: COACH, provider_role: 'trainer', thresholds: { MISSED_SESSIONS: 9 } },
  ], error: null }; }));
  assert.deepEqual(asked, { p_client_id: A });
  const by = Object.fromEntries(ov.careTeam.map((m) => [m.name, m]));
  assert.deepEqual(by.Nia.flagLines, { FOOD_GAP_DAYS: 4, PROTEIN_UNDER_PCT: 20 }, 'numbers only');
  assert.equal(by['Coach Q'].isMe, true);
  assert.ok(!('flagLines' in by['Coach Q']), 'the caller\'s own entry carries none');
  assert.equal(ov.careTeamPartial, false);
  // The record the engine reads keeps them on the co-coach.
  const rec = S.recordFromOverview({ id: A, name: 'Jordan', joinedAt: '2026-09-01' }, ov);
  assert.deepEqual(rec.coCoaches.map((c) => [c.role, c.userId, c.flagLines]), [['nutritionist', NUTRI, { FOOD_GAP_DAYS: 4, PROTEIN_UNDER_PCT: 20 }]]);
});

test('the record keeps only numbers from a care-team entry, whatever the server sent', () => {
  const team = (flagLines) => S.recordFromOverview({ id: A, name: 'Jordan', joinedAt: '2026-09-01' },
    { careTeam: [{ role: 'dietitian', userId: 'n1', name: 'Rae', isMe: false, flagLines }] }).coCoaches[0];
  assert.deepEqual(team({ FOOD_GAP_DAYS: 5, BAD: 'x', ALSO: null, INF: Infinity }).flagLines, { FOOD_GAP_DAYS: 5 });
  assert.equal(team({ FOOD_GAP_DAYS: '5' }).flagLines, undefined, 'a string is no line');
  assert.equal(team([5]).flagLines, undefined, 'a list is no set of lines');
  assert.equal(team(null).flagLines, undefined);
  assert.equal(team({}).flagLines, undefined, 'nothing tuned: no key, as before this shipped');
  assert.equal(team({}).role, 'nutritionist', 'a dietitian is the nutrition co-coach');
});

test('before the migration runs, or when the read fails, no entry carries numbers and the team is whole', async () => {
  const [missing, quietLog] = await quiet(() => build(db(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))));
  assert.deepEqual(quietLog.filter((l) => /get_care_team_flag_lines/.test(l)), [], 'not deployed is not failed');
  assert.deepEqual(missing.careTeam.map((m) => [m.name, 'flagLines' in m]), [['Coach Q', false], ['Nia', false]]);
  assert.equal(missing.careTeamPartial, false);
  const [failed, log] = await quiet(() => build(db(() => ({ data: null, error: { message: 'down' } }))));
  assert.ok(log.some((l) => /get_care_team_flag_lines failed: down/.test(l)), 'a failure is logged');
  assert.deepEqual(failed.careTeam.map((m) => [m.name, 'flagLines' in m]), [['Coach Q', false], ['Nia', false]]);
  assert.equal(failed.careTeamPartial, false, 'the joint note is a hint, never the team\'s membership');
  // An answer that is not a list, or a coach who tuned nothing, carries nothing and breaks nothing.
  for (const data of [{ owner_id: NUTRI, thresholds: { FOOD_GAP_DAYS: 4 } }, [{ owner_id: NUTRI, thresholds: {} }], [{ owner_id: NUTRI, thresholds: [4] }]]) {
    const odd = await build(db(() => ({ data, error: null })));
    assert.deepEqual(odd.careTeam.map((m) => [m.name, 'flagLines' in m]), [['Coach Q', false], ['Nia', false]], JSON.stringify(data));
  }
});

// ── the engine ───────────────────────────────────────────────────────────────
const NOW = new Date('2026-11-12T12:00:00');
const ago = (d) => { const x = new Date(NOW.getTime() - d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function client(lines = {}) {
  return {
    profile: { id: 'c1', name: 'Client One', joinedAt: ago(60) },
    lastContact: { trainer: ago(1), nutritionist: ago(1) },
    pros: { trainer: true, nutritionist: true },
    coCoaches: [
      { role: 'nutritionist', userId: 'n1', name: 'Rae', flagLines: lines.nutritionist ?? null },
      { role: 'trainer', userId: 't1', name: 'Alex', flagLines: lines.trainer ?? null },
    ],
    // A 4-day food-log gap and 5 of 9 trainer sessions missed.
    foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 3 },
    bookedSessions: { trainer: { done: 4, planned: 9 } },
  };
}
const joint = (c, role, t) => S.findJointAttention([c], NOW, t || null, role).length;

test('a trainer reads the nutrition side at the nutritionist\'s own food-log gap', () => {
  assert.equal(joint(client(), 'trainer'), 1, 'untuned: the house 3 days, so a 4-day gap is past it');
  assert.equal(joint(client({ nutritionist: { FOOD_GAP_DAYS: 5 } }), 'trainer'), 0, 'their 5 days: not yet');
  assert.equal(joint(client({ nutritionist: { FOOD_GAP_DAYS: 4 } }), 'trainer'), 1);
  // The two coaches agree: the nutritionist's own feed, at their own 5, finds no joint case either.
  assert.equal(joint(client({ nutritionist: { FOOD_GAP_DAYS: 5 } }), 'nutritionist', { FOOD_GAP_DAYS: 5 }), 0);
  // The trainer's own tuning still moves only their side.
  assert.equal(joint(client({ nutritionist: { FOOD_GAP_DAYS: 4 } }), 'trainer', { FOOD_GAP_DAYS: 9 }), 1);
  assert.equal(joint(client(), 'trainer', { MISSED_SESSIONS: 6 }), 0);
});

test('a nutritionist reads the training side at the trainer\'s own missed-sessions line', () => {
  assert.equal(joint(client(), 'nutritionist'), 1, 'untuned: 5 missed is past the house 3');
  assert.equal(joint(client({ trainer: { MISSED_SESSIONS: 6 } }), 'nutritionist'), 0);
  assert.equal(joint(client({ trainer: { MISSED_SESSIONS: 6 } }), 'trainer', { MISSED_SESSIONS: 6 }), 0, 'and the trainer agrees');
});

test('numbers the engine can\'t take fall back to the house line, never to a broken one', () => {
  // Out of range, not a number, not a tunable: refused, so the side reads at the house 3 days.
  for (const bad of [{ FOOD_GAP_DAYS: 99 }, { FOOD_GAP_DAYS: '5' }, { NOT_A_LINE: 5 }, [], 'x']) {
    assert.equal(joint(client({ nutritionist: bad }), 'trainer'), 1, JSON.stringify(bad));
  }
  // The line comes from the co-coach the note names: the first of that role, as coCoachFor picks.
  const two = client({ nutritionist: { FOOD_GAP_DAYS: 5 } });
  two.coCoaches.push({ role: 'nutritionist', userId: 'n2', name: 'Second', flagLines: { FOOD_GAP_DAYS: 3 } });
  const j = S.findJointAttention([two], NOW, null, 'trainer');
  assert.equal(j.length, 0, 'read at Rae\'s 5, not the second nutritionist\'s 3');
  // A record built before this shipped has no lines at all: the house line, as before.
  const old = client();
  old.coCoaches = old.coCoaches.map(({ flagLines, ...rest }) => rest);
  assert.equal(joint(old, 'trainer'), 1);
});
