// /api/account/export, DRIVEN — not grepped.
//
// ⚠ WHY THIS FILE EXISTS. This route is the GDPR Art. 15/20 artifact, and it had
// NO tests at all. Two of its properties are invisible to a source scan and both
// are the kind a regression ships silently:
//
//   1. EVERY table the member owns reaches the file. A table quietly dropped
//      from OWNED is an incomplete access request — nothing errors, the export
//      just stops containing something, and the member cannot tell.
//   2. The `user_goals` bucket is labelled for WHAT IT HOLDS. It is a per-account
//      document store: 26 distinct kinds can be written to it and exactly two are
//      health screening or goals, so the old key `health_screening_and_goals`
//      handed back a member's typed recipe — or a coach's private notes on a
//      client — under a health-screening label.
//
// The scrub is driven too, because it is the one security-relevant transform
// here and it has to hold at DEPTH (jsonb columns nest).

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

const USER = { id: 'u-00000000-1111-2222-3333-444444444444', email: 'm@example.com' };

// A PostgREST double that records which tables were asked for and returns one
// row per table, so an absent table is visible as an absent key rather than as
// an empty array indistinguishable from "the member has none".
function makeSupabase(rowsByTable = {}) {
  const asked = [];
  return {
    asked,
    from(table) {
      asked.push(table);
      const chain = {
        select() { return chain; },
        eq(col, val) {
          chain._col = col; chain._val = val;
          return Promise.resolve({ data: rowsByTable[table] ?? [{ table, scoped_by: col, owner: val }], error: null })
            .then((r) => r, (r) => r);
        },
      };
      return chain;
    },
  };
}

const load = (supabase, user = USER) => loadRealModule(join(ROOT, 'src/app/api/account/export/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', { clientForRequest: async () => supabase, currentUser: async () => user }],
  ]),
});

const body = async (res) => JSON.parse(await res.text());

test('⚠ THE user_goals BUCKET IS NOT LABELLED AS HEALTH SCREENING', async () => {
  // 26 kinds can be written to that table; exactly two (health_profile,
  // client_goals) are health screening or goals. A key naming the two describes
  // the other twenty-four wrongly — a recipe, a grocery list, a dashboard
  // layout, and a coach's own notes on a client, all under a health label.
  const supabase = makeSupabase();
  const mod = await load(supabase);
  const payload = await body(await mod.GET(new Request('https://x/api/account/export')));

  assert.ok(supabase.asked.includes('user_goals'), 'user_goals must still be exported — portability was never the defect');
  const keys = Object.keys(payload.data);
  assert.ok(!keys.includes('health_screening_and_goals'), 'the narrow label is gone');
  assert.ok(keys.includes('goals_health_and_app_data'), `expected the broad key, got ${JSON.stringify(keys)}`);

  // ⚠ AND THE INVARIANT, NOT THE SPELLING: whatever this key is called, it must
  // not be the name of a single kind that table holds. That is the class of
  // mistake being fixed, and it stays caught if someone renames it again.
  const KINDS = [
    'health_profile', 'client_goals', 'client_settings', 'client_recipes', 'client_library',
    'client_grocery_lists', 'coach_client_notes', 'coach_week_reviews', 'dashboard_layout',
    'dashboard_prefs', 'client_onboarding', 'client_identity', 'client_climb', 'app_tweaks',
  ];
  const bucket = keys.find((k) => k.includes('goals') || k.includes('health'));
  for (const kind of KINDS) {
    assert.notEqual(bucket, kind, `the bucket key must not be one kind's name (${kind})`);
  }
});

test('the export note points the reader at the per-row kind', async () => {
  // The key can only ever be a category; the `kind` on each row is what actually
  // says what a document is. A member who cannot find that is back where they
  // started.
  const mod = await load(makeSupabase());
  const payload = await body(await mod.GET(new Request('https://x/api/account/export')));
  assert.match(payload.export.note, /kind/, 'the note must name the field that identifies each document');
  assert.match(payload.export.note, /goals_health_and_app_data/, 'and name the key it applies to');
});

test('⚠ EVERY OWNED TABLE REACHES THE FILE — a dropped table is an incomplete access request', async () => {
  const supabase = makeSupabase();
  const mod = await load(supabase);
  const payload = await body(await mod.GET(new Request('https://x/api/account/export')));

  // Derived from the route, not restated: every table it queries must produce a
  // key, and every key must carry the rows that table returned.
  for (const table of supabase.asked) {
    const hit = Object.values(payload.data).flat().some((r) => r && r.table === table);
    assert.ok(hit, `${table} was queried but its rows are not in the export`);
  }
  // The tables a member would notice missing, named so a silent removal fails.
  for (const t of ['user_goals', 'client_weigh_ins', 'client_measurements', 'client_checkins',
    'client_progress_photos', 'cycle_events', 'consent_log', 'daily_health_snapshot',
    'score_ledger', 'profiles', 'user_integrations']) {
    assert.ok(supabase.asked.includes(t), `${t} is no longer exported`);
  }
});

test('⚠ TOKENS ARE SCRUBBED AT DEPTH, because jsonb nests', async () => {
  // user_goals.data and client_workouts.payload are jsonb and have carried
  // integration tokens; a top-level-only scrub would ship them.
  const supabase = makeSupabase({
    user_goals: [{
      kind: 'client_settings',
      data: { units: 'metric', nested: { access_token: 'SECRET-A', refresh_token: 'SECRET-B', theme: 'sage' } },
      api_key: 'SECRET-C',
      list: [{ webhook_secret: 'SECRET-D', keep: 'yes' }],
    }],
  });
  const mod = await load(supabase);
  const payload = await body(await mod.GET(new Request('https://x/api/account/export')));
  const json = JSON.stringify(payload);
  for (const s of ['SECRET-A', 'SECRET-B', 'SECRET-C', 'SECRET-D']) {
    assert.ok(!json.includes(s), `${s} reached the export`);
  }
  // ⚠ POSITIVE CONTROL: the member's own data must survive the scrub, or this
  // test would pass just as well on a route that exported nothing.
  assert.ok(json.includes('metric') && json.includes('sage') && json.includes('yes'),
    'the scrub removed the member data it is supposed to keep');
});

test('an unauthenticated request exports nothing', async () => {
  const supabase = makeSupabase();
  const mod = await load(supabase, null);
  const res = await mod.GET(new Request('https://x/api/account/export'));
  assert.equal(res.status, 401);
  assert.equal(supabase.asked.length, 0, 'no table may be read before the caller is known');
});
