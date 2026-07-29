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
];
const CALLERS = ['src/app/api/trainer/week/route.ts'];

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
  assert.ok(checked >= 2, `expected to check both guardrail RPC calls, checked ${checked}`);
});

test('the load-history call names the client parameter the migration declares', () => {
  // The exact regression, pinned by name so the intent survives a refactor.
  const src = readFileSync(join(ROOT, 'src/app/api/trainer/week/route.ts'), 'utf8');
  const call = rpcCalls(src).find((c) => c.fn === 'get_client_load_history');
  assert.ok(call, 'the route still reads the load history');
  assert.deepEqual(call.keys, ['p_client_id']);
  assert.ok(!call.keys.includes('p_user_id'), 'p_user_id does not resolve against this function');
});

test('publish_client_week is called with its full required argument set', () => {
  // `p_rows` and `p_ack` carry defaults; the first six do not, and omitting one
  // fails at the database rather than at any gate in this repo.
  const src = readFileSync(join(ROOT, 'src/app/api/trainer/week/route.ts'), 'utf8');
  const call = rpcCalls(src).find((c) => c.fn === 'publish_client_week');
  assert.ok(call, 'the route still publishes through the boundary');
  for (const required of ['p_coach_user_id', 'p_idempotency_key', 'p_client_id', 'p_week_start', 'p_request_hash', 'p_outcome']) {
    assert.ok(call.keys.includes(required), `publish_client_week needs ${required}`);
  }
});
