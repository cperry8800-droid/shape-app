// POST /api/clients/shared-overview — a coach's roster overviews in ONE request.
//
// The dashboard used to issue one GET /api/clients/[id]/shared-overview per
// roster member through a 4-wide pool (30 clients = 30 requests, 30 auth round
// trips). The batch route runs the SAME body — src/lib/shared-overview.ts is the
// single route's, lifted verbatim — for every id under one authenticated request,
// so the property this file pins first is PARITY: for one fixture and one caller,
// the batch's entry for a client is deep-equal to the single GET's payload. Every
// read still runs under the caller's own client, so the batch adds no reach.
//
// ⚠ A CLIENT THE BATCH COULD NOT BUILD IS NAMED, NOT BLANKED. It lands in `failed`
// and is ABSENT from `results` — an empty overview would be the positive claim
// "nothing shared", and one client's failure must not take the other 29 down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const COACH = { id: '11111111-1111-4111-8111-111111111111' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

// A roster of two: A is fully populated (a session, a program, a thread, a
// snapshot, nutrition targets); B is a bare client. Both link to the caller's
// trainer row 7, so the caller reads them the way RLS would let them.
function fixture({ fail = [] } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const db = fakeSupabase({
    tables: {
      trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH.id }],
      nutritionists: [],
      subscriptions: [
        { client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null },
        { client_id: B, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null },
      ],
      sessions: [{ id: 's1', client_id: A, scheduled_at: tomorrow, duration_min: 60, type: 'training', status: 'confirmed', topic: null, provider_id: 7, provider_role: 'trainer' }],
      coach_program_assignments: [{ id: 'as1', client_id: A, status: 'active', provider_role: 'trainer', provider_id: 7, program_template_id: 't1', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-20T00:00:00Z', notes: null }],
      coach_program_templates: [{ id: 't1', title: 'Block 3', goal: 'strength', level: null, duration_weeks: 12, days_per_week: 4 }],
      client_programs: [{ user_id: A, training_phase: 'build', nutrition_phase: null, detail: { nutrition: { calories: 2400, protein: 180 } } }],
      conversations: [{ client_id: A, kind: 'direct', provider_role: 'trainer', provider_id: 7, last_message_at: '2026-09-28T10:00:00Z' }],
      daily_health_snapshot: [{ user_id: A, snapshot_date: today, sleep_hours: 7.5, calories: 2100, sleep_quality: 7 }],
    },
    rpcs: {
      get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: id === A ? 'Ada' : 'Ben', avatar_url: null })),
      get_my_shared_clients: () => [],
      get_client_goals: () => null,
      get_client_stats: ({ p_user_id }) => ({ daysLogged7d: p_user_id === A ? 5 : 2 }),
      get_client_lifts: () => null,
      get_client_checkins: () => [],
      get_client_measurements: () => [],
      get_client_progress_photos: () => [],
      get_client_health_profile: () => null,
      get_client_cycle: () => null,
      get_client_meal_prep: () => null,
      get_client_score_history: () => null,
    },
    fail,
  });
  db.auth = { getUser: async () => ({ data: { user: COACH } }) };
  return db;
}

const importLib = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
async function loadLib() {
  return loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
    typescript: true,
    registry: new Map([
      // `import type` — erased by the compiler, but the loader still resolves the specifier.
      ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only import; never called'); } }],
      ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
      ['@/lib/vitals-leg.mjs', await importLib('src/lib/vitals-leg.mjs')],
      ['@/lib/coach-client-legs.mjs', await importLib('src/lib/coach-client-legs.mjs')],
    ]),
  });
}
async function loadRoutes(db, { user = COACH } = {}) {
  const lib = await loadLib();
  const supabaseServer = { createClient: async () => ({ ...db, auth: { getUser: async () => ({ data: { user } }) } }) };
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const single = await loadRealModule(join(ROOT, 'src/app/api/clients/[id]/shared-overview/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/supabase/server', supabaseServer], ['@/lib/shared-overview', lib]]),
  });
  const batch = await loadRealModule(join(ROOT, 'src/app/api/clients/shared-overview/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/supabase/server', supabaseServer], ['@/lib/shared-overview', lib], ['@/lib/request-utils', requestUtils]]),
  });
  return { lib, single, batch };
}
const post = (ids, raw) => new Request('https://x/api/clients/shared-overview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify({ ids }) });
const getOne = (id) => new Request(`https://x/api/clients/${id}/shared-overview`);
const json = async (res) => ({ status: res.status, body: JSON.parse(await res.text()) });

test('parity: the batch entry for a client is the single GET payload, deep-equal, for both a full and a bare client', async () => {
  const { single, batch } = await loadRoutes(fixture());
  const b = await json(await batch.POST(post([A, B])));
  assert.equal(b.status, 200);
  assert.deepEqual(b.body.failed, []);
  assert.deepEqual(Object.keys(b.body.results).sort(), [A, B]);
  for (const id of [A, B]) {
    const s = await json(await single.GET(getOne(id), { params: Promise.resolve({ id }) }));
    assert.equal(s.status, 200);
    assert.deepEqual(b.body.results[id], s.body, `batch and single disagree for ${id}`);
  }
  assert.deepEqual(b.body.me, { trainerId: 7, nutritionistId: null });
  // The full client's overview is not a hollow object: the legs the roster reads are there.
  const a = b.body.results[A];
  assert.equal(a.client.name, 'Ada');
  assert.equal(a.sessions.length, 1);
  assert.equal(a.plans[0].template.title, 'Block 3');
  assert.ok(a.lastContact, 'the last-contact leg is on the batch payload');
  assert.ok(a.program, 'the program leg is on the batch payload');
  assert.deepEqual(a.nutritionTargets, { calories: 2400, protein: 180 });
});

test('the honest-absence contract survives the lift: a failed snapshot read OMITS `logs`, in both routes alike', async () => {
  const { single, batch } = await loadRoutes(fixture({ fail: ['daily_health_snapshot'] }));
  const b = await json(await batch.POST(post([A])));
  const s = await json(await single.GET(getOne(A), { params: Promise.resolve({ id: A }) }));
  assert.equal(b.status, 200);
  assert.ok(!('logs' in b.body.results[A]), 'logs must be omitted, not null, when the read failed');
  assert.ok(!('logs' in s.body));
  assert.deepEqual(b.body.results[A], s.body);
});

test('one client failing is named in `failed` and absent from `results`; the others still build', async () => {
  const db = fixture();
  const realRpc = db.rpc.bind(db);
  db.rpc = async (name, args) => {
    if (name === 'get_display_names' && args.p_ids[0] === B) throw new Error('boom for B');
    return realRpc(name, args);
  };
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  let r;
  try {
    const { batch } = await loadRoutes(db);
    r = await json(await batch.POST(post([A, B])));
  } finally { console.error = orig; }
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.failed, [B]);
  assert.deepEqual(Object.keys(r.body.results), [A]);
  assert.ok(!(B in r.body.results), 'a failed client must not appear as an empty overview');
  assert.ok(errors.some((l) => l.includes(B) && l.includes('boom for B')), 'the failure is logged with the client id');
});

test('unauthenticated: 401 and NO read of any table', async () => {
  const db = fixture();
  const { batch } = await loadRoutes(db, { user: null });
  const r = await json(await batch.POST(post([A])));
  assert.equal(r.status, 401);
  assert.equal(db._calls.length, 0, 'no PostgREST read may run before the auth check');
});

test('the body is validated: shape, UUIDs, emptiness and the cap — and duplicates collapse', async () => {
  const { lib, batch } = await loadRoutes(fixture());
  const status = async (req) => (await json(await batch.POST(req))).status;
  assert.equal(await status(post(null, '{"ids":"x"}')), 400);
  assert.equal(await status(post(['not-a-uuid'])), 400);
  assert.equal(await status(post([])), 400);
  assert.equal(await status(post(null, 'not json')), 400);
  const fiftyOne = Array.from({ length: 51 }, (_, i) => uuid(i + 1));
  const capped = await json(await batch.POST(post(fiftyOne)));
  assert.equal(capped.status, 400);
  assert.match(capped.body.error, /50/);
  // Fifty-one entries that are ONE client dedupe to one id, under the cap.
  const dupes = Array.from({ length: 51 }, (_, i) => (i % 2 ? A : A.toUpperCase()));
  const p = lib.parseBatchIds({ ids: dupes });
  assert.deepEqual(p, { ok: true, ids: [A] });
  assert.equal(lib.BATCH_MAX_IDS, 50);
  const r = await json(await batch.POST(post(dupes)));
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.results), [A]);
});

test('the route file exports only its handler set — a helper export fails the App Router build typegen', () => {
  const src = stripComments(fs.readFileSync(join(ROOT, 'src/app/api/clients/shared-overview/route.ts'), 'utf8'));
  const exported = [...src.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]).sort();
  // The route segment config (runtime, dynamic, maxDuration, …) is part of the
  // handler set; a helper such as parseBatchIds is not, and lives in src/lib.
  assert.deepEqual(exported, ['POST', 'dynamic', 'maxDuration', 'runtime']);
  assert.match(src, /^export const maxDuration = 60;/m, 'the batch route must raise the platform function timeout — a timeout fails the WHOLE batch');
  // And the single route is now the thin frame over the shared body.
  const single = stripComments(fs.readFileSync(join(ROOT, 'src/app/api/clients/[id]/shared-overview/route.ts'), 'utf8'));
  assert.match(single, /buildSharedOverview\(supabase, \{ clientId, me \}\)/);
  assert.doesNotMatch(single, /daily_health_snapshot|get_display_names/, 'the reads must live in src/lib/shared-overview.ts, not in the route');
  // The War Room knows the new route.
  const warroom = fs.readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8');
  assert.match(warroom, /\['\/api\/clients\/shared-overview', 'POST'\]/);
});
