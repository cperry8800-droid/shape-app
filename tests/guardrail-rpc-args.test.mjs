// Every RPC argument the guardrail routes send must be a parameter the
// migration actually declares.
//
// WHY THIS FILE EXISTS: PostgREST resolves RPC arguments BY NAME. A wrong name
// is not a wrong value — the function does not resolve at all, and the caller
// gets "function does not exist". That failure is invisible to every other gate
// in this repo: it typechecks (the argument object is untyped `Record`), it
// passes the unit suite (nothing calls the real database), it builds, and it
// only appears against a live Postgres.
//
// It shipped once: the week-publish route called `get_client_load_history` with
// `p_user_id` while the migration declares `p_client_id`. Every publish would
// have fallen into the history-error branch, so NO week could ever have been
// written — the whole boundary dead, with a green suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATIONS = [
  'supabase-migrations/2026-07-27-guardrail-load-history.sql',
  'supabase-migrations/2026-07-29-guardrail-week-publish.sql',
  'supabase-migrations/2026-07-30-adjust-regeneration-ack.sql',
  // ⚠ LAST WINS, AND THAT IS THE POINT. This one RECREATES publish_client_week
  // with a ninth parameter, so its declaration must be the one every assertion
  // below reads — exactly as the deployed database will see it.
  'supabase-migrations/2026-07-30-week-publish-precondition.sql',
];
// The week/session RPC calls live in the shared publisher; the routes above it
// only orchestrate. When they moved there the 'checked' floor below caught it
// rather than letting the guard pass on zero calls.
const PUBLISHER = 'src/lib/week-publish-server.ts';
// Adjust does NOT publish through the week boundary — its atomicity is a real
// safety property — so it calls the load history and the regeneration RPC
// itself, and needs its own coverage here.
const ADJUST = 'src/app/api/trainer/adjust/route.ts';
const CALLERS = [PUBLISHER, ADJUST];

/** name -> Set(declared parameter names), from `create [or replace] function`. */
function declaredParams(sql) {
  const out = new Map();
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/gi;
  let m;
  while ((m = re.exec(sql))) {
    const params = new Set();
    for (const raw of m[2].split(',')) {
      // "p_days int default 180" -> p_days. Skip a bare `()`.
      const name = raw.trim().split(/\s+/)[0];
      if (name && /^p?_?\w+$/.test(name)) params.add(name);
    }
    out.set(m[1], params);
  }
  return out;
}

/**
 * [{fn, keys[]}] from `.rpc('fn', { a: …, b: … })` calls — TOP-LEVEL keys only.
 *
 * Depth matters: `track_event({ p_event, p_props: { … } })` passes a whole
 * object as one argument, and a naive scan reads that object's own keys as RPC
 * arguments and reports every one of them as undeclared. So the argument object
 * is walked with a brace counter and only depth-1 keys are collected.
 */
function rpcCalls(src) {
  const out = [];
  const open = /\.rpc\(\s*'(\w+)'\s*(,\s*\{)?/g;
  let m;
  while ((m = open.exec(src))) {
    if (!m[2]) { out.push({ fn: m[1], keys: [] }); continue; }
    let i = open.lastIndex;      // just past the opening `{`
    let depth = 1;
    const body = [];
    for (; i < src.length && depth > 0; i += 1) {
      const ch = src[i];
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') depth -= 1;
      if (depth >= 1) body.push(depth === 1 ? ch : ''); // mask nested spans
    }
    const keys = [...body.join('').matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*:/g)].map((k) => k[1]);
    out.push({ fn: m[1], keys });
  }
  return out;
}

const DECLARED = new Map();
for (const f of MIGRATIONS) {
  for (const [fn, params] of declaredParams(readFileSync(join(ROOT, f), 'utf8'))) {
    DECLARED.set(fn, params);
  }
}

test('the guardrail migrations declare the functions the routes call', () => {
  // A sanity floor: if the parser stops matching, every assertion below would
  // vacuously pass and the guard would be silently dead.
  assert.ok(DECLARED.has('get_client_load_history'), 'load-history migration parsed');
  assert.ok(DECLARED.has('publish_client_week'), 'week-publish migration parsed');
  assert.ok(DECLARED.get('publish_client_week').size >= 6, 'publish params parsed');
  // The regeneration RPC is DROPPED and recreated (a fifth defaulted parameter
  // is a new signature, not a replacement), so the parser must match a bare
  // `create function` too — not only `create or replace`.
  assert.ok(DECLARED.has('regenerate_client_workouts'), 'adjust-ack migration parsed');
  assert.ok(DECLARED.get('regenerate_client_workouts').has('p_ack'), 'the recreate carries p_ack');
  // The coach is an EXPLICIT argument now: the function is service-role only, so
  // auth.uid() is NULL inside it and an identity read there would fail OPEN.
  assert.ok(
    DECLARED.get('regenerate_client_workouts').has('p_coach_user_id'),
    'the recreate carries p_coach_user_id',
  );
});

test('every RPC argument a guardrail route sends is a declared parameter', () => {
  let checked = 0;
  for (const file of CALLERS) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const { fn, keys } of rpcCalls(src)) {
      const params = DECLARED.get(fn);
      if (!params) continue; // declared in a migration this test does not own
      checked += 1;
      for (const k of keys) {
        assert.ok(
          params.has(k),
          `${file} calls ${fn}({ ${k}: … }) but the migration declares only: ${[...params].join(', ')}`,
        );
      }
    }
  }
  // The floor rises with every gated caller. Without it the loop passes
  // vacuously on zero matched calls — which is exactly how this guard would
  // have gone quiet when the publisher was extracted.
  assert.ok(checked >= 4, `expected to check every guardrail RPC call, checked ${checked}`);
});

test('the load-history call names the client parameter the migration declares', () => {
  // The exact regression, pinned by name so the intent survives a refactor —
  // and pinned on BOTH readers, since each calls the RPC independently.
  for (const file of [PUBLISHER, ADJUST]) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const call = rpcCalls(src).find((c) => c.fn === 'get_client_load_history');
    assert.ok(call, `${file} still reads the load history`);
    assert.deepEqual(call.keys, ['p_client_id'], `${file} names p_client_id`);
    assert.ok(!call.keys.includes('p_user_id'), 'p_user_id does not resolve against this function');
  }
});

test('publish_client_week is called with its full required argument set', () => {
  // `p_rows` and `p_ack` carry defaults; the first six do not, and omitting one
  // fails at the database rather than at any gate in this repo.
  const src = readFileSync(join(ROOT, PUBLISHER), 'utf8');
  const call = rpcCalls(src).find((c) => c.fn === 'publish_client_week');
  assert.ok(call, 'the route still publishes through the boundary');
  for (const required of ['p_coach_user_id', 'p_idempotency_key', 'p_client_id', 'p_week_start', 'p_request_hash', 'p_outcome']) {
    assert.ok(call.keys.includes(required), `publish_client_week needs ${required}`);
  }
});

test('the publish carries the concurrency precondition end to end', () => {
  // A week-replace over a read-merge is a lost-update race: two assignments into
  // one client-week both read the same week, both publish a different merge, and
  // the later replace deletes the earlier one's session. The precondition is the
  // only thing that catches it, and it is invisible to every other gate — drop
  // the argument and the publish still succeeds, still typechecks, still passes
  // the suite, and silently goes back to losing sessions.
  assert.ok(
    DECLARED.get('publish_client_week').has('p_expected_row_ids'),
    'the migration declares the precondition parameter',
  );
  const src = readFileSync(join(ROOT, PUBLISHER), 'utf8');
  const call = rpcCalls(src).find((c) => c.fn === 'publish_client_week');
  assert.ok(call.keys.includes('p_expected_row_ids'), 'the publisher sends the precondition');
});

test('every coach training route publishes through the MERGING door', () => {
  // The boundary REPLACES a client-week. A route that hands it only the sessions
  // being assigned therefore DELETES every other session the coach had scheduled
  // that week — silent data loss on the most ordinary action in the product —
  // and hands the guardrail a week missing that load, so the verdict comes out
  // wrong in the permissive direction.
  //
  // Both surfaces shipped exactly that bug, independently, which is why this is
  // pinned rather than written down: calling the unmerged publisher compiles,
  // typechecks and passes every other gate.
  for (const file of ['src/app/api/trainer/week/route.ts', 'src/app/api/trainer/workout/route.ts']) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(
      src.includes('publishMergedWeekForClient'),
      `${file} must publish through the read-merge path`,
    );
    assert.doesNotMatch(
      src,
      /\bpublishWeekForClient\s*\(/,
      `${file} calls the UNMERGED publisher directly — that replaces the client's week`,
    );
  }
});

test('the precondition migration leaves exactly one publish_client_week overload', () => {
  // PostgREST resolves an overload by the argument names supplied, and an
  // eight-argument call matches BOTH candidates once the ninth defaults. Leaving
  // the old form behind does not merely keep a stale path alive — it makes every
  // publish ambiguous and fails them all at the database.
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-07-30-week-publish-precondition.sql'), 'utf8');
  assert.match(
    sql,
    /drop function if exists public\.publish_client_week\(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb\)/i,
    'the eight-argument form is dropped, not left beside the new one',
  );
  assert.match(sql, /grant\s+execute on function public\.publish_client_week\([^)]*uuid\[\]\) to service_role/i);
  assert.doesNotMatch(
    sql,
    /grant\s+execute on function public\.publish_client_week\([^)]*\) to authenticated/i,
    'the grant IS the gate — authenticated must never hold EXECUTE',
  );
});

test('a publish sends ONE notification, not one per carried row', () => {
  // notify_on_client_workout fires per INSERTED ROW, and a week-replace
  // re-inserts every session it carried. Without the transaction-local GUC a
  // coach assigning one session into a week holding three sent the client FOUR
  // "New workout from your coach" pushes — three for sessions they were told
  // about days ago. Same remedy, same flag, as the Adjust regeneration.
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-07-30-week-publish-precondition.sql'), 'utf8');
  assert.match(sql, /set_config\('shape\.adjust_regen', '1', true\)/, 'the per-row trigger is quieted');
  assert.match(sql, /insert into public\.notifications/, 'and one summary is emitted in its place');
});

test('the adjust route sends the regeneration its full argument set, p_ack included', () => {
  // §10.1: the acknowledgment must ride INSIDE the regeneration transaction.
  // Dropping `p_ack` at the call site is invisible to every other gate — the
  // RPC would default it to null and simply write no audit row, so an
  // overridden red would land with no record that anyone overrode it.
  const src = readFileSync(join(ROOT, ADJUST), 'utf8');
  const call = rpcCalls(src).find((c) => c.fn === 'regenerate_client_workouts');
  assert.ok(call, 'the adjust route still applies through the atomic RPC');
  for (const required of ['p_coach_user_id', 'p_client_id', 'p_delete_ids', 'p_inserts', 'p_repeat_patches', 'p_ack']) {
    assert.ok(call.keys.includes(required), `regenerate_client_workouts needs ${required}`);
  }
});

test('the adjust route does NOT call publish_client_week — its atomicity is the point', () => {
  // Looping week-publishes would forfeit "never both plans, never zero" and can
  // strand a client between two programs. If this ever starts failing, the
  // regeneration was quietly re-shaped into N publishes.
  const src = readFileSync(join(ROOT, ADJUST), 'utf8');
  assert.equal(rpcCalls(src).some((c) => c.fn === 'publish_client_week'), false);
});

test('the website publish button goes through the evaluated boundary, not a direct insert', () => {
  // `publishClientWorkout` inserted into client_workouts straight from the
  // browser — the last unevaluated coach write in the product, live in
  // production while three places claimed every coach write was gated. It could
  // not be moved onto the boundary as-is because it created UNDATED rows, and an
  // undated session has no week to be judged in. The builder now asks for a date
  // and posts to /api/trainer/workout, which reads the week, merges, judges and
  // publishes. If this fails, a surface has gone back around the door.
  const page = readFileSync(join(ROOT, 'public/trainer-dashboard.html'), 'utf8');
  const db = readFileSync(join(ROOT, 'public/supabase.js'), 'utf8');

  assert.match(db, /fetch\('\/api\/trainer\/workout'/, 'delivery posts to the evaluated route');
  assert.doesNotMatch(db, /from\('client_workouts'\)\s*\.insert\(/, 'and never inserts the table itself');
  assert.doesNotMatch(db, /publishClientWorkout/, 'the direct-insert helper is gone, not merely unused');
  assert.doesNotMatch(page, /publishClientWorkout/, 'and nothing still calls it');

  assert.match(page, /assignClientWorkout\(/, 'the builder delivers through the boundary helper');
  assert.match(page, /scheduledDate: workout\.date,/, 'and carries the date the boundary requires');
  assert.match(page, /if \(!workout\.date\)/, 'a dateless send is refused before it is sent');
});

test('the coach INSERT policy is dropped — and the member self-authoring policy is NOT', () => {
  // The lockout is what makes "one evaluated door" structural instead of
  // conventional: with no coach INSERT policy, a future surface cannot
  // reintroduce the hole by writing the table directly. The second assertion is
  // the one that matters most — self-serve training (#1618) writes
  // `trainer_id is null` rows under its OWN policy, and taking that down with
  // the coach policy would silently break every member authoring their own week.
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-07-31-coach-insert-lockout.sql'), 'utf8');
  assert.match(sql, /drop policy if exists "trainer_insert_on_client_workouts" on public\.client_workouts/i);
  assert.doesNotMatch(
    sql,
    /drop policy if exists "client_insert_self_workouts"/i,
    'the member self-insert policy must survive the lockout',
  );
  assert.match(sql, /client_insert_self_workouts is missing/, 'and the migration fails loudly if it did not');
});
